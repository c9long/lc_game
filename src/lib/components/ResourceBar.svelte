<script lang="ts">
	import { RESOURCE_META, ESSENCE_META, totalEssence } from '$lib/game/resources';
	let { resources }: { resources: Record<string, number> } = $props();
	const essence = $derived(totalEssence(resources));
</script>

<!-- Overlays the page rather than sitting in the flow, so it stays visible while scrolling. -->
<div class="resource-bar" aria-label="Resources">
	{#each RESOURCE_META as m (m.kind)}
		<span class="res" title={m.label}>
			<span class="emoji" aria-hidden="true">{m.emoji}</span>
			<strong>{resources[m.kind] ?? 0}</strong>
			<span class="name">{m.label}</span>
		</span>
	{/each}
	<span class="res" title="Essence, summed across every topic">
		<span class="emoji" aria-hidden="true">{ESSENCE_META.emoji}</span>
		<strong>{essence}</strong>
		<span class="name">{ESSENCE_META.label}</span>
	</span>
</div>

<style>
	.resource-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		gap: 0.9rem;
		flex-wrap: wrap;
		align-items: center;
		padding: 0.5rem 0.9rem;
		margin-bottom: 1rem;
		background: color-mix(in srgb, var(--panel) 92%, transparent);
		backdrop-filter: blur(6px);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.res { display: inline-flex; align-items: baseline; gap: 0.3rem; }
	.emoji { font-size: 1.05rem; }
	.name { color: var(--muted); font-size: 0.85rem; }
	/* The labels are the first thing worth dropping when space runs out; the counts are not. */
	@media (max-width: 700px) {
		.name { display: none; }
		.resource-bar { gap: 0.75rem; }
	}
</style>
