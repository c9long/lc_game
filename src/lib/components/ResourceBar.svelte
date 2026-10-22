<script lang="ts">
	import { RESOURCE_META, ESSENCE_META, totalEssence } from '$lib/game/resources';
	let { resources }: { resources: Record<string, number> } = $props();
	const essence = $derived(totalEssence(resources));
	const meta = (kind: string) => RESOURCE_META.find((m) => m.kind === kind)!;
	// Grouped by what they are for: the currency, the building materials, then what drills and
	// solves forge. The gaps between groups carry that, not labels.
	const groups = [['coins'], ['timber', 'stone', 'iron'], ['ingots']];
</script>

<!-- Sticky rather than in the flow, so the counts stay in view while building or scrolling. -->
<div class="resource-bar" aria-label="Resources">
	{#each groups as kinds, g (g)}
		<span class="group">
			{#each kinds as kind (kind)}
				{@const m = meta(kind)}
				<span class="res" title={m.label}>
					<span class="emoji" aria-hidden="true">{m.emoji}</span>
					<strong>{resources[kind] ?? 0}</strong>
					<span class="name">{m.label}</span>
				</span>
			{/each}
			{#if g === groups.length - 1}
				<span class="res" title="Essence, summed across every topic">
					<span class="emoji" aria-hidden="true">{ESSENCE_META.emoji}</span>
					<strong>{essence}</strong>
					<span class="name">{ESSENCE_META.label}</span>
				</span>
			{/if}
		</span>
	{/each}
</div>

<style>
	.resource-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 2.25rem;
		row-gap: 0.25rem;
		padding: 0.45rem 0 0.55rem;
		margin: -0.6rem 0 1.25rem;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}
	.group { display: inline-flex; align-items: baseline; gap: 1.1rem; }
	.res { display: inline-flex; align-items: baseline; gap: 0.35rem; }
	.emoji { font-size: 1rem; align-self: center; }
	strong {
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.35rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.name { color: var(--steel); font-size: 0.85rem; }
	/* The labels are the first thing worth dropping when space runs out; the counts are not. */
	@media (max-width: 760px) {
		.name { display: none; }
		.resource-bar { column-gap: 1.25rem; }
		.group { gap: 0.8rem; }
	}
</style>
