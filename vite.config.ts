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
			adapter: adapter({
				// Emulates D1 and secrets from wrangler.toml / .dev.vars during `vite dev`.
				platformProxy: { configPath: 'wrangler.toml', persist: { path: '.wrangler/state/v3' } }
			})
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
