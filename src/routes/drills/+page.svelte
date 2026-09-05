<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();

	let idx = $state(0);
	let answer = $state('');
	let busy = $state(false);
	let feedback = $state<null | { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; ingots: number; setDone: boolean }>(null);
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

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (feedback) next();
			else submit();
		}
	}
</script>

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
	pre.code { border: 1px solid var(--accent); }
</style>
