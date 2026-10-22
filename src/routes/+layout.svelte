<script lang="ts">
	// Self-hosted fonts (Fontsource): Big Shoulders Display for display type, Atkinson Hyperlegible
	// for reading. vite.config.ts keeps them out of SSR externalization so Node never imports a .css.
	import '@fontsource-variable/big-shoulders-display/wght';
	import '@fontsource/atkinson-hyperlegible/400';
	import '@fontsource/atkinson-hyperlegible/700';
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { build, fmtBuild } from '$lib/version.svelte';
	import ResourceBar from '$lib/components/ResourceBar.svelte';
	let { data, children } = $props();
	// The game on the left; the account on the right, quieter.
	const links = [
		['/', 'Today'],
		['/tree', 'Tech tree'],
		['/drills', 'Drills'],
		['/city', 'City']
	];
	const account = $derived([['/settings', 'Settings'], ...(data.user?.isAdmin ? [['/admin', 'Admin']] : [])]);
	// Once a new version is deployed, the next navigation loads it properly rather than carrying
	// on with client code that no longer matches the server and the judge worker.
	beforeNavigate(({ willUnload, to }) => {
		if (build.outdated && !willUnload && to?.url) location.href = to.url.href;
	});
	onMount(() => build.start());
	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head><title>Commit City</title></svelte:head>

<div class="shell">
	{#if data.user}
		<header class="masthead">
			<a class="brand" href="/"><span aria-hidden="true">⚙</span> Commit City</a>
			<nav class="game" aria-label="Game">
				{#each links as [href, label] (href)}
					<a {href} aria-current={current(href) ? 'page' : undefined}>{label}</a>
				{/each}
			</nav>
			<nav class="account" aria-label="Account">
				{#each account as [href, label] (href)}
					<a {href} aria-current={current(href) ? 'page' : undefined}>{label}</a>
				{/each}
				<form method="POST" action="/auth/logout"><button type="submit">Log out</button></form>
			</nav>
		</header>
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

	/* The bottom rule is track; the current page is the lit stretch of it. */
	.masthead {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'brand game account';
		align-items: stretch;
		column-gap: 2rem;
		border-bottom: 2px solid var(--border);
		margin-bottom: 1.25rem;
	}
	.brand {
		grid-area: brand;
		align-self: center;
		padding: 0.7rem 0;
		font-family: var(--display);
		font-weight: 800;
		font-size: 1.6rem;
		letter-spacing: 0.01em;
		color: var(--brass);
	}
	.brand:hover { text-decoration: none; color: var(--text); }
	nav { display: flex; align-items: stretch; gap: 1.4rem; }
	.game { grid-area: game; }
	.account { grid-area: account; gap: 1.1rem; }
	nav a, nav button {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--steel);
	}
	.game a { font-size: 1.05rem; }
	.account a, .account button { font-size: 0.9rem; }
	nav a:hover, nav button:hover { color: var(--text); text-decoration: none; }
	nav a[aria-current='page'] { color: var(--text); font-weight: 700; }
	nav a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -2px;
		height: 3px;
		background: var(--brass);
	}
	nav a:focus-visible, nav button:focus-visible, .brand:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; border-radius: 2px; }
	nav form { display: flex; margin: 0; }
	nav button { background: none; border: 0; padding: 0; border-radius: 0; font: inherit; }
	nav button:hover:not(:disabled) { border-color: transparent; }

	@media (max-width: 760px) {
		.masthead { grid-template-columns: 1fr auto; grid-template-areas: 'brand account' 'game game'; }
		.brand { font-size: 1.4rem; padding: 0.55rem 0 0.2rem; }
		.game { gap: 1.2rem; }
		.game a { padding: 0.55rem 0; }
	}
</style>
