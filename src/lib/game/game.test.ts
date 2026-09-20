import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDate, weekStartOf } from './dates';
import { INTERVALS, afterSolve, isDue, type SrsState } from './srs';
import { NODES, NODE_ORDER, PROBLEM_BY_SLUG, PROBLEMS, problemsForNode } from './curriculum';
import { computeTree, dueRefreshes, isServable, nextNewProblems, type ProblemProgress } from './tree';
import { HAULS_BONUS, IRONWORKS_MULT, computeAward } from './awards';
import { WEEKLY_BUDGET, weeklyCount } from './budget';
import {
	BUILDINGS,
	CITIES,
	DIVERSITY_BONUS_PER_KIND,
	GRID_SIZE,
	STORAGE,
	baseProduction,
	buildingYield,
	canAfford,
	canStand,
	cityUnlocked,
	costAtLevel,
	dailyCoins,
	fitsTerrain,
	gateSatisfied,
	placementError,
	relocate,
	settleProduction,
	terrainAt,
	terrainLabel,
	unlockedCities,
	wellPlaced,
	type PlacedBuilding
} from './city';
import { DRILL_INTERVALS, MAX_DUE_PER_SET, afterDrill, buildDrillSet, checkAnswer, ingotsFor, normalizeOutput, type Drill, type DrillProgress } from './drills';

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
	it('advances a clean solve however late it is, and caps at the ladder end', () => {
		// A late unaided solve is evidence of retention, not neglect: the step must climb.
		const s1 = afterSolve(afterSolve(null, 'clean', t0), 'clean', new Date(t0.getTime() + 4 * DAY));
		const late = new Date(s1.dueAt!.getTime() + 10 * INTERVALS[1] * DAY);
		expect(afterSolve(s1, 'clean', late).srsStep).toBe(2);
		let s: SrsState = { srsStep: INTERVALS.length - 1, dueAt: t0 };
		s = afterSolve(s, 'clean', t0);
		expect(s.srsStep).toBe(INTERVALS.length - 1);
		expect(isDue(s, t0)).toBe(false);
	});
	it('has a strictly increasing ladder', () => {
		// Climbing must never shorten the gap. The values are tuned by hand and expected to change;
		// what must hold is that a clean on-time solve always buys more time than the one before it.
		for (let i = 1; i < INTERVALS.length; i++) expect(INTERVALS[i]).toBeGreaterThan(INTERVALS[i - 1]);
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
		expect(problemsForNode('arrays-hashing').length).toBe(9); // Premium problems count too
	});
});

function progressFor(slugs: string[], dueAt: Date | null = null): Map<string, ProblemProgress> {
	return new Map(slugs.map((s) => [s, { solveCount: 1, srsStep: 0, dueAt }]));
}

