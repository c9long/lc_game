import type { Db } from '../db';
import { deleteSetting, getSetting, setSetting } from '../settings';
import { fetchUserStatus, type LcAuth } from './client';

const KEY_SESSION = 'lc.session';
const KEY_CSRF = 'lc.csrf';
const KEY_STATUS = 'lc.status';

type Env = { SETTINGS_KEY: string };

export async function getLcAuth(db: Db, env: Env): Promise<LcAuth | null> {
	const session = await getSetting(db, KEY_SESSION, env);
	const csrf = await getSetting(db, KEY_CSRF, env);
	return session && csrf ? { session, csrf } : null;
}

export async function setLcAuth(db: Db, env: Env, auth: LcAuth): Promise<void> {
	await setSetting(db, KEY_SESSION, auth.session, { encrypted: true, env });
	await setSetting(db, KEY_CSRF, auth.csrf, { encrypted: true, env });
	await setSetting(db, KEY_STATUS, JSON.stringify({ ok: true, checkedAt: Date.now() }));
}

export async function clearLcAuth(db: Db): Promise<void> {
	await deleteSetting(db, KEY_SESSION);
	await deleteSetting(db, KEY_CSRF);
	await deleteSetting(db, KEY_STATUS);
}

export interface LcStatus {
	ok: boolean;
	username?: string | null;
	checkedAt: number;
	error?: string;
}

export async function getLcStatus(db: Db): Promise<LcStatus | null> {
	const raw = await getSetting(db, KEY_STATUS);
	return raw ? (JSON.parse(raw) as LcStatus) : null;
}

export async function markLcStatus(db: Db, status: Omit<LcStatus, 'checkedAt'>): Promise<void> {
	await setSetting(db, KEY_STATUS, JSON.stringify({ ...status, checkedAt: Date.now() }));
}

/** Calls LeetCode to confirm the cookie is still a signed-in session. Never throws. */
export async function validateLcAuth(auth: LcAuth): Promise<{ ok: boolean; username: string | null; error?: string }> {
	try {
		const s = await fetchUserStatus(auth);
		return { ok: s.isSignedIn, username: s.username, error: s.isSignedIn ? undefined : 'not signed in' };
	} catch (e) {
		return { ok: false, username: null, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Parses a raw cookie header or "name=value; ..." blob pasted from DevTools into LcAuth. */
export function parseCookieBlob(session: string, csrf: string): LcAuth | null {
	const pick = (s: string, name: string) => {
		const m = s.match(new RegExp(`(?:^|;\\s*)${name}=([^;\\s]+)`));
		return m ? m[1] : s.trim();
	};
	const sess = pick(session, 'LEETCODE_SESSION');
	const tok = pick(csrf, 'csrftoken');
	if (!sess || !tok || sess.length < 20 || tok.length < 10) return null;
	return { session: sess, csrf: tok };
}
