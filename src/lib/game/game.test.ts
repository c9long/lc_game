import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDate } from './dates';
import { INTERVALS, afterSolve, badlyOverdue, isDue, type SrsState } from './srs';
import { NODES, NODE_ORDER, PROBLEMS, problemsForNode } from './curriculum';
import { computeTree, dueRefreshes, nextNewProblems, type ProblemProgress } from './tree';
import { computeAward } from './awards';
import { WEEKLY_BUDGET, advanceMorale, weeklyCount } from './budget';
import { BUILDINGS, baseProduction, canAfford, costAtLevel, dailyCoins, gateSatisfied } from './city';
import { DRILL_INTERVALS, afterDrill, buildDrillSet, checkAnswer, ingotsFor, normalizeOutput, type Drill } from './drills';

const DAY = 86_400_000;
const t0 = new Date('2026-09-04T12:00:00Z');

describe('dates', () => {
	it('formats local dates and does arithmetic', () => {
		expect(localDate(new Date('2026-09-04T23:30:00Z'), 'America/Los_Angeles')).toBe('2026-09-04');
		expect(localDate(new Date('2026-09-04T23:30:00Z'), 'Europe/London')).toBe('2026-09-05');
		expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
		expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7);
	});
});

describe('srs', () => {
	it('steps up on clean solves and resets when assisted', () => {
		const s0 = afterSolve(null, 'clean', t0);
		expect(s0.srsStep).toBe(0);
		expect(s0.dueAt!.getTime()).toBe(t0.getTime() + INTERVALS[0] * DAY);
		const s1 = afterSolve(s0, 'clean', new Date(s0.dueAt!.getTime() + DAY));
		expect(s1.srsStep).toBe(1);
		const reset = afterSolve(s1, 'assisted', new Date(s1.dueAt!.getTime()));
		expect(reset.srsStep).toBe(0);
	});
	it('holds the step when badly overdue and caps at the ladder end', () => {
		const s1 = afterSolve(afterSolve(null, 'clean', t0), 'clean', new Date(t0.getTime() + 4 * DAY));
		const late = new Date(s1.dueAt!.getTime() + (INTERVALS[1] + 1) * DAY);
		expect(badlyOverdue(s1, late)).toBe(true);
		expect(afterSolve(s1, 'clean', late).srsStep).toBe(1);
		let s: SrsState = { srsStep: INTERVALS.length - 1, dueAt: t0 };
		s = afterSolve(s, 'clean', t0);
		expect(s.srsStep).toBe(INTERVALS.length - 1);
		expect(isDue(s, t0)).toBe(false);
	});
});

describe('curriculum', () => {
	it('has 150 problems across 18 nodes in a prerequisite-respecting order', () => {
		expect(PROBLEMS.length).toBe(150);
		expect(NODES.length).toBe(18);
		expect(NODE_ORDER.length).toBe(18);
		for (const n of NODES) {
			for (const r of n.requires) expect(NODE_ORDER.indexOf(r)).toBeLessThan(NODE_ORDER.indexOf(n.id));
		}
		expect(problemsForNode('arrays-hashing', true).length).toBe(9);
		expect(problemsForNode('arrays-hashing', false).length).toBe(8);
	});
});

function progressFor(slugs: string[], dueAt: Date | null = null): Map<string, ProblemProgress> {
	return new Map(slugs.map((s) => [s, { solveCount: 1, srsStep: 0, dueAt }]));
}

