<script lang="ts">
	/**
	 * A confirmation card, replacing window.confirm().
	 *
	 * Built on <dialog> deliberately: showModal() gives focus trapping, Escape-to-dismiss, inert
	 * background and the top layer for free, which a hand-rolled overlay div has to reimplement and
	 * usually gets wrong.
	 */
	let {
		open = $bindable(false),
		title,
		body = '',
		note = '',
		confirmLabel = 'Confirm',
		destructive = false,
		onconfirm
	}: {
		open?: boolean;
		title: string;
		body?: string;
		note?: string;
		confirmLabel?: string;
		destructive?: boolean;
		onconfirm?: () => void;
	} = $props();

	let el = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});

	function confirm() {
		open = false;
		onconfirm?.();
	}
</script>

<dialog bind:this={el} onclose={() => (open = false)} oncancel={() => (open = false)}>
	<h3>{title}</h3>
	{#if body}<p>{body}</p>{/if}
	{#if note}<p class="note">{note}</p>{/if}
	<div class="row actions">
		<button onclick={() => (open = false)}>Cancel</button>
		<button class={destructive ? 'destructive' : 'primary'} onclick={confirm}>{confirmLabel}</button>
	</div>
</dialog>

<style>
	dialog {
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.2rem 1.4rem;
		max-width: min(30rem, calc(100vw - 2rem));
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
	}
	dialog::backdrop { background: rgba(0, 0, 0, 0.55); }
	dialog p { margin: 0.4rem 0; }
	.note { color: var(--muted); font-size: 0.9rem; }
	.actions { margin-top: 1.1rem; justify-content: flex-end; }
</style>
