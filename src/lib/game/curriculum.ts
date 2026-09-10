import problemsJson from '../../../data/neetcode150.json';
import roadmapJson from '../../../data/roadmap.json';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface CurriculumProblem {
	order: number;
	code: string;
	slug: string;
	title: string;
	pattern: string;
	difficulty: Difficulty;
	blind75: boolean;
	premium: boolean;
	solutions: Record<string, boolean>;
	nodeId: string;
}

export interface RoadmapNode {
	id: string;
	pattern: string;
	requires: string[];
	row: number;
	col: number;
}

export const NODES: RoadmapNode[] = roadmapJson.nodes;
export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));
const nodeByPattern = new Map(NODES.map((n) => [n.pattern, n.id]));

export const PROBLEMS: CurriculumProblem[] = (problemsJson as Omit<CurriculumProblem, 'nodeId'>[]).map(
	(p) => {
		const nodeId = nodeByPattern.get(p.pattern);
		if (!nodeId) throw new Error(`no roadmap node for pattern ${p.pattern}`);
		return { ...p, difficulty: p.difficulty as Difficulty, nodeId };
	}
);

export const PROBLEM_BY_SLUG = new Map(PROBLEMS.map((p) => [p.slug, p]));

export function problemsForNode(nodeId: string): CurriculumProblem[] {
	// Every problem counts, Premium or not. LeetCode withholds the statement for its seven Premium
	// problems, so they used to be excluded unless you owned a subscription; the statements now come
	// from data/premium-descriptions.json and the suites were always generated from public metadata,
	// so there is nothing left for a subscription to unlock.
	return PROBLEMS.filter((p) => p.nodeId === nodeId);
}

/** Depth-first order of nodes: prerequisites before dependants, then by row/col. */
export const NODE_ORDER: string[] = (() => {
	const seen = new Set<string>();
	const out: string[] = [];
	const visit = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		for (const r of NODE_BY_ID.get(id)!.requires) visit(r);
		out.push(id);
	};
	for (const n of [...NODES].sort((a, b) => a.row - b.row || a.col - b.col)) visit(n.id);
	return out;
})();
