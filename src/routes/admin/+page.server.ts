import { fail } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { invites, users } from '$lib/server/db/schema';
import { requireAdmin } from '$lib/server/guard';
import { deleteAllSessions } from '$lib/server/auth/session';
import { createInvite } from '$lib/server/auth/register';

/** Instance-wide settings: who can play, and everyone's sessions. Admin only; each player's own
 *  settings are in /settings. */
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireAdmin(locals);
	const db = getDb(platform);
	const env = getEnv(platform);
	const players = await db
		.select({ id: users.id, name: users.name, isAdmin: users.isAdmin, createdAt: users.createdAt })
		.from(users)
		.orderBy(users.createdAt)
		.all();
	const pending = await db
		.select({ tokenHash: invites.tokenHash, name: invites.name, expiresAt: invites.expiresAt })
		.from(invites)
		.where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
		.orderBy(desc(invites.createdAt))
		.all();
	return { players, pending, setupTokenPresent: Boolean(env.SETUP_TOKEN) };
};

export const actions: Actions = {
	invite: async ({ request, locals, platform, url }) => {
		const admin = requireAdmin(locals);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!/^[\w .'-]{1,40}$/.test(name)) return fail(400, { invite: 'give the player a name (letters, digits, spaces)' });
		const token = await createInvite(getDb(platform), admin.id, name);
		// Shown once: only the hash is stored, so a lost link is revoked and reissued, not recovered.
		return { invite: `${url.origin}/auth/register?invite=${token}`, inviteName: name };
	},
	revoke: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const tokenHash = String((await request.formData()).get('tokenHash') ?? '');
		await getDb(platform)
			.update(invites)
			.set({ expiresAt: new Date(0) })
			.where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt)));
		return { revoked: true };
	},
	signOutEverywhere: async ({ locals, platform }) => {
		requireAdmin(locals);
		await deleteAllSessions(getDb(platform));
		return { sessions: 'every player signed out on every device; you too, on the next request' };
	}
};
