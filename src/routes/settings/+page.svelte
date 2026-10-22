<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	// Editable copy of the saved zone, reset from the server whenever the page data reloads.
	let timezone = $state('');
	$effect.pre(() => {
		timezone = data.profile.timezone;
	});
	// Every zone the browser knows, for the field's suggestions, and this device's own zone, which
	// is offered as a one-click fix when it differs from the saved one.
	let zones = $state<string[]>([]);
	let deviceZone = $state('');
	onMount(() => {
		try {
			zones = Intl.supportedValuesOf('timeZone');
		} catch {}
		deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	const added = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<svelte:head><title>Settings · Commit City</title></svelte:head>

<div class="settings">
	<h1>Settings</h1>
	<p class="who">Signed in as {data.profile.name}.</p>

	<section>
		<h2>Timezone</h2>
		<p class="why">Your day turns over at midnight here: a new route, and refreshes coming due.</p>
		<form method="POST" action="?/profile" use:enhance class="zone">
			<input name="timezone" bind:value={timezone} list="zones" autocomplete="off" spellcheck="false" aria-label="Timezone" />
			<datalist id="zones">{#each zones as z (z)}<option value={z}></option>{/each}</datalist>
			<button class="primary">Save timezone</button>
		</form>
		{#if deviceZone && deviceZone !== timezone}
			<button class="quiet" onclick={() => (timezone = deviceZone)}>Use this device's timezone, {deviceZone}</button>
		{/if}
		{#if form?.profile}<p class="result" class:bad={form.profile !== 'saved'}>{form.profile === 'saved' ? 'Timezone saved.' : `Not saved: ${form.profile}.`}</p>{/if}
	</section>

	<section>
		<h2>Passkeys</h2>
		<p class="why">Each device you sign in with has its own passkey.</p>
		<ul class="keys">
			{#each data.passkeys as p (p.id)}
				<li>
					<span class="device">{p.deviceName ?? 'Unnamed device'}</span>
					<span class="added">Added {added(p.createdAt)}</span>
					{#if data.passkeys.length > 1}
						<form method="POST" action="?/removePasskey" use:enhance>
							<input type="hidden" name="id" value={p.id} />
							<button class="danger">Remove</button>
						</form>
					{/if}
				</li>
			{:else}
				<li class="none">No passkeys on this account yet.</li>
			{/each}
		</ul>
		<a class="add" href="/auth/register">Add another device</a>
		{#if form?.passkeys}<p class="result">{form.passkeys}</p>{/if}
	</section>

	<section>
		<h2>Devices</h2>
		<p class="why">Signs you out everywhere, this device included. You'll need a passkey to get back in.</p>
		<form method="POST" action="?/signOutMine" use:enhance>
			<button class="danger">Sign out all my devices</button>
		</form>
		{#if form?.sessions}<p class="result">{form.sessions}</p>{/if}
	</section>
</div>

<style>
	.settings { max-width: 40rem; line-height: 1.5; }
	h1 {
		font-family: var(--display);
		font-weight: 800;
		font-size: clamp(2.4rem, 5vw, 3.75rem);
		line-height: 1;
		margin: 1rem 0 0.4rem;
	}
	.who { margin: 0 0 1.5rem; color: var(--steel); }
	section { padding: 1.4rem 0 1.6rem; border-top: 1px solid var(--border); }
	h2 { font-family: var(--display); font-weight: 700; font-size: 1.75rem; line-height: 1.1; margin: 0 0 0.25rem; }
	.why { margin: 0 0 0.9rem; color: var(--steel); }
	.zone { display: flex; gap: 0.6rem; flex-wrap: wrap; }
	.zone input { flex: 1 1 14rem; }
	.quiet { margin-top: 0.6rem; background: none; border: 0; padding: 0; color: var(--brass); }
	.quiet:hover:not(:disabled) { text-decoration: underline; }
	.result { margin: 0.6rem 0 0; color: var(--steel); }
	.result.bad { color: var(--rust); }
	.keys { list-style: none; margin: 0 0 0.9rem; padding: 0; }
	.keys li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}
	.keys li:first-child { border-top: 1px solid var(--border); }
	.device { font-weight: 700; }
	.added { color: var(--steel); font-size: 0.9rem; }
	.keys form { margin: 0; }
	.none { color: var(--steel); }
	.add { color: var(--brass); font-weight: 700; }
</style>
