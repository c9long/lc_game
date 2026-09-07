import { describe, expect, it } from 'vitest';
import { planItemDone } from './plan';

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
