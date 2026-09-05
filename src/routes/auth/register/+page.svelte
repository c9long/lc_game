<script lang="ts">
	import { startRegistration } from '@simplewebauthn/browser';
	import { goto } from '$app/navigation';
	let { data } = $props();
	let busy = $state(false);
	let message = $state('');
	let deviceName = $state('');
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');

	async function register() {
		busy = true;
		message = '';
		try {
			const q = `?token=${encodeURIComponent(data.token)}`;
			const optionsJSON = (await (await fetch(`/auth/register/options${q}`)).json()) as any;
			if (optionsJSON.error) throw new Error(optionsJSON.error);
			const attestation = await startRegistration({ optionsJSON });
			const r = await fetch(`/auth/register/verify${q}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ attestation, deviceName, timezone })
			});
			const out = (await r.json()) as any;
			if (!r.ok || !out.ok) throw new Error(out.error ?? 'registration failed');
			message = 'Passkey registered. Now delete the SETUP_TOKEN secret.';
			await goto('/admin');
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="card reg">
	<h1>Register a passkey</h1>
	{#if !data.allowed}
		<p>Registration is closed. Set the <code>SETUP_TOKEN</code> secret and open this page with <code>?token=…</code>, or sign in first to add another device.</p>
	{:else}
		<label>Device name <input bind:value={deviceName} placeholder="laptop, phone…" /></label>
		{#if !data.signedIn}
			<label>Timezone <input bind:value={timezone} /></label>
		{/if}
		<button class="primary" onclick={register} disabled={busy}>{busy ? 'Waiting…' : 'Create passkey'}</button>
	{/if}
	{#if message}<p class="muted">{message}</p>{/if}
</div>

<style>
	.reg { max-width: 460px; margin: 4rem auto; display: grid; gap: 0.8rem; }
	label { display: grid; gap: 0.3rem; }
</style>
