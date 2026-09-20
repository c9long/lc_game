<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { RESOURCE_META, formatCost } from '$lib/game/resources';
	// The placement rules are shared with the server rather than restated here, so the catalog a
	// tile offers and the tile the API accepts are decided by the same function.
	import { TERRAIN_META, canStand, terrainAt, type Terrain } from '$lib/game/city';
	let { data } = $props();
	let cityId = $state(0);
	let selected = $state<{ x: number; y: number } | null>(null);
	let message = $state('');
	let busy = $state(false);
	/** The building waiting for a destination tile, set by Move or by placing one out of storage. */
	let moving = $state<null | { id: string; name: string }>(null);

	/** The rules panel. Open on a first visit, because the neighbour bonus is not guessable from a
	 *  grid of tiles, and shut for good once dismissed — the choice is remembered per browser. */
	const HELP_KEY = 'lc:city:help-dismissed';
	let helpOpen = $state(false);
	onMount(() => {
		try {
			helpOpen = localStorage.getItem(HELP_KEY) !== '1';
		} catch {
			helpOpen = true;
		}
	});
	function closeHelp() {
		helpOpen = false;
		try { localStorage.setItem(HELP_KEY, '1'); } catch {}
	}

	const city = $derived(data.cities.find((c) => c.id === cityId) ?? data.cities[0]);
	const at = (x: number, y: number) => data.buildings.find((b) => b.city === cityId && b.x === x && b.y === y);
	const groundAt = (x: number, y: number): Terrain => terrainAt(cityId, x, y) ?? 'plains';
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

	/** A tile click either drops the building being moved, or just selects the tile. */
	function tap(x: number, y: number) {
		if (moving) {
			const b = moving;
			moving = null;
			void post('/api/city/move', { id: b.id, city: cityId, x, y });
			return;
		}
		selected = { x, y };
	}

	function pickUp(b: { id: string; name: string }) {
		moving = { id: b.id, name: b.name };
		message = `Pick a tile for the ${b.name}.`;
	}

	const fmtCost = formatCost;
	/** Per-building output is fractional once freshness is below full, or roads or neighbours apply. */
	const fmtCoins = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
</script>

