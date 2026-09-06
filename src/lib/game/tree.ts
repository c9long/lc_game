import {
	NODES,
	NODE_BY_ID,
	NODE_ORDER,
	PROBLEM_BY_SLUG,
	problemsForNode,
	type CurriculumProblem
} from './curriculum';
import { isDue } from './srs';

export const UNLOCK_FRACTION = 0.5;
export const RUSTING_BELOW = 0.5;

export type NodeStatus = 'locked' | 'available' | 'unlocked' | 'complete';

export interface ProblemProgress {
	solveCount: number;
	srsStep: number;
	dueAt: Date | null;
}

export interface NodeView {
	id: string;
	pattern: string;
	row: number;
	col: number;
	requires: string[];
	total: number;
	solved: number;
	due: number;
	/** 1 when nothing is overdue (or nothing solved yet). */
	freshness: number;
	status: NodeStatus;
	rusting: boolean;
	research: number;
}

export interface TreeInput {
	progress: Map<string, ProblemProgress>;
	research: Map<string, number>;
	hasPremium: boolean;
	now: Date;
}

export function computeTree(input: TreeInput): Map<string, NodeView> {
	const views = new Map<string, NodeView>();
	for (const id of NODE_ORDER) {
		const node = NODE_BY_ID.get(id)!;
		const problems = problemsForNode(id, input.hasPremium);
		let solved = 0;
		let due = 0;
		for (const p of problems) {
			const s = input.progress.get(p.slug);
			if (!s || s.solveCount === 0) continue;
			solved++;
			if (isDue(s, input.now)) due++;
		}
		const total = problems.length;
		const freshness = solved === 0 ? 1 : (solved - due) / solved;
		const prereqsMet = node.requires.every((r) => {
			const st = views.get(r)?.status;
			return st === 'unlocked' || st === 'complete';
		});
		let status: NodeStatus;
		if (total > 0 && solved >= total) status = 'complete';
		else if (solved >= Math.ceil(total * UNLOCK_FRACTION) && solved > 0) status = 'unlocked';
		else status = prereqsMet ? 'available' : 'locked';
		views.set(id, {
			id,
			pattern: node.pattern,
			row: node.row,
			col: node.col,
			requires: node.requires,
			total,
			solved,
			due,
			freshness,
			status,
			rusting: solved > 0 && freshness < RUSTING_BELOW,
			research: input.research.get(id) ?? 0
		});
	}
	return views;
}

export function isOpen(status: NodeStatus): boolean {
	return status !== 'locked';
}

/** Unsolved problems in roadmap order from open, incomplete nodes. */
export function nextNewProblems(
	tree: Map<string, NodeView>,
	progress: Map<string, ProblemProgress>,
	hasPremium: boolean,
	limit: number,
	exclude: Set<string> = new Set()
): CurriculumProblem[] {
	const out: CurriculumProblem[] = [];
	for (const id of NODE_ORDER) {
		const view = tree.get(id)!;
		if (!isOpen(view.status) || view.status === 'complete') continue;
		for (const p of problemsForNode(id, hasPremium)) {
			if (exclude.has(p.slug)) continue;
			const s = progress.get(p.slug);
			if (s && s.solveCount > 0) continue;
			out.push(p);
			if (out.length >= limit) return out;
		}
	}
	return out;
}

/** Solved problems that are due, most overdue first. */
export function dueRefreshes(
	progress: Map<string, ProblemProgress>,
	hasPremium: boolean,
	now: Date
): { slug: string; overdueMs: number }[] {
	const premiumSlugs = new Set(
		NODES.flatMap((n) => problemsForNode(n.id, true).filter((p) => p.premium).map((p) => p.slug))
	);
	const out: { slug: string; overdueMs: number }[] = [];
	for (const [slug, s] of progress) {
		// Profile sync records every accepted submission so solves made on leetcode.com still count
		// towards the weekly budget, which means progress holds problems outside the curriculum.
		// Those must never become refresh tasks: the tree does not track them and, since expected
		// outputs come from the vendored reference solutions, there is no suite to judge them with.
		if (!PROBLEM_BY_SLUG.has(slug)) continue;
		if (s.solveCount === 0 || !isDue(s, now)) continue;
		if (!hasPremium && premiumSlugs.has(slug)) continue;
		out.push({ slug, overdueMs: now.getTime() - s.dueAt!.getTime() });
	}
	return out.sort((a, b) => b.overdueMs - a.overdueMs);
}
