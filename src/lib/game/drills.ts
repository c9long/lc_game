/** Syntax drills: recall exercises mined from language documentation. No code is executed. */

export type DrillKind = 'cloze' | 'output';

export interface Drill {
	id: string;
	lang: string;
	module: string;
	kind: DrillKind;
	/** Preceding doctest lines shown for context. */
	context: string;
	/** The line(s) with the blank (cloze) or whose output is hidden. */
	code: string;
	/** For cloze: the output the blanked call produces, shown as a hint. */
	hint?: string | null;
	answer: string;
	alternatives?: string[];
	api?: string | null;
	url: string;
	/** A couple of sentences on WHY, shown behind a toggle. A documentation link tells you where to
	 *  read; this tells you what is going on, which is the part worth having for something like a
	 *  bitwise operator. Optional: mined drills have none and fall back to the link. */
	explain?: string | null;
}

export const DRILL_SET_SIZE = 5;
/** How many of a set may be reviews. The rest introduce new material, when any is left.
 *
 *  Without this the day is filled purely by what is due, most overdue first, and a backlog in one
 *  module owns every slot: nine heapq drills started early meant a set of five heapq drills, then
 *  another, indefinitely, because the set never reached the new-material stage at all. */
export const MAX_DUE_PER_SET = 3;
export const INGOT_PER_CORRECT = 1;
export const PERFECT_SET_BONUS = 2;
/** Faster ladder than problems: drills are cheap to repeat. Days. */
export const DRILL_INTERVALS = [1, 3, 7, 21, 60];

export interface DrillSrs {
	srsStep: number;
	dueAt: Date | null;
}

export function afterDrill(prev: DrillSrs | null, correct: boolean, now: Date): DrillSrs {
	let step: number;
	if (!correct) step = 0;
	else if (!prev || prev.srsStep < 0) step = 1;
	else step = Math.min(prev.srsStep + 1, DRILL_INTERVALS.length - 1);
	return { srsStep: step, dueAt: new Date(now.getTime() + DRILL_INTERVALS[step] * 86_400_000) };
}

/** Whitespace-, quote- and spacing-insensitive comparison for printed Python values. */
export function normalizeOutput(s: string): string {
	return s
		.replace(/\r/g, '')
		.split('\n')
		.map((line) =>
			line
				.trim()
				.replace(/"/g, "'")
				.replace(/\s*([,:=])\s*/g, '$1')
				.replace(/\s+/g, ' ')
		)
		.filter((line) => line.length > 0)
		.join('\n');
}

export function normalizeCloze(s: string): string {
	return s.trim().replace(/\s+/g, '').replace(/\($/, '');
}

export function checkAnswer(drill: Drill, given: string): boolean {
	const candidates = [drill.answer, ...(drill.alternatives ?? [])];
	if (drill.kind === 'cloze') {
		const g = normalizeCloze(given);
		return candidates.some((c) => normalizeCloze(c) === g);
	}
	const g = normalizeOutput(given);
	return candidates.some((c) => normalizeOutput(c) === g);
}

export interface DrillProgress {
	srsStep: number;
	dueAt: Date | null;
	correct: number;
	wrong: number;
}

/** Due drills first (most overdue), then unseen drills in bank order, alternating kinds where possible. */
export function buildDrillSet(
	bank: Drill[],
	progress: Map<string, DrillProgress>,
	now: Date,
	size = DRILL_SET_SIZE
): Drill[] {
	const byId = new Map(bank.map((d) => [d.id, d]));
	const due = [...progress.entries()]
		.filter(([id, p]) => byId.has(id) && p.dueAt && p.dueAt.getTime() <= now.getTime())
		.sort((a, b) => a[1].dueAt!.getTime() - b[1].dueAt!.getTime())
		.map(([id]) => byId.get(id)!);
	const out: Drill[] = [];
	const chosen = new Set<string>();
	const perModule = new Map<string, number>();

	/** Take from `pool`, always from the module least represented in the set so far, and preferring
	 *  to alternate cloze with output so a set is not all of one shape. */
	const take = (pool: Drill[], limit: number) => {
		const rest = pool.filter((d) => !chosen.has(d.id));
		while (out.length < limit && rest.length > 0) {
			const fewest = Math.min(...rest.map((d) => perModule.get(d.module) ?? 0));
			const lastKind = out.length ? out[out.length - 1].kind : null;
			let idx = rest.findIndex((d) => (perModule.get(d.module) ?? 0) === fewest && d.kind !== lastKind);
			if (idx < 0) idx = rest.findIndex((d) => (perModule.get(d.module) ?? 0) === fewest);
			const [d] = rest.splice(idx, 1);
			out.push(d);
			chosen.add(d.id);
			perModule.set(d.module, (perModule.get(d.module) ?? 0) + 1);
		}
	};

	// Reviews first, but capped, and spread across modules rather than taken strictly by overdueness.
	take(due, Math.min(size, MAX_DUE_PER_SET));
	// Then new material, also spread across modules.
	take(bank.filter((d) => !progress.has(d.id)), size);

	// Only if there is no new material left does the rest of the backlog fill the day.
	take(due, size);
	return out;
}

export function ingotsFor(results: boolean[]): number {
	const correct = results.filter(Boolean).length;
	const bonus = results.length >= DRILL_SET_SIZE && correct === results.length ? PERFECT_SET_BONUS : 0;
	return correct * INGOT_PER_CORRECT + bonus;
}
