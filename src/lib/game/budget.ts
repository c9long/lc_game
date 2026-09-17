import { addDays } from './dates';

/** The pace the home page shows progress against. It is information, not a rule: nothing scales
 *  with it. Morale used to -- a 0-100 multiplier on all income that chased 100 * min(1, weekly/14)
 *  by 15 points a day, with purchasable freeze days to hold it on idle days -- but the refresh
 *  system already penalises absence through node freshness, and a second, city-wide penalty for
 *  the same thing only made income harder to read. Removed 2026-09-16. */
export const WEEKLY_BUDGET = 14;
export const DAILY_TARGET = 2;

/** Credits in the 7-day window ending on `today` (inclusive). */
export function weeklyCount(ledgerDates: Iterable<string>, today: string): number {
	const start = addDays(today, -6);
	let n = 0;
	for (const d of ledgerDates) if (d >= start && d <= today) n++;
	return n;
}
