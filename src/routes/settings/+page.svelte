<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<h1>Settings <span class="muted">{data.profile.name}</span></h1>

<div class="grid two">
	<section class="card">
		<h2>Profile</h2>
		<form method="POST" action="?/profile" use:enhance>
			<label>Timezone <input name="timezone" value={data.profile.timezone} /></label>
			<button class="primary">Save</button>
			{#if form?.profile}<span class="muted">{form.profile}</span>{/if}
		</form>
	</section>

	<section class="card">
		<h2>Passkeys</h2>
		<ul class="keys">
			{#each data.passkeys as p (p.id)}
				<li class="row">
					<span>{p.deviceName ?? 'unnamed device'} <span class="muted">· added {new Date(p.createdAt).toLocaleDateString()}</span></span>
					{#if data.passkeys.length > 1}
						<form method="POST" action="?/removePasskey" use:enhance><input type="hidden" name="id" value={p.id} /><button class="danger">Remove</button></form>
					{/if}
				</li>
			{/each}
		</ul>
		<p><a href="/auth/register">Add another device</a></p>
		{#if form?.passkeys}<span class="muted">{form.passkeys}</span>{/if}
	</section>

	<section class="card">
		<h2>Sessions</h2>
		<form method="POST" action="?/signOutMine" use:enhance><button class="danger">Sign out all my devices</button> {#if form?.sessions}<span class="muted">{form.sessions}</span>{/if}</form>
	</section>
</div>

<style>
	form { display: grid; gap: 0.6rem; margin-top: 0.5rem; }
	label { display: grid; gap: 0.25rem; }
	.keys { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
	.keys .row { justify-content: space-between; }
	.keys form { margin: 0; }
</style>
