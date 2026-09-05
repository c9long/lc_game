<script lang="ts">
	import { startAuthentication } from '@simplewebauthn/browser';
	import { goto } from '$app/navigation';
	let { data } = $props();
	let busy = $state(false);
	let message = $state('');

	async function signIn() {
		busy = true;
		message = '';
		try {
			const optionsJSON = (await (await fetch('/auth/login/options')).json()) as any;
			if (optionsJSON.error) throw new Error(optionsJSON.error);
			const assertion = await startAuthentication({ optionsJSON });
			const r = await fetch('/auth/login/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(assertion)
			});
			const out = (await r.json()) as any;
			if (!r.ok || !out.ok) throw new Error(out.error ?? 'sign-in failed');
			await goto(data.next.startsWith('/') ? data.next : '/');
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="card login">
	<h1>⚙ Commit City</h1>
	{#if data.hasPasskey}
		<p>Sign in with your passkey.</p>
		<button class="primary" onclick={signIn} disabled={busy}>{busy ? 'Waiting for passkey…' : 'Sign in'}</button>
	{:else}
		<p>No passkey is registered yet. Open <code>/auth/register?token=SETUP_TOKEN</code> using the token you set as a secret.</p>
	{/if}
	{#if message}<p class="muted">{message}</p>{/if}
</div>

<style>
	.login { max-width: 420px; margin: 4rem auto; text-align: center; }
</style>
