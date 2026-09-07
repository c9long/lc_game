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
}

export const DRILL_SET_SIZE = 5;
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
	for (const d of due) {
		if (out.length >= size) break;
		out.push(d);
		chosen.add(d.id);
	}
	let lastKind: DrillKind | null = out.length ? out[out.length - 1].kind : null;
	// Round-robin across modules as well as alternating kinds. The bank is grouped by module, so
	// taking unseen drills in bank order gave a whole day from one module — nine heapq drills, then
	// bisect, then collections. Always taking from the module least represented in the set spreads
	// it evenly, and still fills the set when only one module has drills left.
	const perModule = new Map<string, number>();
	for (const d of out) perModule.set(d.module, (perModule.get(d.module) ?? 0) + 1);
	const unseen = bank.filter((d) => !progress.has(d.id) && !chosen.has(d.id));
	while (out.length < size && unseen.length > 0) {
		const fewest = Math.min(...unseen.map((d) => perModule.get(d.module) ?? 0));
		let idx = unseen.findIndex((d) => (perModule.get(d.module) ?? 0) === fewest && d.kind !== lastKind);
		if (idx < 0) idx = unseen.findIndex((d) => (perModule.get(d.module) ?? 0) === fewest);
		const [d] = unseen.splice(idx, 1);
		out.push(d);
		chosen.add(d.id);
		perModule.set(d.module, (perModule.get(d.module) ?? 0) + 1);
		lastKind = d.kind;
	}
	return out;
}

export function ingotsFor(results: boolean[]): number {
	const correct = results.filter(Boolean).length;
	const bonus = results.length >= DRILL_SET_SIZE && correct === results.length ? PERFECT_SET_BONUS : 0;
	return correct * INGOT_PER_CORRECT + bonus;
}
