<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Editor from '$lib/components/Editor.svelte';
	import CustomTests from '$lib/components/CustomTests.svelte';
	import TagToggle from '$lib/components/TagToggle.svelte';
	import { judge, warmUp, stop, STOPPED, TIME_LIMIT_MS, type Suite, type TestCase } from '$lib/pyodide/client';
	let { data } = $props();

	const STORAGE_LANG = 'lc-game:lang';
	// svelte-ignore state_referenced_locally
	let lang = $state(data.lastLang ?? 'python3');
	let code = $state('');
	/** A submission holds the worker; Run waits for it. */
	let busy = $state<'submit' | null>(null);
	/** A test-case run holds the worker; Submit waits for it. */
	let customBusy = $state(false);
	let tests = $state<CustomTests>();
	let suite = $state<Suite | null>(null);
	let suiteError = $state('');
	let result = $state<Record<string, any> | null>(null);
	let message = $state('');
	let award = $state<Record<string, any> | null>(null);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let lastSaved = '';
	/** A solution accepted in this session. The server's lastAccepted only refreshes on reload,
	 *  and the editor is cleared the moment a submit passes, so without this the code would be
	 *  briefly unreachable from the very page that just accepted it. */
	let justAccepted = $state<Record<string, string>>({});

	let drawer = $state<'closed' | 'reference' | 'community'>('closed');
	// Saved per player. Flipped locally first so the editor responds at once, then persisted.
	let completion = $derived(data.codeCompletion);
	async function toggleCompletion() {
		completion = !completion;
		await fetch('/api/settings/completion', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ on: completion })
		}).catch(() => {});
	}
	let reference = $state('');
	let community = $state<{ total: number; articles: any[] } | null>(null);
	let article = $state<{ title: string; content: string } | null>(null);
	let drawerBusy = $state(false);

	const langMeta = $derived(data.langs.find((l) => l.slug === lang) ?? data.langs[0]);
	const monacoLang = $derived(langMeta.monaco);
	const hasReference = $derived(Boolean(data.cur?.solutions?.[langMeta.dir]));
	const lastAcceptedFor = $derived(justAccepted[lang] ?? data.lastAccepted[lang] ?? '');

	function initialCode(l: string) {
		return data.drafts[l] ?? data.snippets[l] ?? '';
	}

	onMount(() => {
		try {
			const stored = localStorage.getItem(STORAGE_LANG);
			if (!data.lastLang && stored && data.snippets[stored]) lang = stored;
		} catch {}
		code = initialCode(lang);

		// Downloading and starting Pyodide takes a few seconds, so it begins while the problem is
		// being read rather than on the first press of Run.
		void warmUp();
		void loadSuite();
	});

	/** Large inputs a too-slow solution cannot finish in time (scripts/tle/), judged on Submit only.
	 *  A static file rather than part of the suite, because they are big; fetched once, on first
	 *  Submit. Most problems have one; a 404 means this one does not. */
	let tleCases: TestCase[] | null = null;
	async function loadTleCases(): Promise<TestCase[]> {
		if (tleCases) return tleCases;
		try {
			const r = await fetch(`/tle/${data.slug}.json`);
			tleCases = r.ok ? ((await r.json()) as { cases: TestCase[] }).cases : [];
		} catch {
			// Judging without them would pass a too-slow solution; better to say so than to guess.
			throw new Error('Could not load the large test cases for Submit; check your connection and try again.');
		}
		return tleCases;
	}

	/** A failing TLE case holds 10^5 values; the table shows the start and how much was cut. */
	function clip(v: unknown): string {
		const s = JSON.stringify(v) ?? String(v);
		return s.length > 300 ? `${s.slice(0, 300)}… (${s.length.toLocaleString()} characters)` : s;
	}

	async function loadSuite() {
		try {
			const r = await fetch(`/api/solve/${data.slug}/tests`);
			const j = (await r.json()) as any;
			if (r.ok) suite = j as Suite;
			else suiteError = j.message ?? 'No test suite for this problem yet.';
		} catch {
			suiteError = 'Could not load the test suite for this problem.';
		}
	}

	function switchLang(next: string) {
		flushSave();
		lang = next;
		code = initialCode(next);
		try { localStorage.setItem(STORAGE_LANG, next); } catch {}
	}

	function resetToStarter() {
		if (confirm('Replace the editor contents with the starter code?')) code = data.snippets[lang] ?? '';
	}

	/** Loads the previous accepted solution, recording the look first so that a problem which is
	 *  DUE is penalised exactly as opening the NeetCode reference would be. Otherwise loading the
	 *  old answer and submitting it would clear a refresh for free. When the problem is not due --
	 *  including straight after a clean refresh, to compare the new answer with the old -- the look
	 *  is free, the server records nothing, and there is nothing to confirm. */
	async function loadLastAccepted() {
		if (!lastAcceptedFor) return;
		if (data.due && !confirm('This problem is due for a refresh. Loading your last accepted solution now marks the refresh as assisted: the award is halved and the timer resets to 3 days. Continue?')) return;
		await fetch(`/api/solve/${data.slug}/solutions?kind=own`).catch(() => {});
		code = lastAcceptedFor;
	}

	async function saveDraft() {
		if (code === lastSaved) return;
		lastSaved = code;
		await fetch(`/api/solve/${data.slug}/draft`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lang, code })
		}).catch(() => {});
	}
	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(saveDraft, 1500);
	}
	function flushSave() {
		clearTimeout(saveTimer);
		void saveDraft();
	}
	$effect(() => {
		code;
		scheduleSave();
	});

	/** Run: your test cases, judged against the reference, in the panel below the editor. */
	function runTests() {
		if (busy || customBusy || !canJudge) return;
		flushSave();
		void tests?.run();
	}

	/** Submit: the whole suite, large inputs included. The only judgement that counts. */
	async function submit() {
		const kind = 'submit';
		if (busy || customBusy || !suite || !canJudge) return;
		busy = kind;
		message = '';
		award = null;
		result = null;
		flushSave();
		try {
			const cases = [...suite.cases, ...(await loadTleCases())];
			const outcome = await judge(code, suite, cases);
			result = {
				status_msg: outcome.verdict,
				total_correct: outcome.passed,
				total_testcases: outcome.total,
				cases: outcome.results,
				stdout: outcome.stdout,
				elapsedMs: outcome.elapsedMs
			};

			const r = await fetch(`/api/solve/${data.slug}/verdict`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					lang,
					code,
					kind,
					verdict: outcome.verdict,
					passed: outcome.passed,
					total: outcome.total,
					elapsedMs: outcome.elapsedMs
				})
			});
			const j = (await r.json()) as any;
			if (r.ok && j.award) award = j.award;

			// A solved problem comes back as a refresh, and leaving the accepted code in the editor
			// meant the repetition could be passed by pressing Submit on an answer that was never
			// re-derived. The code is kept — "Last accepted" restores it — but it is no longer what
			// the window opens with. Saving immediately makes the reset survive a reload.
			// Gated on the server's verdict, not the worker's: the server additionally requires a
			// non-empty suite, so a problem with no cases reports Accepted here while storing no
			// accepted attempt. Clearing on that would discard the only copy of the code.
			if (r.ok && j.accepted) {
				justAccepted[lang] = code;
				code = data.snippets[lang] ?? '';
				flushSave();
				// The refresh is done, so the problem is no longer due. Reload the page's data, or the
				// "due for a refresh" warnings stay up until a reload even though looking is now free.
				void invalidateAll();
			}
		} catch (e) {
			// A stopped run has no verdict, so nothing was posted and nothing is recorded.
			if (e instanceof Error && e.message === STOPPED) message = 'Submission stopped.';
			else message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = null;
		}
	}

	async function openDrawer(tab: 'reference' | 'community') {
		drawer = tab;
		drawerBusy = true;
		try {
			const q = new URLSearchParams({ kind: tab, lang });
			const r = await fetch(`/api/solve/${data.slug}/solutions?${q}`);
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			if (tab === 'reference') {
				if (hasReference) {
					const file = await fetch(`/solutions/${langMeta.dir}/${data.cur!.code}.${langMeta.ext}`);
					reference = file.ok ? await file.text() : 'No reference solution for this language.';
				} else reference = 'No NeetCode reference solution for this language.';
			} else {
				community = j.data;
				article = null;
			}
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			drawerBusy = false;
		}
	}

	async function openArticle(topicId: number) {
		drawerBusy = true;
		try {
			const q = new URLSearchParams({ kind: 'article', topicId: String(topicId) });
			const r = await fetch(`/api/solve/${data.slug}/solutions?${q}`);
			const j = (await r.json()) as any;
			article = j.data;
		} finally {
			drawerBusy = false;
		}
	}

	const passed = $derived(result?.status_msg === 'Accepted');
	const failures = $derived((result?.cases ?? []).filter((c: any) => !c.ok));
	const shortDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
	const seconds = $derived(((suite?.timeLimitMs ?? TIME_LIMIT_MS) / 1000).toLocaleString());
	// The in-browser judge is Pyodide, so only Python can be executed (docs/07-pyodide-judge.md).
	const canJudge = $derived(lang === 'python3' && suite !== null);
	/** The Python reference, the oracle for custom testcases. Fetched from the public static path by
	 *  the panel, never through /api/solve/.../solutions, so using it records no look. */
	const refUrl = $derived.by(() => {
		const py = data.langs.find((l) => l.slug === 'python3');
		return py && data.cur?.solutions?.[py.dir] ? `/solutions/${py.dir}/${data.cur.code}.${py.ext}` : null;
	});
