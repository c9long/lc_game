import { and, eq, gte, sql, type SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { dev } from '$app/environment';
import type { Db } from '../db';
import { awards, buildings, gameState, ledger, problemState, resources, type User } from '../db/schema';
import { weeklyCount } from '$lib/game/budget';
import { dailyCoins, relocate, settleProduction, STORAGE, type PlacedBuilding } from '$lib/game/city';
import { PROBLEM_BY_SLUG } from '$lib/game/curriculum';
import { addDays, localDate } from '$lib/game/dates';
import { computeTree, type NodeView, type ProblemProgress } from '$lib/game/tree';

export interface Progress extends ProblemProgress {
	lastLang: string | null;
	firstSolvedAt: Date | null;
	lastSolvedAt: Date | null;
}

export interface Snapshot {
	user: User;
	now: Date;
	today: string;
	progress: Map<string, Progress>;
	research: Map<string, number>;
	tree: Map<string, NodeView>;
	resources: Record<string, number>;
	buildings: PlacedBuilding[];
	weekly: number;
	ledgerDates: string[];
	totalSolves: number;
	hardSolves: number;
	/** Coins accrued by this request's tick, for a toast. */
	tickCoins: number;
}

/** game_state key for God mode's whole-tree unlock. Honoured only on the dev server. */
export const GOD_UNLOCK_TREE = 'god:unlockTree';

// Every game table is per player: each helper here takes the player's id (`uid`) and scopes to it.

export async function getState<T>(db: Db, uid: string, key: string, fallback: T): Promise<T> {
	const row = await db
		.select()
		.from(gameState)
		.where(and(eq(gameState.userId, uid), eq(gameState.key, key)))
		.get();
	return row ? (row.value as T) : fallback;
}

export async function setState(db: Db, uid: string, key: string, value: unknown): Promise<void> {
	const now = new Date();
	await db
		.insert(gameState)
		.values({ userId: uid, key, value, updatedAt: now })
		.onConflictDoUpdate({ target: [gameState.userId, gameState.key], set: { value, updatedAt: now } });
}

/** A resource change that runs only if the statement just before it in the same batch changed
 *  exactly one row. City actions chain their charges or refunds behind the guarded building write
 *  (see the api/city endpoints): if the building was no longer as the request saw it -- a second click
 *  that lost the race, say -- the write changes nothing, and every chained change skips as well
 *  (each one, when it runs, changes exactly one row, so the chain holds). D1 runs a batch as one
 *  transaction and batches one at a time, so `changes()` always refers to the previous statement. */
export function addResourceAfter(uid: string, kind: string, amount: number): SQL {
	return sql`INSERT INTO resources (user_id, kind, amount)
		SELECT ${uid}, ${kind}, ${amount} WHERE changes() = 1
		ON CONFLICT (user_id, kind) DO UPDATE SET amount = resources.amount + excluded.amount`;
}

const dialect = new SQLiteSyncDialect();

/** Runs raw statements as ONE D1 batch: a single transaction, in order, on one connection, which
 *  the changes() chaining above depends on. Drizzle's own batch() only takes query builders --
 *  db.run(sql) executes on the spot -- so these go to D1 directly. Returns D1's results, whose
 *  meta.changes changedRows() reads. */
export function rawBatch(d1: D1Database, statements: SQL[]) {
	return d1.batch(
		statements.map((s) => {
			const q = dialect.sqlToQuery(s);
			return d1.prepare(q.sql).bind(...q.params);
		})
	);
}

/** SQL that holds while the player can pay `cost` from what they have right now -- checked inside
 *  the transaction, where the snapshot check before it may have gone stale. */
export function canPaySql(uid: string, cost: Record<string, number>) {
	const parts = Object.entries(cost)
		.filter(([, v]) => v > 0)
		.map(([k, v]) => sql`(SELECT COALESCE(MAX(amount), 0) FROM resources WHERE user_id = ${uid} AND kind = ${k}) >= ${v}`);
	return parts.length ? sql.join(parts, sql` AND `) : sql`1`;
}

/** Whether a batch failed only because a tile was already taken: the (user, city, x, y) unique
 *  index. Any other error -- an outage, a timeout, a SQL bug -- is not a conflict, may even have
 *  committed, and must surface as a real error rather than a reassuring 409. */
export function isTileTaken(e: unknown): boolean {
	const seen = new Set<unknown>();
	for (let cur: unknown = e; cur && typeof cur === 'object' && !seen.has(cur); cur = (cur as { cause?: unknown }).cause) {
		seen.add(cur);
		const msg = (cur as { message?: unknown }).message;
		if (typeof msg === 'string' && /UNIQUE constraint failed: buildings\./.test(msg)) return true;
	}
	return false;
}

/** How many rows a batch statement changed (D1 reports it in meta.changes). */
export function changedRows(result: unknown): number {
	return (result as { meta?: { changes?: number } })?.meta?.changes ?? 0;
}

export function addResourceStatement(db: Db, uid: string, kind: string, amount: number) {
	return db
		.insert(resources)
		.values({ userId: uid, kind, amount })
		.onConflictDoUpdate({
			target: [resources.userId, resources.kind],
			set: { amount: sql`${resources.amount} + excluded.amount` }
		});
}

/** The grid shrank to 6x6 and grew terrain, so buildings from the old open 8x8 can be standing
 *  somewhere that no longer exists or no longer takes them. relocate() says where each one goes;
 *  this writes those moves and updates the list in place.
 *
 *  Everything moving is parked in a scratch city first. Without that, a building stepping into a
 *  tile that another building is about to vacate would trip the (city, x, y) unique index halfway
 *  through the batch. relocate() returns nothing once the city is valid, so this is a no-op on
 *  every load after the first. */
const SCRATCH_CITY = STORAGE - 1;

async function applyRelocations(db: Db, uid: string, placed: PlacedBuilding[]): Promise<void> {
	const moves = relocate(placed);
	if (moves.length === 0) return;
	const mine = (id: string) => and(eq(buildings.userId, uid), eq(buildings.id, id));
	const statements = [
		...moves.map((m, i) => db.update(buildings).set({ city: SCRATCH_CITY, x: i, y: 0 }).where(mine(m.id))),
		...moves.map((m) => db.update(buildings).set({ city: m.city, x: m.x, y: m.y }).where(mine(m.id)))
	] as unknown as Parameters<typeof db.batch>[0];
	await db.batch(statements);
	for (const m of moves) {
		const b = placed.find((p) => p.id === m.id);
		if (b) Object.assign(b, { city: m.city, x: m.x, y: m.y });
	}
}

export async function loadSnapshot(db: Db, user: User, now = new Date()): Promise<Snapshot> {
	const today = localDate(now, user.timezone);
	const uid = user.id;

	const stateRows = await db.select().from(problemState).where(eq(problemState.userId, uid)).all();
	const progress = new Map<string, Progress>();
	let totalSolves = 0;
	let hardSolves = 0;
	for (const r of stateRows) {
		progress.set(r.slug, {
			solveCount: r.solveCount,
			srsStep: r.srsStep,
			dueAt: r.dueAt,
			lastLang: r.lastLang,
			firstSolvedAt: r.firstSolvedAt,
			lastSolvedAt: r.lastSolvedAt
		});
		if (r.solveCount > 0) {
			totalSolves++;
			if (PROBLEM_BY_SLUG.get(r.slug)?.difficulty === 'Hard') hardSolves++;
		}
	}

	const awardRows = await db
		.select({ slug: awards.slug, research: awards.research })
		.from(awards)
		.where(eq(awards.userId, uid))
		.all();
	const research = new Map<string, number>();
	for (const a of awardRows) {
		const nodeId = PROBLEM_BY_SLUG.get(a.slug)?.nodeId;
		if (nodeId) research.set(nodeId, (research.get(nodeId) ?? 0) + a.research);
	}

	const resRows = await db.select().from(resources).where(eq(resources.userId, uid)).all();
	const res: Record<string, number> = {};
	for (const r of resRows) res[r.kind] = r.amount;

	const bRows = await db.select().from(buildings).where(eq(buildings.userId, uid)).all();
	const placed: PlacedBuilding[] = bRows.map((b) => ({ id: b.id, kind: b.kind, city: b.city, x: b.x, y: b.y, level: b.level }));
	await applyRelocations(db, uid, placed);

	const since = addDays(today, -70);
	const ledgerRows = await db
		.select({ date: ledger.date })
		.from(ledger)
		.where(and(eq(ledger.userId, uid), gte(ledger.date, since)))
		.all();
	const ledgerDates = ledgerRows.map((r) => r.date);

	// God mode's whole-tree unlock (src/routes/god). Never read outside the dev server, so in a build
	// a stray row cannot open anything.
	const unlockAll = dev && (await getState<boolean>(db, uid, GOD_UNLOCK_TREE, false)) === true;
	const tree = computeTree({ progress, research, now, unlockAll });

	// Coins accrue lazily: every unpaid active day since the last settlement is paid now, at the
	// city's current rate. There is no other tick left -- morale used to advance here as well.
	const active = new Set(ledgerDates);
	const settledThrough = await getState<string>(db, uid, 'coinsAsOf', addDays(today, -1));
	const settled = settleProduction({
		coinsAsOf: settledThrough,
		today,
		earliest: since,
		active,
		perDay: dailyCoins(placed, tree),
		addDays
	});
	const tickCoins = settled.coins;
	if (settled.coinsAsOf !== settledThrough) await setState(db, uid, 'coinsAsOf', settled.coinsAsOf);
	if (tickCoins > 0) {
		await addResourceStatement(db, uid, 'coins', tickCoins);
		res.coins = (res.coins ?? 0) + tickCoins;
	}

	return {
		user,
		now,
		today,
		progress,
		research,
		tree,
		resources: res,
		buildings: placed,
		weekly: weeklyCount(ledgerDates, today),
		ledgerDates,
		totalSolves,
		hardSolves,
		tickCoins
	};
}
