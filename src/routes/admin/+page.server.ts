import { fail } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { passkeys, users } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { deleteAllSessions } from '$lib/server/auth/session';
import { clearLcAuth, getLcAuth, getLcStatus, markLcStatus, parseCookieBlob, setLcAuth, validateLcAuth } from '$lib/server/leetcode/auth';
import { fetchUserExists } from '$lib/server/leetcode/client';
import { syncRecentAc } from '$lib/server/game/sync';
import { getState } from '$lib/server/game/state';
import { isValidTimeZone } from '$lib/game/dates';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const env = getEnv(platform);
	const [{ n }] = await db.select({ n: count() }).from(passkeys);
	return {
		user: { lcUsername: user.lcUsername ?? '', timezone: user.timezone, hasPremium: user.hasPremium },
		lc: { connected: Boolean(await getLcAuth(db, env)), status: await getLcStatus(db) },
		passkeyCount: n,
		setupTokenPresent: Boolean(env.SETUP_TOKEN),
		lastSyncAt: await getState<number>(db, 'lastSyncAt', 0)
	};
};

export const actions: Actions = {
	profile: async ({ request, locals, platform }) => {
		const user = requireUser(locals);
		const db = getDb(platform);
		const form = await request.formData();
		const lcUsername = String(form.get('lcUsername') ?? '').trim();
		const timezone = String(form.get('timezone') ?? '').trim();
		if (!isValidTimeZone(timezone)) return fail(400, { profile: 'unknown timezone' });
		if (lcUsername && !/^[\w.-]{1,40}$/.test(lcUsername)) return fail(400, { profile: 'username looks wrong' });
		if (lcUsername && lcUsername !== user.lcUsername) {
			const exists = await fetchUserExists(lcUsername).catch(() => true);
			if (!exists) return fail(400, { profile: `LeetCode has no user "${lcUsername}"` });
		}
		await db.update(users).set({ lcUsername: lcUsername || null, timezone }).where(eq(users.id, user.id));
		return { profile: 'saved' };
	},
	cookie: async ({ request, locals, platform }) => {
		requireUser(locals);
		const db = getDb(platform);
		const env = getEnv(platform);
		const form = await request.formData();
		const auth = parseCookieBlob(String(form.get('session') ?? ''), String(form.get('csrf') ?? ''));
		if (!auth) return fail(400, { cookie: 'paste both LEETCODE_SESSION and csrftoken values' });
		const v = await validateLcAuth(auth);
		if (!v.ok) return fail(400, { cookie: `LeetCode did not accept that cookie: ${v.error ?? 'not signed in'}` });
		await setLcAuth(db, env, auth);
		await markLcStatus(db, { ok: true, username: v.username });
		return { cookie: `connected as ${v.username}` };
	},
	recheck: async ({ locals, platform }) => {
		requireUser(locals);
		const db = getDb(platform);
		const auth = await getLcAuth(db, getEnv(platform));
		if (!auth) return fail(400, { cookie: 'no cookie stored' });
		const v = await validateLcAuth(auth);
		await markLcStatus(db, { ok: v.ok, username: v.username, error: v.error });
		return { cookie: v.ok ? `still valid (${v.username})` : `invalid: ${v.error}` };
	},
	clearCookie: async ({ locals, platform }) => {
		requireUser(locals);
		await clearLcAuth(getDb(platform));
		return { cookie: 'cookie removed' };
	},
	sync: async ({ locals, platform }) => {
		const user = requireUser(locals);
		const r = await syncRecentAc(getDb(platform), user, new Date(), true);
		return { sync: r.error ? `failed: ${r.error}` : `synced ${r.synced} new accepted submission(s)` };
	},
	signOutEverywhere: async ({ locals, platform }) => {
		requireUser(locals);
		await deleteAllSessions(getDb(platform));
		return { sessions: 'all sessions revoked; you will be signed out on the next request' };
	}
};
