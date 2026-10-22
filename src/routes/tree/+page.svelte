<script lang="ts">
	let { data } = $props();

	type Node = (typeof data.nodes)[number];

	const byId = $derived(new Map(data.nodes.map((n) => [n.id, n])));
	const totalProblems = $derived(data.nodes.reduce((s, n) => s + n.total, 0));
	const due = $derived(data.nodes.reduce((s, n) => s + n.due, 0));

	/** Solves needed to unlock a pattern: half of it, rounded up (UNLOCK_FRACTION in tree.ts). */
	const threshold = (n: Node) => Math.ceil(n.total / 2);
	/** A pattern carries the line onward once it is unlocked and its own line is open. */
	const leads = (n: Node | undefined) => !!n && (n.status === 'unlocked' || n.status === 'complete') && n.prereqsMet;
	const open = (n: Node) => n.status !== 'locked' && n.prereqsMet;

	const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
	const word = (n: number) => WORDS[n] ?? String(n);
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

	/** The nearest unlock, as a sentence: "Two more Two Pointers problems open three new
	 *  patterns." Prefers the open pattern needing the fewest solves, then the one opening most. */
	const headline = $derived.by(() => {
		const candidates = data.nodes
			.filter((n) => open(n) && n.status === 'available')
			.map((n) => {
				const opens = data.nodes.filter(
					(c) => !c.prereqsMet && c.requires.includes(n.id) && c.requires.every((r) => r === n.id || leads(byId.get(r)))
				);
				return { n, need: threshold(n) - n.solved, opens };
			})
			.sort((a, b) => a.need - b.need || b.opens.length - a.opens.length);
		const best = candidates.find((c) => c.opens.length) ?? candidates[0];
		if (!best) return data.nodes.every((n) => n.status === 'complete') ? 'Every pattern is complete.' : 'Every pattern is open.';
		const { n, need, opens } = best;
		const subject = `${cap(word(need))} more ${n.pattern} ${need === 1 ? 'problem' : 'problems'}`;
		const verb = need === 1 ? 'opens' : 'open';
		if (!opens.length) return `${subject} ${need === 1 ? 'unlocks' : 'unlock'} ${n.pattern}.`;
		if (opens.length <= 2) return `${subject} ${verb} ${opens.map((o) => o.pattern).join(' and ')}.`;
		return `${subject} ${verb} ${word(opens.length)} new patterns.`;
	});

	// ---------- map geometry ----------
	const W = 200; // column pitch
	const H = 130; // row pitch
	const R = 28; // station radius
	const PAD = 24;
	const at = (n: Node) => ({ x: n.col * W + W / 2, y: n.row * H + R + PAD });
	const cols = $derived(Math.max(...data.nodes.map((n) => n.col)) + 1);
	const rows = $derived(Math.max(...data.nodes.map((n) => n.row)) + 1);
	const width = $derived(cols * W);
	const height = $derived((rows - 1) * H + 2 * (R + PAD) + 24);

	/** Track from a prerequisite down to the pattern it opens: down, across on a lane, then down, with
	 *  rounded corners. Lanes are offset by column so unrelated lines never share a stretch. Lines
	 *  merging into one pattern from the row just above share that pattern's lane and join cleanly;
	 *  any other line keeps its parent's lane, so its drop never runs through a station. */
	function track(a: Node, b: Node): string {
		const p = at(a), q = at(b);
		if (p.x === q.x) return `M${p.x},${p.y + R} V${q.y - R}`;
		const merges = b.requires.length > 1 && b.row - a.row === 1;
		const lane = p.y + 76 + ((merges ? b.col : a.col) - 2) * 8;
		const d = q.x > p.x ? 1 : -1, c = 8;
		return `M${p.x},${p.y + R} V${lane - c} Q${p.x},${lane} ${p.x + d * c},${lane} H${q.x - d * c} Q${q.x},${lane} ${q.x},${lane + c} V${q.y - R}`;
	}
	const edges = $derived(
		data.nodes.flatMap((n) => n.requires.map((r) => ({ key: `${r}-${n.id}`, d: track(byId.get(r)!, n), lit: leads(byId.get(r)) })))
	);

	const C = 2 * Math.PI * R;
	/** Point on the ring at a fraction of the way round, clockwise from the top. */
	const onRing = (f: number, r: number) => ({ x: Math.sin(f * 2 * Math.PI) * r, y: -Math.cos(f * 2 * Math.PI) * r });
	const needs = (n: Node) => n.requires.filter((r) => !leads(byId.get(r))).map((r) => byId.get(r)!.pattern);
