<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>God mode · Commit City</title></svelte:head>

<div class="god">
	<h1>God mode</h1>
	<p class="sub">Set your resources to anything. This page exists only on the dev server.</p>

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
	.fields { display: grid; border-top: 1px solid var(--border); }
	label {
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
</style>
