<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import ResourceBar from '$lib/components/ResourceBar.svelte';
	let { data, children } = $props();
	const links = [
		['/', 'Today'],
		['/tree', 'Tech tree'],
		['/drills', 'Drills'],
		['/city', 'City'],
		['/admin', 'Admin']
	];
	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head><title>LC Game</title></svelte:head>

<div class="shell">
	{#if data.user}
		<nav class="top">
			<span class="brand">⚙ Commit City</span>
			{#each links as [href, label] (href)}
				<a {href} aria-current={current(href) ? 'page' : undefined}>{label}</a>
			{/each}
			<form method="POST" action="/auth/logout"><button type="submit">Log out</button></form>
		</nav>
	{/if}
	{#if data.showResourceBar}<ResourceBar resources={data.resources} />{/if}
	<main>{@render children()}</main>
</div>
