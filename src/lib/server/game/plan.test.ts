import { describe, expect, it } from 'vitest';
import { REFRESH_BACKLOG_TAKEOVER, chooseSlots, planItemDone } from './plan';
import { problemsForNode } from '$lib/game/curriculum';
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

	it('pairs a refresh with a new problem below the backlog threshold', () => {
		const chosen = chooseSlots(snapFor(progressWith(root.slice(0, 6), 2)), null);
		expect(chosen.map((c) => c.kind)).toEqual(['refresh', 'new']);
	});

	it('gives both slots to refreshes once the backlog is reached', () => {
		const progress = progressWith(root.slice(0, 6), REFRESH_BACKLOG_TAKEOVER);
		const chosen = chooseSlots(snapFor(progress), null);
		expect(chosen.map((c) => c.kind)).toEqual(['refresh', 'refresh']);
		// Most overdue first, and never the same problem twice.
		expect(new Set(chosen.map((c) => c.slug)).size).toBe(2);
	});

	it('drops the daily challenge while the backlog stands', () => {
		// The daily is a problem never solved before, so serving it works against draining.
		const daily = { slug: root[6], title: 'x', difficulty: 'Easy', date: '2026-09-09' } as never;
		const fresh = snapFor(progressWith(root.slice(0, 6), 2));
		expect(chooseSlots(fresh, daily).map((c) => c.kind)).toEqual(['refresh', 'daily']);
		const backed = snapFor(progressWith(root.slice(0, 6), REFRESH_BACKLOG_TAKEOVER));
		expect(chooseSlots(backed, daily).map((c) => c.kind)).toEqual(['refresh', 'refresh']);
	});

	it('falls back to a new problem when the backlog runs dry mid-plan', () => {
		// Exactly REFRESH_BACKLOG_TAKEOVER due, two taken; a later day with fewer left must still
		// fill slot 2 rather than returning a one-slot expedition.
		const progress = progressWith(root.slice(0, 6), 1);
		const chosen = chooseSlots(snapFor(progress), null);
		expect(chosen).toHaveLength(2);
		expect(chosen[1].kind).toBe('new');
	});
});
