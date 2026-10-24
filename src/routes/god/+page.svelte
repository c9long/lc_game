<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let treeForm: HTMLFormElement;
</script>

<svelte:head><title>God mode · Commit City</title></svelte:head>

<div class="god">
	<h1>God mode</h1>
	<p class="sub">Set your resources and open the tech tree. This page exists only on the dev server.</p>

	<h2>Resources</h2>
	<form method="POST" action="?/set" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<div class="fields">
			{#each data.kinds as k (k.kind)}
				<label>
					<span class="name"><span aria-hidden="true">{k.emoji}</span> {k.label}</span>
					<input name={k.kind} type="number" min="0" step="1" value={k.amount} />
				</label>
			{/each}
			<label>
				<span class="name"><span aria-hidden="true">✨</span> Essence</span>
				<input name="essence" type="number" min="0" step="1" value={data.essence} />
			</label>
		</div>
		<p class="hint">Essence is a total across topics; it unlocks the later cities at 1,000 and 10,000.</p>
		<button class="primary">Save resources</button>
		{#if form?.message}<p class="result">{form.message}</p>{/if}
	</form>

	<h2>Tech tree</h2>
	<form method="POST" action="?/tree" bind:this={treeForm} use:enhance>
		<label class="switch">
			<input type="checkbox" role="switch" name="unlock" checked={data.treeUnlocked} onchange={() => treeForm.requestSubmit()} />
			<span>Unlock the whole tree</span>
		</label>
		<p class="hint">
			Every pattern opens, with its buildings and its problems on the daily route. Your solves are untouched: turn it off and
			the tree goes back to what they have earned.
		</p>
		<noscript><button>Save</button></noscript>
		{#if form?.tree}<p class="result">{form.tree}</p>{/if}
	</form>
</div>

<style>
	.god { max-width: 40rem; line-height: 1.5; }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 1rem 0 0.4rem;
	}
	.sub { margin: 0 0 1.5rem; color: var(--steel); }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.75rem; line-height: 1.1; margin: 1.75rem 0 0.6rem; }
	.fields { display: grid; border-top: 1px solid var(--border); }
	.fields label {
		display: grid;
		grid-template-columns: 1fr 10rem;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}
	.name { font-family: var(--display); font-weight: 700; font-size: 1.35rem; }
	input { font-variant-numeric: tabular-nums; text-align: right; }
	input:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
	.hint { color: var(--steel); font-size: 0.92rem; margin: 0.6rem 0 1rem; }
	.result { color: var(--steel); margin: 0.6rem 0 0; }
	.switch { display: inline-flex; align-items: center; gap: 0.7rem; font-weight: 700; cursor: pointer; }
	.switch input {
		appearance: none;
		width: 2.6rem;
		height: 1.4rem;
		margin: 0;
		padding: 0;
		border-radius: 999px;
		background: var(--panel-2);
		border: 1px solid var(--border);
		position: relative;
		cursor: pointer;
	}
	.switch input::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.4rem - 6px);
		height: calc(1.4rem - 6px);
		border-radius: 50%;
		background: var(--steel);
		transition: transform 0.15s;
	}
	.switch input:checked { background: var(--brass); border-color: var(--brass); }
	.switch input:checked::after { background: var(--on-brass); transform: translateX(1.2rem); }
	@media (prefers-reduced-motion: reduce) { .switch input::after { transition: none; } }
</style>
