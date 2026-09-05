<script lang="ts">
	let { data } = $props();
	const pct = $derived(Math.min(100, Math.round((data.weekly / data.budget) * 100)));
	const kindLabel: Record<string, string> = { new: 'New', refresh: 'Refresh', daily: 'Daily ×2', drills: 'Forge' };
</script>

<h1>Today <span class="muted">{data.today}</span></h1>

{#if !data.lc.connected}
	<div class="banner">LeetCode is not connected. Run and Submit need your session cookie: <a href="/admin">paste it in Admin</a>.</div>
{:else if !data.lc.ok}
	<div class="banner">Your LeetCode cookie looks expired or invalid{data.lc.error ? ` (${data.lc.error})` : ''}. <a href="/admin">Reconnect in Admin</a>.</div>
{/if}
{#if data.sync.error}
	<div class="banner">Profile sync failed: {data.sync.error}</div>
{/if}
{#if data.tickCoins > 0}
	<div class="toast">🪙 +{data.tickCoins} coins produced while you were away</div>
{/if}

<div class="grid two">
	<section class="card">
		<h2>Expedition</h2>
		{#if data.plan.length === 0}
			<p class="muted">Nothing to plan yet. Solve anything from the <a href="/tree">tech tree</a>.</p>
		{/if}
		{#each data.plan as item (item.slot)}
			<div class="row plan-item" class:done={item.done}>
				<span class="slot">{item.slot}</span>
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
		<h2>Weekly budget</h2>
		<div class="bar"><span style="width: {pct}%"></span></div>
		<p><strong>{data.weekly}</strong> / {data.budget} solves in the last 7 days · morale <strong>{Math.round(data.morale.morale)}</strong> · freeze days {data.morale.freezeDays}</p>
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
