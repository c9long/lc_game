/** A parser for printed Python values, and a comparison that accepts any spelling of the same value.
 *
 *  Drills ask "what is printed?", and the expected answer is a repr. Comparing reprs as strings
 *  rejects answers that are plainly right — `l` for `'l'`, `{'b': 2, 'a': 1}` for `{'a': 1, 'b': 2}`
 *  — so the answer is parsed into a value and compared structurally instead.
 *
 *  Nothing is executed: this only reads literals. */

export type PyValue =
	| { t: 'int'; v: bigint }
	| { t: 'float'; v: number }
	| { t: 'str'; v: string; bare?: boolean }
	| { t: 'bool'; v: boolean }
	| { t: 'none' }
	| { t: 'list'; v: PyValue[] }
	| { t: 'tuple'; v: PyValue[] }
	| { t: 'set'; v: PyValue[] }
	| { t: 'dict'; v: [PyValue, PyValue][] };

const CLOSERS: Record<string, string> = { '[': ']', '(': ')', '{': '}' };

class Reader {
	s: string;
	i = 0;
	/** Lenient mode turns an unparseable run of text into a string, so `l` answers `'l'` and
	 *  `[fig, apple]` answers `['fig', 'apple']`. Only ever used as a fallback: a strict parse is
	 *  tried first, so `3` stays an int and is not quietly accepted for the string `'3'`. */
	lenient: boolean;

	constructor(s: string, lenient: boolean) {
		this.s = s;
		this.lenient = lenient;
	}

	ws() {
		while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
	}

	peek(): string {
		return this.s[this.i] ?? '';
	}

	value(): PyValue | null {
		this.ws();
		const c = this.peek();
		if (c === '') return null;
		if (c === '[' || c === '(' || c === '{') return this.container(c);
		if (c === '"' || c === "'") return this.str();
		const word = this.keyword();
		if (word) return word;
		const num = this.number();
		if (num) return num;
		return this.lenient ? this.bare() : null;
	}

	/** Everything up to the next structural character, as a string. Trimmed, so a whitespace-padded
	 *  expected string such as `'   spacious'` can only be answered with quotes — the padding is the
	 *  whole point of those drills and leading spaces in a text box are usually a slip. */
	bare(): PyValue | null {
		const start = this.i;
		while (this.i < this.s.length && !'[](){},:'.includes(this.s[this.i])) this.i++;
		const raw = this.s.slice(start, this.i).trim();
		if (raw === '') {
			this.i = start;
			return null;
		}
		return { t: 'str', v: raw, bare: true };
	}

	keyword(): PyValue | null {
		const m = /^(True|False|None)\b/.exec(this.s.slice(this.i));
		if (!m) return null;
		this.i += m[0].length;
		if (m[0] === 'None') return { t: 'none' };
		return { t: 'bool', v: m[0] === 'True' };
	}

	number(): PyValue | null {
		const rest = this.s.slice(this.i);
		const inf = /^([+-]?)(inf|Infinity)\b/.exec(rest);
		if (inf) {
			this.i += inf[0].length;
			return { t: 'float', v: inf[1] === '-' ? -Infinity : Infinity };
		}
		const nan = /^[+-]?nan\b/.exec(rest);
		if (nan) {
			this.i += nan[0].length;
			return { t: 'float', v: NaN };
		}
		const based = /^([+-]?)0([bBoOxX])([0-9a-fA-F_]+)/.exec(rest);
		if (based) {
			this.i += based[0].length;
			const radix = { b: 2, o: 8, x: 16 }[based[2].toLowerCase() as 'b' | 'o' | 'x'];
			const digits = based[3].replace(/_/g, '');
			let v = 0n;
			for (const d of digits) v = v * BigInt(radix) + BigInt(parseInt(d, radix));
			return { t: 'int', v: based[1] === '-' ? -v : v };
		}
		const m = /^([+-]?)(\d[\d_]*)?(\.[\d_]*)?([eE][+-]?\d+)?/.exec(rest);
		if (!m || (!m[2] && !m[3])) return null;
		const text = m[0].replace(/_/g, '');
		if (text === '' || text === '+' || text === '-' || text === '.') return null;
		this.i += m[0].length;
		if (m[3] || m[4]) return { t: 'float', v: Number(text) };
		return { t: 'int', v: BigInt(text) };
	}

