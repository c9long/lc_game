<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();

	let idx = $state(0);
	let answer = $state('');
	let busy = $state(false);
	let feedback = $state<null | { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; explain: string | null; ingots: number; setDone: boolean }>(null);
	let message = $state('');

	const remaining = $derived(data.drills.filter((d) => d.answered === undefined));
	const current = $derived(remaining[0] ?? null);
	const answeredCount = $derived(data.drills.length - remaining.length);
	const correctCount = $derived(data.drills.filter((d) => d.answered === true).length);

	async function submit() {
		if (!current || busy || !answer.trim()) return;
		busy = true;
		message = '';
		try {
			const r = await fetch('/api/drills/answer', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ drillId: current.id, answer })
			});
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			feedback = j;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function next() {
		feedback = null;
		answer = '';
		await invalidateAll();
	}

	/** Enter advances whichever card is showing feedback, wherever focus happens to be.
	 *  Submitting replaces the input with the feedback banner, so focus lands on nothing and the
	 *  element-level handlers never saw the keypress. */
	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		if (feedback) {
			e.preventDefault();
			void next();
		} else if (practiceFeedback) {
			e.preventDefault();
			void nextPractice();
		}
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (feedback) next();
			else submit();
		}
	}

	// --- unlimited practice, unlocked once the day's set is done ---
	// Nothing here is scored or recorded: the counters are per-session only, and `seen` just keeps
	// the server from handing back a drill twice in a row until the bank wraps.
	type PracticeDrill = { id: string; kind: string; module: string; context: string | null; code: string; hint: string | null };

	let practice = $state<PracticeDrill | null>(null);
	let practiceAnswer = $state('');
	let practiceBusy = $state(false);
	let practiceFeedback = $state<null | { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; explain: string | null }>(null);
	let practiceDone = $state(0);
	let practiceCorrect = $state(0);
	let seen = $state<string[]>([]);

	async function loadPractice() {
		practiceBusy = true;
		message = '';
		try {
			const q = seen.length ? `?exclude=${encodeURIComponent(seen.join(','))}` : '';
			const r = await fetch(`/api/drills/practice${q}`);
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			practice = j.drill;
			seen = [...seen, j.drill.id];
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
			practice = null;
		} finally {
			practiceBusy = false;
		}
	}

	async function startPractice() {
		practiceFeedback = null;
		practiceAnswer = '';
		await loadPractice();
	}

	async function submitPractice() {
		if (!practice || practiceBusy || !practiceAnswer.trim()) return;
		practiceBusy = true;
		message = '';
		try {
			const r = await fetch('/api/drills/practice', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ drillId: practice.id, answer: practiceAnswer })
			});
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			practiceFeedback = j;
			practiceDone += 1;
			if (j.correct) practiceCorrect += 1;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			practiceBusy = false;
		}
	}

	async function nextPractice() {
		practiceFeedback = null;
		practiceAnswer = '';
		await loadPractice();
	}

	function stopPractice() {
		practice = null;
		practiceFeedback = null;
		practiceAnswer = '';
	}

	function onPracticeKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (practiceFeedback) nextPractice();
			else submitPractice();
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<svelte:head><title>Drills · LC Game</title></svelte:head>

<h1>Syntax drills <span class="muted">{data.today}{data.lang ? ` · ${data.lang}` : ''}</span></h1>
<p class="muted">Recall exercises mined from the official documentation and verified by running them. Each correct answer forges 1 Ingot; a perfect set of {data.drills.length} adds 2. Ingots are the only way to upgrade buildings.</p>

