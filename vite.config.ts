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
			// broke custom testcases on 2026-09-24. Polling lets the page notice and reload.
			version: { pollInterval: 5 * 60_000 },
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