<h1>City</h1>
<div class="row summary">
	{#each RESOURCE_META as m (m.kind)}<span class="pill">{m.emoji} {m.label} <strong>{data.resources[m.kind] ?? 0}</strong></span>{/each}
	<span class="muted">· {data.production} coins per active day</span>
</div>
{#if essence.length}<p class="row">{#each essence as [k, v] (k)}<span class="pill">{k.slice(8)} {v}</span>{/each}</p>{/if}

<div class="row tabs">
	{#each data.cities as c (c.id)}
		<button class="tab" class:active={c.id === cityId} disabled={!c.unlocked} onclick={() => { cityId = c.id; selected = null; }}>
			{c.name}
			<span class="muted small">{c.unlocked ? c.honoree : `✨ ${data.essence} / ${c.essence}`}</span>
		</button>
	{/each}
</div>
<div class="help">
	<button class="linkish" aria-expanded={helpOpen} onclick={() => (helpOpen ? closeHelp() : (helpOpen = true))}>
		ⓘ How production works
	</button>
	{#if helpOpen}
		<div class="help-body card">
			<p><strong>Coins per active day</strong> = rate × level × freshness × roads × neighbours.</p>
			<ul>
				<li><strong>Freshness</strong> — the share of that building's node that is not overdue. Refreshing restores it.</li>
				<li>
					<strong>Roads</strong> — ×1.25 on the four tiles around Graph Roads, and the same around a
					Two-Pointer Bridge, which pays both of its banks. The two do not stack: one of each beside the
					same building is still ×1.25.
				</li>
				<li>
					<strong>Neighbours</strong> — ×1.15 for each <em>different</em> kind of building on the four tiles
					beside it, up to ×1.6. Two of the same kind side by side add nothing to each other, so a mixed
					quarter out-earns a row of whichever building unlocked first. Only tiles in the same city count.
				</li>
			</ul>
			<p class="muted">
				Terrain is fixed, and each kind names the ground it accepts: the mill and the lighthouse stand on
				plains or river, the foundry on plains or forest, the Heap Mine and the DP buildings only on
				mountain, the clocktower on plains but only beside the water. A tile takes nothing that does not
				name it. Essence founds new cities. Moving a building is free; destroying one refunds its level 1
				cost only.
			</p>
			<button onclick={closeHelp}>Got it</button>
		</div>
	{/if}
</div>
{#if message}<div class="banner">{message}</div>{/if}

<div class="city">
	<div class="grid-wrap card">
		<div class="board" style="grid-template-columns: repeat({data.size}, 1fr)">
			{#each cells as c (`${c.x},${c.y}`)}
				{@const b = at(c.x, c.y)}
				{@const t = groundAt(c.x, c.y)}
				<button
					class="cell {t}"
					class:selected={selected?.x === c.x && selected?.y === c.y}
					class:targeting={Boolean(moving)}
					onclick={() => tap(c.x, c.y)}
					title={b ? `${b.name} L${b.level} on ${t}` : t}
				>
					{#if b}<span class="emoji">{b.emoji}</span><span class="lvl">{b.level}</span>
					{:else if t !== 'plains'}<span class="terrain">{TERRAIN_META[t].emoji}</span>{/if}
				</button>
			{/each}
		</div>
		{#if data.stored.length}
			<div class="stored">
				<h4>Stored <span class="muted small">— these lost their tile when the map changed. Placing them is free.</span></h4>
				<ul class="row">
					{#each data.stored as s (s.id)}
						<li><button class="pill" disabled={busy} onclick={() => pickUp(s)}>{s.emoji} {s.name} L{s.level} · place</button></li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<aside class="card side">
		{#if moving}
			<p>Moving the <strong>{moving.name}</strong>. Click a tile that fits it, on any founded city.</p>
			<button onclick={() => { moving = null; message = ''; }}>Cancel</button>
		{:else if !selected}
			<p class="muted">Select a tile to build or upgrade.</p>
		{:else}
			{@const b = at(selected.x, selected.y)}
			{@const t = groundAt(selected.x, selected.y)}
			{#if b}
				<h3>{b.emoji} {b.name} <span class="muted">level {b.level}</span></h3>
				{#if b.rate > 0}
					<p class="yield">🪙 <strong>{fmtCoins(b.yield.perDay)}</strong> coins per active day</p>
					<p class="muted breakdown">
						{b.rate} base × level {b.level} = {fmtCoins(b.yield.base)}
						{#if b.hasNode}<br />× freshness {Math.round(b.yield.freshness * 100)}%{/if}
						{#if b.yield.adjacency > 1}<br /><span title="Graph Roads or a Two-Pointer Bridge on a neighbouring tile">× roads ×{b.yield.adjacency}</span>{/if}
						{#if b.yield.diversity > 1}<br /><span title="×1.15 for each different kind of building on the four tiles beside this one, up to ×1.6">× neighbours ×{b.yield.diversity.toFixed(2)}</span>{/if}
					</p>
					{#if b.hasNode && b.yield.freshness < 1}
						<p class="muted">Refresh this node's overdue problems to restore full output.</p>
					{/if}
					{#if b.yield.diversity === 1}
						<p class="muted">No different kind of building beside it — each one is worth ×1.15, up to ×1.6.</p>
					{/if}
				{:else}
					<p class="muted">Produces no coins{b.effect ? ` — ${b.effect}` : ''}.</p>
				{/if}
				{#if b.next}
					<p>Upgrade: {fmtCost(b.next)}</p>
				{:else}<p class="muted">Max level.</p>{/if}
				<p class="muted">Destroy refunds the level 1 cost: {fmtCost(b.refund)}{b.level > 1 ? ' — upgrades are not refunded' : ''}</p>
				<div class="row">
					{#if b.next}
						<button class="primary" disabled={busy || !b.canUpgrade} onclick={() => post('/api/city/build', { id: b.id })}>Upgrade</button>
					{/if}
					<button disabled={busy} onclick={() => pickUp(b)}>Move</button>
					<button class="destructive" disabled={busy} onclick={() => destroy(b)}>Destroy</button>
				</div>
			{:else}
				{@const fits = data.catalog.filter((k) => canStand(k.id, cityId, selected!.x, selected!.y))}
				<h3>Build at ({selected.x}, {selected.y})</h3>
				<p class="muted small">{TERRAIN_META[t].emoji} {t} — {fits.length} of the {data.catalog.length} kinds can stand here</p>
				<ul class="catalog">
					{#each fits as k (k.id)}
						<li class:disabled={!k.gated || !k.affordable}>
							<div class="row">
								<span>{k.emoji} <strong>{k.name}</strong></span>
								<span class="muted">{k.coins ? `${k.coins} coins/day` : k.effect}</span>
								<button disabled={busy || !k.gated || !k.affordable} onclick={() => post('/api/city/build', { kind: k.id, city: cityId, x: selected!.x, y: selected!.y })}>Build</button>
							</div>
							<div class="muted small">{fmtCost(k.cost)} · {k.terrainLabel}{k.gateText ? ` · needs ${k.gateText}` : ''}{k.nodeFreshness !== null && k.nodeFreshness < 1 ? ` · freshness ${Math.round(k.nodeFreshness * 100)}%` : ''}</div>
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
	.help { margin: -0.25rem 0 0.75rem; }
	.linkish { background: none; border: 0; padding: 0; color: var(--muted); font-size: 0.85rem; cursor: pointer; }
	.linkish:hover { color: var(--accent); }
	.help-body { margin-top: 0.4rem; padding: 0.75rem 0.9rem; font-size: 0.88rem; line-height: 1.5; max-width: 60ch; }
	.help-body p { margin: 0 0 0.5rem; }
	.help-body ul { margin: 0 0 0.6rem; padding-left: 1.1rem; display: grid; gap: 0.3rem; }
	.tabs { gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
	.tab { display: grid; gap: 0.1rem; text-align: left; padding: 0.4rem 0.7rem; border-radius: 8px; }
	.tab.active { outline: 2px solid var(--accent); }
	.tab:disabled { opacity: 0.55; }
	.board { display: grid; gap: 4px; aspect-ratio: 1; }
	.cell { aspect-ratio: 1; padding: 0; border-radius: 6px; background: #1b2a1e; border: 1px solid #263a2a; position: relative; font-size: clamp(14px, 3vw, 28px); }
	/* Terrain is a tint plus a faint glyph, so an empty river tile reads as water, not as a gap. */
	.cell.river { background: #16283a; border-color: #23415c; }
	.cell.mountain { background: #2b2b33; border-color: #43434f; }
	.cell.forest { background: #17301d; border-color: #24512f; }
	.cell .terrain { opacity: 0.45; }
	.cell:hover { border-color: var(--accent); }
	.cell.selected { outline: 2px solid var(--accent); }
	.cell.targeting { cursor: crosshair; }
	.stored { margin-top: 0.75rem; }
	.stored ul { list-style: none; padding: 0; margin: 0.3rem 0 0; flex-wrap: wrap; gap: 0.4rem; }
	.yield { margin: 0.2rem 0; }
	.breakdown { font-size: 0.85rem; line-height: 1.5; }
	.lvl { position: absolute; right: 3px; bottom: 1px; font-size: 0.6rem; color: var(--muted); }
	.catalog { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; max-height: 70vh; overflow: auto; }
	.catalog li { border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
	.catalog li.disabled { opacity: 0.55; }
	.small { font-size: 0.8rem; }
	.side { position: sticky; top: 1rem; }
</style>
