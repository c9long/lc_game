<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { RESOURCE_META, formatCost } from '$lib/game/resources';
	let { data } = $props();
	let selected = $state<{ x: number; y: number } | null>(null);
	let message = $state('');
	let busy = $state(false);

	const at = (x: number, y: number) => data.buildings.find((b) => b.x === x && b.y === y);
	const essence = $derived(Object.entries(data.resources).filter(([k, v]) => k.startsWith('essence:') && v > 0));
	const cells = $derived(Array.from({ length: data.size * data.size }, (_, i) => ({ x: i % data.size, y: Math.floor(i / data.size) })));

	/** Demolition is irreversible and refunds only the level 1 cost, so it asks first. */
	let pendingDestroy = $state<null | { id: string; name: string; level: number; refund: Record<string, number> }>(null);
	// Real state, not derived: the dialog writes `open` back when you cancel or press Escape, and a
	// derived value would discard that write and reopen itself.
	let confirmOpen = $state(false);

	function destroy(b: { id: string; name: string; level: number; refund: Record<string, number> }) {
		pendingDestroy = b;
		confirmOpen = true;
	}

	async function post(url: string, body: unknown) {
		busy = true;
		message = '';
		try {
			const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			await invalidateAll();
			selected = null;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	const fmtCost = formatCost;
</script>

<h1>City</h1>
<div class="row summary">
	{#each RESOURCE_META as m (m.kind)}<span class="pill">{m.emoji} {m.label} <strong>{data.resources[m.kind] ?? 0}</strong></span>{/each}
	<span class="muted">· {data.production} coins per active day · morale {Math.round(data.morale.morale)} · freeze days {data.morale.freezeDays}/3</span>
	{#if data.hasGranary}
		<button disabled={busy || (data.resources.coins ?? 0) < data.freezeCost || data.morale.freezeDays >= 3} onclick={() => post('/api/city/freeze', {})}>Buy freeze day ({data.freezeCost} coins)</button>
		<span class="muted">{data.freezeBought} bought this week · price doubles each time, resets Monday</span>
	{/if}
</div>
{#if essence.length}<p class="row">{#each essence as [k, v] (k)}<span class="pill">{k.slice(8)} {v}</span>{/each}</p>{/if}
{#if message}<div class="banner">{message}</div>{/if}

<div class="city">
	<div class="grid-wrap card">
		<div class="board" style="grid-template-columns: repeat({data.size}, 1fr)">
			{#each cells as c (`${c.x},${c.y}`)}
				{@const b = at(c.x, c.y)}
				<button class="cell" class:selected={selected?.x === c.x && selected?.y === c.y} onclick={() => (selected = { x: c.x, y: c.y })} title={b ? `${b.name} L${b.level}` : 'empty'}>
					{#if b}<span class="emoji">{b.emoji}</span><span class="lvl">{b.level}</span>{/if}
				</button>
			{/each}
		</div>
	</div>

	<aside class="card side">
		{#if !selected}
			<p class="muted">Select a tile to build or upgrade.</p>
		{:else}
			{@const b = at(selected.x, selected.y)}
			{#if b}
				<h3>{b.emoji} {b.name} <span class="muted">level {b.level}</span></h3>
				{#if b.next}
					<p>Upgrade: {fmtCost(b.next)}</p>
				{:else}<p class="muted">Max level.</p>{/if}
				<p class="muted">Destroy refunds the level 1 cost: {fmtCost(b.refund)}{b.level > 1 ? ' — upgrades are not refunded' : ''}</p>
				<div class="row">
					{#if b.next}
						<button class="primary" disabled={busy || !b.canUpgrade} onclick={() => post('/api/city/build', { id: b.id })}>Upgrade</button>
					{/if}
					<button class="destructive" disabled={busy} onclick={() => destroy(b)}>Destroy</button>
				</div>
			{:else}
				<h3>Build at ({selected.x}, {selected.y})</h3>
				<ul class="catalog">
					{#each data.catalog as k (k.id)}
						<li class:disabled={!k.gated || !k.affordable}>
							<div class="row">
								<span>{k.emoji} <strong>{k.name}</strong></span>
								<span class="muted">{k.coins ? `${k.coins} coins/day` : k.effect}</span>
								<button disabled={busy || !k.gated || !k.affordable} onclick={() => post('/api/city/build', { kind: k.id, x: selected!.x, y: selected!.y })}>Build</button>
							</div>
							<div class="muted small">{fmtCost(k.cost)}{k.gateText ? ` · needs ${k.gateText}` : ''}{k.nodeFreshness !== null && k.nodeFreshness < 1 ? ` · freshness ${Math.round(k.nodeFreshness * 100)}%` : ''}</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</aside>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title={pendingDestroy ? `Destroy the ${pendingDestroy.name}?` : ''}
	body={pendingDestroy ? `This refunds ${fmtCost(pendingDestroy.refund)}.` : ''}
	note={pendingDestroy && pendingDestroy.level > 1
		? `The ${pendingDestroy.level - 1} upgrade${pendingDestroy.level > 2 ? 's are' : ' is'} not refunded.`
		: ''}
	confirmLabel="Destroy"
	destructive
	onconfirm={() => {
		const b = pendingDestroy;
		pendingDestroy = null;
		if (b) void post('/api/city/destroy', { id: b.id });
	}}
/>

<style>
	.city { display: grid; grid-template-columns: minmax(320px, 2fr) minmax(280px, 1fr); gap: 1rem; align-items: start; }
	@media (max-width: 900px) { .city { grid-template-columns: 1fr; } }
	.board { display: grid; gap: 4px; aspect-ratio: 1; }
	.cell { aspect-ratio: 1; padding: 0; border-radius: 6px; background: #1b2a1e; border: 1px solid #263a2a; position: relative; font-size: clamp(14px, 3vw, 28px); }
	.cell:hover { border-color: var(--accent); }
	.cell.selected { outline: 2px solid var(--accent); }
	.lvl { position: absolute; right: 3px; bottom: 1px; font-size: 0.6rem; color: var(--muted); }
	.catalog { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; max-height: 70vh; overflow: auto; }
	.catalog li { border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
	.catalog li.disabled { opacity: 0.55; }
	.small { font-size: 0.8rem; }
	.side { position: sticky; top: 1rem; }
</style>
