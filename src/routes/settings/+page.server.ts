import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys, users } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { deleteUserSessions } from '$lib/server/auth/session';
import { fetchUserExists } from '$lib/server/leetcode/client';
import { syncRecentAc } from '$lib/server/game/sync';
import { getState } from '$lib/server/game/state';
import { isValidTimeZone } from '$lib/game/dates';

/** Each player's own settings. Anything that affects other players lives in /admin. */
export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const keys = await db
		.select({ id: passkeys.id, deviceName: passkeys.deviceName, createdAt: passkeys.createdAt })
		.from(passkeys)
		.where(eq(passkeys.userId, user.id))
		.all();
	return {
		profile: { name: user.name, lcUsername: user.lcUsername ?? '', timezone: user.timezone },
		passkeys: keys,
		lastSyncAt: await getState<number>(db, user.id, 'lastSyncAt', 0)
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
	sync: async ({ locals, platform }) => {
		const user = requireUser(locals);
		const r = await syncRecentAc(getDb(platform), user, new Date(), true);
		return { sync: r.error ? `failed: ${r.error}` : `synced ${r.synced} new accepted submission(s)` };
	},
	removePasskey: async ({ request, locals, platform }) => {
		const user = requireUser(locals);
		const db = getDb(platform);
		const id = String((await request.formData()).get('id') ?? '');
		const mine = await db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.id)).all();
		if (!mine.some((p) => p.id === id)) return fail(404, { passkeys: 'no such passkey' });
		if (mine.length === 1) return fail(400, { passkeys: 'that is your only passkey; add another device first' });
		await db.delete(passkeys).where(and(eq(passkeys.userId, user.id), eq(passkeys.id, id)));
		return { passkeys: 'passkey removed' };
	},
	signOutMine: async ({ locals, platform }) => {
		const user = requireUser(locals);
		await deleteUserSessions(getDb(platform), user.id);
		return { sessions: 'signed out of all your devices; you will be signed out on the next request' };
	}
};
