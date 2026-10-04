import { and, eq, gte } from 'drizzle-orm';
import type { Db } from '../db';
import { ledger, planItems, plans } from '../db/schema';
import { fetchDaily, type Daily } from '../leetcode/client';
import { getState, setState, type Snapshot } from './state';
import { PROBLEM_BY_SLUG } from '$lib/game/curriculum';
import { expeditionTally } from '$lib/game/budget';
import { addDays } from '$lib/game/dates';
import { dueRefreshes, isServable, nextNewProblems, type NodeView, type ProblemProgress } from '$lib/game/tree';
import { DRILL_LANGS } from '$lib/game/drillbank';
import { isSetComplete, langForDate, loadDrillSet } from './drills';

export interface PlanItem {
	slot: number;
	slug: string;
	kind: 'new' | 'refresh' | 'daily' | 'drills';
	done: boolean;
	title: string;
	difficulty: string;
	nodeId: string | null;
	pattern: string | null;
}

/** Today's LeetCode daily challenge, looked up once per player per local date. */
export async function getDaily(db: Db, uid: string, today: string): Promise<Daily | null> {
	const key = `daily:${today}`;
	const cached = await getState<Daily | null | undefined>(db, uid, key, undefined);
	if (cached !== undefined) return cached;
	let daily: Daily | null = null;
	try {
		daily = await fetchDaily();
	} catch {
		daily = null;
	}
	await setState(db, uid, key, daily);
	return daily;
}

/** Whether a plan item counts as done.
 *
 *  Always derived from the underlying record rather than trusting the stored flag, because a plan
 *  can be created after the work was already finished. The stored flag is written once, at the
 *  moment the work completes, so a plan built later never receives it: regenerating today's plan
 *  after finishing the drills left the Forge slot permanently unticked with no way to earn it
 *  again. The ledger plays this role for problems; the day's drill set plays it for drills.
 */
export function planItemDone(
	item: { kind: PlanItem['kind']; slug: string; done: boolean },
	doneToday: Set<string>,
	drillsDone: boolean
): boolean {
	if (item.kind === 'drills') return item.done || drillsDone;
	return item.done || doneToday.has(item.slug);
}

function decorate(
	items: { slot: number; slug: string; kind: PlanItem['kind']; done: boolean }[],
	doneToday: Set<string>,
	drillsDone: boolean
): PlanItem[] {
	return items
		.sort((a, b) => a.slot - b.slot)
		.map((i) => {
			if (i.kind === 'drills') {
				return {
					...i,
					done: planItemDone(i, doneToday, drillsDone),
					title: `Syntax drills (${i.slug})`,
					difficulty: '',
					nodeId: null,
					pattern: 'Forge'
				};
			}
			const p = PROBLEM_BY_SLUG.get(i.slug);
			return {
				...i,
				done: planItemDone(i, doneToday, drillsDone),
				title: p?.title ?? i.slug,
				difficulty: p?.difficulty ?? '',
				nodeId: p?.nodeId ?? null,
				pattern: p?.pattern ?? null
			};
		});
}

/** At most this many refreshes go into one expedition. */
export const MAX_REFRESH_SLOTS = 2;
/** The Forge row's slot: fixed, after the most problem slots a plan can hold (slotCounts tops out
 *  at three), so two first loads of the day that see different due counts still agree on it and
 *  cannot each insert a drills row. The home page numbers rows by position, not by slot. */
export const DRILLS_SLOT = 4;

/** How many problem slots of each kind the expedition gets, given how many refreshes are due.
 *
 *  Progression is the point: every day introduces at least one untouched problem. Two or more due
 *  refreshes take two slots and leave one for a new problem; one due refresh leaves two new; none
 *  due means two new. (Until 2026-10-03 three due refreshes took both slots and no new problem was
 *  served at all, which stalled the tree whenever the backlog stood.) */
export function slotCounts(due: number): { refresh: number; fresh: number } {
	const refresh = Math.min(due, MAX_REFRESH_SLOTS);
	return { refresh, fresh: refresh >= MAX_REFRESH_SLOTS ? 1 : 2 };
}

/** The problem slots, chosen from the tree, the SRS schedule and the day's daily challenge.
 *
 *  Refreshes come first, earliest due in curriculum order; then the new problems (slotCounts says how
 *  many of each). The daily challenge takes the first new slot when it sits in a node the tree has
 *  actually opened and has never been solved. The daily is gated on the node because otherwise
 *  LeetCode's pick decides the difficulty: one day's was distinct-subsequences, a 2-D DP problem,
 *  offered while 1-D DP was still locked.
 *
 *  A kind that runs short (the curriculum has no new problem left, say) is made up with the other,
 *  so the expedition keeps its size while there is anything to serve.
 *
 *  Pure so the slot rules can be tested without a database.
 */