{#if message}<div class="banner">{message}</div>{/if}

<div class="grid two">
	<section class="card">
		{#if data.drills.length === 0}
			<p class="muted">No drill bank is available. Run <code>python3 scripts/mine-python-docs.py</code> and redeploy.</p>
		{:else if !current}
			<h2>Set complete: {correctCount}/{data.drills.length}</h2>
			<p>Ingots forged today: <strong>{data.setIngots}</strong>. Come back tomorrow for a new set; missed ones return sooner.</p>
			{#if data.practiceUnlocked && data.practicePool > 0}
				<hr />
				<h3>Practice <span class="muted">unlimited · unscored</span></h3>
				{#if !practice}
					<p class="muted">
						{data.practicePool} more drill{data.practicePool === 1 ? '' : 's'} in the bank. Practice forges no
						Ingots and does not change your schedule, so tomorrow's set is unaffected.
					</p>
					<button class="primary" onclick={startPractice} disabled={practiceBusy}>
						{practiceBusy ? 'Loading…' : 'Practice'}
					</button>
				{:else}
					<div class="row">
						<span class="pill">practice</span>
						<span class="pill">{practice.module}</span>
						<span class="pill">{practice.kind === 'cloze' ? 'fill the blank' : 'what does it print?'}</span>
						<span class="muted">{practiceCorrect}/{practiceDone} this session</span>
					</div>
					{#if practice.context}<pre class="ctx">{practice.context}</pre>{/if}
					<pre class="code">{practice.code}</pre>
					{#if practice.kind === 'cloze'}
						{#if practice.hint}<p class="muted">Produces: <code>{practice.hint}</code></p>{/if}
						<p>What replaces <code>___</code>?</p>
					{:else}
						<p>What is printed?</p>
					{/if}
					{#if !practiceFeedback}
						<div class="row">
							<input
								bind:value={practiceAnswer}
								onkeydown={onPracticeKey}
								placeholder={practice.kind === 'cloze' ? 'name' : 'output'}
								autocomplete="off"
								spellcheck="false"
								style="flex:1; font-family: ui-monospace, monospace"
							/>
							<button class="primary" onclick={submitPractice} disabled={practiceBusy || !practiceAnswer.trim()}>Check</button>
						</div>
					{:else}
						<div class="banner" class:ok={practiceFeedback.correct}>
							{practiceFeedback.correct ? '✓ Correct' : '✗ Not quite'} · expected <code>{practiceFeedback.expected}</code>
							{#if practiceFeedback.alternatives.length}<span class="muted"> (also accepted: {practiceFeedback.alternatives.join(', ')})</span>{/if}
							<br /><a href={practiceFeedback.url} target="_blank" rel="noreferrer">{practiceFeedback.api ?? 'docs'} ↗</a>
						</div>
						{#if practiceFeedback.explain}
							<details class="explain">
								<summary>Why?</summary>
								<p>{practiceFeedback.explain}</p>
							</details>
						{/if}
						<div class="row">
							<button class="primary" onclick={nextPractice} onkeydown={onPracticeKey}>Next <span class="muted">↵</span></button>
							<button onclick={stopPractice}>Stop</button>
						</div>
					{/if}
				{/if}
			{/if}
		{:else}
			<div class="row"><span class="pill">{answeredCount + 1} / {data.drills.length}</span> <span class="pill">{current.module}</span> <span class="pill">{current.kind === 'cloze' ? 'fill the blank' : 'what does it print?'}</span></div>
			{#if current.context}<pre class="ctx">{current.context}</pre>{/if}
			<pre class="code">{current.code}</pre>
			{#if current.kind === 'cloze'}
				{#if current.hint}<p class="muted">Produces: <code>{current.hint}</code></p>{/if}
				<p>What replaces <code>___</code>?</p>
			{:else}
				<p>What is printed?</p>
			{/if}
			{#if !feedback}
				<div class="row">
					<input bind:value={answer} onkeydown={onkey} placeholder={current.kind === 'cloze' ? 'name' : 'output'} autocomplete="off" spellcheck="false" style="flex:1; font-family: ui-monospace, monospace" />
					<button class="primary" onclick={submit} disabled={busy || !answer.trim()}>Check</button>
				</div>
			{:else}
				<div class="banner" class:ok={feedback.correct}>
					{feedback.correct ? '✓ Correct' : '✗ Not quite'} · expected <code>{feedback.expected}</code>
					{#if feedback.alternatives.length}<span class="muted"> (also accepted: {feedback.alternatives.join(', ')})</span>{/if}
					{#if feedback.ingots > 0}<strong> +{feedback.ingots} ingot{feedback.ingots === 1 ? '' : 's'}</strong>{/if}
					<br /><a href={feedback.url} target="_blank" rel="noreferrer">{feedback.api ?? 'docs'} ↗</a>
				</div>
				<button class="primary" onclick={next} onkeydown={onkey}>Next</button>
			{/if}
		{/if}
	</section>

	<section class="card">
		<h2>Forge</h2>
		<p>Ingots: <strong>{data.ingots}</strong> · {data.dueCount} drill{data.dueCount === 1 ? '' : 's'} due</p>
		<table>
			<thead><tr><th>Module</th><th>Seen</th><th>Mastered</th><th>Total</th></tr></thead>
			<tbody>
				{#each data.modules as m (m.key)}
					<tr><td>{m.key}</td><td>{m.seen}</td><td>{m.mastered}</td><td>{m.total}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<style>
	pre.ctx { color: var(--muted); }
	.explain { margin: 0.6rem 0; }
	.explain summary { cursor: pointer; color: var(--accent-2); }
	.explain p { margin: 0.5rem 0 0; line-height: 1.55; }
	pre.code { border: 1px solid var(--accent); }
</style>
