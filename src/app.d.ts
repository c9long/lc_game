/// <reference types="@cloudflare/workers-types" />
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/db/schema').User | null;
			sessionId: string | null;
		}
		interface Platform {
			env: {
				DB: D1Database;
				ASSETS: Fetcher;
				/** Signs session cookies and other tokens. 32 random bytes, hex. */
				AUTH_SECRET: string;
				/** AES-256-GCM key for encrypted rows in the settings table. 32 random bytes, hex. */
				SETTINGS_KEY: string;
				/** Present only while registering the first passkey; delete afterwards. */
				SETUP_TOKEN?: string;
				/** Public origin, e.g. https://lc-game.example.workers.dev. Used for WebAuthn. */
				ORIGIN?: string;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
