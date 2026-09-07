<script lang="ts">
	import { onMount } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import { judge, warmUp, exampleCases, type Suite } from '$lib/pyodide/client';
	let { data } = $props();

	const STORAGE_LANG = 'lc-game:lang';
	// svelte-ignore state_referenced_locally
	let lang = $state(data.lastLang ?? 'python3');
	let code = $state('');
	let busy = $state<'run' | 'submit' | null>(null);
	let suite = $state<Suite | null>(null);
	let suiteError = $state('');
	let result = $state<Record<string, any> | null>(null);
	let resultKind = $state<'run' | 'submit' | null>(null);
	let message = $state('');
	let award = $state<Record<string, any> | null>(null);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let lastSaved = '';

	let drawer = $state<'closed' | 'reference' | 'community' | 'editorial'>('closed');
	let reference = $state('');
	let community = $state<{ total: number; articles: any[] } | null>(null);
	let article = $state<{ title: string; content: string } | null>(null);
	let editorial = $state<{ content: string | null; paidOnly: boolean } | null>(null);
	let drawerBusy = $state(false);

	const langMeta = $derived(data.langs.find((l) => l.slug === lang) ?? data.langs[0]);
	const monacoLang = $derived(langMeta.monaco);
	const hasReference = $derived(Boolean(data.cur?.solutions?.[langMeta.dir]));

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

	function loadLastAccepted() {
		const prev = data.lastAccepted[lang];
		if (prev) code = prev;
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

	async function execute(kind: 'run' | 'submit') {
		if (busy || !suite || !canJudge) return;
		busy = kind;
		message = '';
		award = null;
		result = null;
		flushSave();
		try {
			// Run shows only the cases derived from LeetCode's published examples; Submit is judged
			// against the whole suite.
			const cases = kind === 'run' ? exampleCases(suite) : suite.cases;
			const outcome = await judge(code, suite, cases);
			result = {
				status_msg: outcome.verdict,
				total_correct: outcome.passed,
				total_testcases: outcome.total,
				cases: outcome.results,
				stdout: outcome.stdout,
				elapsedMs: outcome.elapsedMs
			};
			resultKind = kind;

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
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = null;
		}
	}

	async function openDrawer(tab: 'reference' | 'community' | 'editorial') {
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
			} else if (tab === 'community') {
				community = j.data;
				article = null;
			} else {
				editorial = j.data;
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
	const kindLabel = $derived(resultKind === 'submit' ? 'Submission' : 'Run');
	// The in-browser judge is Pyodide, so only Python can be executed (docs/07-pyodide-judge.md).
	const canJudge = $derived(lang === 'python3' && suite !== null);
</script>

<svelte:head><title>{data.title} · LC Game</title></svelte:head>

<div class="head row">
	<h1>{data.title}</h1>
	<span class="pill {data.difficulty}">{data.difficulty}</span>
	{#if data.cur}<span class="pill">{data.cur.pattern}</span>{/if}
	{#if data.solved}<span class="pill" style="color: var(--good)">solved ×{data.solveCount}</span>{/if}
	{#if data.dueAt}<span class="muted">due {new Date(data.dueAt).toLocaleDateString()}</span>{/if}
	<a class="muted" href="https://leetcode.com/problems/{data.slug}/" target="_blank" rel="noreferrer">on LeetCode ↗</a>
</div>

{#if suiteError}
	<div class="banner">{suiteError} You can still edit and save drafts here.</div>
{:else if lang !== 'python3'}
	<div class="banner">The in-browser judge runs Python only. Switch to Python 3 to run and submit; other languages are editable but cannot be judged yet.</div>
{/if}
{#if !data.lc.connected || !data.lc.ok}
	<div class="banner">LeetCode is not connected ({data.lc.connected ? 'the cookie looks expired' : 'no cookie configured'}), so community solutions, editorials and profile sync are unavailable. <a href="/admin">Fix in Admin</a>. Solving still works.</div>
{/if}

<div class="solve">
	<section class="card prose desc">
		{@html data.contentHtml ?? '<p>No description available.</p>'}
		<p class="row">{#each data.tags as t (t)}<span class="pill">{t}</span>{/each}</p>
	</section>

	<section class="work">
		<div class="row toolbar">
			<select value={lang} onchange={(e) => switchLang((e.target as HTMLSelectElement).value)}>
				{#each data.langs as l (l.slug)}
					<option value={l.slug} disabled={!data.snippets[l.slug]}>{l.name}{l.bonus ? ' ×1.5' : ''}</option>
				{/each}
			</select>
			<button onclick={resetToStarter}>Starter</button>
			{#if data.lastAccepted[lang]}<button onclick={loadLastAccepted}>Last accepted</button>{/if}
			<span class="spacer"></span>
			<button onclick={() => execute('run')} disabled={busy !== null || !canJudge} title="Ctrl+Enter">{busy === 'run' ? 'Running…' : 'Run'}</button>
			<button class="primary" onclick={() => execute('submit')} disabled={busy !== null || !canJudge} title="Ctrl+Shift+Enter">{busy === 'submit' ? 'Judging…' : 'Submit'}</button>
		</div>

		<Editor bind:value={code} language={monacoLang} onrun={() => execute('run')} onsubmit={() => execute('submit')} />

		{#if suite}
			<p class="muted">
				{suite.exampleCount} example case{suite.exampleCount === 1 ? '' : 's'}
				{#if suite.cases.length > suite.exampleCount}· {suite.cases.length} in total on Submit{/if}
				{#if suite.compare !== 'exact'}· order-insensitive ({suite.compare}){/if}
			</p>
		{/if}

		{#if message}<div class="banner">{message}</div>{/if}

		{#if award}
			<div class="banner ok">
				{#if award.counted}
					🎉 {award.kind} solve: +{award.award.research} research, {Object.entries(award.award.resources).map(([k, v]) => `${k} +${v}`).join(', ')}
				{:else if award.duplicate}
					Already rewarded.
				{:else}
					Accepted again today; this problem already earned its credit for {award.date}.
				{/if}
			</div>
		{/if}

		{#if result}
			<div class="card result" class:pass={passed} class:fail={!passed}>
				<h3>{kindLabel}: {result.status_msg ?? result.state}</h3>
				{#if result.total_testcases != null}<p>{result.total_correct ?? 0} / {result.total_testcases} test cases passed <span class="muted">· {result.elapsedMs} ms</span></p>{/if}

				{#if result.cases?.[0]?.fatal}
					<pre>{result.cases[0].error}</pre>
				{:else if result.cases?.length}
					<!-- Submit can run a long suite, so only the failures are worth listing once past the examples. -->
					{@const shown = resultKind === 'run' ? result.cases : result.cases.filter((c: any) => !c.ok).slice(0, 5)}
					{#if shown.length}
						<table>
							<thead><tr><th>#</th><th>Input</th><th>Expected</th><th>Got</th></tr></thead>
							<tbody>
								{#each shown as c, i (i)}
									<tr class:bad={!c.ok}>
										<td>{result.cases.indexOf(c) + 1}</td>
										<td><code>{JSON.stringify(c.args)}</code></td>
										<td><code>{JSON.stringify(c.expected)}</code></td>
										<td><code>{c.error ? c.error : JSON.stringify(c.actual)}</code></td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
					{#if resultKind === 'submit' && !passed && result.cases.filter((c: any) => !c.ok).length > 5}
						<p class="muted">and {result.cases.filter((c: any) => !c.ok).length - 5} more failing case(s)</p>
					{/if}
				{:else if result.status_msg === 'Time Limit Exceeded'}
					<p>Your code did not finish within the time limit, so the run was stopped.</p>
				{/if}

				{#if result.stdout}
					<p>stdout:</p><pre>{result.stdout}</pre>
				{/if}
			</div>
		{/if}

		<div class="card">
			<div class="row">
				<strong>Solutions</strong>
				{#if !data.solved && !data.viewedToday}<span class="muted">Free to open. On a refresh it marks the solve as assisted, so it comes back sooner.</span>{/if}
				<button onclick={() => openDrawer('reference')} disabled={drawerBusy}>NeetCode reference</button>
				<button onclick={() => openDrawer('community')} disabled={drawerBusy}>Community ({langMeta.name})</button>
				<button onclick={() => openDrawer('editorial')} disabled={drawerBusy}>Editorial</button>
				{#if drawer !== 'closed'}<button onclick={() => (drawer = 'closed')}>Close</button>{/if}
			</div>
			{#if drawer === 'reference'}
				<pre>{reference || (drawerBusy ? 'Loading…' : '')}</pre>
			{:else if drawer === 'community'}
				{#if article}
					<button onclick={() => (article = null)}>← back to list</button>
					<h3>{article.title}</h3>
					<pre class="md">{article.content}</pre>
				{:else if community}
					<p class="muted">{community.total} solutions tagged {langMeta.name}, hottest first.</p>
					<ul>
						{#each community.articles as a (a.uuid)}
							<li><button class="link" onclick={() => a.topicId && openArticle(a.topicId)}>{a.title}</button> <span class="muted">{a.hitCount} views</span></li>
						{/each}
					</ul>
				{:else if drawerBusy}<p>Loading…</p>{/if}
			{:else if drawer === 'editorial'}
				{#if editorial?.content}
					<pre class="md">{editorial.content}</pre>
				{:else if editorial}
					<p>The editorial is {editorial.paidOnly ? 'Premium-only' : 'not available in-app'}. <a href="https://leetcode.com/problems/{data.slug}/editorial/" target="_blank" rel="noreferrer">Open on LeetCode ↗</a></p>
				{:else if drawerBusy}<p>Loading…</p>{/if}
			{/if}
		</div>
	</section>
</div>

<style>
	.head h1 { font-size: 1.4rem; margin: 0; }
	.solve { display: grid; grid-template-columns: minmax(300px, 2fr) minmax(420px, 3fr); gap: 1rem; align-items: start; }
	@media (max-width: 1000px) { .solve { grid-template-columns: 1fr; } }
	.desc { max-height: 80vh; overflow: auto; }
	.work { display: grid; gap: 0.8rem; }
	.toolbar .spacer { flex: 1; }
	.result table { width: 100%; table-layout: fixed; }
	.result td code { overflow-wrap: anywhere; }
	.result.pass { border-color: var(--good); }
	.result.fail { border-color: var(--bad); }
	tr.bad td { color: var(--bad); }
	pre.md { white-space: pre-wrap; max-height: 60vh; }
	button.link { border: none; background: none; color: var(--accent-2); padding: 0; }
	ul { padding-left: 1.2rem; }
</style>
