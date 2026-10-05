<script lang="ts">
	import TagToggle from '$lib/components/TagToggle.svelte';
	let { data } = $props();
	const pct = (t: { done: number; offered: number }) => (t.offered ? Math.min(100, Math.round((t.done / t.offered) * 100)) : 0);
	const kindLabel: Record<string, string> = { new: 'New', refresh: 'Refresh', daily: 'Daily ×2', drills: 'Forge' };
</script>

<h1>Today <span class="muted">{data.today}</span></h1>

{#if data.sync.error}
	<div class="banner">Profile sync failed: {data.sync.error}</div>
{/if}
{#if data.tickCoins > 0}
	<div class="toast">🪙 +{data.tickCoins} coins produced while you were away</div>
{/if}

<div class="grid two">
	<section class="card">
		<h2 class="row">Expedition <TagToggle show={data.showTags} /></h2>
		{#if data.plan.length === 0}
			<p class="muted">Nothing to plan yet. Solve anything from the <a href="/tree">tech tree</a>.</p>
		{/if}
		{#each data.plan as item, i (item.slot)}
			<div class="row plan-item" class:done={item.done}>
				<span class="slot">{i + 1}</span>
				{#if item.difficulty}<span class="pill {item.difficulty}">{item.difficulty}</span>{/if}
				<span class="pill">{kindLabel[item.kind]}</span>
				<a href={item.kind === 'drills' ? '/drills' : `/solve/${item.slug}`}><strong>{item.title}</strong></a>
				{#if item.pattern}<span class="muted">{item.pattern}</span>{/if}
				{#if item.done}<span class="done-mark">✓ done</span>{/if}
			</div>
		{/each}
		<p class="muted">Extra solves count too. {data.dueCount > 0 ? `${data.dueCount} refresh${data.dueCount === 1 ? '' : 'es'} due.` : 'No refreshes due.'}</p>
	</section>

	<section class="card">
		<h2>Last 7 days</h2>
		<div class="bar"><span style="width: {pct(data.expedition.fresh)}%"></span></div>
		<p><strong>{data.expedition.fresh.done}</strong> / {data.expedition.fresh.offered} new problems</p>
		<div class="bar"><span style="width: {pct(data.expedition.refresh)}%"></span></div>
		<p><strong>{data.expedition.refresh.done}</strong> / {data.expedition.refresh.offered} refreshes</p>
		<p class="muted">Out of what your expeditions offered. {data.weekly} solve{data.weekly === 1 ? '' : 's'} in all, extras included.</p>
		<p class="muted">City produces {data.production} coins per active day. Total solved: {data.totalSolves}.</p>
		<div class="row">
			{#each Object.entries(data.resources).filter(([k]) => !k.startsWith('essence:')) as [k, v] (k)}
				<span class="pill">{k} {v}</span>
			{/each}
		</div>
	</section>

	<section class="card">
		<h2>Frontier</h2>
		{#each data.frontier as n (n.id)}
			<div class="row"><a href="/tree/{n.id}">{n.pattern}</a> <span class="muted">{n.solved}/{n.total} · {n.status}</span></div>
		{/each}
		{#if data.rusting.length}
			<h3>Rusting</h3>
			{#each data.rusting as n (n.id)}
				<div class="row"><a href="/tree/{n.id}">{n.pattern}</a> <span class="muted">{n.due} due</span></div>
			{/each}
		{/if}
	</section>
</div>

<style>
	.plan-item { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
	.plan-item.done { opacity: 0.6; }
	.slot { width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--panel-2); display: inline-grid; place-items: center; font-weight: 700; }
	.done-mark { color: var(--good); margin-left: auto; }
</style>
