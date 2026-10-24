import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { marketPrices, resources, trades, users } from '../db/schema';
import { MATERIALS, epochOf, isMaterial, type Material, type Prices } from '$lib/game/market';
import { nextFair } from '$lib/game/fair-price';

// Fair prices are set by the cron worker (src/cron/market.ts) at the start of each 8-hour epoch,
// from each player's holdings at that moment. ensurePrices() is the fallback for a missed cron or a
// player who joined mid-epoch: it prices them on the spot, the same way, so the market always opens.

function toPrices(rows: { kind: string; fair: number }[]): Prices | null {
	const out: Partial<Prices> = {};
	for (const r of rows) if (isMaterial(r.kind)) out[r.kind] = r.fair;
	return MATERIALS.every((m) => out[m] !== undefined) ? (out as Prices) : null;
}

export async function fairFor(db: Db, uid: string, epoch: number): Promise<Prices | null> {
	const rows = await db
		.select({ kind: marketPrices.kind, fair: marketPrices.fair })
		.from(marketPrices)
		.where(and(eq(marketPrices.userId, uid), eq(marketPrices.epoch, epoch)))
		.all();
	return toPrices(rows);
}

/** The most recent fair prices from before `epoch`: the last reprice, however long ago it was. */
export async function previousFair(db: Db, uid: string, epoch: number): Promise<Prices | null> {
	const last = await db
		.select({ epoch: marketPrices.epoch })
		.from(marketPrices)
		.where(and(eq(marketPrices.userId, uid), lt(marketPrices.epoch, epoch)))
		.orderBy(desc(marketPrices.epoch))
		.limit(1)
		.get();
	return last ? fairFor(db, uid, last.epoch) : null;
}

async function holdings(db: Db, uid: string): Promise<Record<string, number>> {
	const rows = await db.select().from(resources).where(eq(resources.userId, uid)).all();
	return Object.fromEntries(rows.map((r) => [r.kind, r.amount]));
}

/** Sets this player's fair prices for `epoch` from what they hold now. Never overwrites: a second
 *  run for the same epoch (a retried cron, the fallback racing it) keeps whichever landed first. */
export async function repriceUser(db: Db, uid: string, epoch: number): Promise<Prices> {
	const [held, prev] = await Promise.all([holdings(db, uid), previousFair(db, uid, epoch)]);
	const fair = nextFair(prev, held);
	const createdAt = new Date();
	await db
		.insert(marketPrices)
		.values(MATERIALS.map((m) => ({ userId: uid, epoch, kind: m, fair: fair[m], createdAt })))
		.onConflictDoNothing();
	return (await fairFor(db, uid, epoch)) ?? fair;
}

/** The cron's job: reprice every player for the epoch. Returns how many were priced. */
export async function repriceAll(db: Db, epoch: number): Promise<number> {
	const all = await db.select({ id: users.id }).from(users).all();
	for (const u of all) await repriceUser(db, u.id, epoch);
	return all.length;
}

export interface MarketPrices {
	epoch: number;
	fair: Prices;
	/** The epoch before's, for a trend; null for a player's first. */
	prev: Prices | null;
}

export async function ensurePrices(db: Db, uid: string, now: Date = new Date()): Promise<MarketPrices> {
	const epoch = epochOf(now.getTime());
	const [fair, prev] = await Promise.all([fairFor(db, uid, epoch), previousFair(db, uid, epoch)]);
	return { epoch, fair: fair ?? (await repriceUser(db, uid, epoch)), prev };
}

/** Units of each material already received this epoch, toward its cap. */
export async function receivedThisEpoch(db: Db, uid: string, epoch: number): Promise<Prices> {
	const rows = await db
		.select({ kind: trades.getKind, n: sql<number>`SUM(${trades.getAmount})` })
		.from(trades)
		.where(and(eq(trades.userId, uid), eq(trades.epoch, epoch)))
		.groupBy(trades.getKind)
		.all();
	const out: Prices = { timber: 0, stone: 0, iron: 0 };
	for (const r of rows) if (isMaterial(r.kind)) out[r.kind] = Number(r.n);
	return out;
}

export interface TradeRow {
	giveKind: string;
	giveAmount: number;
	getKind: Material;
	getAmount: number;
	createdAt: Date;
}

export async function recentTrades(db: Db, uid: string, limit = 10): Promise<TradeRow[]> {
	const rows = await db
		.select({
			giveKind: trades.giveKind,
			giveAmount: trades.giveAmount,
			getKind: trades.getKind,
			getAmount: trades.getAmount,
			createdAt: trades.createdAt
		})
		.from(trades)
		.where(eq(trades.userId, uid))
		.orderBy(desc(trades.createdAt))
		.limit(limit)
		.all();
	return rows.filter((r): r is TradeRow => isMaterial(r.getKind));
}