	str(): PyValue | null {
		const q = this.peek();
		const triple = this.s.startsWith(q.repeat(3), this.i);
		const close = triple ? q.repeat(3) : q;
		let j = this.i + close.length;
		let out = '';
		while (j < this.s.length) {
			if (this.s.startsWith(close, j)) {
				this.i = j + close.length;
				return { t: 'str', v: out };
			}
			if (this.s[j] === '\\') {
				const e = this.s[j + 1];
				if (e === 'x' || e === 'u' || e === 'U') {
					const n = e === 'x' ? 2 : e === 'u' ? 4 : 8;
					const hex = this.s.slice(j + 2, j + 2 + n);
					out += String.fromCodePoint(parseInt(hex, 16) || 0);
					j += 2 + n;
					continue;
				}
				out += { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v' }[e] ?? e ?? '';
				j += 2;
				continue;
			}
			out += this.s[j];
			j++;
		}
		return null; // unterminated
	}

	container(open: string): PyValue | null {
		const close = CLOSERS[open];
		this.i++;
		const items: PyValue[] = [];
		const pairs: [PyValue, PyValue][] = [];
		let isDict = false;
		let comma = false;
		this.ws();
		while (this.peek() !== close) {
			const v = this.value();
			if (!v) return null;
			this.ws();
			if (this.peek() === ':') {
				if (items.length > 0) return null;
				isDict = true;
				this.i++;
				const val = this.value();
				if (!val) return null;
				pairs.push([v, val]);
			} else {
				if (isDict) return null;
				items.push(v);
			}
			this.ws();
			if (this.peek() === ',') {
				this.i++;
				comma = true;
				this.ws();
				continue;
			}
			break;
		}
		if (this.peek() !== close) return null;
		this.i++;
		if (open === '[') return { t: 'list', v: items };
		// `(x)` is just x; `(x,)` is a one-tuple.
		if (open === '(') return items.length === 1 && !comma ? items[0] : { t: 'tuple', v: items };
		// `{}` is an empty dict in Python, not an empty set.
		if (isDict || items.length === 0) return { t: 'dict', v: pairs };
		return { t: 'set', v: items };
	}
}

function parse(s: string, lenient: boolean): PyValue | null {
	const r = new Reader(s, lenient);
	const first = r.value();
	if (!first) return null;
	r.ws();
	// A bare comma list is a tuple: `1, 2` answers `(1, 2)`.
	if (r.peek() === ',') {
		const items = [first];
		while (r.peek() === ',') {
			r.i++;
			r.ws();
			if (r.i >= r.s.length) break;
			const v = r.value();
			if (!v) return null;
			items.push(v);
			r.ws();
		}
		r.ws();
		return r.i >= r.s.length ? { t: 'tuple', v: items } : null;
	}
	return r.i >= r.s.length ? first : null;
}

export function parseStrict(s: string): PyValue | null {
	return parse(s, false);
}

export function parseLenient(s: string): PyValue | null {
	return parse(s, true);
}

function floatEq(a: number, b: number): boolean {
	if (Number.isNaN(a) && Number.isNaN(b)) return true;
	if (a === b) return true;
	if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
	return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Order-insensitive match over small collections: each expected item must claim a distinct given
 *  item. Sizes here are single digits, so the quadratic scan is free. */
function matchAll<T>(expected: T[], given: T[], eq: (a: T, b: T) => boolean): boolean {
	if (expected.length !== given.length) return false;
	const used = new Array(given.length).fill(false);
	for (const e of expected) {
		const j = given.findIndex((g, k) => !used[k] && eq(e, g));
		if (j < 0) return false;
		used[j] = true;
	}
	return true;
}

export function pyEqual(expected: PyValue, given: PyValue): boolean {
	// int and float stay distinct: `7 / 2` giving 3.5 where `7 // 2` gives 3 is a lesson, and so is
	// `6 / 2` giving 3.0 rather than 3.
	if (expected.t !== given.t) return false;
	switch (expected.t) {
		case 'int':
			return expected.v === (given as { v: bigint }).v;
		case 'float':
			return floatEq(expected.v, (given as { v: number }).v);
		case 'str':
			return expected.v === (given as { v: string }).v;
		case 'bool':
			return expected.v === (given as { v: boolean }).v;
		case 'none':
			return true;
		case 'list':
		case 'tuple': {
			const g = (given as { v: PyValue[] }).v;
			return expected.v.length === g.length && expected.v.every((e, i) => pyEqual(e, g[i]));
		}
		case 'set':
			return matchAll(expected.v, (given as { v: PyValue[] }).v, pyEqual);
		case 'dict': {
			const g = (given as { v: [PyValue, PyValue][] }).v;
			return matchAll(expected.v, g, (a, b) => pyEqual(a[0], b[0]) && pyEqual(a[1], b[1]));
		}
	}
}

/** True when `given` prints the same Python value as `expected`. Null when `expected` is not a
 *  literal this understands (`<class 'float'>`, `Counter({'a': 1})`, multi-line output), leaving the
 *  caller to fall back to string comparison. */
export function sameValue(expected: string, given: string): boolean | null {
	const want = parseStrict(expected);
	if (!want) return null;
	const strict = parseStrict(given);
	if (strict) return pyEqual(want, strict);
	const lenient = parseLenient(given);
	return lenient ? pyEqual(want, lenient) : false;
}
