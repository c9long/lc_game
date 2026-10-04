import { addDays } from './dates';

/** The weekly view on the home page. It is information, not a rule: nothing scales with it. Morale
 *  used to -- a 0-100 multiplier on all income that chased 100 * min(1, weekly/14) by 15 points a
 *  day, with purchasable freeze days to hold it on idle days -- but the refresh system already
 *  penalises absence through node freshness, and a second, city-wide penalty for the same thing
 *  only made income harder to read. Removed 2026-09-16.
 *
 *  The target used to be a fixed 14 a week. Since 2026-10-03 the expedition's size depends on how
 *  many refreshes are due, so the target is now whatever the expedition actually offered
 *  (expeditionTally), split into new problems and refreshes. */

/** Credits in the 7-day window ending on `today` (inclusive). */
export function weeklyCount(ledgerDates: Iterable<string>, today: string): number {
	const start = addDays(today, -6);
	let n = 0;
	for (const d of ledgerDates) if (d >= start && d <= today) n++;
	return n;
}

export interface Tally {
	done: number;
	offered: number;
}

/** What the expedition offered over the 7 days ending on `today`, and how much of it was done.
 *
 *  Counted per distinct problem, not per plan row: a new problem left undone is offered again the
 *  next day, and counting both rows would make one problem look like two missed. An offer is done
 *  when the problem was solved on or after the day it was first offered in the window -- the same
 *  day or later, since a problem finished the next morning was still done. The daily challenge is
 *  a new problem; the Forge drill slot is not a problem and is left out. */
export function expeditionTally(
	offers: Iterable<{ date: string; slug: string; kind: string }>,
	solves: Iterable<{ date: string; slug: string }>,
	today: string
): { fresh: Tally; refresh: Tally } {
	const start = addDays(today, -6);
	const inWindow = (d: string) => d >= start && d <= today;
	const first = { fresh: new Map<string, string>(), refresh: new Map<string, string>() };
	for (const o of offers) {
		if (!inWindow(o.date)) continue;
		const bucket = o.kind === 'refresh' ? first.refresh : o.kind === 'new' || o.kind === 'daily' ? first.fresh : null;
		if (!bucket) continue;
		const seen = bucket.get(o.slug);
		if (!seen || o.date < seen) bucket.set(o.slug, o.date);
	}
	const solvedOn = new Map<string, string[]>();
	for (const s of solves) if (inWindow(s.date)) (solvedOn.get(s.slug) ?? solvedOn.set(s.slug, []).get(s.slug)!).push(s.date);
	const tally = (m: Map<string, string>): Tally => ({
		offered: m.size,
		done: [...m].filter(([slug, from]) => (solvedOn.get(slug) ?? []).some((d) => d >= from)).length
	});
	return { fresh: tally(first.fresh), refresh: tally(first.refresh) };
}
