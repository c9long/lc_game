import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Db = DrizzleD1Database<typeof schema>;

export function getDb(platform: App.Platform | undefined): Db {
	const binding = platform?.env?.DB;
	if (!binding) {
		throw new Error('D1 binding "DB" is missing. Check wrangler.toml and the adapter platformProxy option.');
	}
	return drizzle(binding, { schema });
}

export function getEnv(platform: App.Platform | undefined): App.Platform['env'] {
	if (!platform?.env) throw new Error('platform.env is missing');
	return platform.env;
}
