<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<h1>Admin</h1>

<div class="grid two">
	<section class="card">
		<h2>Profile</h2>
		<form method="POST" action="?/profile" use:enhance>
			<label>LeetCode username <input name="lcUsername" value={data.user.lcUsername} placeholder="for profile sync" /></label>
			<label>Timezone <input name="timezone" value={data.user.timezone} /></label>
			<button class="primary">Save</button>
			{#if form?.profile}<span class="muted">{form.profile}</span>{/if}
		</form>
	</section>

	<section class="card">
		<h2>Sync</h2>
		<p class="muted">Pulls your last 20 accepted submissions from your public profile so solves made elsewhere still count. Runs automatically every 5 minutes when you open Today.{#if data.lastSyncAt} Last: {new Date(data.lastSyncAt).toLocaleString()}.{/if}</p>
		<form method="POST" action="?/sync" use:enhance><button>Sync now</button> {#if form?.sync}<span class="muted">{form.sync}</span>{/if}</form>
	</section>

	<section class="card">
		<h2>Security</h2>
		<p>{data.passkeyCount} passkey{data.passkeyCount === 1 ? '' : 's'} registered. <a href="/auth/register">Add another device</a> (works while signed in).</p>
		{#if data.setupTokenPresent}<div class="banner">SETUP_TOKEN is still set. Delete it now that a passkey exists: <code>wrangler secret delete SETUP_TOKEN</code>.</div>{/if}
		<form method="POST" action="?/signOutEverywhere" use:enhance><button class="danger">Sign out everywhere</button> {#if form?.sessions}<span class="muted">{form.sessions}</span>{/if}</form>
	</section>
</div>

<style>
	form { display: grid; gap: 0.6rem; margin-top: 0.5rem; }
	label { display: grid; gap: 0.25rem; }
</style>
