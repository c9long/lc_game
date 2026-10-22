<script lang="ts">
	// LeetCode-style testcases: tabs of cases, one labelled field per parameter, and a run that shows
	// your output beside the reference solution's. The page's Run button (and Ctrl+Enter) calls run().
	// The published examples are only the starting cases: remove them, add your own, or reset. Runs
	// entirely in the browser worker and never talks to the server, so nothing is recorded and
	// nothing counts as assistance.
	import { exampleCases, formatValue, paramsOf, parseCase, runCustom, STOPPED, type CustomResult, type Suite } from '$lib/pyodide/client';

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

	/** Saved cases for this problem, unless the problem's shape changed since they were saved. An empty
	 *  list is kept: removing every case is a choice, and Reset to examples undoes it. */
	function load(): string[][] {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			if (
				Array.isArray(saved) &&
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
	let setup = $state('');
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

	/** A copy of the case on screen, or a blank one when there are none. */
	function addCase() {
		if (cases.length >= MAX_CASES) return;
		cases.push(cases[active] ? [...cases[active]] : params.map(() => ''));
		active = cases.length - 1;
		view = 'testcase';
	}

	function removeCase(i: number) {
		cases.splice(i, 1);
		if (active >= cases.length) active = Math.max(0, cases.length - 1);
		results = null;
		view = 'testcase';
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

	let panel: HTMLElement;

	/** Runs every case. Called by the page's Run button and by Ctrl+Enter in the editor. */
	export async function run() {
		if (running || blocked) return;
		failure = '';
		if (!cases.length) {
			view = 'testcase';
			failure = 'There are no test cases to run. Add one, or reset to the examples.';
			return;
		}
		if (!valid) {
			active = parsed.findIndex((p) => p.args === undefined);
			view = 'testcase';
			failure = `Case ${active + 1} has an input that is not valid JSON; fix it to run.`;
			return;
		}
		running = true;
		onrunning?.(true);
		panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		try {
			const inputs = parsed.map((p) => p.args!);
			const out = await runCustom(code, suite, await reference(), inputs);
			results = out.results;
			setup = out.setup;
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

<section class="bench" bind:this={panel} aria-label="Test cases">
	<div class="head">
		<div class="tabs" role="tablist">
			<button role="tab" aria-selected={view === 'testcase'} class:on={view === 'testcase'} onclick={() => (view = 'testcase')}>Test cases</button>
			<button role="tab" aria-selected={view === 'result'} class:on={view === 'result'} onclick={() => (view = 'result')} disabled={!results && !timedOut}>Results</button>
		</div>
		<button class="link" onclick={resetToExamples}>Reset to examples</button>
	</div>

	{#if cases.length}
		<div class="cases">
			{#each cases as _, i (i)}
				<span class="case" class:on={active === i}>
					<button class="chip" onclick={() => (active = i)}>
						{#if view === 'result' && results && !fatal}<span class="mark" class:good={results[i]?.ok === true} class:bad={results[i]?.ok === false}>{mark(results[i])}</span>{/if}
						Case {i + 1}
					</button>
					{#if view === 'testcase'}
						<button class="x" onclick={() => removeCase(i)} aria-label="Remove case {i + 1}" title="Remove case {i + 1}">×</button>
					{/if}
				</span>
			{/each}
			{#if view === 'testcase' && cases.length < MAX_CASES}
				<button class="chip add" onclick={addCase} title="Add a case (copies the one on screen)">Add case</button>
			{/if}
		</div>
	{/if}

	{#if view === 'testcase'}
		{#if !cases.length}
			<p class="empty">No test cases. <button class="link" onclick={addCase}>Add one</button>, or reset to the examples.</p>
		{:else}
			{#each params as p, j (p.name)}
				<label class="field">
					<span class="param">{p.name} =</span>
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
		{/if}
	{:else if timedOut}
		<p class="call bad">Time limit exceeded.</p>
		<p class="note">The run did not finish within {Math.round(elapsedMs / 1000)} s and was stopped.</p>
	{:else if fatal}
		<p class="call bad">It doesn't compile.</p>
		<pre>{fatal.error}</pre>
		{#if setup}<div class="block"><span class="label">Printed while loading</span><pre>{setup}</pre></div>{/if}
	{:else if current}
		<p class="call" class:good={current.ok === true} class:bad={current.ok === false}>
			{#if current.ok === true}Matches the reference.{:else if current.ok === false}{current.error ? 'Runtime error.' : 'Wrong answer.'}{:else}No expected output to compare.{/if}
		</p>
		<p class="note">{results!.length} {results!.length === 1 ? 'case' : 'cases'} in {elapsedMs} ms</p>
		<div class="block">
			<span class="label">Input</span>
			{#each params as p, j (p.name)}<pre>{p.name} = {formatValue(current.args?.[j])}</pre>{/each}
		</div>
		<div class="pair">
			<div class="block">
				<span class="label">Your output</span>
				<pre class:bad={current.ok === false}>{current.error ?? formatValue(current.actual)}</pre>
			</div>
			{#if refUrl}
				<div class="block">
					<span class="label">Expected</span>
					{#if current.refError}
						<pre class="dim">The reference solution failed on this input, so there is no expected output. The input may be outside the problem's constraints.
{current.refError}</pre>
					{:else}
						<pre>{formatValue(current.expected)}</pre>
					{/if}
				</div>
			{/if}
		</div>
		<div class="block">
			<span class="label">Printed</span>
			{#if current.stdout}<pre>{current.stdout}</pre>{:else}<pre class="dim">Nothing.</pre>{/if}
		</div>
		{#if setup}
			<div class="block">
				<span class="label">Printed while loading</span>
				<pre>{setup}</pre>
			</div>
		{/if}
	{:else if results}
		<p class="note">This case was added after the last run.</p>
	{/if}

	{#if failure}<p class="err">{failure}</p>{/if}
</section>

<style>
	.bench { display: grid; gap: 0.75rem; }
	.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; border-bottom: 2px solid var(--border); }
	.tabs { display: flex; gap: 1.5rem; }
	.tabs button {
		position: relative;
		background: none;
		border: 0;
		border-radius: 0;
		padding: 0.35rem 0 0.45rem;
		color: var(--steel);
	}
	.tabs button:hover:not(:disabled) { color: var(--text); }
	.tabs button.on { color: var(--text); font-weight: 700; }
	.tabs button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; height: 3px; background: var(--brass); }
	.tabs button:disabled { opacity: 0.45; }
	.head .link { margin-bottom: 0.45rem; }

	.cases { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.case { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 4px; }
	.case.on { border-color: var(--brass); }
	.chip { background: none; border: 0; border-radius: 4px; padding: 0.2rem 0.6rem; color: var(--steel); font-size: 0.92rem; }
	.case.on .chip { color: var(--text); }
	.chip.add { border: 1px dashed var(--border); color: var(--steel); }
	.chip.add:hover { color: var(--brass); border-color: var(--brass); }
	.x { background: none; border: 0; border-radius: 4px; color: var(--steel); padding: 0.2rem 0.45rem 0.2rem 0; }
	.x:hover:not(:disabled) { color: var(--rust); }
	.mark { font-weight: 700; margin-right: 0.15rem; }

	.field { display: grid; gap: 0.2rem; }
	.param { color: var(--steel); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9rem; }
	.field textarea { resize: vertical; font-size: 0.95rem; }
	.field textarea:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
	.field textarea.invalid { border-color: var(--rust); }
	.err { color: var(--rust); font-size: 0.9rem; margin: 0; }
	.empty { color: var(--steel); margin: 0.25rem 0; }

	.call { margin: 0.2rem 0 0; font-family: var(--display); font-weight: 700; font-size: 1.5rem; line-height: 1.15; }
	.note { margin: 0; color: var(--steel); font-size: 0.9rem; }
	.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
	@media (max-width: 600px) { .pair { grid-template-columns: 1fr; } }
	.block { display: grid; gap: 0.2rem; min-width: 0; }
	.label { color: var(--steel); font-size: 0.85rem; }
	.block pre, .bench > pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
	pre.dim { color: var(--steel); }
	.good { color: var(--brass); }
	.bad { color: var(--rust); }
	pre.bad { color: var(--rust); }
	button.link { border: none; background: none; color: var(--brass); padding: 0; font-size: 0.92rem; }
	button.link:hover { text-decoration: underline; }
</style>