describe('tree', () => {
	it('starts with only the root available and unlocks at half', () => {
		const empty = computeTree({ progress: new Map(), research: new Map(), now: t0 });
		expect(empty.get('arrays-hashing')!.status).toBe('available');
		expect(empty.get('two-pointers')!.status).toBe('locked');
		const root = problemsForNode('arrays-hashing').map((p) => p.slug);
		const half = computeTree({ progress: progressFor(root.slice(0, 5)), research: new Map(), now: t0 });
		expect(half.get('arrays-hashing')!.status).toBe('unlocked');
		expect(half.get('two-pointers')!.status).toBe('available');
		expect(half.get('stack')!.status).toBe('available');
		expect(half.get('binary-search')!.status).toBe('locked');
		const full = computeTree({ progress: progressFor(root), research: new Map(), now: t0 });
		expect(full.get('arrays-hashing')!.status).toBe('complete');
	});
	it('computes freshness, rusting and refresh ordering by curriculum', () => {
		const root = problemsForNode('arrays-hashing').map((p) => p.slug);
		const overdue = new Date(t0.getTime() - 2 * DAY);
		const progress = new Map<string, ProblemProgress>();
		root.slice(0, 4).forEach((s, i) =>
			progress.set(s, { solveCount: 1, srsStep: 0, dueAt: i < 3 ? new Date(overdue.getTime() - i * DAY) : new Date(t0.getTime() + DAY) })
		);
		const tree = computeTree({ progress, research: new Map(), now: t0 });
		const v = tree.get('arrays-hashing')!;
		expect(v.solved).toBe(4);
		expect(v.due).toBe(3);
		expect(v.freshness).toBeCloseTo(0.25);
		expect(v.rusting).toBe(true);
		// root[2] is the most overdue, yet order follows the curriculum, not the wait.
		const refreshes = dueRefreshes(tree, progress, t0);
		expect(refreshes.map((r) => r.slug)).toEqual([root[0], root[1], root[2]]);
		const next = nextNewProblems(tree, progress, 2);
		expect(next.map((p) => p.slug)).toEqual(root.slice(4, 6));
	});

	it('never schedules a refresh for a problem outside the curriculum', () => {
		// Profile sync records solves made on leetcode.com so they count towards the weekly budget,
		// which puts non-curriculum slugs into progress. They previously surfaced as refresh tasks
		// linking to a solve page with no test suite, because expected outputs only exist for the
		// vendored NeetCode 150.
		const t0 = new Date('2026-09-06T12:00:00Z');
		const overdue = new Date(t0.getTime() - 5 * DAY);
		const inCurriculum = problemsForNode('arrays-hashing')[0].slug;
		const progress = new Map<string, ProblemProgress>([
			[inCurriculum, { solveCount: 1, srsStep: 0, dueAt: overdue }],
			['maximum-number-of-vowels-in-a-substring-of-given-length', { solveCount: 1, srsStep: 0, dueAt: overdue }],
			['most-common-word', { solveCount: 2, srsStep: 1, dueAt: overdue }]
		]);
		expect(dueRefreshes(computeTree({ progress, research: new Map(), now: t0 }), progress, t0).map((r) => r.slug)).toEqual([inCurriculum]);
	});

	it('never serves problems from a node whose prerequisites are still locked', () => {
		const t0 = new Date('2026-09-06T12:00:00Z');
		const tree = computeTree({ progress: new Map(), research: new Map(), now: t0 });
		const dp2d = tree.get('dp-2d')!;
		expect(dp2d.requires).toContain('dp-1d');
		expect(dp2d.prereqsMet).toBe(false);
		expect(isServable(dp2d)).toBe(false);

		// Nothing offered may come from a node that is not reachable yet.
		const offered = nextNewProblems(tree, new Map(), 20);
		for (const p of offered) expect(isServable(tree.get(p.nodeId)!)).toBe(true);
		expect(offered.some((p) => p.nodeId === 'dp-2d')).toBe(false);

		// The reported case: LeetCode's daily was distinct-subsequences, and the daily slot took it
		// on curriculum membership alone. This is the condition that slot now applies.
		const reported = PROBLEM_BY_SLUG.get('distinct-subsequences')!;
		expect(reported.nodeId).toBe('dp-2d');
		expect(isServable(tree.get(reported.nodeId)!)).toBe(false);
	});

	it('treats a node unlocked by solve count alone as unservable while its path is locked', () => {
		// Profile sync can record enough solves on a deep node to mark it `unlocked` long before the
		// path to it opens, which would otherwise let the expedition serve from it.
		const t0 = new Date('2026-09-06T12:00:00Z');
		const dp2d = problemsForNode('dp-2d');
		const progress = new Map<string, ProblemProgress>();
		for (const p of dp2d) progress.set(p.slug, { solveCount: 1, srsStep: 3, dueAt: new Date(t0.getTime() + 30 * DAY) });
		const tree = computeTree({ progress, research: new Map(), now: t0 });
		const view = tree.get('dp-2d')!;
		expect(view.status).toBe('complete');
		expect(view.prereqsMet).toBe(false);
		expect(isServable(view)).toBe(false);
	});

	it('requires the whole path to be open, not just the direct prerequisite', () => {
		// Two Pointers synced to `unlocked` while Arrays & Hashing is not must not open Sliding Window.
		const t0 = new Date('2026-09-06T12:00:00Z');
		const progress = new Map<string, ProblemProgress>();
		for (const p of problemsForNode('two-pointers')) progress.set(p.slug, { solveCount: 1, srsStep: 0, dueAt: new Date(t0.getTime() + DAY) });
		const tree = computeTree({ progress, research: new Map(), now: t0 });
		expect(tree.get('two-pointers')!.status).toBe('complete');
		expect(tree.get('sliding-window')!.prereqsMet).toBe(false);
		expect(isServable(tree.get('sliding-window')!)).toBe(false);
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

describe('weekly budget', () => {
	it('counts a rolling week', () => {
		const dates = ['2026-08-28', '2026-08-29', '2026-09-03', '2026-09-04', '2026-09-04'];
		expect(weeklyCount(dates, '2026-09-04')).toBe(4);
		expect(weeklyCount(dates, '2026-09-03')).toBe(3);
		expect(WEEKLY_BUDGET).toBe(14);
	});
});

describe('city', () => {
	it('gates, prices and produces', () => {
		const tree = computeTree({ progress: new Map(), research: new Map(), now: t0 });
		const ctx = { tree, totalSolves: 0, hardSolves: 0 };
		expect(gateSatisfied(undefined, ctx)).toBe(true);
		expect(gateSatisfied({ node: 'arrays-hashing', status: 'unlocked' }, ctx)).toBe(false);
		expect(gateSatisfied({ hard: 3 }, { ...ctx, hardSolves: 3 })).toBe(true);
		const hut = BUILDINGS.find((b) => b.id === 'hut')!;
		expect(costAtLevel(hut, 2)).toEqual({ timber: 8, ingots: 3, coins: 15 });
		expect(canAfford({ timber: 8 }, costAtLevel(hut, 2))).toBe(false);
		expect(canAfford({ timber: 8, ingots: 3 }, costAtLevel(hut, 2))).toBe(false); // coins now count too
		expect(canAfford({ timber: 8, ingots: 3, coins: 15 }, costAtLevel(hut, 2))).toBe(true);
		const placed = [
			{ id: 'a', kind: 'hut', city: 0, x: 0, y: 0, level: 2 },
			{ id: 'r', kind: 'graph-roads', city: 0, x: 1, y: 0, level: 1 },
			{ id: 'g', kind: 'granary', city: 0, x: 5, y: 5, level: 1 }
		];
		// Hut: 2 base × 1.25 roads × 1.15 for one different neighbour. Roads: 2 × 1.15 for the hut.
		expect(baseProduction(placed, tree)).toBeCloseTo(2 * 1.25 * 1.15 + 2 * 1.15);
		expect(dailyCoins(placed, tree)).toBe(5); // 5.175 rounds down
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

describe('production settlement', () => {
	const addD = (d: string, n: number) => addDays(d, n);
	const perDay = 2; // two huts

	it('pays today as soon as it has a solve, not on the first page load', () => {
		// The original bug: production for today was paid inside a tick that fired on the first
		// load of the day, when nothing has been solved yet.
		const empty = settleProduction({
			coinsAsOf: '2026-09-05', today: '2026-09-06', earliest: '2026-07-01',
			active: new Set(['2026-09-05']), perDay, addDays: addD
		});
		expect(empty).toEqual({ coins: 0, coinsAsOf: '2026-09-05' });

		// Same day, once a solve lands.
		const solved = settleProduction({
			coinsAsOf: '2026-09-05', today: '2026-09-06', earliest: '2026-07-01',
			active: new Set(['2026-09-05', '2026-09-06']), perDay, addDays: addD
		});
		expect(solved).toEqual({ coins: 2, coinsAsOf: '2026-09-06' });
	});

	it('pays each day once', () => {
		const first = settleProduction({
			coinsAsOf: '2026-09-05', today: '2026-09-06', earliest: '2026-07-01',
			active: new Set(['2026-09-06']), perDay, addDays: addD
		});
		expect(first.coins).toBe(2);
		const again = settleProduction({
			coinsAsOf: first.coinsAsOf, today: '2026-09-06', earliest: '2026-07-01',
			active: new Set(['2026-09-06']), perDay, addDays: addD
		});
		expect(again.coins).toBe(0);
	});

	it('catches up missed active days and skips idle ones', () => {
		const r = settleProduction({
			coinsAsOf: '2026-09-01', today: '2026-09-05', earliest: '2026-07-01',
			active: new Set(['2026-09-02', '2026-09-04']),
			perDay, addDays: addD
		});
		expect(r).toEqual({ coins: 4, coinsAsOf: '2026-09-04' });
	});

	it('never walks back further than the ledger window', () => {
		const r = settleProduction({
			coinsAsOf: '2020-01-01', today: '2026-09-06', earliest: '2026-09-04',
			active: new Set(['2026-09-04', '2026-09-05', '2026-09-06']),
			perDay, addDays: addD
		});
		expect(r).toEqual({ coins: 6, coinsAsOf: '2026-09-06' });
	});
});

describe('city economy', () => {
	it('anchors the week to Monday whichever day it is asked about', () => {
		expect(weekStartOf('2026-09-07')).toBe('2026-09-07'); // Monday itself
		expect(weekStartOf('2026-09-13')).toBe('2026-09-07'); // the Sunday after
		expect(weekStartOf('2026-09-06')).toBe('2026-08-31'); // Sunday belongs to the week before
	});

	it('charges coins as well as materials and ingots to upgrade', () => {
		const hut = BUILDINGS.find((b) => b.id === 'hut')!;
		expect(costAtLevel(hut, 1).coins).toBeUndefined(); // building it costs no coins
		expect(costAtLevel(hut, 2)).toMatchObject({ ingots: 3, coins: 15 });
		expect(costAtLevel(hut, 3)).toMatchObject({ ingots: 6, coins: 30 });
	});

	it('pays nothing for an idle day', () => {
		const r = settleProduction({
			coinsAsOf: '2026-09-01', today: '2026-09-04', earliest: '2026-08-01',
			active: new Set(['2026-09-03']), // nothing solved on 09-02
			perDay: 2, addDays
		});
		expect(r).toEqual({ coins: 2, coinsAsOf: '2026-09-03' });
	});
});

describe('drill set variety', () => {
	const bank: Drill[] = [];
	// Mirrors the real bank: grouped by module, which is what made a day's set monotonous.
	for (const [module, n] of [['heapq', 9], ['bisect', 4], ['collections', 9]] as const) {
		for (let i = 0; i < n; i++) {
			bank.push({
				id: `${module}-${i}`, lang: 'python', module,
				kind: i % 2 === 0 ? 'cloze' : 'output',
				context: '', code: 'x', answer: 'y', hint: null, api: null, url: ''
			} as Drill);
		}
	}

	it('spreads a fresh set across modules instead of marching through one', () => {
		const set = buildDrillSet(bank, new Map(), new Date('2026-09-06T12:00:00Z'), 5);
		expect(set).toHaveLength(5);
		expect(new Set(set.map((d) => d.module)).size).toBe(3); // every module available, none repeated needlessly
		expect(set.filter((d) => d.module === 'heapq').length).toBeLessThanOrEqual(2);
	});

	it('still fills the set when only one module has drills left', () => {
		const single = bank.filter((d) => d.module === 'heapq');
		expect(buildDrillSet(single, new Map(), new Date('2026-09-06T12:00:00Z'), 5)).toHaveLength(5);
	});
});

describe('difficulty yields', () => {
	const base = { tags: [] as string[], lang: 'python3', prev: null, isDaily: false, assisted: false };

	it('pays the easier materials too, so no supply line closes as you climb', () => {
		// Difficulty used to choose only the KIND of material. Easy problems run out up the tree, so
		// timber — which gates the Hut, Granary, Hash Market and Window Mill — became unobtainable.
		expect(computeAward({ ...base, difficulty: 'Easy' }).resources).toEqual({ timber: 3, stone: 1 });
		expect(computeAward({ ...base, difficulty: 'Medium' }).resources).toEqual({ stone: 3, timber: 3 });
		expect(computeAward({ ...base, difficulty: 'Hard' }).resources).toEqual({ iron: 3, stone: 3, timber: 3 });
	});

	it('makes a Hard strictly better than an Easy, not merely different', () => {
		const easy = computeAward({ ...base, difficulty: 'Easy' }).resources;
		const hard = computeAward({ ...base, difficulty: 'Hard' }).resources;
		const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
		expect(total(hard)).toBeGreaterThan(total(easy));
	});

	it('scales the secondary materials by the same multiplier', () => {
		const go = computeAward({ ...base, difficulty: 'Hard', lang: 'golang', isDaily: true });
		expect(go.multiplier).toBe(3); // 1.5 bonus language x 2 daily
		expect(go.resources).toEqual({ iron: 9, stone: 9, timber: 9 });
	});

	it('never rounds a secondary yield away to nothing', () => {
		const refresh = computeAward({ ...base, difficulty: 'Medium', prev: { solveCount: 1, lastLang: 'python3' } });
		expect(refresh.multiplier).toBe(0.5);
		expect(refresh.resources.timber).toBeGreaterThanOrEqual(1);
	});

	it('adds the Granary pinch after the multipliers, on every solve', () => {
		const plain = computeAward({ ...base, difficulty: 'Medium' }).resources;
		const withGranary = computeAward({ ...base, difficulty: 'Medium', effects: { hauls: true } }).resources;
		expect(withGranary.timber).toBe(plain.timber + HAULS_BONUS.timber);
		expect(withGranary.stone).toBe(plain.stone + HAULS_BONUS.stone);
		// Flat, so a half-value refresh still gets the full pinch.
		const refresh = { ...base, difficulty: 'Easy' as const, prev: { solveCount: 1, lastLang: 'python3' } };
		const r0 = computeAward(refresh).resources;
		const r1 = computeAward({ ...refresh, effects: { hauls: true } }).resources;
		expect(r1.timber - r0.timber).toBe(HAULS_BONUS.timber);
	});

	it('scales iron with the Walls, and only iron', () => {
		const hard = computeAward({ ...base, difficulty: 'Hard', effects: { ironworks: true } }).resources;
		expect(hard.iron).toBe(Math.round(3 * IRONWORKS_MULT));
		expect(hard.stone).toBe(3);
		// A Medium yields no iron, so the Walls add nothing to it.
		const medium = computeAward({ ...base, difficulty: 'Medium', effects: { ironworks: true } }).resources;
		expect(medium.iron).toBeUndefined();
	});
});

describe('per-building yield', () => {
	const tree = computeTree({ progress: new Map(), research: new Map(), now: t0 });

	it('breaks a building down into the factors that produce its number', () => {
		const hut = [{ id: 'a', kind: 'hut', city: 0, x: 0, y: 0, level: 2 }];
		const y = buildingYield(hut[0], hut, tree);
		expect(y).toMatchObject({ base: 2, freshness: 1, adjacency: 1, diversity: 1, perDay: 2 });
	});

	it('applies the road bonus', () => {
		const placed = [
			{ id: 'a', kind: 'hut', city: 0, x: 0, y: 0, level: 1 },
			{ id: 'r', kind: 'graph-roads', city: 0, x: 1, y: 0, level: 1 }
		];
		const y = buildingYield(placed[0], placed, tree);
		expect(y.adjacency).toBe(1.25);
		expect(y.perDay).toBeCloseTo(1.25 * 1.15); // the roads are also a different kind next door
	});

	it('pays both banks of a Two-Pointer Bridge, and does not stack with roads', () => {
		// The bridge earns coins AND carries the roads bonus across to its neighbours: (1,1) is water.
		const banks = [
			{ id: 'a', kind: 'hut', city: 0, x: 1, y: 0, level: 1 },
			{ id: 'w', kind: 'pointer-bridge', city: 0, x: 1, y: 1, level: 1 }
		];
		expect(buildingYield(banks[0], banks, tree).adjacency).toBe(1.25);

		// Roads on the other side as well. The bonus is a flag, not a count, so it stays at 1.25 --
		// only the diversity multiplier notices the second neighbour.
		const both = [...banks, { id: 'r', kind: 'graph-roads', city: 0, x: 0, y: 0, level: 1 }];
		const y = buildingYield(both[0], both, tree);
		expect(y.adjacency).toBe(1.25);
		expect(y.perDay).toBeCloseTo(1.25 * (1 + 2 * DIVERSITY_BONUS_PER_KIND));
	});

	it('reports nothing for a building that produces no coins', () => {
		const placed = [{ id: 'g', kind: 'granary', city: 0, x: 0, y: 0, level: 1 }];
		expect(buildingYield(placed[0], placed, tree).perDay).toBe(0);
	});

	it('sums to the city total, which is the same formula', () => {
		// baseProduction sums buildingYield, so a drift between the tile panel and the city header
		// is impossible by construction. This pins that they stay wired together.
		const placed = [
			{ id: 'a', kind: 'hut', city: 0, x: 0, y: 0, level: 1 },
			{ id: 'b', kind: 'hut', city: 0, x: 3, y: 3, level: 2 },
			{ id: 'r', kind: 'graph-roads', city: 0, x: 1, y: 0, level: 1 }
		];
		const summed = placed.reduce((n, b) => n + buildingYield(b, placed, tree).perDay, 0);
		expect(baseProduction(placed, tree)).toBeCloseTo(summed);
		expect(dailyCoins(placed, tree)).toBe(Math.round(summed));
	});
});

describe('drill set composition', () => {
	const bank: Drill[] = [];
	for (const [module, n] of [['heapq', 9], ['bisect', 4], ['basics', 9], ['strings', 6]] as const) {
		for (let i = 0; i < n; i++) {
			bank.push({
				id: `${module}-${i}`, lang: 'python', module,
				kind: i % 2 === 0 ? 'cloze' : 'output',
				context: '', code: 'x', answer: 'y', hint: null, api: null, url: ''
			} as Drill);
		}
	}
	const now = new Date('2026-09-08T12:00:00Z');
	const overdue = new Date(now.getTime() - DAY);

	it('caps reviews so a backlog in one module cannot own the day', () => {
		// The reported case: nine heapq drills started, all coming due, filling every slot for days
		// while the fundamentals sat untouched behind them.
		const progress = new Map<string, DrillProgress>();
		for (let i = 0; i < 9; i++) progress.set(`heapq-${i}`, { srsStep: 0, dueAt: overdue, correct: 0, wrong: 1 });
		const set = buildDrillSet(bank, progress, now, 5);
		expect(set).toHaveLength(5);
		expect(set.filter((d) => progress.has(d.id)).length).toBe(MAX_DUE_PER_SET);
		expect(set.filter((d) => d.module === 'heapq').length).toBeLessThanOrEqual(MAX_DUE_PER_SET);
		expect(set.some((d) => !progress.has(d.id))).toBe(true); // new material got in
	});

	it('spreads the reviews it does take across modules', () => {
		const progress = new Map<string, DrillProgress>();
		for (const id of ['heapq-0', 'heapq-1', 'heapq-2', 'bisect-0', 'bisect-1']) {
			progress.set(id, { srsStep: 0, dueAt: overdue, correct: 0, wrong: 1 });
		}
		const reviews = buildDrillSet(bank, progress, now, 5).filter((d) => progress.has(d.id));
		expect(new Set(reviews.map((d) => d.module)).size).toBeGreaterThan(1);
	});

	it('falls back to the backlog once no new material is left', () => {
		const progress = new Map<string, DrillProgress>();
		for (const d of bank) progress.set(d.id, { srsStep: 0, dueAt: overdue, correct: 0, wrong: 1 });
		expect(buildDrillSet(bank, progress, now, 5)).toHaveLength(5);
	});
});

describe('cities and terrain', () => {
	const tree = computeTree({ progress: new Map(), research: new Map(), now: t0 });
	const b = (id: string, kind: string, city: number, x: number, y: number, level = 1): PlacedBuilding => ({ id, kind, city, x, y, level });

	it('draws three cities whose maps are the right shape', () => {
		expect(CITIES).toHaveLength(3);
		for (const c of CITIES) {
			expect(c.terrain).toHaveLength(GRID_SIZE);
			for (const row of c.terrain) expect(row).toHaveLength(GRID_SIZE);
			// Every terrain a city has must be somewhere a building can actually stand.
			expect(c.terrain.join('')).toMatch(/^[.~^*]+$/);
		}
	});

	it('locks terrain both ways', () => {
		expect(fitsTerrain('pointer-bridge', 'river')).toBe(true);
		expect(fitsTerrain('pointer-bridge', 'plains')).toBe(false); // bridges span water only
		expect(fitsTerrain('hash-market', 'river')).toBe(false);
		expect(fitsTerrain('hash-market', 'plains')).toBe(true);
		expect(fitsTerrain('dp-academy', 'mountain')).toBe(true);
		expect(fitsTerrain('trie-library', 'forest')).toBe(true);
		expect(terrainAt(0, 2, 2)).toBe('river');
		expect(terrainAt(0, 0, 4)).toBe('mountain');
		expect(terrainAt(0, 3, 2)).toBe('forest');
		expect(terrainAt(0, 0, 0)).toBe('plains');
		expect(terrainAt(0, GRID_SIZE, 0)).toBeNull();
		expect(terrainAt(9, 0, 0)).toBeNull();
	});

	it('founds a city the moment the essence is there', () => {
		expect(cityUnlocked(0, 0)).toBe(true);
		expect(cityUnlocked(1, 999)).toBe(false);
		expect(cityUnlocked(1, 1000)).toBe(true);
		expect(cityUnlocked(2, 9999)).toBe(false);
		expect(unlockedCities(10000).map((c) => c.id)).toEqual([0, 1, 2]);
		expect(unlockedCities(0)).toHaveLength(1);
	});

	it('refuses a placement for the one reason that applies', () => {
		const placed = [b('a', 'hut', 0, 0, 0)];
		expect(placementError('hut', 0, 1, 0, placed, 0)).toBeNull();
		expect(placementError('hut', 0, 0, 0, placed, 0)?.error).toBe('occupied');
		expect(placementError('hut', 0, 2, 2, placed, 0)?.error).toBe('terrain');
		expect(placementError('pointer-bridge', 0, 1, 0, placed, 0)?.error).toBe('terrain');
		expect(placementError('pointer-bridge', 0, 2, 2, placed, 0)).toBeNull();
		expect(placementError('hut', 1, 3, 3, placed, 0)?.error).toBe('locked');
		expect(placementError('hut', 1, 3, 3, placed, 1000)).toBeNull();
		expect(placementError('hut', 7, 0, 0, placed, 99_999)?.error).toBe('bad_request');
		expect(placementError('hut', 0, 9, 0, placed, 0)?.error).toBe('bad_request');
	});

	it('pays for different neighbours, not for more of the same', () => {
		const row = [b('a', 'hash-market', 0, 0, 0), b('b', 'hash-market', 0, 1, 0), b('c', 'hash-market', 0, 2, 0)];
		// The old dominant strategy: three of a kind in a row, and no one earns a thing extra.
		for (const m of row) expect(buildingYield(m, row, tree).diversity).toBe(1);

		// Same three tiles, same rates, one swapped for another kind: the whole street earns more.
		const interleaved = [b('a', 'hash-market', 0, 0, 0), b('b', 'stack-tower', 0, 1, 0), b('c', 'hash-market', 0, 2, 0)];
		expect(baseProduction(interleaved, tree)).toBeCloseTo(9 * 1.15);
		expect(baseProduction(interleaved, tree)).toBeGreaterThan(baseProduction(row, tree));

		// Three different neighbours around one market, one of which produces nothing itself.
		const crossroads = [b('a', 'hash-market', 0, 1, 1), b('b', 'hut', 0, 0, 1), b('c', 'stack-tower', 0, 2, 1), b('d', 'granary', 0, 1, 0)];
		expect(buildingYield(crossroads[0], crossroads, tree).diversity).toBeCloseTo(1 + 3 * DIVERSITY_BONUS_PER_KIND);
	});

	it('keeps each city to itself and pays nothing for storage', () => {
		// Same coordinates, different cities: neither is the other's neighbour.
		const apart = [b('a', 'hash-market', 0, 1, 1), b('b', 'hut', 1, 1, 0)];
		expect(buildingYield(apart[0], apart, tree).diversity).toBe(1);
		const stored = [b('s', 'hash-market', STORAGE, 0, 0, 3)];
		expect(buildingYield(stored[0], stored, tree).perDay).toBe(0);
		expect(dailyCoins(stored, tree)).toBe(0);
	});

	it('lets a kind name more than one terrain, and still refuses the rest', () => {
		// Shared ground: a watermill and a harbour light belong on the bank or on the water.
		for (const kind of ['window-mill', 'search-lighthouse']) {
			expect(fitsTerrain(kind, 'plains')).toBe(true);
			expect(fitsTerrain(kind, 'river')).toBe(true);
			expect(fitsTerrain(kind, 'mountain')).toBe(false);
			expect(fitsTerrain(kind, 'forest')).toBe(false);
		}
		expect(fitsTerrain('chain-foundry', 'forest')).toBe(true);
		expect(fitsTerrain('chain-foundry', 'plains')).toBe(true);
		expect(fitsTerrain('chain-foundry', 'river')).toBe(false);
		// And the exclusives stay exclusive.
		expect(fitsTerrain('heap-forge', 'mountain')).toBe(true);
		expect(fitsTerrain('heap-forge', 'plains')).toBe(false);
		expect(fitsTerrain('arboretum', 'plains')).toBe(false);

		expect(terrainLabel('window-mill')).toBe('plains or river');
		expect(terrainLabel('heap-forge')).toBe('mountain only');
		expect(terrainLabel('hut')).toBe('plains');
		expect(terrainLabel('interval-clock')).toBe('plains beside a river');
	});

	it('puts the clocktower on the bank but never in the water', () => {
		const placed: PlacedBuilding[] = [];
		// (3,1) and (2,4) are plains with a river tile beside them; (5,5) is dry inland.
		expect(canStand('interval-clock', 0, 3, 1)).toBe(true);
		expect(canStand('interval-clock', 0, 2, 4)).toBe(true);
		expect(canStand('interval-clock', 0, 5, 5)).toBe(false);
		expect(placementError('interval-clock', 0, 3, 1, placed, 0)).toBeNull();
		expect(placementError('interval-clock', 0, 5, 5, placed, 0)).toMatchObject({
			error: 'terrain',
			message: 'must stand beside a river'
		});
		// Plains-only: the river itself is still out, near or not.
		expect(placementError('interval-clock', 0, 2, 2, placed, 0)?.error).toBe('terrain');
	});

	it('leaves somewhere in the first city for every kind to stand', () => {
		// The terrain budget is deliberately tight, but a kind you can never place anywhere is a bug,
		// not a design: this catches a map edit that paves over the last peak or the last wood.
		for (const kind of BUILDINGS) {
			const homes = [];
			for (let y = 0; y < GRID_SIZE; y++) {
				for (let x = 0; x < GRID_SIZE; x++) if (canStand(kind.id, 0, x, y)) homes.push([x, y]);
			}
			expect(homes.length, `${kind.name} has nowhere to stand in ${CITIES[0].name}`).toBeGreaterThan(0);
		}
	});

});

describe('relocation onto the smaller map', () => {
	const b = (id: string, kind: string, city: number, x: number, y: number, level = 1): PlacedBuilding => ({ id, kind, city, x, y, level });

	it('leaves a city that is already valid alone', () => {
		const placed = [b('a', 'hut', 0, 0, 0), b('r', 'pointer-bridge', 0, 2, 2), b('s', 'hut', STORAGE, 0, 0)];
		expect(placed.every(wellPlaced)).toBe(true);
		expect(relocate(placed)).toEqual([]);
	});

	it('brings buildings in off the old 8x8 and off ground that is no longer theirs', () => {
		const placed = [b('far', 'hut', 0, 7, 7, 2), b('wet', 'pointer-bridge', 0, 0, 0), b('dry', 'hash-market', 0, 2, 3)];
		const moves = relocate(placed);
		expect(moves).toHaveLength(3);
		const by = Object.fromEntries(moves.map((m) => [m.id, m]));
		// The bridge lands on water, the market on ground, and the stray corner tile comes inside.
		expect(terrainAt(0, by.wet.x, by.wet.y)).toBe('river');
		expect(terrainAt(0, by.dry.x, by.dry.y)).toBe('plains');
		expect(by.far).toMatchObject({ city: 0 });
		expect(by.far.x).toBeLessThan(GRID_SIZE);
		expect(by.far.y).toBeLessThan(GRID_SIZE);

		// Applying the moves settles the city: running it again finds nothing left to do.
		for (const m of moves) Object.assign(placed.find((p) => p.id === m.id)!, m);
		expect(relocate(placed)).toEqual([]);
		expect(placed.every(wellPlaced)).toBe(true);
	});

	it('walks a building onto the ground its kind now needs', () => {
		// Both were legal before terrain tightened: the mine was on plains, the clock inland.
		const placed = [b('m', 'heap-forge', 0, 0, 0, 2), b('c', 'interval-clock', 0, 5, 5)];
		const moves = relocate(placed);
		expect(moves).toHaveLength(2);
		for (const m of moves) Object.assign(placed.find((p) => p.id === m.id)!, m);
		expect(terrainAt(0, placed[0].x, placed[0].y)).toBe('mountain');
		expect(placed[0].level).toBe(2); // the upgrade survives the move
		expect(canStand('interval-clock', 0, placed[1].x, placed[1].y)).toBe(true);
		expect(placed.every(wellPlaced)).toBe(true);
		expect(relocate(placed)).toEqual([]);
	});

	it('stores what will not fit, biggest buildings keeping their tiles', () => {
		// Nine bridges for four river tiles: five have to wait in storage.
		const placed = Array.from({ length: 9 }, (_, i) => b(`b${i}`, 'pointer-bridge', 0, 7, i, i === 8 ? 3 : 1));
		const moves = relocate(placed);
		for (const m of moves) Object.assign(placed.find((p) => p.id === m.id)!, m);
		const inCity = placed.filter((p) => p.city === 0);
		const stored = placed.filter((p) => p.city === STORAGE);
		expect(inCity.length + stored.length).toBe(9);
		expect(stored.length).toBeGreaterThan(0);
		expect(inCity.map((p) => p.id)).toContain('b8'); // the level 3 one is placed first
		for (const p of inCity) expect(terrainAt(0, p.x, p.y)).toBe('river');
		// Storage slots are distinct, so the (city, x, y) unique index holds.
		expect(new Set(stored.map((p) => p.x)).size).toBe(stored.length);
		expect(relocate(placed)).toEqual([]);
	});
});
