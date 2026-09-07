import { eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { awards, buildings, gameState, ledger, problemState, resources, type User } from '../db/schema';
import { advanceMorale, weeklyCount, type MoraleState } from '$lib/game/budget';
import { dailyCoins, hasEffect, settleProduction, type PlacedBuilding } from '$lib/game/city';
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
	morale: MoraleState;
	weekly: number;
	ledgerDates: string[];
	totalSolves: number;
	hardSolves: number;
	/** Coins accrued by this request's tick, for a toast. */
	tickCoins: number;
}

export async function getState<T>(db: Db, key: string, fallback: T): Promise<T> {
	const row = await db.select().from(gameState).where(eq(gameState.key, key)).get();
	return row ? (row.value as T) : fallback;
}

export async function setState(db: Db, key: string, value: unknown): Promise<void> {
	const now = new Date();
	await db
		.insert(gameState)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: gameState.key, set: { value, updatedAt: now } });
}

export function addResourceStatement(db: Db, kind: string, amount: number) {
	return db
		.insert(resources)
		.values({ kind, amount })
		.onConflictDoUpdate({ target: resources.kind, set: { amount: sql`${resources.amount} + excluded.amount` } });
}

export async function loadSnapshot(db: Db, user: User, now = new Date()): Promise<Snapshot> {
	const today = localDate(now, user.timezone);

	const stateRows = await db.select().from(problemState).all();
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

	const awardRows = await db.select({ slug: awards.slug, research: awards.research }).from(awards).all();
	const research = new Map<string, number>();
	for (const a of awardRows) {
		const nodeId = PROBLEM_BY_SLUG.get(a.slug)?.nodeId;
		if (nodeId) research.set(nodeId, (research.get(nodeId) ?? 0) + a.research);
	}

	const resRows = await db.select().from(resources).all();
	const res: Record<string, number> = {};
	for (const r of resRows) res[r.kind] = r.amount;

	const bRows = await db.select().from(buildings).all();
	const placed: PlacedBuilding[] = bRows.map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, level: b.level }));

	const since = addDays(today, -70);
	const ledgerRows = await db.select({ date: ledger.date }).from(ledger).where(gte(ledger.date, since)).all();
	const ledgerDates = ledgerRows.map((r) => r.date);

	const tree = computeTree({ progress, research, hasPremium: user.hasPremium, now });

	// Morale must be stored the first time it is seen. It used to be written only inside the tick
	// branch below, while the fallback it reads is dated today — so the branch was never true, the
	// state was never persisted, and the next day fell back to a fresh "today" again. The condition
	// could not become true on any day, so production never accrued at all.
	const storedMorale = await getState<MoraleState | null>(db, 'morale', null);
	let morale: MoraleState = storedMorale ?? { morale: 100, asOf: today, freezeDays: 0 };
	if (!storedMorale) await setState(db, 'morale', morale);

	const active = new Set(ledgerDates);
	const moraleByDate = new Map<string, number>();
	if (morale.asOf < today) {
		const { state, ticks } = advanceMorale(morale, ledgerDates, today, { hasWalls: hasEffect(placed, 'walls') });
		for (const t of ticks) moraleByDate.set(t.date, t.after);
		morale = state;
		await setState(db, 'morale', morale);
	}

	const settledThrough = await getState<string>(db, 'coinsAsOf', addDays(today, -1));
	const settled = settleProduction({
		coinsAsOf: settledThrough,
		today,
		earliest: since,
		active,
		moraleByDate,
		currentMorale: morale.morale,
		perDay: (m) => dailyCoins(placed, tree, m),
		addDays
	});
	const tickCoins = settled.coins;
	if (settled.coinsAsOf !== settledThrough) await setState(db, 'coinsAsOf', settled.coinsAsOf);
	if (tickCoins > 0) {
		await addResourceStatement(db, 'coins', tickCoins);
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
		morale,
		weekly: weeklyCount(ledgerDates, today),
		ledgerDates,
		totalSolves,
		hardSolves,
		tickCoins
	};
}