export function chooseSlots(
	// Only what the rules read, rather than Pick<Snapshot, ...>: the slot choice depends on nothing
	// else, and the narrower type is what lets it be exercised without building a whole snapshot.
	snap: { tree: Map<string, NodeView>; progress: Map<string, ProblemProgress>; now: Date },
	daily: Daily | null
): { slot: number; slug: string; kind: PlanItem['kind']; done: boolean }[] {
	const refreshes = dueRefreshes(snap.tree, snap.progress, snap.now);
	const exclude = new Set<string>();
	const chosen: { slot: number; slug: string; kind: PlanItem['kind']; done: boolean }[] = [];
	const next = () => chosen.length + 1;

	const takeNew = () => {
		const [n] = nextNewProblems(snap.tree, snap.progress, 1, exclude);
		if (!n) return false;
		chosen.push({ slot: next(), slug: n.slug, kind: 'new', done: false });
		exclude.add(n.slug);
		return true;
	};
	const takeRefresh = () => {
		const r = refreshes.find((x) => !exclude.has(x.slug));
		if (!r) return false;
		chosen.push({ slot: next(), slug: r.slug, kind: 'refresh', done: false });
		exclude.add(r.slug);
		return true;
	};
	const takeDaily = () => {
		const node = daily ? PROBLEM_BY_SLUG.get(daily.slug)?.nodeId : undefined;
		const view = node ? snap.tree.get(node) : undefined;
		const ok =
			daily &&
			view &&
			isServable(view) &&
			view.status !== 'complete' &&
			!exclude.has(daily.slug) &&
			!(snap.progress.get(daily.slug)?.solveCount ?? 0);
		if (!ok) return false;
		chosen.push({ slot: next(), slug: daily!.slug, kind: 'daily', done: false });
		exclude.add(daily!.slug);
		return true;
	};

	const want = slotCounts(refreshes.length);
	for (let i = 0; i < want.refresh; i++) if (!takeRefresh()) takeNew();
	for (let i = 0; i < want.fresh; i++) if (!(i === 0 && takeDaily()) && !takeNew()) takeRefresh();
	return chosen;
}

/** The last 7 days of expeditions: new problems and refreshes offered, and how many were done. */
export async function weeklyExpedition(db: Db, uid: string, today: string) {
	const since = addDays(today, -6);
	const offers = await db
		.select({ date: planItems.planDate, slug: planItems.slug, kind: planItems.kind })
		.from(planItems)
		.where(and(eq(planItems.userId, uid), gte(planItems.planDate, since)))
		.all();
	const solves = await db
		.select({ date: ledger.date, slug: ledger.slug })
		.from(ledger)
		.where(and(eq(ledger.userId, uid), gte(ledger.date, since)))
		.all();
	return expeditionTally(offers, solves, today);
}

/** Today's expedition: the problem slots from chooseSlots plus the Forge drill slot after them,
 *  persisted on first read so the day's plan is stable. */
export async function getOrCreatePlan(db: Db, snap: Snapshot): Promise<PlanItem[]> {
	const uid = snap.user.id;
	const doneRows = await db
		.select({ slug: ledger.slug })
		.from(ledger)
		.where(and(eq(ledger.userId, uid), eq(ledger.date, snap.today)))
		.all();
	const doneToday = new Set(doneRows.map((r) => r.slug));

	// The day's drill set is the source of truth for the Forge slot, exactly as the ledger is for
	// problem slots. Reading it here means a plan regenerated mid-day reflects work already done.
	const drillsDone = isSetComplete(await loadDrillSet(db, uid, snap.today));

	const existing = await db
		.select()
		.from(planItems)
		.where(and(eq(planItems.userId, uid), eq(planItems.planDate, snap.today)))
		.all();
	if (existing.length > 0) return decorate(existing, doneToday, drillsDone);

	const daily = await getDaily(db, uid, snap.today);
	const chosen = chooseSlots(snap, daily);

	if (DRILL_LANGS.length > 0) {
		chosen.push({ slot: DRILLS_SLOT, slug: langForDate(snap.today), kind: 'drills', done: drillsDone });
	}

	if (chosen.length > 0) {
		await db.batch([
			db.insert(plans).values({ userId: uid, date: snap.today, createdAt: snap.now }).onConflictDoNothing(),
			...chosen.map((c) =>
				db
					.insert(planItems)
					.values({ userId: uid, planDate: snap.today, slot: c.slot, slug: c.slug, kind: c.kind, done: c.done })
					.onConflictDoNothing()
			)
		]);
	}
	return decorate(chosen, doneToday, drillsDone);
}
