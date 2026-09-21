// Main-thread wrapper around the Pyodide judge worker.
//
// The worker cannot stop itself mid-run (see the note in worker.js), so the only reliable time
// limit is terminating it from here. That costs the loaded runtime, hence the reboot afterwards.

export interface TestCase {
	args: unknown[];
	expected: unknown;
}

export interface Suite {
	slug: string;
	mode: 'plain' | 'structure' | 'design';
	entry?: string;
	classname?: string;
	methods?: unknown[];
	params: { name: string; type: string }[];
	returns?: { type: string };
	compare: string;
	cases: TestCase[];
	exampleCount: number;
}

export interface CaseResult {
	ok: boolean;
	args?: unknown[];
	expected?: unknown;
	actual?: unknown;
	error?: string;
	fatal?: boolean;
}

export type Verdict =
	| 'Accepted'
	| 'Wrong Answer'
	| 'Runtime Error'
	| 'Compile Error'
	| 'Time Limit Exceeded';

export interface JudgeOutcome {
	verdict: Verdict;
	results: CaseResult[];
	stdout: string;
	elapsedMs: number;
	passed: number;
	total: number;
}

/** Total budget for one Run or Submit. Pyodide is 3-5x slower than native CPython, so this is
 *  deliberately generous rather than a mirror of LeetCode's per-case limits. */
export const TIME_LIMIT_MS = 15_000;

let worker: Worker | null = null;
let nextId = 1;

function spawn(): Worker {
	const w = new Worker('/pyodide/worker.js', { type: 'module' });
	worker = w;
	return w;
}

function call<T>(message: Record<string, unknown>, timeoutMs: number): Promise<T> {
	const w = worker ?? spawn();
	const id = nextId++;

	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			// A runaway loop leaves the worker wedged, so it is discarded rather than reused.
			w.terminate();
			if (worker === w) worker = null;
			reject(new Error('timeout'));
		}, timeoutMs);

		function cleanup() {
			clearTimeout(timer);
			w.removeEventListener('message', onMessage);
			w.removeEventListener('error', onError);
		}

		function onMessage(event: MessageEvent) {
			if (event.data?.id !== id) return;
			cleanup();
			if (event.data.ok) resolve(event.data as T);
			else reject(new Error(event.data.error ?? 'worker failed'));
		}

		function onError(event: ErrorEvent) {
			cleanup();
			if (worker === w) worker = null;
			reject(new Error(event.message || 'worker crashed'));
		}

		w.addEventListener('message', onMessage);
		w.addEventListener('error', onError);
		w.postMessage({ id, ...message });
	});
}

/** Start downloading and initialising Pyodide. Safe to call repeatedly; the worker boots once. */
export function warmUp(): Promise<unknown> {
	return call({ type: 'boot' }, 120_000).catch(() => undefined);
}

export async function judge(
	source: string,
	suite: Suite,
	cases: TestCase[],
	timeoutMs = TIME_LIMIT_MS
): Promise<JudgeOutcome> {
	let response: { results: CaseResult[]; stdout: string; elapsedMs: number };
	try {
		// Serialise here rather than posting the objects. `suite` is usually a Svelte $state proxy,
		// which structured clone refuses ("could not be cloned"), and the worker needs JSON anyway.
		response = await call(
			{
				type: 'judge',
				source,
				specJson: JSON.stringify(suite),
				casesJson: JSON.stringify(cases)
			},
			timeoutMs
		);
	} catch (e) {
		if ((e as Error).message === 'timeout') {
			return {
				verdict: 'Time Limit Exceeded',
				results: [],
				stdout: '',
				elapsedMs: timeoutMs,
				passed: 0,
				total: cases.length
			};
		}
		throw e;
	}

	const { results, stdout, elapsedMs } = response;
	const passed = results.filter((r) => r.ok).length;
	let verdict: Verdict = 'Accepted';
	if (results.some((r) => r.fatal)) verdict = 'Compile Error';
	else if (results.some((r) => !r.ok && r.error)) verdict = 'Runtime Error';
	else if (passed < results.length) verdict = 'Wrong Answer';

	return { verdict, results, stdout, elapsedMs, passed, total: results.length };
}

/** Cases shown by Run: the ones derived from LeetCode's published examples. */
export function exampleCases(suite: Suite): TestCase[] {
	return suite.cases.slice(0, suite.exampleCount || suite.cases.length);
}

// ---------- custom testcases ----------
//
// Inputs typed by hand, LeetCode style: one field per parameter, each holding a JSON value. The
// expected output comes from running the reference solution on the same input in the worker.
// Nothing here talks to the server, so a custom run is never recorded.

export interface CustomResult {
	/** null when there is no expected output to judge against (no reference, or it failed). */
	ok: boolean | null;
	args?: unknown[];
	expected?: unknown;
	actual?: unknown;
	error?: string;
	/** The reference solution failed on this input — usually one outside the problem's constraints. */
	refError?: string;
	fatal?: boolean;
	stdout?: string;
}

export interface CustomOutcome {
	results: CustomResult[];
	elapsedMs: number;
	timedOut: boolean;
}

export async function runCustom(
	source: string,
	suite: Suite,
	refSource: string | null,
	inputs: unknown[][],
	timeoutMs = TIME_LIMIT_MS
): Promise<CustomOutcome> {
	try {
		const r = await call<{ results: CustomResult[]; elapsedMs: number }>(
			{
				type: 'custom',
				source,
				refSource,
				specJson: JSON.stringify(suite),
				inputsJson: JSON.stringify(inputs)
			},
			timeoutMs
		);
		return { results: r.results, elapsedMs: r.elapsedMs, timedOut: false };
	} catch (e) {
		if ((e as Error).message === 'timeout') return { results: [], elapsedMs: timeoutMs, timedOut: true };
		throw e;
	}
}

/** The fields of one testcase, in the order the harness expects them. A design problem takes the
 *  list of operations and the list of their arguments, as LeetCode's own testcase box does. */
export function paramsOf(suite: Suite): { name: string; type: string }[] {
	if (suite.mode === 'design') {
		return [
			{ name: 'operations', type: 'string[]' },
			{ name: 'arguments', type: 'list' }
		];
	}
	return suite.params;
}

/** A value as LeetCode writes it in a testcase: compact JSON, `[2,7,11,15]`, `"abc"`. */
export function formatValue(v: unknown): string {
	return JSON.stringify(v) ?? 'null';
}

/** Parses each field as JSON. `errors[i]` is set for a field that does not parse, and `args` is
 *  present only when every field does. */
export function parseCase(fields: string[]): { args?: unknown[]; errors: (string | null)[] } {
	const args: unknown[] = [];
	const errors = fields.map((text, i) => {
		if (text.trim() === '') return 'empty';
		try {
			args[i] = JSON.parse(text);
			return null;
		} catch {
			return text.includes("'") ? 'not valid JSON (strings take double quotes)' : 'not valid JSON';
		}
	});
	return errors.every((e) => e === null) ? { args, errors } : { errors };
}
