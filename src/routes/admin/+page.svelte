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
			<label class="row"><input type="checkbox" name="hasPremium" checked={data.user.hasPremium} /> I have LeetCode Premium (count Premium problems)</label>
			<button class="primary">Save</button>
			{#if form?.profile}<span class="muted">{form.profile}</span>{/if}
		</form>
	</section>

	<section class="card">
		<h2>LeetCode connection</h2>
		{#if data.lc.connected}
			<p class="{data.lc.status?.ok ? 'ok' : ''}">Cookie stored · {data.lc.status?.ok ? `valid as ${data.lc.status.username}` : `invalid${data.lc.status?.error ? `: ${data.lc.status.error}` : ''}`}{#if data.lc.status?.checkedAt} · checked {new Date(data.lc.status.checkedAt).toLocaleString()}{/if}</p>
			<div class="row">
				<form method="POST" action="?/recheck" use:enhance><button>Re-check</button></form>
				<form method="POST" action="?/clearCookie" use:enhance><button class="danger">Remove cookie</button></form>
			</div>
		{:else}
			<p class="muted">Not connected. Run and Submit are disabled until you paste your cookie.</p>
		{/if}
		<form method="POST" action="?/cookie" use:enhance>
			<label>LEETCODE_SESSION <input name="session" autocomplete="off" placeholder="from leetcode.com cookies" /></label>
			<label>csrftoken <input name="csrf" autocomplete="off" /></label>
			<button class="primary">Validate and save</button>
			{#if form?.cookie}<span class="muted">{form.cookie}</span>{/if}
		</form>
		<p class="muted small">Log in at leetcode.com, open DevTools → Application → Cookies, copy the two values. They are stored encrypted with SETTINGS_KEY and only used to call LeetCode's judge on your behalf.</p>
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
	label.row { grid-auto-flow: column; justify-content: start; }
	.ok { color: var(--good); }
	.small { font-size: 0.85rem; }
</style>
