<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { build, fmtBuild } from '$lib/version.svelte';
	import ResourceBar from '$lib/components/ResourceBar.svelte';
	let { data, children } = $props();
	const links = $derived([
		['/', 'Today'],
		['/tree', 'Tech tree'],
		['/drills', 'Drills'],
		['/city', 'City'],
		['/settings', 'Settings'],
		...(data.user?.isAdmin ? [['/admin', 'Admin']] : [])
	]);
	// Once a new version is deployed, the next navigation loads it properly rather than carrying
	// on with client code that no longer matches the server and the judge worker.
	beforeNavigate(({ willUnload, to }) => {
		if (build.outdated && !willUnload && to?.url) location.href = to.url.href;
	});
	onMount(() => build.start());
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
	{#if build.outdated}
		<div class="banner updated">
			A new version of the app is out, and this page is still running the old one
			<span class="muted">(this page: built {fmtBuild(build.page)} · server: built {fmtBuild(build.server)})</span>.
			<button onclick={() => location.reload()}>Reload</button>
		</div>
	{/if}
	{#if data.showResourceBar}<ResourceBar resources={data.resources} />{/if}
	<main>{@render children()}</main>
</div>

<style>
	.banner.updated { display: flex; gap: 0.8rem; align-items: center; margin: 0.6rem 0; }
</style>
