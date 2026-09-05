/** Spaced-repetition ladder in days. A freshly solved problem is due again after INTERVALS[0]. */
export const INTERVALS = [3, 7, 21, 60, 120, 240];

export interface SrsState {
	/** Index into INTERVALS; -1 means never solved. */
	srsStep: number;
	dueAt: Date | null;
}

export type SolveQuality = 'clean' | 'assisted';

/**
 * Next schedule after an accepted solve.
 * clean and on time (or first solve) -> step up; clean but badly overdue -> hold; assisted -> back to step 0.
 */
export function afterSolve(prev: SrsState | null, quality: SolveQuality, now: Date): SrsState {
	let step: number;
	if (!prev || prev.srsStep < 0) step = 0;
	else if (quality === 'assisted') step = 0;
	else if (badlyOverdue(prev, now)) step = prev.srsStep;
	else step = Math.min(prev.srsStep + 1, INTERVALS.length - 1);
	return { srsStep: step, dueAt: new Date(now.getTime() + INTERVALS[step] * 86_400_000) };
}

export function isDue(state: SrsState, now: Date): boolean {
	return state.dueAt !== null && state.dueAt.getTime() <= now.getTime();
}

/** Overdue by more than the interval that was scheduled. */
export function badlyOverdue(state: SrsState, now: Date): boolean {
	if (!state.dueAt || state.srsStep < 0) return false;
	const interval = INTERVALS[Math.min(state.srsStep, INTERVALS.length - 1)] * 86_400_000;
	return now.getTime() - state.dueAt.getTime() > interval;
}

export function overdueDays(state: SrsState, now: Date): number {
	if (!state.dueAt) return 0;
	return Math.max(0, Math.floor((now.getTime() - state.dueAt.getTime()) / 86_400_000));
}
