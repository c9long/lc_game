import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys, users } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { deleteUserSessions } from '$lib/server/auth/session';
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
		profile: { name: user.name, timezone: user.timezone },
		passkeys: keys
	};
};

export const actions: Actions = {
	profile: async ({ request, locals, platform }) => {
		const user = requireUser(locals);
		const db = getDb(platform);
		const form = await request.formData();
		const timezone = String(form.get('timezone') ?? '').trim();
		if (!isValidTimeZone(timezone)) return fail(400, { profile: 'unknown timezone' });
		await db.update(users).set({ timezone }).where(eq(users.id, user.id));
		return { profile: 'saved' };
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
