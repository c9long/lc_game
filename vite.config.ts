import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// A tab left open across a deploy keeps running the old client code, while every judge run
			// starts a fresh worker from the server, which is the new one. The two disagreeing is what
			// broke custom testcases on 2026-09-24. The page notices through src/lib/version.svelte.ts,
			// which only counts a strictly newer build; SvelteKit's own poll is off because it flagged
			// any difference at all.
			version: { pollInterval: 0 },
			adapter: adapter({
				// Emulates D1 and secrets from wrangler.toml / .dev.vars during `vite dev`.
				platformProxy: {
					configPath: 'wrangler.toml',
					// LC_D1_STATE lets scripts/smoke.sh use a throwaway database directory.
					persist: { path: process.env.LC_D1_STATE ?? '.wrangler/state/v3' }
				}
			})
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
