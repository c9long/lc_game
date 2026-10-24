<script lang="ts">
	let { data } = $props();

	const v = $derived(data.view);
	const need = $derived(Math.ceil(v.total / 2) - v.solved);
	const blockers = $derived(data.requires.filter((r) => !r.done));
	const shortDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>{v.pattern} · Commit City</title></svelte:head>

<div class="pattern">
	<p class="back"><a href="/tree">Tech tree</a></p>
	<h1>{v.pattern}</h1>
	<p class="status">
		{v.solved} of {v.total} solved.
		{#if blockers.length}
			Opens once you unlock {#each blockers as r, i (r.id)}{i ? ' and ' : ''}<a href="/tree/{r.id}">{r.pattern}</a>{/each}.
		{:else if v.status === 'available'}
			{need} more to unlock it.
		{:else if v.status === 'unlocked'}
			Unlocked, with {v.total - v.solved} left to complete it.
		{:else if v.status === 'complete'}
			Complete.
		{/if}
		{#if v.due > 0}<span class="due">{v.due} {v.due === 1 ? 'refresh is' : 'refreshes are'} due.</span>{/if}
		{#if v.rusting}It's rusting, so its buildings make half as much until you refresh it.{/if}
	</p>

	<ol class="problems">
		{#each data.problems as p (p.slug)}
			<li class:solved={p.solveCount > 0} class:is-due={p.due}>
				<span class="mark" aria-hidden="true">
					{#if p.solveCount > 0}<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>{/if}
				</span>
				<span class="name">
					<a href="/solve/{p.slug}">{p.title}</a>
					{#if p.premium}<span class="pill">Premium</span>{/if}
				</span>
				<span class="difficulty {p.difficulty}">{p.difficulty}</span>
				<span class="history">
					{#if p.solveCount > 0}Solved {p.solveCount === 1 ? 'once' : `${p.solveCount} times`}{#if p.lastLang}, last in {p.lastLang}{/if}{:else}Not solved yet{/if}
				</span>
				<span class="when">
					{#if p.due}Due now{:else if p.dueAt}Refresh {shortDate(p.dueAt)}{/if}
				</span>
			</li>
		{/each}
	</ol>
	{#if data.problems.some((p) => p.premium)}
		<p class="note">Premium problems count like any other: LeetCode withholds their statement, so the app supplies its own.</p>
	{/if}
</div>

<style>
	.pattern { font-family: var(--body); line-height: 1.5; max-width: 56rem; }
	.back { margin: 1rem 0 0; }
	.back a { color: var(--steel); }
	.back a:hover { color: var(--brass); }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 0.25rem 0 0.6rem;
	}
	.status { margin: 0 0 1.75rem; color: var(--steel); max-width: 40rem; }
	.status a { color: var(--text); font-weight: 700; }
	.due { color: var(--rust); font-weight: 700; }

	.problems { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--border); }
	li {
		display: grid;
		grid-template-columns: 1.4rem minmax(0, 1fr) 5rem 15rem 7.5rem;
		align-items: center;
		column-gap: 0.75rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--border);
	}
	.mark {
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 50%;
		border: 2px solid var(--border);
		display: grid;
		place-items: center;
	}
	.solved .mark { background: var(--brass); border-color: var(--brass); }
	.is-due .mark { background: var(--rust); border-color: var(--rust); }
	.mark svg { width: 0.8rem; height: 0.8rem; fill: none; stroke: var(--on-brass); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.name a { color: var(--text); font-weight: 700; }
	.name a:hover { color: var(--brass); text-decoration: none; }
	.name a:focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; border-radius: 2px; }
	.name .pill { margin-left: 0.4rem; font-size: 0.75rem; }
	.difficulty { font-size: 0.9rem; }
	.difficulty.Easy { color: var(--easy); }
	.difficulty.Medium { color: var(--medium); }
	.difficulty.Hard { color: var(--hard); }
	.history { color: var(--steel); font-size: 0.9rem; }
	.when { color: var(--steel); font-size: 0.9rem; text-align: right; font-variant-numeric: tabular-nums; }
	.is-due .when { color: var(--rust); font-weight: 700; }
	.note { color: var(--steel); font-size: 0.9rem; margin-top: 1rem; }

	@media (max-width: 760px) {
		li {
			grid-template-columns: 1.4rem minmax(0, 1fr) auto;
			grid-template-areas: 'mark name difficulty' 'mark history when';
			row-gap: 0.15rem;
		}
		.mark { grid-area: mark; align-self: start; margin-top: 0.2rem; }
		.name { grid-area: name; }
		.difficulty { grid-area: difficulty; text-align: right; }
		.history { grid-area: history; }
		.when { grid-area: when; }
	}
</style>
