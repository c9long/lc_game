import { addDays } from './dates';

export const WEEKLY_BUDGET = 14;
export const DAILY_TARGET = 2;
export const MORALE_STEP = 15;
export const MAX_FREEZE_DAYS = 3;

/** Credits in the 7-day window ending on `today` (inclusive). */
export function weeklyCount(ledgerDates: Iterable<string>, today: string): number {
	const start = addDays(today, -6);
	let n = 0;
	for (const d of ledgerDates) if (d >= start && d <= today) n++;
	return n;
}

export interface MoraleState {
	morale: number;
	/** Local date the morale value is valid for. */
	asOf: string;
	freezeDays: number;
}

export interface MoraleOptions {
	/** Walls halve daily losses. */
	hasWalls: boolean;
}

export interface MoraleTick {
	date: string;
	before: number;
	after: number;
	usedFreeze: boolean;
}

/**
 * Advance morale one day at a time from state.asOf to `today`.
 * Each day morale moves toward 100 * min(1, weekly/14) by at most MORALE_STEP (losses halved with walls).
 * A zero-solve day that would lose morale consumes a freeze day instead, if one is stored.
 */
export function advanceMorale(
	state: MoraleState,
	ledgerDates: string[],
	today: string,
	opts: MoraleOptions
): { state: MoraleState; ticks: MoraleTick[] } {
	const ticks: MoraleTick[] = [];
	let { morale, asOf, freezeDays } = state;
	const dates = new Set(ledgerDates);
	while (asOf < today) {
		const day = addDays(asOf, 1);
		const target = 100 * Math.min(1, weeklyCount(ledgerDates, day) / WEEKLY_BUDGET);
		const delta = target - morale;
		const before = morale;
		let usedFreeze = false;
		if (delta < 0) {
			const loss = Math.min(-delta, opts.hasWalls ? MORALE_STEP / 2 : MORALE_STEP);
			if (!dates.has(day) && freezeDays > 0) {
				freezeDays -= 1;
				usedFreeze = true;
			} else {
				morale = Math.max(0, morale - loss);
			}
		} else {
			morale = Math.min(100, morale + Math.min(delta, MORALE_STEP));
		}
		morale = Math.round(morale * 100) / 100;
		ticks.push({ date: day, before, after: morale, usedFreeze });
		asOf = day;
	}
	return { state: { morale, asOf, freezeDays }, ticks };
}
