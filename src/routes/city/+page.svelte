<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { formatCost } from '$lib/game/resources';
	// The placement rules are shared with the server rather than restated here, so the catalog a
	// tile offers and the tile the API accepts are decided by the same function.
	import { BUILDING_BY_ID, TERRAIN_META, canAfford, canStand, moveCost, terrainAt, type Terrain } from '$lib/game/city';
	let { data } = $props();
	let cityId = $state(0);
	let selected = $state<{ x: number; y: number } | null>(null);
	let message = $state('');
	let busy = $state(false);
	/** The building waiting for a destination tile, set by Move or by placing one out of storage. */
	let moving = $state<null | { id: string; name: string; kind: string; level: number; city: number }>(null);
	/** What dropping it on the city now shown would cost: nothing, unless that city is a higher tier. */
	const moveCharge = $derived.by(() => {
		const kind = moving && BUILDING_BY_ID.get(moving.kind);
		return moving && kind ? moveCost(kind, moving.level, moving.city, cityId) : {};
	});

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
	/** Closing the rules remembers it; opening them again is just for now. */
	function onHelpToggle(e: Event) {
		helpOpen = (e.currentTarget as HTMLDetailsElement).open;
		if (!helpOpen) try { localStorage.setItem(HELP_KEY, '1'); } catch {}
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
			// A 409 means the city changed under this page (another tab or device got there first):
			// show the city as it now is, alongside the message.
			if (r.status === 409) await invalidateAll();
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

	function pickUp(b: { id: string; name: string; kind: string; level: number; city: number }) {
		moving = { id: b.id, name: b.name, kind: b.kind, level: b.level, city: b.city };
		message = `Pick a tile for the ${b.name}.`;
	}

	const fmtCost = formatCost;
	const fmtInt = (n: number) => n.toLocaleString();
	const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
	/** Per-building output is fractional once freshness is below full, or roads or neighbours apply. */
	const fmtCoins = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
</script>

<svelte:head><title>{city.name} · Commit City</title></svelte:head>

<div class="town">
	<header class="lede">
		<h1>{city.name}</h1>
		<p class="sub">
			Named for {city.honoree}. Your city makes <strong>{data.production}</strong> {data.production === 1 ? 'coin' : 'coins'} on each
			day you solve something.
		</p>
		<nav class="cities" aria-label="Cities">
			{#each data.cities as c (c.id)}
				<button
					class="city-tab"
					aria-current={c.id === cityId ? 'page' : undefined}
					disabled={!c.unlocked}
					onclick={() => { cityId = c.id; selected = null; }}
				>
					<span class="tab-name">{c.name}</span>
					{#if !c.unlocked}<span class="tab-need">{fmtInt(data.essence)} of {fmtInt(c.essence)} essence to found it</span>{/if}
				</button>
			{/each}
		</nav>
		{#if essence.length}
			<p class="essence">Essence by topic: {#each essence as [k, v], i (k)}{i ? ', ' : ''}{k.slice(8)} {v}{/each}</p>
		{/if}
	</header>

	{#if message}<div class="banner">{message}</div>{/if}

	<div class="city">
		<div class="plot">
			<div class="board" style="grid-template-columns: repeat({data.size}, 1fr)">
				{#each cells as c (`${c.x},${c.y}`)}
					{@const b = at(c.x, c.y)}
					{@const t = groundAt(c.x, c.y)}
					<button
						class="cell {t}"
						class:built={Boolean(b)}
						class:selected={selected?.x === c.x && selected?.y === c.y}
						class:targeting={Boolean(moving)}
						onclick={() => tap(c.x, c.y)}
						title={b ? `${b.name}, level ${b.level}, on ${t}` : t}
						aria-label={b ? `${b.name}, level ${b.level}, on ${t}` : `Empty ${t} tile`}
					>
						{#if b}<span class="emoji">{b.emoji}</span><span class="lvl">{b.level}</span>
						{:else if t !== 'plains'}<span class="terrain">{TERRAIN_META[t].emoji}</span>{/if}
					</button>
				{/each}
			</div>
			{#if data.stored.length}
				<div class="stored">
					<h2>In storage</h2>
					<p class="muted-note">These lost their tile when the map changed. Placing one in the first city is free.</p>
					<ul>
						{#each data.stored as s (s.id)}
							<li><button disabled={busy} onclick={() => pickUp(s)}>{s.emoji} Place the {s.name}, level {s.level}</button></li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<aside class="side">
			{#if moving}
				<h2>Moving the {moving.name}</h2>
				<p>Click a tile that fits it, in any founded city.</p>
				{#if Object.keys(moveCharge).length}
					<p class:bad={!canAfford(data.resources, moveCharge)}>Moving it into {city.name} costs {fmtCost(moveCharge)}, the difference from the price where it stands.</p>
				{:else if moving.city !== cityId}
					<p class="muted-note">Moving it into {city.name} is free.</p>
				{/if}
				<button onclick={() => { moving = null; message = ''; }}>Cancel the move</button>
			{:else if !selected}
				<h2>Pick a tile</h2>
				<p class="muted-note">Click an empty tile to build on it, or a building to upgrade, move or destroy it.</p>
				<details class="rules" open={helpOpen} ontoggle={onHelpToggle}>
					<summary>How production works</summary>
					<p><strong>Coins per active day</strong> = rate × level × city × freshness × roads × neighbours.</p>
					<dl>
						<dt>City</dt>
						<dd>
							Each city past the first produces ×3 the coins of the one before it, and charges ×4 the coins: ×3 and ×4 in Knuth's
							Knolls, ×9 and ×16 in Dijkstra's Delta. Only coins: materials and ingots cost the same in every city. Building in a
							later city also costs a coin build fee; building in the Hamlet does not.
						</dd>
						<dt>Freshness</dt>
						<dd>The share of that building's pattern that is not overdue. Refreshing restores it.</dd>
						<dt>Roads</dt>
						<dd>
							×1.25 on the four tiles around Graph Roads, and the same around a Two-Pointer Bridge, which pays both of its banks.
							The two do not stack: one of each beside the same building is still ×1.25.
						</dd>
						<dt>Neighbours</dt>
						<dd>
							×1.15 for each <em>different</em> kind of building on the four tiles beside it, up to ×1.6. Two of the same kind side
							by side add nothing to each other, so a mixed quarter out-earns a row of one kind. Only tiles in the same city count.
						</dd>
					</dl>
					<p class="muted-note">
						Terrain is fixed, and each kind names the ground it accepts: the mill and the lighthouse stand on plains or river,
						the foundry on plains or forest, the Heap Mine and the DP buildings only on mountain, the clocktower on plains but
						only beside the water. Essence founds new cities. Moving a building is free within a city or to an earlier one;
						moving it to a later city charges the difference in price. Destroying one refunds its level 1 cost only.
					</p>
				</details>
			{:else}
				{@const b = at(selected.x, selected.y)}
				{@const t = groundAt(selected.x, selected.y)}
				{#if b}
					<h2><span aria-hidden="true">{b.emoji}</span> {b.name}</h2>
					<p class="muted-note">Level {b.level}, on {t}</p>
					{#if b.rate > 0}
						<p class="yield"><strong>{fmtCoins(b.yield.perDay)}</strong> coins per active day</p>
						<ul class="breakdown">
							<li>{b.rate * b.yield.tier} base × level {b.level} = {fmtCoins(b.yield.base)}</li>
							{#if b.hasNode}<li>× freshness {Math.round(b.yield.freshness * 100)}%</li>{/if}
							{#if b.yield.adjacency > 1}<li title="Graph Roads or a Two-Pointer Bridge on a neighbouring tile">× roads ×{b.yield.adjacency}</li>{/if}
							{#if b.yield.diversity > 1}<li title="×1.15 for each different kind of building on the four tiles beside this one, up to ×1.6">× neighbours ×{b.yield.diversity.toFixed(2)}</li>{/if}
						</ul>
						{#if b.hasNode && b.yield.freshness < 1}
							<p class="warn">Refresh this pattern's overdue problems to restore full output.</p>
						{/if}
						{#if b.yield.diversity === 1}
							<p class="muted-note">No different kind of building beside it. Each one is worth ×1.15, up to ×1.6.</p>
						{/if}
					{:else}
						<p class="muted-note">Produces no coins{b.effect ? `: ${b.effect}` : ''}.</p>
					{/if}
					{#if b.next}
						<p>Upgrading to level {b.level + 1} costs {fmtCost(b.next)}.</p>
					{:else}<p class="muted-note">At its highest level.</p>{/if}
					<div class="actions">
						{#if b.next}
							<button class="primary" disabled={busy || !b.canUpgrade} onclick={() => post('/api/city/build', { id: b.id })}>Upgrade</button>
						{/if}
						<button disabled={busy} onclick={() => pickUp(b)}>Move</button>
						<button class="danger" disabled={busy} onclick={() => destroy(b)}>Destroy</button>
					</div>
					<p class="muted-note small">Destroying it refunds the level 1 cost, {fmtCost(b.refund)}{b.level > 1 ? '; upgrades are not refunded' : ''}.</p>
				{:else}
					{@const fits = data.catalog.filter((k) => canStand(k.id, cityId, selected!.x, selected!.y))}
					<h2>Build here</h2>
					<p class="muted-note">{TERRAIN_META[t].emoji} {cap(t)}, column {selected.x + 1}, row {selected.y + 1}. {fits.length} of the {data.catalog.length} kinds can stand here.</p>
					<ul class="catalog">
						{#each fits as k (k.id)}
							{@const can = k.gated && k.affordable[cityId]}
							<li class:off={!can}>
								<span class="k-emoji" aria-hidden="true">{k.emoji}</span>
								<span class="k-main">
									<strong>{k.name}</strong>
									<span class="k-detail">
										{fmtCost(k.cost[cityId])}{k.gateText ? `. Needs ${k.gateText}` : ''}{k.nodeFreshness !== null && k.nodeFreshness < 1 ? `. Freshness ${Math.round(k.nodeFreshness * 100)}%` : ''}
									</span>
								</span>
								<span class="k-out">{k.coins[cityId] ? `${k.coins[cityId]}/day` : k.effect}</span>
								<button disabled={busy || !can} onclick={() => post('/api/city/build', { kind: k.id, city: cityId, x: selected!.x, y: selected!.y })}>Build</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</aside>
	</div>
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
	.town { line-height: 1.5; }
	.lede { margin: 0.75rem 0 1.25rem; }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 0 0 0.4rem;
	}
	.sub { margin: 0 0 1rem; color: var(--steel); max-width: 42rem; }
	.sub strong { color: var(--brass); }
	.essence { margin: 0.6rem 0 0; color: var(--steel); font-size: 0.9rem; }

	/* The city switcher reads like the top bar: the city you are in is the lit stretch of track. */
	.cities { display: flex; flex-wrap: wrap; gap: 0 1.75rem; border-bottom: 2px solid var(--border); }
	.city-tab {
		position: relative;
		display: grid;
		text-align: left;
		background: none;
		border: 0;
		border-radius: 0;
		padding: 0.4rem 0 0.5rem;
		color: var(--steel);
	}
	.city-tab:hover:not(:disabled) { color: var(--text); }
	.city-tab[aria-current='page'] { color: var(--text); font-weight: 700; }
	.city-tab[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -2px;
		height: 3px;
		background: var(--brass);
	}
	.city-tab:disabled { opacity: 1; cursor: default; }
	.city-tab:disabled .tab-name { color: var(--steel); opacity: 0.6; }
	.city-tab:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
	.tab-need { font-size: 0.8rem; color: var(--steel); font-weight: 400; }

	.city { display: grid; grid-template-columns: minmax(0, 40rem) minmax(18rem, 26rem); gap: 2.5rem; align-items: start; }
	@media (max-width: 900px) { .city { grid-template-columns: 1fr; gap: 1.5rem; } }

	/* ---------- the board ---------- */
	.board { display: grid; gap: 3px; aspect-ratio: 1; }
	.cell {
		aspect-ratio: 1;
		padding: 0;
		border-radius: 4px;
		background: #1a2a1e;
		border: 1px solid #253a2a;
		position: relative;
		font-size: clamp(16px, 4vw, 34px);
	}
	/* Terrain is a tint plus a faint glyph, so an empty river tile reads as water, not as a gap. */
	.cell.river { background: #16283a; border-color: #22405a; }
	.cell.mountain { background: #2a2a32; border-color: #42424e; }
	.cell.forest { background: #15301c; border-color: #23502e; }
	.cell .terrain { opacity: 0.4; }
	.cell:hover:not(:disabled) { border-color: var(--brass); }
	.cell.selected { outline: 3px solid var(--brass); outline-offset: 1px; z-index: 1; }
	.cell:focus-visible { outline: 3px solid var(--brass); outline-offset: 1px; z-index: 1; }
	.cell.targeting { cursor: crosshair; }
	.lvl {
		position: absolute;
		right: 4px;
		bottom: 1px;
		font-family: var(--display);
		font-weight: 700;
		font-size: clamp(0.7rem, 1.4vw, 0.95rem);
		color: var(--brass);
	}

	.stored { margin-top: 1.25rem; }
	.stored ul { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }

	/* ---------- the side panel ---------- */
	.side { position: sticky; top: 4rem; }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.9rem; line-height: 1.1; margin: 0 0 0.25rem; }
	.side p { margin: 0 0 0.75rem; }
	.muted-note { color: var(--steel); }
	.small { font-size: 0.85rem; }
	.warn { color: var(--rust); }
	.bad { color: var(--bad); }
	.yield { margin: 0.75rem 0 0.25rem; color: var(--steel); }
	.yield strong { font-family: var(--display); font-size: 2.6rem; line-height: 1; color: var(--brass); margin-right: 0.3rem; }
	.breakdown { list-style: none; margin: 0 0 0.9rem; padding: 0; color: var(--steel); font-size: 0.9rem; }
	.actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 0.5rem 0 0.75rem; }

	.rules { margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem; font-size: 0.92rem; }
	.rules summary { cursor: pointer; color: var(--brass); font-weight: 700; }
	.rules p { margin: 0.6rem 0; }
	.rules dl { margin: 0.5rem 0; }
	.rules dt { font-weight: 700; margin-top: 0.5rem; }
	.rules dd { margin: 0.1rem 0 0; color: var(--steel); }

	.catalog { list-style: none; padding: 0; margin: 0.5rem 0 0; max-height: 70vh; overflow: auto; border-top: 1px solid var(--border); }
	.catalog li {
		display: grid;
		grid-template-columns: 1.6rem minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}
	.catalog li.off .k-emoji, .catalog li.off .k-main, .catalog li.off .k-out { opacity: 0.5; }
	.k-emoji { font-size: 1.3rem; }
	.k-main { display: grid; }
	.k-detail { color: var(--steel); font-size: 0.82rem; }
	.k-out { color: var(--steel); font-size: 0.85rem; white-space: nowrap; }
</style>