</script>

<svelte:head><title>{data.title} · Commit City</title></svelte:head>

<div class="solve-page">
	<header class="head">
		<h1>{data.title}</h1>
		<p class="status">
			<span class="difficulty {data.difficulty}">{data.difficulty}.</span>
			{#if data.due}<span class="due">Due for a refresh.</span>
			{:else if data.solved}Solved {times(data.solveCount)}{#if data.dueAt}, next refresh {shortDate(data.dueAt)}{/if}.
			{:else}Not solved yet.{/if}
			{#if data.cur?.pattern}<span class="pattern">{data.cur.pattern}.</span>{/if}
			<a href="https://leetcode.com/problems/{data.slug}/" target="_blank" rel="noreferrer">Open on LeetCode</a>
		</p>
		<TagToggle show={data.showTags} />
	</header>

	{#if suiteError}
		<div class="banner">{suiteError} You can still edit and save drafts here.</div>
	{:else if lang !== 'python3'}
		<div class="banner">The in-browser judge runs Python only. Switch to Python 3 to run and submit; other languages are editable but cannot be judged yet.</div>
	{/if}

	<div class="solve">
		<section class="statement prose">
			{#if data.ownDescription}
				<p class="own">LeetCode Premium withholds this statement, so this one is the app's own, written from the published signature and examples.</p>
			{/if}
			{@html data.contentHtml ?? '<p>No description available.</p>'}
			{#if data.notes.length}
				<!-- LeetCode has dropped the definitions its statements used to carry, so a problem can use
				     its central term without ever defining it. The statement stays verbatim; this says what
				     the term means. -->
				<aside class="notes">
					<strong>Clarification</strong>
					<ul>{#each data.notes as n (n)}<li>{n}</li>{/each}</ul>
				</aside>
			{/if}
			{#if data.tags.length}<p class="tags">Topics: {data.tags.join(', ')}</p>{/if}
		</section>

		<section class="work">
			<div class="toolbar">
				<select value={lang} onchange={(e) => switchLang((e.target as HTMLSelectElement).value)} aria-label="Language">
					{#each data.langs as l (l.slug)}
						<option value={l.slug} disabled={!data.snippets[l.slug]}>{l.name}{l.bonus ? ' ×1.5' : ''}</option>
					{/each}
				</select>
				<button class="quiet" onclick={resetToStarter}>Starter code</button>
				{#if lastAcceptedFor}<button class="quiet" onclick={loadLastAccepted}>Last accepted</button>{/if}
				<button class="quiet" onclick={toggleCompletion} aria-pressed={completion} title="Editor suggestions, parameter hints and snippets; saved for your account">
					Autocomplete {completion ? 'on' : 'off'}
				</button>
				<span class="spacer"></span>
				{#if busy !== null || customBusy}
					<button class="stop" onclick={stop} title="Stop the code that is running now">Stop</button>
				{/if}
				<button onclick={runTests} disabled={busy !== null || customBusy || !canJudge} title="Run your test cases (Ctrl+Enter)">{customBusy ? 'Running…' : 'Run'}</button>
				<button class="primary" onclick={submit} disabled={busy !== null || customBusy || !canJudge} title="Judge every case (Ctrl+Shift+Enter)">{busy === 'submit' ? 'Judging…' : 'Submit'}</button>
			</div>

			<Editor bind:value={code} language={monacoLang} {completion} onrun={runTests} onsubmit={submit} />

			{#if suite}
				<p class="limits">
					Run checks your test cases against the reference solution. Submit judges all {suite.cases.length}{suite.cases.length > suite.exampleCount ? '+' : ''}
					cases{suite.cases.length > suite.exampleCount ? ', large inputs included,' : ''} with a {seconds}&nbsp;s limit{suite.compare !== 'exact' ? `, in any order (${suite.compare})` : ''}.
				</p>
			{/if}

			{#if message}<div class="banner">{message}</div>{/if}

			{#if result}
				<div class="verdict" class:pass={passed}>
					<div class="verdict-head">
						<p class="call">{passed ? 'Accepted.' : `${result.status_msg ?? result.state}.`}</p>
						<button class="quiet" onclick={() => (result = null)} title="Hide this output">Clear</button>
					</div>
					{#if result.total_testcases != null}
						<p class="note">{result.total_correct ?? 0} of {result.total_testcases} cases passed in {result.elapsedMs} ms.</p>
					{/if}
					{#if award}
						<p class="reward">
							{#if award.counted}
								A {award.kind} solve: +{award.award.research} research{#each Object.entries(award.award.resources) as [k, v] (k)}, +{v} {k}{/each}.
							{:else if award.duplicate}
								Already rewarded.
							{:else}
								Accepted again today; this problem already earned its credit for {award.date}.
							{/if}
						</p>
					{/if}

					{#if result.cases?.[0]?.fatal}
						<pre>{result.cases[0].error}</pre>
					{:else if failures.length}
						<!-- A long suite: only the first few failures are worth listing. -->
						<table>
							<thead><tr><th>Case</th><th>Input</th><th>Expected</th><th>Got</th></tr></thead>
							<tbody>
								{#each failures.slice(0, 5) as c, i (i)}
									<tr>
										<td>{result.cases.indexOf(c) + 1}</td>
										<td><code>{clip(c.args)}</code></td>
										<td><code>{clip(c.expected)}</code></td>
										<td class="got"><code>{c.error ? c.error : clip(c.actual)}</code></td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if failures.length > 5}<p class="note">And {failures.length - 5} more failing {failures.length - 5 === 1 ? 'case' : 'cases'}.</p>{/if}
					{:else if result.status_msg === 'Time Limit Exceeded'}
						<p>
							Your code did not finish within this problem's {seconds} s limit, so it was stopped. The limit is about six times
							what an efficient solution needs, so a correct answer that times out usually needs a better algorithm, not
							micro-tuning.
						</p>
					{/if}

					{#if result.stdout}
						<p class="note">Printed:</p>
						<pre>{result.stdout}</pre>
					{/if}
				</div>
			{/if}

			{#if canJudge && suite}
				<CustomTests bind:this={tests} {suite} slug={data.slug} {code} {refUrl} blocked={busy !== null} onrunning={(r) => (customBusy = r)} />
			{/if}

			<section class="solutions">
				<h2>Solutions</h2>
				{#if data.due}
					<p class="due">This problem is due for a refresh: opening a solution or loading your last accepted one marks the refresh as assisted, so it comes back in 3 days.</p>
				{:else}
					<p class="note">Free to open.</p>
				{/if}
				<div class="actions">
					<button onclick={() => openDrawer('reference')} disabled={drawerBusy}>NeetCode reference</button>
					<button onclick={() => openDrawer('community')} disabled={drawerBusy}>Community, {langMeta.name}</button>
					{#if drawer !== 'closed'}<button class="quiet" onclick={() => (drawer = 'closed')}>Close</button>{/if}
				</div>
				{#if drawer === 'reference'}
					<pre>{reference || (drawerBusy ? 'Loading…' : '')}</pre>
				{:else if drawer === 'community'}
					{#if article}
						<button class="quiet" onclick={() => (article = null)}>Back to the list</button>
						<h3>{article.title}</h3>
						<pre class="md">{article.content}</pre>
					{:else if community}
						<p class="note">{community.total} solutions tagged {langMeta.name}, most viewed first.</p>
						<ul class="articles">
							{#each community.articles as a (a.uuid)}
								<li><button class="link" onclick={() => a.topicId && openArticle(a.topicId)}>{a.title}</button> <span class="note">{a.hitCount.toLocaleString()} views</span></li>
							{/each}
						</ul>
					{:else if drawerBusy}<p class="note">Loading…</p>{/if}
				{/if}
			</section>
		</section>
	</div>
</div>

<style>
	.solve-page { line-height: 1.5; }
	.head { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 1.25rem; row-gap: 0.25rem; margin: 0.5rem 0 1rem; }
	h1 { font-family: var(--display); font-weight: 800; font-size: clamp(2rem, 3.6vw, 2.9rem); line-height: 1; margin: 0; }
	.status { margin: 0; color: var(--steel); flex: 1 1 20rem; }
	.status a { color: var(--steel); text-decoration: underline; text-underline-offset: 3px; }
	.status a:hover { color: var(--brass); }
	.difficulty { font-weight: 700; }
	.difficulty.Easy { color: var(--easy); }
	.difficulty.Medium { color: var(--medium); }
	.difficulty.Hard { color: var(--hard); }
	.due { color: var(--rust); font-weight: 700; }

	.solve { display: grid; grid-template-columns: minmax(300px, 5fr) minmax(420px, 7fr); gap: 2rem; align-items: start; }
	@media (max-width: 1000px) { .solve { grid-template-columns: 1fr; } }

	/* ---------- the statement ---------- */
	.statement {
		position: sticky;
		top: 1rem;
		max-height: calc(100vh - 2rem);
		overflow: auto;
		padding-right: 1.25rem;
		border-right: 1px solid var(--border);
		font-size: 1rem;
		line-height: 1.6;
	}
	@media (max-width: 1000px) { .statement { position: static; max-height: none; border-right: 0; padding-right: 0; } }
	.statement :global(p) { margin: 0 0 0.8rem; }
	.statement :global(pre) { background: var(--panel); border-left: 3px solid var(--border); border-radius: 0 4px 4px 0; }
	.statement :global(code) { font-size: 0.92em; }
	.own { color: var(--steel); font-size: 0.9rem; border-left: 3px solid var(--brass); padding-left: 0.75rem; }
	.notes { border-left: 3px solid var(--brass); padding: 0.25rem 0 0.25rem 0.9rem; margin: 1.25rem 0; }
	.notes ul { margin: 0.3rem 0 0; padding-left: 1.1rem; }
	.tags { color: var(--steel); font-size: 0.9rem; }

	/* ---------- the workbench ---------- */
	.work { display: grid; gap: 1rem; min-width: 0; }
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
	.toolbar .spacer { flex: 1; }
	.quiet { background: none; border-color: transparent; color: var(--steel); }
	.quiet:hover:not(:disabled) { color: var(--text); border-color: var(--border); }
	button.stop { border-color: var(--rust); color: var(--rust); }
	.limits { margin: -0.25rem 0 0; color: var(--steel); font-size: 0.9rem; }

	.verdict { padding-left: 1.1rem; border-left: 4px solid var(--rust); display: grid; gap: 0.35rem; }
	.verdict.pass { border-left-color: var(--brass); }
	.verdict-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
	.call { margin: 0; font-family: var(--display); font-weight: 800; font-size: 2rem; line-height: 1.1; }
	.verdict.pass .call { color: var(--brass); }
	.note { margin: 0; color: var(--steel); font-size: 0.92rem; }
	.reward { margin: 0; color: var(--brass); font-weight: 700; }
	.verdict table { table-layout: fixed; font-size: 0.9rem; }
	.verdict td code { overflow-wrap: anywhere; }
	.verdict td.got { color: var(--rust); }
	.verdict pre { margin: 0; }

	.solutions { border-top: 1px solid var(--border); padding-top: 1rem; display: grid; gap: 0.5rem; }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.6rem; line-height: 1.1; margin: 0; }
	h3 { margin: 0.5rem 0; }
	.solutions .due { font-weight: 400; margin: 0; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	pre.md { white-space: pre-wrap; max-height: 60vh; }
	.articles { padding-left: 1.2rem; margin: 0; }
	button.link { border: none; background: none; color: var(--brass); padding: 0; text-align: left; }
	button.link:hover { text-decoration: underline; }
</style>
