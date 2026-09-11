/** Spaced-repetition ladder in days. A freshly solved problem is due again after INTERVALS[0].
 *
 *  Capped at 30 days deliberately. A longer tail (the ladder previously ran to 240) means a problem
 *  at the top contributes to its node's freshness, and so to that node's income, for most of a year
 *  without ever being re-derived. Thirty days keeps every solved problem in circulation while still
 *  rewarding the climb: four clean on-time solves take a problem from returning twice a week to
 *  returning monthly.
 */
export const INTERVALS = [3, 7, 14, 21, 30];

export interface SrsState {
	/** Index into INTERVALS; -1 means never solved. */
	srsStep: number;
	dueAt: Date | null;
}

export type SolveQuality = 'clean' | 'assisted';

/**
 * Next schedule after an accepted solve: clean (or a first solve) -> step up; assisted -> back to
 * step 0.
 *
 * Lateness is deliberately not a factor. A clean solve that arrived long past its due date used
 * to hold its rung instead of advancing, on the theory that ignoring the schedule should not
 * earn a longer interval. But that punished the one case that proves retention -- a problem
 * solved unaided after a longer gap than the next rung even asks for -- while every overdue day
 * was already costing income through node freshness. Forgetting is caught by the assisted reset;
 * lateness needs no second penalty.
 */
export function afterSolve(prev: SrsState | null, quality: SolveQuality, now: Date): SrsState {
	let step: number;
	if (!prev || prev.srsStep < 0) step = 0;
	else if (quality === 'assisted') step = 0;
	else step = Math.min(prev.srsStep + 1, INTERVALS.length - 1);
	return { srsStep: step, dueAt: new Date(now.getTime() + INTERVALS[step] * 86_400_000) };
}

export function isDue(state: SrsState, now: Date): boolean {
	return state.dueAt !== null && state.dueAt.getTime() <= now.getTime();
}

export function overdueDays(state: SrsState, now: Date): number {
	if (!state.dueAt) return 0;
	return Math.max(0, Math.floor((now.getTime() - state.dueAt.getTime()) / 86_400_000));
}
