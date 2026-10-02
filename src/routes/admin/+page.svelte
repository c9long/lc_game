<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<h1>Admin</h1>

<div class="grid two">
	<section class="card">
		<h2>Invite a player</h2>
		<p class="muted">Makes a single-use sign-up link, valid for 7 days. The player gets their own account and progress, and no access to this page.</p>
		<form method="POST" action="?/invite" use:enhance>
			<label>Name <input name="name" placeholder="who it is for" autocomplete="off" /></label>
			<button class="primary">Create invite link</button>
		</form>
		{#if form?.invite && form?.inviteName}
			<p>Send this to {form.inviteName}. It is shown only once:</p>
			<input class="link" readonly value={form.invite} onfocus={(e) => e.currentTarget.select()} />
		{:else if form?.invite}
			<p class="muted">{form.invite}</p>
		{/if}
		{#if data.pending.length}
			<h3>Pending</h3>
			<ul class="list">
				{#each data.pending as inv (inv.tokenHash)}
					<li class="row">
						<span>{inv.name} <span class="muted">· expires {new Date(inv.expiresAt).toLocaleDateString()}</span></span>
						<form method="POST" action="?/revoke" use:enhance><input type="hidden" name="tokenHash" value={inv.tokenHash} /><button class="danger">Revoke</button></form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card">
		<h2>Players</h2>
		<ul class="list">
			{#each data.players as p (p.id)}
				<li>{p.name || 'unnamed'}{#if p.isAdmin} <span class="muted">· admin</span>{/if} <span class="muted">· joined {new Date(p.createdAt).toLocaleDateString()}</span></li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<h2>Security</h2>
		{#if data.setupTokenPresent}<div class="banner">SETUP_TOKEN is still set. Delete it: <code>wrangler secret delete SETUP_TOKEN</code>. (It only works while there are no players, but there is no reason to keep it.)</div>{/if}
		<form method="POST" action="?/signOutEverywhere" use:enhance><button class="danger">Sign out every player</button> {#if form?.sessions}<span class="muted">{form.sessions}</span>{/if}</form>
	</section>
</div>

<style>
	form { display: grid; gap: 0.6rem; margin-top: 0.5rem; }
	label { display: grid; gap: 0.25rem; }
	.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
	.list .row { justify-content: space-between; }
	.list form { margin: 0; }
	.link { width: 100%; font-family: var(--mono, monospace); }
</style>
