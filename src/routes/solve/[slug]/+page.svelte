<script lang="ts">
	import { onMount } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	let { data } = $props();

	const STORAGE_LANG = 'lc-game:lang';
	// svelte-ignore state_referenced_locally
	let lang = $state(data.lastLang ?? 'python3');
	let code = $state('');
	// svelte-ignore state_referenced_locally
	let input = $state(data.exampleTestcases);
	let busy = $state<'run' | 'submit' | null>(null);
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
	});

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

	async function poll(id: string): Promise<Record<string, any>> {
		for (let i = 0; i < 60; i++) {
			const r = await fetch(`/api/check/${encodeURIComponent(id)}`);
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? `check failed (${r.status})`);
			if (j.state === 'SUCCESS') return j;
			await new Promise((res) => setTimeout(res, 1000));
		}
		throw new Error('timed out waiting for the judge');
	}

	async function execute(kind: 'run' | 'submit') {
		if (busy) return;
		busy = kind;
		message = '';
		award = null;
		result = null;
		flushSave();
		try {
			const r = await fetch(`/api/solve/${data.slug}/${kind}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lang, code, input })
			});
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? `request failed (${r.status})`);
			const out = await poll(j.id);
			result = out.result;
			resultKind = kind;
			if (out.award) award = out.award;
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

	const passed = $derived(result?.status_msg === 'Accepted' || (resultKind === 'run' && result?.run_success && result?.correct_answer !== false));
	const kindLabel = $derived(resultKind === 'submit' ? 'Submission' : 'Run');
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

{#if !data.lc.connected || !data.lc.ok}
	<div class="banner">LeetCode judge unavailable: {data.lc.connected ? 'cookie looks expired' : 'no cookie configured'}. <a href="/admin">Fix in Admin</a>. You can still edit and save drafts.</div>
{/if}
{#if data.isPaidOnly}
	<div class="banner">This is a LeetCode Premium problem; submitting needs a Premium account.</div>
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
			<button onclick={() => execute('run')} disabled={busy !== null || !data.lc.ok} title="Ctrl+Enter">{busy === 'run' ? 'Running…' : 'Run'}</button>
			<button class="primary" onclick={() => execute('submit')} disabled={busy !== null || !data.lc.ok} title="Ctrl+Shift+Enter">{busy === 'submit' ? 'Judging…' : 'Submit'}</button>
		</div>

		<Editor bind:value={code} language={monacoLang} onrun={() => execute('run')} onsubmit={() => execute('submit')} />

		<details class="card" open>
			<summary>Test input (one argument per line)</summary>
			<textarea bind:value={input} rows="4"></textarea>
		</details>

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
				{#if result.total_testcases != null}<p>{result.total_correct ?? 0} / {result.total_testcases} test cases passed</p>{/if}
				{#if result.status_runtime}<p class="muted">{result.status_runtime} · {result.status_memory}{result.runtime_percentile != null ? ` · faster than ${Math.round(result.runtime_percentile)}%` : ''}</p>{/if}
				{#if result.full_compile_error || result.compile_error}<pre>{result.full_compile_error ?? result.compile_error}</pre>{/if}
				{#if result.full_runtime_error || result.runtime_error}<pre>{result.full_runtime_error ?? result.runtime_error}</pre>{/if}
				{#if resultKind === 'run' && result.code_answer}
					<table>
						<thead><tr><th>#</th><th>Output</th><th>Expected</th></tr></thead>
						<tbody>
							{#each result.code_answer as out, i (i)}
								<tr class:bad={result.expected_code_answer?.[i] !== undefined && result.expected_code_answer[i] !== out}>
									<td>{i + 1}</td><td><code>{out}</code></td><td><code>{result.expected_code_answer?.[i] ?? ''}</code></td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
				{#if resultKind === 'submit' && result.last_testcase && result.status_msg !== 'Accepted'}
					<p>Failing input:</p><pre>{result.last_testcase}</pre>
					<p>Expected <code>{result.expected_output}</code>, got <code>{Array.isArray(result.code_output) ? result.code_output.join('\n') : result.code_output}</code></p>
				{/if}
				{#if result.std_output_list?.some((s: string) => s)}
					<p>stdout:</p><pre>{result.std_output_list.filter((s: string) => s).join('\n---\n')}</pre>
				{/if}
			</div>
		{/if}

		<div class="card">
			<div class="row">
				<strong>Solutions</strong>
				{#if !data.solved && !data.viewedToday}<span class="muted">Opening before you solve costs 2 essence and marks a refresh as assisted.</span>{/if}
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
	textarea { width: 100%; }
	.result.pass { border-color: var(--good); }
	.result.fail { border-color: var(--bad); }
	tr.bad td { color: var(--bad); }
	pre.md { white-space: pre-wrap; max-height: 60vh; }
	button.link { border: none; background: none; color: var(--accent-2); padding: 0; }
	ul { padding-left: 1.2rem; }
</style>
