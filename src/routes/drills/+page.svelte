<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { data } = $props();

	let idx = $state(0);
	let answer = $state('');
	let busy = $state(false);
	let feedback = $state<null | { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; explain: string | null; note: string | null; ingots: number; setDone: boolean }>(null);
	let message = $state('');

	const remaining = $derived(data.drills.filter((d) => d.answered === undefined));
	const current = $derived(remaining[0] ?? null);
	const answeredCount = $derived(data.drills.length - remaining.length);
	const correctCount = $derived(data.drills.filter((d) => d.answered === true).length);

	async function submit() {
		if (!current || busy || !answer.trim()) return;
		busy = true;
		message = '';
		try {
			const r = await fetch('/api/drills/answer', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ drillId: current.id, answer })
			});
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			feedback = j;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function next() {
		feedback = null;
		answer = '';
		await invalidateAll();
	}

	/** Enter advances whichever card is showing feedback, wherever focus happens to be.
	 *  Submitting replaces the input with the feedback banner, so focus lands on nothing and the
	 *  element-level handlers never saw the keypress. */
	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		if (feedback) {
			e.preventDefault();
			void next();
		} else if (practiceFeedback) {
			e.preventDefault();
			void nextPractice();
		}
	}

	/** Each answer box is created fresh when a card's feedback clears, so focusing it as it is
	 *  created puts the cursor in it after Next (or Enter) with no click. */
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (feedback) next();
			else submit();
		}
	}

	// --- unlimited practice, unlocked once the day's set is done ---
	// Nothing here is scored or recorded: the counters are per-session only, and `seen` just keeps
	// the server from handing back a drill twice in a row until the bank wraps.
	type PracticeDrill = { id: string; kind: string; module: string; context: string | null; code: string; hint: string | null; variant: number };

	let practice = $state<PracticeDrill | null>(null);
	let practiceAnswer = $state('');
	let practiceBusy = $state(false);
	let practiceFeedback = $state<null | { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; explain: string | null; note: string | null }>(null);
	let practiceDone = $state(0);
	let practiceCorrect = $state(0);
	let seen = $state<string[]>([]);

	async function loadPractice() {
		practiceBusy = true;
		message = '';
		try {
			const q = seen.length ? `?exclude=${encodeURIComponent(seen.join(','))}` : '';
			const r = await fetch(`/api/drills/practice${q}`);
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			practice = j.drill;
			seen = [...seen, j.drill.id];
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
			practice = null;
		} finally {
			practiceBusy = false;
		}
	}

	async function startPractice() {
		practiceFeedback = null;
		practiceAnswer = '';
		await loadPractice();
	}

	async function submitPractice() {
		if (!practice || practiceBusy || !practiceAnswer.trim()) return;
		practiceBusy = true;
		message = '';
		try {
			const r = await fetch('/api/drills/practice', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ drillId: practice.id, answer: practiceAnswer, variant: practice.variant })
			});
			const j = (await r.json()) as any;
			if (!r.ok) throw new Error(j.message ?? j.error ?? 'failed');
			practiceFeedback = j;
			practiceDone += 1;
			if (j.correct) practiceCorrect += 1;
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			practiceBusy = false;
		}
	}

	async function nextPractice() {
		practiceFeedback = null;
		practiceAnswer = '';
		await loadPractice();
	}

	function stopPractice() {
		practice = null;
		practiceFeedback = null;
		practiceAnswer = '';
	}

	// One language per set, so its prefix on every module name says nothing.
	const oneLang = $derived(new Set(data.modules.map((m) => m.key.split('/')[0])).size === 1);
	const moduleName = (key: string) => (oneLang ? key.slice(key.indexOf('/') + 1) : key);
	const question = (kind: string) => (kind === 'cloze' ? 'What fills the blank?' : 'What does this print?');

	function onPracticeKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (practiceFeedback) nextPractice();
			else submitPractice();
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<svelte:head><title>Drills · Commit City</title></svelte:head>

