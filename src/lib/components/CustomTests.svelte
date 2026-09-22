<script lang="ts">
	// LeetCode-style custom testcases: tabs of cases, one labelled field per parameter, and a run that
	// shows your output beside the reference solution's. Runs entirely in the browser worker and never
	// talks to the server, so nothing is recorded and nothing counts as assistance.
	import {
		exampleCases,
		formatValue,
		paramsOf,
		parseCase,
		runCustom,
		stop,
		STOPPED,
		type CustomResult,
		type Suite
	} from '$lib/pyodide/client';

	let {
		suite,
		slug,
		code,
		refUrl,
		blocked = false,
		onrunning
	}: {
		suite: Suite;
		slug: string;
		code: string;
		/** The reference solution, used as the oracle. Null when the problem has none. */
		refUrl: string | null;
		/** The page is running or submitting; the worker is busy. */
		blocked?: boolean;
		onrunning?: (running: boolean) => void;
	} = $props();

	const MAX_CASES = 10;
	// svelte-ignore state_referenced_locally
	const storageKey = `lc-game:custom:${slug}`;
	// svelte-ignore state_referenced_locally
	const params = paramsOf(suite);

	function examples(): string[][] {
		const ex = exampleCases(suite).map((c) => c.args.map(formatValue));
		return ex.length ? ex : [params.map(() => '')];
	}

	/** Saved cases for this problem, unless the problem's shape changed since they were saved. */
	function load(): string[][] {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			if (
				Array.isArray(saved) &&
				saved.length > 0 &&
				saved.every((c) => Array.isArray(c) && c.length === params.length && c.every((f) => typeof f === 'string'))
			) {
				return saved.slice(0, MAX_CASES);
			}
		} catch {}
		return examples();
	}

	let cases = $state<string[][]>(load());
	let active = $state(0);
	let view = $state<'testcase' | 'result'>('testcase');
	let running = $state(false);
	let results = $state<CustomResult[] | null>(null);
	let elapsedMs = $state(0);
	let timedOut = $state(false);
	let failure = $state('');
	/** undefined until fetched; null when there is no reference to fetch. */
	let refSource: string | null | undefined = undefined;

	const parsed = $derived(cases.map((c) => parseCase(c)));
	const valid = $derived(parsed.every((p) => p.args !== undefined));

	$effect(() => {
		const snapshot = JSON.stringify(cases);
		try {
			localStorage.setItem(storageKey, snapshot);
		} catch {}
	});

	function addCase() {
		if (cases.length >= MAX_CASES) return;
		cases.push([...cases[active]]);
		active = cases.length - 1;
		view = 'testcase';
	}

	function removeCase(i: number) {
		if (cases.length <= 1) return;
		cases.splice(i, 1);
		if (active >= cases.length) active = cases.length - 1;
		results = null;
	}

	function resetToExamples() {
		cases = examples();
		active = 0;
		results = null;
		view = 'testcase';
	}

	async function reference(): Promise<string | null> {
		if (refSource !== undefined) return refSource;
		if (!refUrl) return (refSource = null);
		try {
			const r = await fetch(refUrl);
			refSource = r.ok ? await r.text() : null;
		} catch {
			refSource = null;
		}
		return refSource;
	}

	async function run() {
		if (running || blocked || !valid) return;
		running = true;
		onrunning?.(true);
		failure = '';
		try {
			const inputs = parsed.map((p) => p.args!);
			const out = await runCustom(code, suite, await reference(), inputs);
			results = out.results;
			elapsedMs = out.elapsedMs;
			timedOut = out.timedOut;
			view = 'result';
			if (active >= inputs.length) active = 0;
		} catch (e) {
			failure = e instanceof Error && e.message === STOPPED ? 'Stopped.' : e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
			onrunning?.(false);
		}
	}

	function mark(r: CustomResult | undefined): string {
		if (!r) return '';
		if (r.ok === true) return '✓';
		if (r.ok === false) return '✗';
		return '·';
	}

	const fatal = $derived(results?.[0]?.fatal ? results[0] : null);
	const current = $derived(results && !fatal ? results[active] : undefined);
</script>

