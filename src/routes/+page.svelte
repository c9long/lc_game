<script lang="ts">
	import TagToggle from '$lib/components/TagToggle.svelte';

	let { data } = $props();

	type Item = (typeof data.plan)[number];

	const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five'];
	const count = (n: number, one: string, many: string) => `${NUMBERS[n] ?? n} ${n === 1 ? one : many}`;

	/** Today's route as a sentence, written from the plan itself: "One refresh, two new problems,
	 *  then the forge." The route is the day's job, so the headline says what it is. */
	const headline = $derived.by(() => {
		const plan = data.plan;
		if (plan.length === 0) return 'No route today yet.';
		if (plan.every((i) => i.done)) return "Today's route is done.";
		const refresh = plan.filter((i) => i.kind === 'refresh').length;
		const fresh = plan.filter((i) => i.kind === 'new').length;
		const daily = plan.some((i) => i.kind === 'daily');
		const forge = plan.some((i) => i.kind === 'drills');
		const parts: string[] = [];
		if (refresh) parts.push(count(refresh, 'refresh', 'refreshes'));
		if (fresh) parts.push(count(fresh, 'new problem', 'new problems'));
		if (daily) parts.push("the daily challenge");
		let s = parts.join(', ');
		if (forge) s = parts.length ? `${s}, then the forge` : 'The forge';
		return s.charAt(0).toUpperCase() + s.slice(1) + '.';
	});

	const date = $derived(
		new Date(`${data.today}T12:00:00Z`).toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		})
	);

	const KIND: Record<Item['kind'], string> = {
		new: 'New problem',
		refresh: 'Refresh',
		daily: 'Daily challenge, ×2',
		drills: 'Forge'
	};
	// Refreshes still on today's route are already shown above; the footer names only the rest.
	const dueElsewhere = $derived(Math.max(0, data.dueCount - data.plan.filter((i) => i.kind === 'refresh' && !i.done).length));
	const href = (i: Item) => (i.kind === 'drills' ? '/drills' : `/solve/${i.slug}`);

	/** How far along the route is lit: up to and including the last finished stop. */
	const lit = $derived(data.plan.reduce((n, i, idx) => (i.done ? idx + 1 : n), 0));

	/** A punch card has one square per problem offered. Past this many, a row of squares stops being
	 *  readable, and the numbers alone say it better. */
	const PUNCH_MAX = 28;
</script>

<svelte:head><title>Today · Commit City</title></svelte:head>

