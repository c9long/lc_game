import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { ledger, planItems, plans } from '../db/schema';
import { fetchDaily, type Daily } from '../leetcode/client';
import { getState, setState, type Snapshot } from './state';
import { PROBLEM_BY_SLUG } from '$lib/game/curriculum';
import { dueRefreshes, isServable, nextNewProblems } from '$lib/game/tree';
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

/** Today's LeetCode daily challenge, looked up once per local date. */
export async function getDaily(db: Db, today: string): Promise<Daily | null> {
	const key = `daily:${today}`;
	const cached = await getState<Daily | null | undefined>(db, key, undefined);
	if (cached !== undefined) return cached;
	let daily: Daily | null = null;
	try {
		daily = await fetchDaily();
	} catch {
		daily = null;
	}
	await setState(db, key, daily);
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

/** Two slots: the most overdue refresh (else a new problem), then the daily challenge if it is in the curriculum, else the next new problem. */
export async function getOrCreatePlan(db: Db, snap: Snapshot): Promise<PlanItem[]> {
	const doneRows = await db.select({ slug: ledger.slug }).from(ledger).where(eq(ledger.date, snap.today)).all();
	const doneToday = new Set(doneRows.map((r) => r.slug));

	// The day's drill set is the source of truth for the Forge slot, exactly as the ledger is for
	// problem slots. Reading it here means a plan regenerated mid-day reflects work already done.
	const drillsDone = isSetComplete(await loadDrillSet(db, snap.today));

	const existing = await db.select().from(planItems).where(eq(planItems.planDate, snap.today)).all();
	if (existing.length > 0) return decorate(existing, doneToday, drillsDone);

	const daily = await getDaily(db, snap.today);
	const refreshes = dueRefreshes(snap.progress, snap.now);
	const exclude = new Set<string>();
	const chosen: { slot: number; slug: string; kind: PlanItem['kind']; done: boolean }[] = [];

	const takeNew = (slot: number) => {
		const [n] = nextNewProblems(snap.tree, snap.progress, 1, exclude);
		if (!n) return false;
		chosen.push({ slot, slug: n.slug, kind: 'new', done: false });
		exclude.add(n.slug);
		return true;
	};
	const takeRefresh = (slot: number) => {
		const r = refreshes.find((x) => !exclude.has(x.slug));
		if (!r) return false;
		chosen.push({ slot, slug: r.slug, kind: 'refresh', done: false });
		exclude.add(r.slug);
		return true;
	};

	if (!takeRefresh(1)) takeNew(1);

	// The daily challenge is only taken when it sits in a node the tree has actually opened.
	// Otherwise LeetCode's pick decides the difficulty: today's was distinct-subsequences, a 2-D DP
	// problem, offered while 1-D DP was still locked.
	const dailyNode = daily ? PROBLEM_BY_SLUG.get(daily.slug)?.nodeId : undefined;
	const dailyNodeView = dailyNode ? snap.tree.get(dailyNode) : undefined;
	const dailyIsCandidate =
		daily &&
		dailyNodeView &&
		isServable(dailyNodeView) &&
		dailyNodeView.status !== 'complete' &&
		!exclude.has(daily.slug) &&
		!(snap.progress.get(daily.slug)?.solveCount ?? 0);
	if (dailyIsCandidate) {
		chosen.push({ slot: 2, slug: daily!.slug, kind: 'daily', done: false });
		exclude.add(daily!.slug);
	} else if (!takeNew(2)) {
		takeRefresh(2);
	}

	if (DRILL_LANGS.length > 0) {
		chosen.push({ slot: 3, slug: langForDate(snap.today), kind: 'drills', done: drillsDone });
	}

	if (chosen.length > 0) {
		await db.batch([
			db.insert(plans).values({ date: snap.today, createdAt: snap.now }).onConflictDoNothing(),
			...chosen.map((c) =>
				db
					.insert(planItems)
					.values({ planDate: snap.today, slot: c.slot, slug: c.slug, kind: c.kind, done: c.done })
					.onConflictDoNothing()
			)
		]);
	}
	return decorate(chosen, doneToday, drillsDone);
}