<div class="card custom">
	<div class="row head">
		<button class="tab" class:on={view === 'testcase'} onclick={() => (view = 'testcase')}>Testcase</button>
		<button class="tab" class:on={view === 'result'} onclick={() => (view = 'result')} disabled={!results && !timedOut}>Test Result</button>
		<span class="spacer"></span>
		<button class="link" onclick={resetToExamples}>Reset to examples</button>
		{#if running}
			<button class="stop" onclick={stop} title="Stop the code that is running now">■ Stop</button>
		{:else}
			<button onclick={run} disabled={blocked || !valid} title={valid ? '' : 'Fix the highlighted input first'}>Run custom</button>
		{/if}
	</div>

	<div class="row cases">
		{#each cases as _, i (i)}
			<span class="case" class:on={active === i}>
				<button class="tab" onclick={() => (active = i)}>
					{#if view === 'result' && results && !fatal}<span class:good={results[i]?.ok === true} class:bad={results[i]?.ok === false}>{mark(results[i])}</span>{/if}
					Case {i + 1}
				</button>
				{#if view === 'testcase' && cases.length > 1}
					<button class="x" onclick={() => removeCase(i)} title="Remove case {i + 1}">×</button>
				{/if}
			</span>
		{/each}
		{#if view === 'testcase' && cases.length < MAX_CASES}
			<button class="tab" onclick={addCase} title="Add a case (copies this one)">+</button>
		{/if}
	</div>

	{#if view === 'testcase'}
		{#each params as p, j (p.name)}
			<label class="field">
				<span class="muted">{p.name} =</span>
				<textarea
					rows={Math.min(8, Math.max(1, cases[active][j].split('\n').length))}
					spellcheck="false"
					autocomplete="off"
					class:invalid={parsed[active].errors[j] !== null}
					bind:value={cases[active][j]}
				></textarea>
				{#if parsed[active].errors[j]}<span class="err">{parsed[active].errors[j]}</span>{/if}
			</label>
		{/each}
	{:else if timedOut}
		<p class="bad">Time Limit Exceeded — the run did not finish within {Math.round(elapsedMs / 1000)} s and was stopped.</p>
	{:else if fatal}
		<p class="bad">Compile Error</p>
		<pre>{fatal.error}</pre>
	{:else if current}
		<p class="muted">
			{#if current.ok === true}<strong class="good">Output matches</strong>
			{:else if current.ok === false}<strong class="bad">{current.error ? 'Runtime Error' : 'Wrong Answer'}</strong>
			{:else}No verdict{/if}
			· {elapsedMs} ms for {results!.length} case{results!.length === 1 ? '' : 's'}
		</p>
		<div class="block">
			<span class="muted">Input</span>
			{#each params as p, j (p.name)}<pre>{p.name} = {formatValue(current.args?.[j])}</pre>{/each}
		</div>
		{#if current.stdout}
			<div class="block"><span class="muted">Stdout</span><pre>{current.stdout}</pre></div>
		{/if}
		<div class="block">
			<span class="muted">Output</span>
			<pre class:bad={current.ok === false}>{current.error ?? formatValue(current.actual)}</pre>
		</div>
		{#if refUrl}
			<div class="block">
				<span class="muted">Expected</span>
				{#if current.refError}
					<pre class="muted">The reference solution failed on this input, so there is no expected output. The input may be outside the problem's constraints.
{current.refError}</pre>
				{:else}
					<pre>{formatValue(current.expected)}</pre>
				{/if}
			</div>
		{/if}
	{:else if results}
		<p class="muted">This case was added after the last run.</p>
	{/if}

	{#if failure}<p class="bad">{failure}</p>{/if}
</div>

<style>
	.custom { display: grid; gap: 0.6rem; }
	.head .spacer { flex: 1; }
	.tab { background: none; border: 1px solid transparent; border-radius: 6px; padding: 0.2rem 0.6rem; color: var(--muted); }
	.tab.on, .case.on .tab { color: var(--text); border-color: var(--border); background: var(--panel-2); }
	.cases { gap: 0.3rem; flex-wrap: wrap; }
	.case { display: inline-flex; align-items: center; }
	.x { background: none; border: none; color: var(--muted); padding: 0 0.3rem; }
	.field { display: grid; gap: 0.2rem; }
	.field textarea { resize: vertical; }
	.field textarea.invalid { border-color: var(--bad); }
	.err { color: var(--bad); font-size: 0.85rem; }
	.block { display: grid; gap: 0.2rem; }
	.block pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
	.good { color: var(--good); }
	.bad { color: var(--bad); }
	button.stop { border-color: var(--bad); color: var(--bad); }
	button.link { border: none; background: none; color: var(--accent-2); padding: 0; }
</style>