</script>

<svelte:head><title>Tech tree · Commit City</title></svelte:head>

<div class="tree">
	<header class="lede">
		<p class="tally">{data.totalSolves} of {totalProblems} problems solved</p>
		<h1>{headline}</h1>
		<p class="how">
			Solving half of a pattern opens the patterns below it. A pattern rusts when more than half of its solved problems
			are due for a refresh, and a rusting pattern's buildings make half as much.
			{#if due > 0}<span class="due">{due} {due === 1 ? 'refresh is' : 'refreshes are'} due.</span>{/if}
		</p>
	</header>

	<!-- Desktop and tablet: the rail map. -->
	<svg class="map" viewBox="0 0 {width} {height}" role="group" aria-label="Tech tree map">
		{#each edges.filter((e) => !e.lit) as e (e.key)}<path class="track" d={e.d} />{/each}
		{#each edges.filter((e) => e.lit) as e (e.key)}<path class="track lit" d={e.d} />{/each}
		{#each data.nodes as n (n.id)}
			{@const p = at(n)}
			{@const tick = onRing(threshold(n) / n.total, R)}
			<a
				href="/tree/{n.id}"
				class="station {n.status}"
				class:closed={!open(n)}
				class:rusting={n.rusting}
				aria-label="{n.pattern}: {n.solved} of {n.total} solved{n.due ? `, ${n.due} due` : ''}{open(n) ? '' : ', locked'}"
			>
				<circle class="focus" cx={p.x} cy={p.y} r={R + 8} />
				<circle class="bed" cx={p.x} cy={p.y} r={R} />
				{#if n.solved > 0 && n.status !== 'complete'}
					<circle
						class="arc"
						cx={p.x}
						cy={p.y}
						r={R}
						stroke-dasharray="{(C * n.solved) / n.total} {C}"
						transform="rotate(-90 {p.x} {p.y})"
					/>
				{/if}
				{#if n.status !== 'complete' && open(n)}
					<line class="tick" x1={p.x + tick.x * 0.78} y1={p.y + tick.y * 0.78} x2={p.x + tick.x * 1.22} y2={p.y + tick.y * 1.22} />
				{/if}
				<text class="count" x={p.x} y={p.y + 7}>{n.solved}/{n.total}</text>
				<text class="name" x={p.x} y={p.y + R + 20}>{n.pattern}</text>
				{#if n.due > 0}
					<circle class="badge" cx={p.x + R * 0.78} cy={p.y - R * 0.78} r="10" />
					<text class="badge-n" x={p.x + R * 0.78} y={p.y - R * 0.78 + 4}>{n.due}</text>
				{/if}
			</a>
		{/each}
	</svg>

	<!-- Phones: the same stations as a list, in tree order. -->
	<ol class="list">
		{#each data.nodes as n (n.id)}
			<li class="row {n.status}" class:closed={!open(n)} class:rusting={n.rusting}>
				<span class="dot" aria-hidden="true"></span>
				<a class="pattern" href="/tree/{n.id}">{n.pattern}</a>
				<span class="meter" aria-hidden="true">
					<span class="fill" style:width="{(100 * n.solved) / n.total}%"></span>
					<span class="half" style:left="{(100 * threshold(n)) / n.total}%"></span>
				</span>
				<span class="of">{n.solved} of {n.total}</span>
				<span class="note">
					{#if !open(n)}Needs {needs(n).join(' and ')}{:else if n.due > 0}<span class="due">{n.due} due</span>{#if n.rusting}, rusting{/if}{:else if n.status === 'complete'}Complete{:else if n.status === 'available'}{threshold(n) - n.solved} more to unlock{:else}Unlocked{/if}
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.tree {
		font-family: var(--body);
		line-height: 1.5;
		max-width: 64rem;
	}

	/* ---------- lede ---------- */
	.lede { margin: 1.5rem 0 1rem; max-width: 54rem; }
	.tally { margin: 0; color: var(--steel); }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.2rem, 4.6vw, 3.75rem);
		line-height: 0.98;
		letter-spacing: 0.005em;
		margin: 0.2rem 0 0.9rem;
		text-wrap: balance;
	}
	.how { margin: 0; color: var(--steel); max-width: 40rem; }
	.due { color: var(--rust); font-weight: 700; }

	/* ---------- map ---------- */
	.map { display: block; width: 100%; height: auto; max-width: 1000px; }
	.track { fill: none; stroke: var(--steel); stroke-width: 2; stroke-dasharray: 5 6; opacity: 0.45; }
	.track.lit { stroke: var(--brass); stroke-width: 3; stroke-dasharray: none; opacity: 1; }

	.station { cursor: pointer; }
	.station:hover { text-decoration: none; }
	.focus { fill: none; stroke: transparent; stroke-width: 2; }
	.station:focus-visible { outline: none; }
	.station:focus-visible .focus { stroke: var(--brass); }

	.bed { fill: var(--bg); stroke: var(--border); stroke-width: 5; }
	.arc { fill: none; stroke: var(--brass); stroke-width: 5; stroke-linecap: butt; }
	.rusting .arc { stroke: var(--rust); }
	.tick { stroke: var(--text); stroke-width: 2; opacity: 0.55; }
	.closed .bed { stroke: var(--border); stroke-dasharray: 4 5; }
	.complete .bed { fill: var(--brass); stroke: var(--brass); }
	.station:hover .bed { stroke: var(--steel); }
	.complete:hover .bed { stroke: var(--text); }

	.count {
		font-family: var(--display);
		font-weight: 700;
		font-size: 20px;
		text-anchor: middle;
		fill: var(--text);
	}
	.closed .count { fill: var(--steel); opacity: 0.7; }
	.complete .count { fill: #1a1200; }

	/* Names sit on a slate halo, so track running behind them never cuts through the letters. */
	.name {
		font-family: var(--body);
		font-size: 14px;
		font-weight: 700;
		text-anchor: middle;
		fill: var(--text);
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 6px;
		stroke-linejoin: round;
	}
	.closed .name { fill: var(--steel); font-weight: 400; }
	.station:hover .name { fill: var(--brass); }

	.badge { fill: var(--rust); stroke: var(--bg); stroke-width: 3; }
	.badge-n { font-family: var(--body); font-size: 12px; font-weight: 700; text-anchor: middle; fill: #1a0d06; }

	/* ---------- phone list ---------- */
	.list { display: none; list-style: none; margin: 0; padding: 0; }

	@media (max-width: 760px) {
		.map { display: none; }
		.list { display: block; }
		.row {
			display: grid;
			grid-template-columns: 1.25rem 1fr auto;
			grid-template-areas: 'dot pattern of' 'dot meter meter' 'dot note note';
			column-gap: 0.6rem;
			row-gap: 0.3rem;
			padding: 0.8rem 0;
			border-bottom: 1px solid var(--border);
		}
		.dot {
			grid-area: dot;
			margin-top: 0.3rem;
			width: 0.85rem;
			height: 0.85rem;
			border-radius: 50%;
			border: 3px solid var(--brass);
		}
		.closed .dot { border: 2px dashed var(--steel); opacity: 0.6; }
		.complete .dot { background: var(--brass); }
		.rusting .dot { border-color: var(--rust); }
		.pattern { grid-area: pattern; color: var(--text); font-weight: 700; }
		.closed .pattern { color: var(--steel); font-weight: 400; }
		.of { grid-area: of; color: var(--steel); font-variant-numeric: tabular-nums; }
		.meter { grid-area: meter; position: relative; height: 5px; background: var(--border); border-radius: 3px; }
		.fill { position: absolute; inset: 0 auto 0 0; background: var(--brass); border-radius: 3px; }
		.rusting .fill { background: var(--rust); }
		.half { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); opacity: 0.5; }
		.note { grid-area: note; color: var(--steel); font-size: 0.9rem; }
	}
</style>