describe('tree', () => {
	it('starts with only the root available and unlocks at half', () => {
		const empty = computeTree({ progress: new Map(), research: new Map(), hasPremium: false, now: t0 });
		expect(empty.get('arrays-hashing')!.status).toBe('available');
		expect(empty.get('two-pointers')!.status).toBe('locked');
		const root = problemsForNode('arrays-hashing', false).map((p) => p.slug);
		const half = computeTree({ progress: progressFor(root.slice(0, 4)), research: new Map(), hasPremium: false, now: t0 });
		expect(half.get('arrays-hashing')!.status).toBe('unlocked');
		expect(half.get('two-pointers')!.status).toBe('available');
		expect(half.get('stack')!.status).toBe('available');
		expect(half.get('binary-search')!.status).toBe('locked');
		const full = computeTree({ progress: progressFor(root), research: new Map(), hasPremium: false, now: t0 });
		expect(full.get('arrays-hashing')!.status).toBe('complete');
	});
	it('computes freshness, rusting and refresh ordering', () => {
		const root = problemsForNode('arrays-hashing', false).map((p) => p.slug);
		const overdue = new Date(t0.getTime() - 2 * DAY);
		const progress = new Map<string, ProblemProgress>();
		root.slice(0, 4).forEach((s, i) =>
			progress.set(s, { solveCount: 1, srsStep: 0, dueAt: i < 3 ? new Date(overdue.getTime() - i * DAY) : new Date(t0.getTime() + DAY) })
		);
		const tree = computeTree({ progress, research: new Map(), hasPremium: false, now: t0 });
		const v = tree.get('arrays-hashing')!;
		expect(v.solved).toBe(4);
		expect(v.due).toBe(3);
		expect(v.freshness).toBeCloseTo(0.25);
		expect(v.rusting).toBe(true);
		const refreshes = dueRefreshes(progress, false, t0);
		expect(refreshes.map((r) => r.slug)).toEqual([root[2], root[1], root[0]]);
		const next = nextNewProblems(tree, progress, false, 2);
		expect(next.map((p) => p.slug)).toEqual(root.slice(4, 6));
	});

	it('never schedules a refresh for a problem outside the curriculum', () => {
		// Profile sync records solves made on leetcode.com so they count towards the weekly budget,
		// which puts non-curriculum slugs into progress. They previously surfaced as refresh tasks
		// linking to a solve page with no test suite, because expected outputs only exist for the
		// vendored NeetCode 150.
		const t0 = new Date('2026-09-06T12:00:00Z');
		const overdue = new Date(t0.getTime() - 5 * DAY);
		const inCurriculum = problemsForNode('arrays-hashing', true)[0].slug;
		const progress = new Map<string, ProblemProgress>([
			[inCurriculum, { solveCount: 1, srsStep: 0, dueAt: overdue }],
			['maximum-number-of-vowels-in-a-substring-of-given-length', { solveCount: 1, srsStep: 0, dueAt: overdue }],
			['most-common-word', { solveCount: 2, srsStep: 1, dueAt: overdue }]
		]);
		expect(dueRefreshes(progress, false, t0).map((r) => r.slug)).toEqual([inCurriculum]);
	});
});

describe('awards', () => {
	it('applies language, daily and refresh multipliers', () => {
		const base = computeAward({ difficulty: 'Medium', tags: ['Array'], lang: 'python3', prev: null, isDaily: false, assisted: false });
		expect(base).toMatchObject({ kind: 'new', research: 25, resources: { stone: 3, 'essence:Array': 1 } });
		const go = computeAward({ difficulty: 'Hard', tags: [], lang: 'golang', prev: null, isDaily: true, assisted: false });
		expect(go.research).toBe(180);
		expect(go.resources.iron).toBe(9);
		const refresh = computeAward({ difficulty: 'Easy', tags: [], lang: 'python3', prev: { solveCount: 1, lastLang: 'python3' }, isDaily: false, assisted: false });
		expect(refresh).toMatchObject({ kind: 'refresh', research: 5, resources: { timber: 2 } });
		const translation = computeAward({ difficulty: 'Easy', tags: [], lang: 'csharp', prev: { solveCount: 1, lastLang: 'python3' }, isDaily: false, assisted: false });
		expect(translation).toMatchObject({ kind: 'translation', research: 15 });
	});
});

describe('budget and morale', () => {
	it('counts a rolling week', () => {
		const dates = ['2026-08-28', '2026-08-29', '2026-09-03', '2026-09-04', '2026-09-04'];
		expect(weeklyCount(dates, '2026-09-04')).toBe(4);
		expect(weeklyCount(dates, '2026-09-03')).toBe(3);
		expect(WEEKLY_BUDGET).toBe(14);
	});
	it('moves toward the weekly target, halves losses with walls, spends freeze days', () => {
		const start = { morale: 100, asOf: '2026-09-01', freezeDays: 1 };
		const { state, ticks } = advanceMorale(start, [], '2026-09-04', { hasWalls: false });
		expect(ticks.length).toBe(3);
		expect(ticks[0].usedFreeze).toBe(true);
		expect(ticks[0].after).toBe(100);
		expect(ticks[1].after).toBe(85);
		expect(state).toEqual({ morale: 70, asOf: '2026-09-04', freezeDays: 0 });
		const walls = advanceMorale({ morale: 100, asOf: '2026-09-01', freezeDays: 0 }, [], '2026-09-02', { hasWalls: true });
		expect(walls.state.morale).toBe(92.5);
		const full = Array.from({ length: 14 }, (_, i) => addDays('2026-08-29', Math.floor(i / 2)));
		const up = advanceMorale({ morale: 50, asOf: '2026-09-03', freezeDays: 0 }, full, '2026-09-04', { hasWalls: false });
		expect(up.state.morale).toBe(65);
	});
});