<div class="today">
	{#if data.tickCoins > 0}
		<div class="toast" role="status">🪙 Your city made {data.tickCoins} coins while you were away.</div>
	{/if}

	<header class="day">
		<p class="date">{date}</p>
		<h1>{headline}</h1>
	</header>

	<section class="route" aria-label="Today's route">
		{#if data.plan.length === 0}
			<p class="empty">Nothing is planned yet. Pick any problem from the <a href="/tree">tech tree</a> to start.</p>
		{:else}
			<ol class="stops" style="--stops: {data.plan.length}; --lit: {lit}">
				{#each data.plan as item, i (item.slot)}
					<li class="stop" class:done={item.done} class:forge={item.kind === 'drills'} class:reached={i < lit}>
						<span class="marker" aria-hidden="true">
							{#if item.done}<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>{:else if item.kind === 'drills'}⚒{:else}{i + 1}{/if}
						</span>
						<span class="kind">{KIND[item.kind]}{#if item.done}<span class="sr-only">, done</span>{/if}</span>
						<a class="title" href={href(item)}>{item.title}</a>
						<span class="meta">
							{#if item.difficulty}<span class="difficulty {item.difficulty}">{item.difficulty}</span>{/if}
							{#if item.pattern && item.kind !== 'drills'}<span class="pattern">{item.pattern}</span>{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/if}
		<div class="route-foot">
			<p>
				{#if dueElsewhere > 0}
					<span class="due">{dueElsewhere} more {dueElsewhere === 1 ? 'refresh is' : 'refreshes are'} due</span> beyond today's route. Solves off the route count too.
				{:else}
					Nothing else is due today.
				{/if}
			</p>
			<TagToggle show={data.showTags} />
		</div>
	</section>

	<div class="lower">
		<section class="week" aria-labelledby="week-h">
			<h2 id="week-h">This week</h2>
			{#each [{ label: 'New problems', t: data.expedition.fresh, metal: 'brass' }, { label: 'Refreshes', t: data.expedition.refresh, metal: 'verdigris' }] as row (row.label)}
				<div class="tally">
					<span class="tally-label">{row.label}</span>
					{#if row.t.offered > 0 && row.t.offered <= PUNCH_MAX}
						<span class="punch {row.metal}" aria-hidden="true">
							{#each Array.from({ length: row.t.offered }, (_, k) => k < row.t.done) as filled, k (k)}
								<span class="hole" class:filled></span>
							{/each}
						</span>
					{/if}
					<span class="tally-count"><strong>{row.t.done}</strong> of {row.t.offered}</span>
				</div>
			{/each}
			<p class="note">
				Out of what your routes offered over the last 7 days, counting a skipped day as missed.
				{data.weekly} {data.weekly === 1 ? 'solve' : 'solves'} in all, extras included.
			</p>
			<p class="note">Your city makes {data.production} coins on each day you solve something.</p>
		</section>

		<section class="tree" aria-labelledby="tree-h">
			<h2 id="tree-h">Tech tree</h2>
			{#if data.rusting.length}
				<h3>Rusting</h3>
				<ul class="nodes">
					{#each data.rusting as n (n.id)}
						<li class="node rust">
							<a href="/tree/{n.id}">{n.pattern}</a>
							<span class="due">{n.due} due</span>
						</li>
					{/each}
				</ul>
			{/if}
			<h3>Open now</h3>
			{#if data.frontier.length === 0}
				<p class="note">Every open topic is finished. New ones unlock from the <a href="/tree">tech tree</a>.</p>
			{/if}
			<ul class="nodes">
				{#each data.frontier as n (n.id)}
					<li class="node">
						<a href="/tree/{n.id}">{n.pattern}</a>
						<span class="meter" aria-hidden="true"><span style="width: {Math.round((n.solved / Math.max(1, n.total)) * 100)}%"></span></span>
						<span class="frac">{n.solved} of {n.total}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</div>

<style>
	.today {
		--brass: var(--accent);
		--verdigris: #5fb3a1;
		--rust: #c9683c;
		--steel: var(--muted);
		--ember: var(--warn);
		--display: 'Big Shoulders Display Variable', 'Big Shoulders Display', 'Arial Narrow', sans-serif;
		--body: 'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif;
		font-family: var(--body);
		font-size: 1rem;
		line-height: 1.5;
		max-width: 72rem;
	}

	/* ---------- the day ---------- */
	.day { margin: 1.5rem 0 2rem; }
	.date { margin: 0; color: var(--steel); font-size: 1rem; }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5.2vw, 4.25rem);
		line-height: 0.98;
		letter-spacing: 0.005em;
		margin: 0.35rem 0 0;
		max-width: 22ch;
		text-wrap: balance;
	}

	/* ---------- the route ---------- */
	.route { padding-bottom: 1.6rem; border-bottom: 1px solid var(--border); }
	.stops {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--stops), minmax(0, 1fr));
		gap: 0 1.25rem;
		position: relative;
	}
	/* The track runs behind the markers; the brass part covers the stops already reached. */
	.stops::before,
	.stops::after {
		content: '';
		position: absolute;
		top: 1.25rem;
		left: 1.25rem;
		height: 3px;
		border-radius: 3px;
	}
	.stops::before {
		right: calc((100% + 1.25rem) / var(--stops) - 1.25rem);
		background: repeating-linear-gradient(90deg, var(--border) 0 10px, transparent 10px 16px);
	}
	.stops::after {
		width: calc((100% + 1.25rem) / var(--stops) * max(0, var(--lit) - 1));
		background: var(--brass);
		transform-origin: left;
		animation: lay-track 900ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}
	@keyframes lay-track { from { transform: scaleX(0); } }

	.stop { position: relative; display: grid; gap: 0.15rem; align-content: start; min-width: 0; }
	.marker {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		margin-bottom: 0.7rem;
		position: relative;
		z-index: 1;
		background: var(--bg);
		border: 3px solid var(--border);
		color: var(--steel);
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.25rem;
	}
	.stop.reached .marker,
	.stop.done .marker { border-color: var(--brass); }
	.stop.done .marker { background: var(--brass); color: #1a1200; }
	.stop.forge:not(.done) .marker { border-color: var(--ember); color: var(--ember); font-size: 1.1rem; }
	.marker svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

	.kind { color: var(--steel); font-size: 0.9rem; }
	.title {
		color: var(--text);
		font-weight: 700;
		font-size: 1.15rem;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.title:hover { color: var(--brass); text-decoration: none; }
	.title:focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; border-radius: 2px; }
	.stop.done .title { color: var(--steel); }
	.meta { display: flex; flex-wrap: wrap; gap: 0.2rem 0.75rem; font-size: 0.9rem; color: var(--steel); }
	.difficulty.Easy { color: var(--easy); }
	.difficulty.Medium { color: var(--medium); }
	.difficulty.Hard { color: var(--hard); }

	.route-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 1.6rem;
		color: var(--steel);
	}
	.route-foot p { margin: 0; max-width: 60ch; }
	.due { color: var(--rust); font-weight: 700; }
	.empty { margin: 0; font-size: 1.15rem; }

	/* ---------- below the route ---------- */
	.lower {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 3rem;
		margin-top: 1.8rem;
	}
	h2 {
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.75rem;
		line-height: 1.1;
		margin: 0 0 1rem;
	}
	h3 { font-size: 1rem; font-weight: 700; color: var(--steel); margin: 1.2rem 0 0.4rem; }
	h2 + h3 { margin-top: 0; }
	.note { color: var(--steel); font-size: 0.95rem; margin: 0.8rem 0 0; max-width: 60ch; }

	.tally {
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem 0;
	}
	.tally-label { font-weight: 700; }
	.tally-count { color: var(--steel); white-space: nowrap; }
	.tally-count strong { font-family: var(--display); font-size: 1.6rem; color: var(--text); font-weight: 800; margin-right: 0.15rem; }
	/* One square per problem offered; filled when it was solved. */
	.punch { display: flex; flex-wrap: wrap; gap: 4px; }
	.hole { width: 0.85rem; height: 0.85rem; border-radius: 2px; border: 1.5px solid var(--border); }
	.punch.brass .hole.filled { background: var(--brass); border-color: var(--brass); }
	.punch.verdigris .hole.filled { background: var(--verdigris); border-color: var(--verdigris); }

	.nodes { list-style: none; margin: 0; padding: 0; }
	.node {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 6rem auto;
		align-items: center;
		gap: 0.9rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}
	.node.rust { grid-template-columns: minmax(0, 1fr) auto; }
	.node a { color: var(--text); }
	.node a:hover { color: var(--brass); text-decoration: none; }
	.node.rust a { color: var(--rust); }
	.meter { height: 6px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
	.meter span { display: block; height: 100%; background: var(--brass); }
	.frac { color: var(--steel); font-size: 0.9rem; white-space: nowrap; }

	.toast { font-family: var(--body); }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

	/* ---------- small screens: the route runs down the page ---------- */
	@media (max-width: 760px) {
		.stops { grid-template-columns: 1fr; gap: 1.1rem; }
		.stops::before,
		.stops::after { display: none; }
		.stop { grid-template-columns: 2.5rem minmax(0, 1fr); column-gap: 0.9rem; }
		.marker { grid-row: span 3; margin: 0; }
		.stop:not(:last-child) .marker::after {
			content: '';
			position: absolute;
			top: 100%;
			left: 50%;
			width: 3px;
			height: 1.3rem;
			transform: translateX(-50%);
			background: var(--border);
		}
		.stop.reached:not(:last-child) .marker::after { background: var(--brass); }
		.lower { grid-template-columns: 1fr; gap: 2rem; }
		.tally { grid-template-columns: 1fr auto; }
		.punch { grid-column: 1 / -1; grid-row: 2; }
	}

	@media (prefers-reduced-motion: reduce) {
		.stops::after { animation: none; }
	}
</style>
