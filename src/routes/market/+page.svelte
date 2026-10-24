<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { MATERIALS, priceOf, type Material, type Payment } from '$lib/game/market';
	import { emojiFor, labelFor } from '$lib/game/resources';
	let { data } = $props();

	let get = $state<Material>('stone');
	let give = $state<Payment>('coins');
	let amount = $state(10);
	let busy = $state(false);
	let message = $state('');
	let done = $state('');

	const tz = $derived(data.user?.timezone ?? 'UTC');
	const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
	const name = (k: string) => labelFor(k).toLowerCase();
	const fmt = (n: number) => (n < 10 ? n.toFixed(2) : n.toFixed(1));

	/** Where a price sits on the player's band, 0 (cheapest it gets) to 1 (dearest), base at 0.5. */
	function place(m: Material): number {
		const r = Math.log(data.quotes[m] / data.base[m]);
		const lo = Math.log(data.band.min);
		const hi = Math.log(data.band.max);
		return Math.min(1, Math.max(0, (r - lo) / (hi - lo)));
	}

	// You can pay with coins or with either of the other two materials; never with what you are getting.
	const payWith = $derived<Payment[]>(['coins', ...MATERIALS.filter((m) => m !== get)]);
	$effect.pre(() => {
		if (give === get) give = 'coins';
	});

	const qty = $derived(Number.isInteger(amount) && amount > 0 ? amount : 0);
	const cost = $derived(qty ? priceOf(get, qty, give, data.quotes) : 0);
	const room = $derived(data.room[get]);
	const have = $derived(data.held[give]);
	const problem = $derived(
		!qty ? 'Enter how many to get.'
		: qty > room ? `You can get ${room} more ${get} before ${clock(data.repriceAt)}.`
		: cost > have ? `You have ${have} ${name(give)}.`
		: ''
	);

	/** The most of `get` that both the cap and the player's purse allow. */
	function most() {
		let n = room;
		while (n > 0 && priceOf(get, n, give, data.quotes) > have) n--;
		amount = n;
	}

	async function trade() {
		if (problem || busy) return;
		busy = true;
		message = '';
		done = '';
		try {
			const r = await fetch('/api/market/trade', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ get, give, amount: qty, expect: cost })
			});
			const j = (await r.json()) as { message?: string; error?: string; cost?: number; received?: number };
			await invalidateAll();
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'The trade failed.');
			done = `Got ${j.received} ${emojiFor(get)} ${get} for ${j.cost} ${emojiFor(give)} ${name(give)}.`;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// Quotes change on the hour: fetch the new ones then rather than offer a stale price.
	$effect(() => {
		const wait = data.hourEndsAt - Date.now() + 1500;
		const t = setTimeout(() => invalidateAll(), Math.max(1000, wait));
		return () => clearTimeout(t);
	});

	const ago = (d: Date | string) => {
		const t = new Date(d);
		const today = new Date().toDateString() === t.toDateString();
		return today ? clock(t.getTime()) : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: tz });
	};
</script>

<svelte:head><title>Market · Commit City</title></svelte:head>

