<script lang="ts">
	let { data } = $props();
	const W = 190, H = 130, R = 34;
	const pos = (n: { row: number; col: number }) => ({ x: n.col * W + 110, y: n.row * H + 70 });
	const width = $derived(Math.max(...data.nodes.map((n) => n.col)) * W + 240);
	const height = $derived(Math.max(...data.nodes.map((n) => n.row)) * H + 150);
	const byId = $derived(new Map(data.nodes.map((n) => [n.id, n])));
	const color: Record<string, string> = { locked: '#3a3f4f', available: '#6cb6ff', unlocked: '#f2b544', complete: '#4cd37b' };
	const ring = 2 * Math.PI * R;
</script>

<h1>Tech tree <span class="muted">{data.totalSolves} solved</span></h1>
<p class="muted">Solve half of a node's problems to unlock it. The ring shows freshness: solved problems that are not overdue. Rusting nodes halve their buildings' output.</p>

<div class="atlas card">
	<svg viewBox="0 0 {width} {height}" {width} {height}>
		{#each data.nodes as n (n.id)}
			{#each n.requires as r (r)}
				{@const a = pos(byId.get(r)!)}
				{@const b = pos(n)}
				<line x1={a.x} y1={a.y + R} x2={b.x} y2={b.y - R} stroke={n.status === 'locked' ? '#2a2f3d' : '#4a5062'} stroke-width="2" />
			{/each}
		{/each}
		{#each data.nodes as n (n.id)}
			{@const p = pos(n)}
			<a href="/tree/{n.id}">
				<g class="node" class:locked={n.status === 'locked'}>
					<circle cx={p.x} cy={p.y} r={R} fill="#171a23" stroke={color[n.status]} stroke-width="3" />
					{#if n.solved > 0}
						<circle cx={p.x} cy={p.y} r={R + 6} fill="none" stroke={n.rusting ? '#ff8a5b' : '#4cd37b'} stroke-width="3"
							stroke-dasharray="{ring * n.freshness * ((R + 6) / R)} {ring * 2}" transform="rotate(-90 {p.x} {p.y})" opacity="0.9" />
					{/if}
					<text x={p.x} y={p.y + 5} text-anchor="middle" font-size="13" fill="#e6e8ef" font-weight="700">{n.solved}/{n.total}</text>
					<text x={p.x} y={p.y + R + 22} text-anchor="middle" font-size="12" fill={n.status === 'locked' ? '#6b7186' : '#e6e8ef'}>{n.pattern}</text>
					{#if n.due > 0}<text x={p.x + R - 4} y={p.y - R + 4} font-size="11" fill="#ff8a5b">⟳{n.due}</text>{/if}
				</g>
			</a>
		{/each}
	</svg>
</div>

<style>
	.atlas { overflow: auto; }
	.node:hover circle { filter: brightness(1.3); }
	svg a { text-decoration: none; }
</style>
