<script lang="ts">
	import { onMount } from 'svelte';
	import type * as Monaco from 'monaco-editor';

	let {
		value = $bindable(''),
		language = 'python',
		completion = true,
		onrun,
		onsubmit
	}: { value?: string; language?: string; completion?: boolean; onrun?: () => void; onsubmit?: () => void } = $props();

	/** Everything Monaco offers that writes or suggests code for you. Hover and syntax colouring stay. */
	function completionOptions(on: boolean): Monaco.editor.IEditorOptions & Monaco.editor.IGlobalEditorOptions {
		return {
			quickSuggestions: on,
			suggestOnTriggerCharacters: on,
			wordBasedSuggestions: on ? 'currentDocument' : 'off',
			parameterHints: { enabled: on },
			acceptSuggestionOnEnter: on ? 'on' : 'off',
			tabCompletion: on ? 'on' : 'off',
			snippetSuggestions: on ? 'inline' : 'none',
			inlineSuggest: { enabled: on }
		};
	}

	let host: HTMLDivElement;
	let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
	let monaco: typeof Monaco | undefined;
	let applying = false;
	let loadError = $state('');

	// Monaco's AMD build is served from /monaco/vs (copied by scripts/copy-monaco.mjs).
	function loadMonaco(): Promise<typeof Monaco> {
		const w = window as unknown as {
			monaco?: typeof Monaco;
			require?: any;
			MonacoEnvironment?: unknown;
			__monacoLoading?: Promise<typeof Monaco>;
		};
		if (w.monaco) return Promise.resolve(w.monaco);
		if (w.__monacoLoading) return w.__monacoLoading;
		w.__monacoLoading = new Promise((resolve, reject) => {
			// The AMD build derives its worker URL from the configured `vs` path; no MonacoEnvironment needed.
			const s = document.createElement('script');
			s.src = '/monaco/vs/loader.js';
			s.onerror = () => reject(new Error('could not load /monaco/vs/loader.js'));
			s.onload = () => {
				w.require.config({ paths: { vs: '/monaco/vs' } });
				w.require(['vs/editor/editor.main'], () => resolve(w.monaco!), reject);
			};
			document.head.appendChild(s);
		});
		return w.__monacoLoading;
	}

	onMount(() => {
		let disposed = false;
		loadMonaco()
			.then((m) => {
				if (disposed) return;
				monaco = m;
				editor = m.editor.create(host, {
					value,
					language,
					theme: 'vs-dark',
					automaticLayout: true,
					minimap: { enabled: false },
					fontSize: 14,
					tabSize: 4,
					insertSpaces: language !== 'go',
					scrollBeyondLastLine: false,
					...completionOptions(completion)
				});
				editor.onDidChangeModelContent(() => {
					if (applying || !editor) return;
					value = editor.getValue();
				});
				editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => onrun?.());
				editor.addCommand(m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.Enter, () => onsubmit?.());
			})
			.catch((e) => (loadError = e instanceof Error ? e.message : String(e)));
		return () => {
			disposed = true;
			editor?.dispose();
		};
	});

	// The autocomplete toggle applies live, without recreating the editor or losing its state.
	$effect(() => {
		const on = completion;
		editor?.updateOptions(completionOptions(on));
	});

	// External value changes (language switch, reset to starter) flow into the editor.
	$effect(() => {
		const v = value;
		if (editor && editor.getValue() !== v) {
			applying = true;
			editor.setValue(v);
			applying = false;
		}
	});
	$effect(() => {
		const lang = language;
		if (editor && monaco) {
			const model = editor.getModel();
			if (model) monaco.editor.setModelLanguage(model, lang);
			editor.updateOptions({ insertSpaces: lang !== 'go' });
		}
	});
</script>

<div class="editor" bind:this={host}>
	{#if loadError}<p class="muted">Editor failed to load: {loadError}</p>{/if}
</div>

<style>
	.editor { width: 100%; height: 100%; min-height: 420px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
</style>
