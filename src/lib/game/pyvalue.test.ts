import { describe, expect, it } from 'vitest';
import { parseStrict, sameValue } from './pyvalue';
import { checkAnswer, type Drill } from './drills';
import { DRILL_BANKS } from './drillbank';

const yes = (expected: string, given: string) => expect(sameValue(expected, given)).toBe(true);
const no = (expected: string, given: string) => expect(sameValue(expected, given)).toBe(false);

describe('python value comparison', () => {
	it('accepts any spelling of a string, but not another type', () => {
		yes("'l'", 'l');
		yes("'l'", "'l'");
		yes("'l'", '"l"');
		yes("'eet'", ' eet ');
		no("'l'", 'L');
		no("'l'", "''");
		no("'l'", '"l "');
		// bin() returns a string; typing the number is the mistake the drill is about.
		no("'0b1010'", '0b1010');
		no("'3'", '3');
		no("'True'", 'True');
	});

	it('keeps whitespace inside strings', () => {
		no("'   spacious'", "' spacious'");
		no("'   spacious'", 'spacious');
		no("'spacious   '", "'spacious'");
		yes("'   spacious'", '"   spacious"');
		// the f-string drill: the space around = is content, not formatting
		no("'n=3'", "'n = 3'");
		yes("'n=3'", '"n=3"');
	});

	it('keeps int and float apart', () => {
		yes('3', '3');
		yes('3', ' 3 ');
		yes('10', '0b1010');
		yes('10', '0x_a');
		yes('1000', '1_000');
		no('3', '3.0');
		no('3.0', '3');
		yes('3.0', '3.00');
		yes('0.001', '1e-3');
		yes('2.5', '2.50');
		no('2.5', '2');
	});

	it('handles infinities and nan', () => {
		yes('-inf', '-inf');
		yes('-inf', '-Infinity');
		yes('inf', 'inf');
		yes('nan', 'nan');
		no('inf', '-inf');
		no("'inf'", 'inf');
	});

	it('does not confuse the collection types', () => {
		no('[1, 2]', '(1, 2)');
		no('[1, 2]', '{1, 2}');
		yes('(1, 2)', '1, 2');
		yes('(1, 2)', '(1, 2,)');
		yes('(2, 1)', '(2,1)');
		yes("['fig', 'apple']", '["fig","apple"]');
		yes("['fig', 'apple']", '[fig, apple]');
		no("['fig', 'apple']", "['apple', 'fig']");
	});

	it('ignores order in sets and dicts only', () => {
		yes('{1, 2}', '{2, 1}');
		yes('{2}', '{2}');
		yes("{'a': 1, 'b': 2}", "{'b': 2, 'a': 1}");
		yes("{'a': 1, 'b': 2}", '{b: 2, a: 1}');
		yes('{1: 2, 3: 4}', '{1:2, 3:4}');
		no("{'a': 1}", "{'a': 2}");
		yes('{}', '{}');
	});

	it('leaves output it cannot parse to the caller', () => {
		expect(sameValue("<class 'float'>", "<class 'float'>")).toBe(null);
		expect(sameValue("Counter({'a': 1})", "{'a': 1}")).toBe(null);
		expect(parseStrict("(1, 'a')\n(2, 'b')")).toBe(null);
	});

	it('rejects lowercase keywords: True is not true in Python', () => {
		const d = (answer: string): Drill => ({
			id: 'x',
			lang: 'python',
			module: 'm',
			kind: 'output',
			context: '',
			code: '>>> x',
			answer,
			url: ''
		});
		expect(checkAnswer(d('True'), 'true')).toBe(false);
		expect(checkAnswer(d('True'), 'TRUE')).toBe(false);
		expect(checkAnswer(d('None'), 'none')).toBe(false);
		expect(checkAnswer(d('False'), 'Null')).toBe(false);
		expect(checkAnswer(d('True'), 'True')).toBe(true);
	});

	it('falls back to string comparison when the answer is not a literal', () => {
		const d: Drill = {
			id: 'x',
			lang: 'python',
			module: 'm',
			kind: 'output',
			context: '',
			code: '>>> x',
			answer: "<class 'float'>",
			url: ''
		};
		expect(checkAnswer(d, "<class 'float'>")).toBe(true);
		expect(checkAnswer(d, '<class "float">')).toBe(true);
		expect(checkAnswer(d, "<class 'int'>")).toBe(false);
	});
});

describe('cloze answers', () => {
	const cloze = (answer: string, api?: string): Drill => ({
		id: 'x',
		lang: 'python',
		module: 'm',
		kind: 'cloze',
		context: '',
		code: '>>> ___(h)',
		answer,
		api,
		url: ''
	});

	it('accepts the qualified name of the same call', () => {
		expect(checkAnswer(cloze('heapify', 'heapq.heapify'), 'heapq.heapify')).toBe(true);
		expect(checkAnswer(cloze('heapify', 'heapq.heapify'), 'heapify(')).toBe(true);
		expect(checkAnswer(cloze('heapify', 'heapq.heapify'), 'heapify()')).toBe(true);
		expect(checkAnswer(cloze('split', 'str.split'), 'str.split')).toBe(true);
	});

	it('does not accept the api when the blank is an argument', () => {
		// defaultdict(___) with answer `int`: the factory is the whole question.
		expect(checkAnswer(cloze('int', 'collections.defaultdict'), 'defaultdict')).toBe(false);
		expect(checkAnswer(cloze('int', 'collections.defaultdict'), 'collections.defaultdict')).toBe(false);
		// sorted(..., ___=len) with answer `key`
		expect(checkAnswer(cloze('key', 'sorted'), 'sorted')).toBe(false);
		expect(checkAnswer(cloze('list', 'reversed'), 'reversed')).toBe(false);
	});

	it('stays case sensitive', () => {
		expect(checkAnswer(cloze('heapify', 'heapq.heapify'), 'Heapify')).toBe(false);
	});
});

describe('the bank itself', () => {
	// The generator that produces drill variants has no reviewer, so this is the net under it: every
	// drill the app can serve must accept the answer it ships with.
	it('accepts its own answers', () => {
		const bad: string[] = [];
		for (const [lang, bank] of Object.entries(DRILL_BANKS)) {
			for (const d of bank) {
				if (!checkAnswer(d, d.answer)) bad.push(`${lang}/${d.id} (${d.answer})`);
				for (const alt of d.alternatives ?? []) {
					if (!checkAnswer(d, alt)) bad.push(`${lang}/${d.id} alt (${alt})`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
