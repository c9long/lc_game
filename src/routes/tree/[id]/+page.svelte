<script lang="ts">
	let { data } = $props();
	const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString() : '');
</script>

<p><a href="/tree">← Tech tree</a></p>
<h1>{data.view.pattern} <span class="pill">{data.view.status}</span> {#if data.view.rusting}<span class="pill" style="color: var(--warn)">rusting</span>{/if}</h1>
<p class="muted">
	{data.view.solved}/{data.view.total} solved · {data.view.due} due for refresh · research {data.view.research}
	{#if data.requires.length} · requires {#each data.requires as r, i (r.id)}{i ? ', ' : ''}<a href="/tree/{r.id}">{r.pattern}</a>{/each}{/if}
</p>

<div class="card">
	<table>
		<thead><tr><th>Problem</th><th>Difficulty</th><th>Solved</th><th>Last language</th><th>Due</th><th>Reference</th></tr></thead>
		<tbody>
			{#each data.problems as p (p.slug)}
				<tr class:due={p.due} class:skip={!p.counted}>
					<td><a href="/solve/{p.slug}">{p.title}</a>{#if p.premium} <span class="pill">Premium</span>{/if}</td>
					<td><span class="pill {p.difficulty}">{p.difficulty}</span></td>
					<td>{p.solveCount > 0 ? `×${p.solveCount}` : '—'}</td>
					<td>{p.lastLang ?? ''}</td>
					<td>{p.due ? '⟳ now' : fmt(p.dueAt)}</td>
					<td class="muted">{p.solutions.join(', ')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if data.problems.some((p) => !p.counted)}
		<p class="muted">Premium problems are not counted toward this node unless Premium is enabled in Admin.</p>
	{/if}
</div>

<style>
	tr.due td:nth-child(5) { color: var(--warn); font-weight: 600; }
	tr.skip { opacity: 0.55; }
</style>
