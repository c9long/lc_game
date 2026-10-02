import type { RequestEvent } from '@sveltejs/kit';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { invites, users } from '../db/schema';
import { randomId, sha256Hex, timingSafeEqual } from '../crypto';

/** Single-use invite links stay valid this long. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Who a registration is for. There are three ways in:
 *  - device: a signed-in player adding a passkey to their own account;
 *  - invite: the bearer of an unused, unexpired invite link, who becomes a NEW player;
 *  - setup:  the bearer of SETUP_TOKEN, only while there are no users yet; becomes the admin.
 * A passkey is never attached to an existing account by anything but its own signed-in session.
 */
export type Registration =
	| { mode: 'device'; userId: string; name: string }
	| { mode: 'invite'; tokenHash: string; name: string }
	| { mode: 'setup'; name: string };

export async function registrationFor(event: RequestEvent, db: Db): Promise<Registration | null> {
	const user = event.locals.user;
	if (user) return { mode: 'device', userId: user.id, name: user.name };

	const invite = event.url.searchParams.get('invite');
	if (invite) {
		const tokenHash = await sha256Hex(invite);
		const row = await db
			.select({ name: invites.name })
			.from(invites)
			.where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
			.get();
		return row ? { mode: 'invite', tokenHash, name: row.name } : null;
	}

	const expected = event.platform?.env?.SETUP_TOKEN;
	const token = event.url.searchParams.get('token');
	if (!expected || !token || !timingSafeEqual(expected, token)) return null;
	const [{ n }] = await db.select({ n: count() }).from(users);
	return n === 0 ? { mode: 'setup', name: 'admin' } : null;
}

/** Creates an invite and returns the raw token, which is shown once and never stored. */
export async function createInvite(db: Db, createdBy: string, name: string, now = new Date()): Promise<string> {
	const token = randomId(24);
	await db.insert(invites).values({
		tokenHash: await sha256Hex(token),
		name,
		createdBy,
		expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
		createdAt: now
	});
	return token;
}

/** Marks an invite used, atomically: false if it was already used, revoked or has expired. */
export async function claimInvite(db: Db, tokenHash: string, now = new Date()): Promise<boolean> {
	const rows = await db
		.update(invites)
		.set({ usedAt: now })
		.where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)))
		.returning({ tokenHash: invites.tokenHash });
	return rows.length === 1;
}
