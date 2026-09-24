import { describe, expect, it } from 'vitest';
import { formatValue, paramsOf, parseCase, type Suite } from './client';

const suites = import.meta.glob('/data/tests/*.json', { eager: true, import: 'default' }) as Record<string, Suite>;

describe('custom testcase fields', () => {
	it('names the fields after the parameters, and design problems after operations and arguments', () => {
		const twoSum = Object.values(suites).find((s) => s.slug === 'two-sum')!;
		expect(paramsOf(twoSum).map((p) => p.name)).toEqual(['nums', 'target']);
		const minStack = Object.values(suites).find((s) => s.slug === 'min-stack')!;
		expect(paramsOf(minStack).map((p) => p.name)).toEqual(['operations', 'arguments']);
	});

	it('reports which field is not valid JSON', () => {
		const r = parseCase(['[1,2,3]', "['a']", '']);
		expect(r.args).toBeUndefined();
		expect(r.errors[0]).toBeNull();
		expect(r.errors[1]).toMatch(/double quotes/);
		expect(r.errors[2]).toBe('empty');
		expect(parseCase(['[2,7,11,15]', '9']).args).toEqual([[2, 7, 11, 15], 9]);
	});

	it('prefills every problem with examples that parse back to themselves', () => {
		const bad: string[] = [];
		for (const suite of Object.values(suites)) {
			const n = paramsOf(suite).length;
			for (const c of suite.cases.slice(0, suite.exampleCount || suite.cases.length)) {
				const fields = c.args.map(formatValue);
				const back = parseCase(fields).args;
				if (fields.length !== n || JSON.stringify(back) !== JSON.stringify(c.args)) bad.push(suite.slug);
			}
		}
		expect(bad).toEqual([]);
		expect(Object.keys(suites).length).toBe(150);
	});
});

describe('description clarifications', () => {
	// LeetCode's statements are shown verbatim, so where one never defines its own term the note
	// file is the only place that does. A note for a slug that does not exist would never be seen.
	it('names real problems and says something', async () => {
		const notes = (await import('../../../data/description-notes.json')).default.notes as Record<string, string[]>;
		const problems = (await import('../../../data/neetcode150.json')).default as { slug: string }[];
		const slugs = new Set(problems.map((p) => p.slug));
		for (const [slug, lines] of Object.entries(notes)) {
			expect(slugs.has(slug), `${slug} is not a problem`).toBe(true);
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) expect(line.trim().length).toBeGreaterThan(20);
		}
	});
});