{#snippet prompt(d: { kind: string; module: string; context: string | null; code: string; hint: string | null })}
	{#if d.context}<pre class="ctx">{d.context}</pre>{/if}
	<pre class="code">{d.code}</pre>
	{#if d.kind === 'cloze' && d.hint}<p class="hint">It produces <code>{d.hint}</code></p>{/if}
{/snippet}

{#snippet verdict(f: { correct: boolean; expected: string; alternatives: string[]; url: string; api: string | null; explain: string | null; note: string | null }, ingots: number)}
	<div class="verdict" class:right={f.correct}>
		<p class="call">
			{#if f.correct}Right.{#if ingots > 0}{' '}<span class="gain">+{ingots} {ingots === 1 ? 'ingot' : 'ingots'}</span>{/if}{:else}Not quite. The answer is <code>{f.expected}</code>.{/if}
		</p>
		{#if f.alternatives.length}<p class="aside">Also accepted: {#each f.alternatives as a, i (a)}{i ? ', ' : ''}<code>{a}</code>{/each}</p>{/if}
		{#if f.note}<p class="aside">{f.note}</p>{/if}
		{#if f.explain}
			<details class="explain">
				<summary>Why</summary>
				<p>{f.explain}</p>
			</details>
		{/if}
		<p class="aside">In the docs: <a href={f.url} target="_blank" rel="noreferrer">{f.api ?? 'the reference page'}</a></p>
	</div>
{/snippet}

<div class="drills">
	{#if message}<div class="banner">{message}</div>{/if}

	<div class="layout">
		<section class="bench">
			{#if data.drills.length === 0}
				<h1>No drills yet.</h1>
				<p class="lede">The drill bank is empty. Run <code>python3 scripts/mine-python-docs.py</code> and redeploy.</p>
			{:else}
				<div class="set">
					<span class="set-label">Today's set{data.lang ? `, ${data.lang}` : ''}</span>
					<ol class="punch" aria-label="{answeredCount} of {data.drills.length} answered, {correctCount} right">
						{#each data.drills as d (d.id)}
							<!-- The answer just checked counts at once, before Next reloads the set. -->
							{@const just = feedback && current?.id === d.id ? feedback.correct : undefined}
							<li class:right={(just ?? d.answered) === true} class:missed={(just ?? d.answered) === false} class:now={current?.id === d.id && just === undefined}></li>
						{/each}
					</ol>
				</div>

				{#if !current}
					<h1>Set done: {correctCount} of {data.drills.length} right.</h1>
					<p class="lede">
						{data.setIngots} {data.setIngots === 1 ? 'ingot' : 'ingots'} forged today. A new set comes tomorrow, and the ones you
						missed come back sooner.
					</p>
					{#if data.practiceUnlocked && data.practicePool > 0}
						<div class="practice">
							<h2>Practice</h2>
							{#if !practice}
								<p class="lede">
									{data.practicePool} more {data.practicePool === 1 ? 'drill' : 'drills'} in the bank. Practice forges no ingots and
									leaves your schedule alone, so tomorrow's set is unaffected.
								</p>
								<button class="primary" onclick={startPractice} disabled={practiceBusy}>{practiceBusy ? 'Loading…' : 'Start practising'}</button>
							{:else}
								<p class="meta">{practiceCorrect} of {practiceDone} right this session, from {moduleName(`${data.lang}/${practice.module}`)}</p>
								<h3>{question(practice.kind)}</h3>
								{@render prompt(practice)}
								{#if !practiceFeedback}
									<div class="answer">
										<input
											{@attach focusOnMount}
											bind:value={practiceAnswer}
											onkeydown={onPracticeKey}
											placeholder={practice.kind === 'cloze' ? 'the missing name' : 'the output'}
											autocomplete="off"
											spellcheck="false"
											aria-label="Your answer"
										/>
										<button class="primary" onclick={submitPractice} disabled={practiceBusy || !practiceAnswer.trim()}>Check</button>
									</div>
								{:else}
									{@render verdict(practiceFeedback, 0)}
									<div class="answer">
										<button class="primary" onclick={nextPractice} onkeydown={onPracticeKey}>Next drill</button>
										<button onclick={stopPractice}>Stop practising</button>
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				{:else}
					<p class="meta">Drill {answeredCount + 1} of {data.drills.length}, from {moduleName(`${data.lang}/${current.module}`)}</p>
					<h1>{question(current.kind)}</h1>
					{@render prompt(current)}
					{#if !feedback}
						<div class="answer">
							<input
								{@attach focusOnMount}
								bind:value={answer}
								onkeydown={onkey}
								placeholder={current.kind === 'cloze' ? 'the missing name' : 'the output'}
								autocomplete="off"
								spellcheck="false"
								aria-label="Your answer"
							/>
							<button class="primary" onclick={submit} disabled={busy || !answer.trim()}>Check</button>
						</div>
					{:else}
						{@render verdict(feedback, feedback.ingots)}
						<div class="answer">
							<button class="primary" onclick={next} onkeydown={onkey}>{remaining.length > 1 ? 'Next drill' : 'Finish the set'}</button>
							<span class="key">or press Enter</span>
						</div>
					{/if}
				{/if}
			{/if}
		</section>

		<aside class="ledger">
			<p class="ingots"><strong>{data.ingots}</strong> {data.ingots === 1 ? 'ingot' : 'ingots'}</p>
			<p class="note">
				Each right answer forges 1 ingot, and a perfect set adds 2. Ingots pay for building upgrades.
				{#if data.ingotMultiplier > 1}Your monuments multiply each answer by {data.ingotMultiplier}.{/if}
				{#if data.dueCount > 0}<span class="due">{data.dueCount} {data.dueCount === 1 ? 'drill is' : 'drills are'} due for review.</span>{/if}
			</p>
			<h2>Modules</h2>
			<ul class="modules">
				{#each data.modules as m (m.key)}
					<li>
						<span class="name">{moduleName(m.key)}</span>
						<span class="meter" aria-hidden="true">
							<span class="seen" style:width="{(100 * m.seen) / m.total}%"></span>
							<span class="mastered" style:width="{(100 * m.mastered) / m.total}%"></span>
						</span>
						<span class="of">{m.mastered} of {m.total}</span>
					</li>
				{/each}
			</ul>
			<p class="note small">The bar shows drills seen; the solid part, drills mastered.</p>
		</aside>
	</div>
</div>

<style>
	.drills { line-height: 1.5; }
	.layout { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: 3rem; align-items: start; }

	/* ---------- the bench: today's set ---------- */
	.set { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 0.75rem 0 1.5rem; }
	.set-label { color: var(--steel); }
	.punch { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; }
	.punch li { width: 1.1rem; height: 1.1rem; border: 2px solid var(--border); border-radius: 3px; }
	.punch li.right { background: var(--brass); border-color: var(--brass); }
	.punch li.missed { background: var(--rust); border-color: var(--rust); }
	.punch li.now { border-color: var(--brass); }

	.meta { margin: 0; color: var(--steel); }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 0.2rem 0 1rem;
		text-wrap: balance;
	}
	h3 { font-family: var(--display); font-weight: 700; font-size: 1.9rem; line-height: 1.1; margin: 0.3rem 0 0.75rem; }
	.lede { color: var(--steel); max-width: 40rem; margin: 0 0 1rem; }

	pre { font-size: 1.05rem; line-height: 1.55; padding: 0.9rem 1.1rem; margin: 0 0 0.75rem; border-radius: 4px; }
	pre.code { background: var(--panel); border-left: 4px solid var(--brass); }
	pre.ctx { background: none; color: var(--steel); padding: 0 1.1rem; border-left: 4px solid var(--border); }
	.hint { margin: 0 0 1rem; color: var(--steel); }

	.answer { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 1rem; }
	.answer input {
		flex: 1 1 16rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 1.05rem;
		padding: 0.6rem 0.8rem;
	}
	.answer input:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
	.key { color: var(--steel); font-size: 0.9rem; }

	.verdict { margin-top: 1rem; padding-left: 1.1rem; border-left: 4px solid var(--rust); }
	.verdict.right { border-left-color: var(--brass); }
	.call { margin: 0 0 0.3rem; font-family: var(--display); font-weight: 700; font-size: 1.6rem; line-height: 1.2; }
	.call code { font-size: 0.8em; }
	.gain { color: var(--brass); }
	.aside { margin: 0 0 0.3rem; color: var(--steel); }
	.aside a { color: var(--brass); }
	.explain { margin: 0.4rem 0; }
	.explain summary { cursor: pointer; color: var(--brass); }
	.explain p { margin: 0.4rem 0 0; max-width: 40rem; }

	.practice { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.75rem; line-height: 1.1; margin: 0 0 0.5rem; }

	/* ---------- the ledger: ingots and modules ---------- */
	.ledger { padding-top: 0.75rem; }
	.ingots { margin: 0; color: var(--steel); }
	.ingots strong { font-family: var(--display); font-size: 3rem; line-height: 1; color: var(--brass); margin-right: 0.2rem; }
	.note { color: var(--steel); font-size: 0.95rem; margin: 0.4rem 0 1.5rem; }
	.note.small { font-size: 0.85rem; margin-top: 0.75rem; }
	.due { color: var(--rust); font-weight: 700; }
	.modules { list-style: none; margin: 0; padding: 0; }
	.modules li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 5rem 3.75rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.95rem;
	}
	.meter { position: relative; height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
	.seen { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--brass) 35%, transparent); }
	.mastered { position: absolute; inset: 0 auto 0 0; background: var(--brass); }
	.of { color: var(--steel); text-align: right; font-variant-numeric: tabular-nums; font-size: 0.85rem; }

	@media (max-width: 900px) {
		.layout { grid-template-columns: 1fr; gap: 2rem; }
		.ledger { border-top: 1px solid var(--border); padding-top: 1.25rem; }
	}
</style>
