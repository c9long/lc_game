import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes SQL migrations to ./drizzle; wrangler applies them to D1 (local or remote).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite'
});
