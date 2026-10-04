import { describe, expect, it } from 'vitest';
import { DRILLS_SLOT, chooseSlots, missedOffers, planItemDone, slotCounts } from './plan';
import { NODE_ORDER, problemsForNode } from '$lib/game/curriculum';
import { computeTree, type ProblemProgress } from '$lib/game/tree';

describe('plan item doneness', () => {
	const ledgerToday = new Set(['two-sum']);

	it('derives doneness from the record, not just the stored flag', () => {
		// A plan regenerated mid-day carries done=false on every row, because the flags are written
		// once when the work completes. Both kinds must recover from the underlying record.
		expect(planItemDone({ kind: 'new', slug: 'two-sum', done: false }, ledgerToday, false)).toBe(true);
		expect(planItemDone({ kind: 'drills', slug: 'python', done: false }, ledgerToday, true)).toBe(true);
	});

	it('leaves genuinely unfinished work unticked', () => {
		expect(planItemDone({ kind: 'new', slug: 'valid-anagram', done: false }, ledgerToday, true)).toBe(false);
		expect(planItemDone({ kind: 'drills', slug: 'python', done: false }, ledgerToday, false)).toBe(false);
	});

	it('never un-ticks a stored flag', () => {
		expect(planItemDone({ kind: 'drills', slug: 'python', done: true }, new Set(), false)).toBe(true);
		expect(planItemDone({ kind: 'refresh', slug: 'x', done: true }, new Set(), false)).toBe(true);
	});
});