<div class="market">
	<h1>Market</h1>
	<p class="sub">
		Buy materials with coins, or swap one for another. Your prices follow your own stock: what you have plenty of is
		cheap, and what you're short of costs more. Prices reset at <strong>{clock(data.repriceAt)}</strong>, and drift a
		little every hour until then.
	</p>

	<ol class="board" aria-label="Your prices this hour">
		{#each MATERIALS as m, i (m)}
			{@const at = place(m)}
			{@const trend = data.prev ? data.fair[m] - data.prev[m] : 0}
			<li>
				<span class="what"><span class="emoji" aria-hidden="true">{emojiFor(m)}</span>{labelFor(m)}</span>
				<span class="price"><strong>{fmt(data.quotes[m])}</strong> coins each</span>
				<span class="gauge" role="img" aria-label="{Math.round((data.quotes[m] / data.base[m]) * 100)}% of its usual value of {fmt(data.base[m])} coins">
					<span class="band">
						<span class="fill" class:low={at < 0.5} style:left="{Math.min(at, 0.5) * 100}%" style:width="{Math.abs(at - 0.5) * 100}%"></span>
						<span class="base"></span>
						<span class="needle" class:low={at < 0.5} class:high={at > 0.5} style:left="{at * 100}%"></span>
					</span>
					{#if i === 0}<span class="ends"><span>cheap for you</span><span>dear for you</span></span>{/if}
				</span>
				{#if data.prev && Math.abs(trend) >= 0.01}
					<span class="note trend" class:up={trend > 0}>{trend > 0 ? 'Up' : 'Down'} from {fmt(data.prev[m])} at the last reset.</span>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="lower">
		<section class="trade" aria-labelledby="trade-h">
			<h2 id="trade-h">Trade</h2>
			<form class="sentence" onsubmit={(e) => { e.preventDefault(); trade(); }}>
				<label>Get <input type="number" min="1" max={room} step="1" bind:value={amount} aria-label="How many" /></label>
				<select bind:value={get} aria-label="Material to get">
					{#each MATERIALS as m (m)}<option value={m}>{emojiFor(m)} {name(m)}</option>{/each}
				</select>
				<label>for
					<select bind:value={give} aria-label="Pay with">
						{#each payWith as p (p)}<option value={p}>{emojiFor(p)} {name(p)}</option>{/each}
					</select>
				</label>
			</form>
			<p class="total">
				{#if qty}<strong>{cost}</strong> {emojiFor(give)} {name(give)}{:else}&nbsp;{/if}
			</p>
			<p class="fine">
				{#if give === 'coins'}At this hour's price.{:else}At this hour's prices, less 10% for the swap.{/if}
				You have {have} {name(give)}, and can get {room} more {get} before {clock(data.repriceAt)}.
				<button type="button" class="link" onclick={most} disabled={room === 0}>Get as many as I can</button>
			</p>
			<button class="primary" onclick={trade} disabled={busy || Boolean(problem)}>
				{give === 'coins' ? `Buy ${qty || ''} ${get}` : `Swap ${cost || ''} ${give} for ${qty || ''} ${get}`}
			</button>
			{#if problem && qty}<p class="err">{problem}</p>{/if}
			{#if message}<p class="err">{message}</p>{/if}
			{#if done}<p class="ok">{done}</p>{/if}
			<p class="fine">Coins buy materials but materials don't sell for coins. Ingots and essence aren't traded.</p>
		</section>

		<section class="history" aria-labelledby="history-h">
			<h2 id="history-h">Your trades</h2>
			{#if data.trades.length}
				<ul>
					{#each data.trades as t, i (i)}
						<li>
							<span>{t.getAmount} {emojiFor(t.getKind)} {name(t.getKind)} for {t.giveAmount} {emojiFor(t.giveKind)} {name(t.giveKind)}</span>
							<span class="when">{ago(t.createdAt)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="fine">No trades yet. What you buy or swap shows up here.</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.market { line-height: 1.5; }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 1rem 0 0.4rem;
	}
	.sub { margin: 0 0 1.75rem; color: var(--steel); max-width: 44rem; }
	.sub strong { color: var(--text); }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.75rem; line-height: 1.1; margin: 0 0 0.6rem; }

	/* ---------- the board: one row per material ---------- */
	.board { list-style: none; margin: 0 0 2.5rem; padding: 0; border-top: 2px solid var(--border); }
	.board li {
		display: grid;
		grid-template-columns: 9rem 11rem minmax(12rem, 1fr);
		grid-template-areas: 'what price gauge' 'what price note';
		column-gap: 2rem;
		align-items: center;
		padding: 1rem 0;
		border-bottom: 1px solid var(--border);
	}
	.what { grid-area: what; font-family: var(--display); font-weight: 700; font-size: 1.6rem; }
	.emoji { margin-right: 0.45rem; }
	.price { grid-area: price; color: var(--steel); white-space: nowrap; }
	.price strong {
		font-family: var(--display);
		font-weight: 800;
		font-size: 3rem;
		line-height: 1;
		color: var(--brass);
		margin-right: 0.35rem;
		font-variant-numeric: tabular-nums;
	}
	.gauge { grid-area: gauge; display: grid; gap: 0.2rem; max-width: 30rem; }
	.band { position: relative; height: 10px; background: var(--panel-2); border-radius: 2px; }
	.fill { position: absolute; top: 0; bottom: 0; background: var(--rust); opacity: 0.55; }
	.fill.low { background: var(--verdigris); }
	.base { position: absolute; left: 50%; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--steel); }
	.needle {
		position: absolute;
		top: -6px;
		bottom: -6px;
		width: 4px;
		margin-left: -2px;
		border-radius: 2px;
		background: var(--text);
	}
	.needle.low { background: var(--verdigris); }
	.needle.high { background: var(--rust); }
	.ends { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--steel); }
	.note { grid-area: note; font-size: 0.92rem; margin-top: 0.35rem; }
	.trend { color: var(--verdigris); }
	.trend.up { color: var(--rust); }

	/* ---------- trade and history ---------- */
	.lower { display: grid; grid-template-columns: minmax(0, 34rem) minmax(16rem, 1fr); gap: 3rem; align-items: start; }
	.sentence { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; font-size: 1.25rem; }
	.sentence label { display: inline-flex; align-items: center; gap: 0.6rem; }
	.sentence input { width: 5.5rem; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
	.sentence select { font-size: 1.1rem; }
	.sentence :is(input, select):focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
	.total { margin: 1rem 0 0; font-size: 1.1rem; color: var(--steel); }
	.total strong { font-family: var(--display); font-weight: 800; font-size: 2.6rem; line-height: 1; color: var(--text); margin-right: 0.2rem; }
	.fine { color: var(--steel); font-size: 0.92rem; margin: 0.4rem 0 0.9rem; }
	.link { background: none; border: 0; padding: 0; color: var(--brass); font-size: inherit; }
	.link:hover:not(:disabled) { text-decoration: underline; }
	.err { color: var(--rust); margin: 0.6rem 0 0; }
	.ok { color: var(--verdigris); margin: 0.6rem 0 0; }
	.history ul { list-style: none; margin: 0; padding: 0; }
	.history li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
	.history li:first-child { border-top: 1px solid var(--border); }
	.when { color: var(--steel); font-size: 0.9rem; white-space: nowrap; }

	@media (max-width: 760px) {
		.board li {
			grid-template-columns: 1fr auto;
			grid-template-areas: 'what price' 'gauge gauge' 'note note';
			row-gap: 0.6rem;
		}
		.price strong { font-size: 2.4rem; }
		.gauge { max-width: none; }
		.lower { grid-template-columns: 1fr; gap: 2rem; }
	}
</style>