describe('city', () => {
	it('gates, prices and produces', () => {
		const tree = computeTree({ progress: new Map(), research: new Map(), hasPremium: false, now: t0 });
		const ctx = { tree, totalSolves: 0, hardSolves: 0 };
		expect(gateSatisfied(undefined, ctx)).toBe(true);
		expect(gateSatisfied({ node: 'arrays-hashing', status: 'unlocked' }, ctx)).toBe(false);
		expect(gateSatisfied({ hard: 3 }, { ...ctx, hardSolves: 3 })).toBe(true);
		const hut = BUILDINGS.find((b) => b.id === 'hut')!;
		expect(costAtLevel(hut, 2)).toEqual({ timber: 8, ingots: 3 });
		expect(canAfford({ timber: 8 }, costAtLevel(hut, 2))).toBe(false);
		expect(canAfford({ timber: 8, ingots: 3 }, costAtLevel(hut, 2))).toBe(true);
		const placed = [
			{ id: 'a', kind: 'hut', x: 0, y: 0, level: 2 },
			{ id: 'r', kind: 'graph-roads', x: 1, y: 0, level: 1 },
			{ id: 'g', kind: 'granary', x: 5, y: 5, level: 1 }
		];
		expect(baseProduction(placed, tree)).toBeCloseTo(2 * 1.25 + 2);
		expect(dailyCoins(placed, tree, 50)).toBe(2);
	});
});

describe('drills', () => {
	const mk = (id: string, kind: Drill['kind'], answer: string): Drill => ({ id, lang: 'python', module: 'm', kind, context: '', code: '', answer, url: '' });
	it('checks answers leniently but correctly', () => {
		expect(checkAnswer(mk('a', 'output', "['fig', 'apple']"), '["fig","apple"]')).toBe(true);
		expect(checkAnswer(mk('a', 'output', '{1: 2, 3: 4}'), '{1:2, 3:4}')).toBe(true);
		expect(checkAnswer(mk('a', 'output', 'True'), 'true')).toBe(false);
		expect(checkAnswer(mk('b', 'cloze', 'heappush'), ' heappush( ')).toBe(true);
		expect(checkAnswer(mk('b', 'cloze', 'heappush'), 'heappop')).toBe(false);
		expect(normalizeOutput('a = 1\n\n')).toBe('a=1');
	});
	it('schedules and rewards', () => {
		const s1 = afterDrill(null, true, t0);
		expect(s1.srsStep).toBe(1);
		expect(afterDrill(s1, false, t0).srsStep).toBe(0);
		expect(afterDrill({ srsStep: 9, dueAt: t0 }, true, t0).srsStep).toBe(DRILL_INTERVALS.length - 1);
		expect(ingotsFor([true, true, true, true, true])).toBe(7);
		expect(ingotsFor([true, false, true, true, true])).toBe(4);
	});
	it('builds a set from due then unseen drills, alternating kinds', () => {
		const bank = [mk('1', 'cloze', 'x'), mk('2', 'cloze', 'x'), mk('3', 'output', 'x'), mk('4', 'output', 'x'), mk('5', 'cloze', 'x'), mk('6', 'output', 'x')];
		const progress = new Map([
			['5', { srsStep: 1, dueAt: new Date(t0.getTime() - DAY), correct: 1, wrong: 0 }],
			['6', { srsStep: 1, dueAt: new Date(t0.getTime() + DAY), correct: 1, wrong: 0 }]
		]);
		const set = buildDrillSet(bank, progress, t0, 4);
		expect(set.map((d) => d.id)).toEqual(['5', '3', '1', '4']);
	});
});