describe('expedition slot choice', () => {
	const now = new Date('2026-09-09T12:00:00Z');
	const DAY = 86_400_000;
	const root = problemsForNode('arrays-hashing').map((p) => p.slug);

	/** `dueCount` solved-and-overdue problems, the rest solved and fresh. */
	function progressWith(solved: string[], dueCount: number) {
		const progress = new Map<string, ProblemProgress>();
		solved.forEach((slug, i) =>
			progress.set(slug, {
				solveCount: 1,
				srsStep: 0,
				dueAt: new Date(now.getTime() + (i < dueCount ? -(i + 1) * DAY : DAY))
			})
		);
		return progress;
	}
	function snapFor(progress: Map<string, ProblemProgress>) {
		return { progress, now, tree: computeTree({ progress, research: new Map(), now }) };
	}

	it('serves 2 new with no refresh due, 1 refresh + 2 new with one due, 2 refresh + 1 new with two or more', () => {
		expect(slotCounts(0)).toEqual({ refresh: 0, fresh: 2 });
		expect(slotCounts(1)).toEqual({ refresh: 1, fresh: 2 });
		expect(slotCounts(2)).toEqual({ refresh: 2, fresh: 1 });
		expect(slotCounts(7)).toEqual({ refresh: 2, fresh: 1 });
		const kinds = (due: number) => chooseSlots(snapFor(progressWith(root.slice(0, 6), due)), null).map((c) => c.kind);
		expect(kinds(0)).toEqual(['new', 'new']);
		expect(kinds(1)).toEqual(['refresh', 'new', 'new']);
		expect(kinds(2)).toEqual(['refresh', 'refresh', 'new']);
		expect(kinds(5)).toEqual(['refresh', 'refresh', 'new']);
	});

	it('numbers slots in order and never serves a problem twice', () => {
		for (const due of [0, 1, 2, 5]) {
			const chosen = chooseSlots(snapFor(progressWith(root.slice(0, 6), due)), null);
			expect(chosen.map((c) => c.slot)).toEqual(chosen.map((_, i) => i + 1));
			expect(new Set(chosen.map((c) => c.slug)).size).toBe(chosen.length);
		}
	});

	it('counts a day the app was never opened as the slots it would have offered', () => {
		// Steve: two days away with nothing due -> 2 new each; one with a refresh due -> 1 + 2.
		expect(missedOffers(['2026-10-03', '2026-10-04'], () => 0)).toEqual({ fresh: 4, refresh: 0 });
		expect(missedOffers(['2026-10-05'], () => 1)).toEqual({ fresh: 2, refresh: 1 });
		expect(missedOffers([], () => 9)).toEqual({ fresh: 0, refresh: 0 });
	});

	it('keeps problem slots below the fixed Forge slot', () => {
		// The Forge row's slot must not depend on the day's due count (see DRILLS_SLOT).
		for (const due of [0, 1, 2, 5]) {
			const chosen = chooseSlots(snapFor(progressWith(root.slice(0, 6), due)), null);
			expect(Math.max(...chosen.map((c) => c.slot))).toBeLessThan(DRILLS_SLOT);
		}
	});

	it('serves untouched problems as the new ones', () => {
		const progress = progressWith(root.slice(0, 6), 1);
		for (const c of chooseSlots(snapFor(progress), null).filter((c) => c.kind === 'new')) {
			expect(progress.has(c.slug)).toBe(false);
		}
	});

	it('serves the shallower node first, however long the deeper one has waited', () => {
		// A due Two Pointers problem one day late must come before a due 1-D DP problem ten days
		// late. Refreshes walk the tree from the root, exactly as new problems do.
		// Every node is solved and fresh so the whole path is open and only ordering decides.
		const shallow = problemsForNode('two-pointers')[0].slug;
		const deep = problemsForNode('dp-1d')[0].slug;
		const progress = new Map<string, ProblemProgress>(
			NODE_ORDER.flatMap((id) => problemsForNode(id)).map((p) => [
				p.slug,
				{ solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() + DAY) }
			])
		);
		progress.set(deep, { solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() - 10 * DAY) });
		progress.set(shallow, { solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() - DAY) });
		const chosen = chooseSlots(snapFor(progress), null);
		expect(chosen[0]).toMatchObject({ slot: 1, kind: 'refresh', slug: shallow });
	});

	it('holds back refreshes from nodes past one that is not yet unlocked', () => {
		// Practice solves on leetcode.com put Sliding Window problems on the schedule while Two
		// Pointers, its prerequisite, was still locked. Those must wait for the path to open.
		const window = problemsForNode('sliding-window').map((p) => p.slug);
		const progress = progressWith(window, window.length);
		// Arrays & Hashing unlocked and fresh, Two Pointers untouched.
		for (const slug of root.slice(0, Math.ceil(root.length / 2)))
			progress.set(slug, { solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() + DAY) });
		const chosen = chooseSlots(snapFor(progress), null);
		expect(chosen.map((c) => c.kind)).toEqual(['new', 'new']);
		expect(chosen.some((c) => window.includes(c.slug))).toBe(false);

		// Once Two Pointers unlocks, its due refreshes are served, still with a new problem.
		const pointers = problemsForNode('two-pointers').map((p) => p.slug);
		for (const slug of pointers.slice(0, Math.ceil(pointers.length / 2)))
			progress.set(slug, { solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() + DAY) });
		const opened = chooseSlots(snapFor(progress), null);
		expect(opened.map((c) => c.kind)).toEqual(['refresh', 'refresh', 'new']);
		expect(opened.filter((c) => c.kind === 'refresh').every((c) => window.includes(c.slug))).toBe(true);
	});

	it('lets the daily challenge take the first new slot, whatever is due', () => {
		const daily = { slug: root[6], title: 'x', difficulty: 'Easy', date: '2026-09-09' } as never;
		expect(chooseSlots(snapFor(progressWith(root.slice(0, 6), 0)), daily).map((c) => c.kind)).toEqual(['daily', 'new']);
		expect(chooseSlots(snapFor(progressWith(root.slice(0, 6), 1)), daily).map((c) => c.kind)).toEqual(['refresh', 'daily', 'new']);
		expect(chooseSlots(snapFor(progressWith(root.slice(0, 6), 3)), daily).map((c) => c.kind)).toEqual(['refresh', 'refresh', 'daily']);
	});

	it('makes up a short kind with the other, keeping the expedition its size', () => {
		// Every problem in the tree solved, three due: no new problem exists, so refreshes fill in.
		const all = NODE_ORDER.flatMap((id) => problemsForNode(id)).map((p) => p.slug);
		const progress = new Map<string, ProblemProgress>(
			all.map((slug, i) => [slug, { solveCount: 1, srsStep: 0, dueAt: new Date(now.getTime() + (i < 3 ? -DAY : DAY)) }])
		);
		expect(chooseSlots(snapFor(progress), null).map((c) => c.kind)).toEqual(['refresh', 'refresh', 'refresh']);
	});
});
