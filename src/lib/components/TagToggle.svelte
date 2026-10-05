<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	let { show }: { show: boolean } = $props();
	let busy = $state(false);

	// Saved per player; the pages reload their data so hidden tags are not even sent to the browser.
	async function toggle() {
		busy = true;
		try {
			await fetch('/api/settings/tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ show: !show })
			});
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<button class="tag-toggle" onclick={toggle} disabled={busy} title="Problem categories and topic tags are clues; hidden by default">
	{show ? 'Hide tags' : 'Show tags'}
</button>

<style>
	.tag-toggle { font-size: 0.8rem; padding: 0.15rem 0.5rem; }
</style>
