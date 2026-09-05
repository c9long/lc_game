import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';
import { decrypt, encrypt } from './crypto';

type KeyEnv = { SETTINGS_KEY: string };

export async function getSetting(db: Db, key: string, env?: KeyEnv): Promise<string | null> {
	const row = await db.select().from(settings).where(eq(settings.key, key)).get();
	if (!row) return null;
	if (!row.encrypted) return row.value;
	if (!env) throw new Error(`setting ${key} is encrypted; SETTINGS_KEY required`);
	return decrypt(row.value, env.SETTINGS_KEY);
}

export async function setSetting(
	db: Db,
	key: string,
	value: string,
	opts: { encrypted?: boolean; env?: KeyEnv } = {}
): Promise<void> {
	const encrypted = Boolean(opts.encrypted);
	if (encrypted && !opts.env) throw new Error('SETTINGS_KEY required to store an encrypted setting');
	const stored = encrypted ? await encrypt(value, opts.env!.SETTINGS_KEY) : value;
	const now = new Date();
	await db
		.insert(settings)
		.values({ key, value: stored, encrypted, updatedAt: now })
		.onConflictDoUpdate({ target: settings.key, set: { value: stored, encrypted, updatedAt: now } });
}

export async function deleteSetting(db: Db, key: string): Promise<void> {
	await db.delete(settings).where(eq(settings.key, key));
}
