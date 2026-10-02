import { json } from '@sveltejs/kit';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { invites, passkeys, users } from '$lib/server/db/schema';
import { randomId } from '$lib/server/crypto';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { claimInvite, registrationFor } from '$lib/server/auth/register';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '$lib/server/auth/session';
import { CHALLENGE_COOKIE, finishRegistration, relyingParty } from '$lib/server/auth/webauthn';
import { isValidTimeZone } from '$lib/game/dates';

export const POST: RequestHandler = async (event) => {
	if (!rateLimit(`register:${event.getClientAddress()}`, 10, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts' }, { status: 429 });
	}
	const db = getDb(event.platform);
	const reg = await registrationFor(event, db);
	if (!reg) return json({ error: 'registration closed' }, { status: 403 });
	const challengeId = event.cookies.get(CHALLENGE_COOKIE);
	event.cookies.delete(CHALLENGE_COOKIE, { path: '/auth' });
	if (!challengeId) return json({ error: 'missing challenge; reload and try again' }, { status: 400 });

	const body = (await event.request.json().catch(() => null)) as {
		attestation?: RegistrationResponseJSON;
		deviceName?: string;
		timezone?: string;
	} | null;
	if (!body?.attestation?.id) return json({ error: 'bad attestation' }, { status: 400 });

	try {
		const { rpID, origin } = relyingParty(event.url);
		const cred = await finishRegistration(db, { challengeId, response: body.attestation, rpID, origin });
		const now = new Date();

		const passkey = (userId: string) =>
			db.insert(passkeys).values({
				id: cred.id,
				userId,
				publicKey: cred.publicKey,
				counter: cred.counter,
				transports: cred.transports,
				deviceName: (body.deviceName ?? '').slice(0, 60) || null,
				createdAt: now
			});

		let userId: string;
		if (reg.mode === 'device') {
			userId = reg.userId;
			await passkey(userId);
		} else {
			// A new player. An invite is claimed atomically, so a link opened twice makes one account.
			if (reg.mode === 'invite' && !(await claimInvite(db, reg.tokenHash, now))) {
				return json({ error: 'this invite has already been used or has expired' }, { status: 403 });
			}
			userId = randomId();
			const tz = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : 'UTC';
			await db.batch([
				db.insert(users).values({ id: userId, name: reg.name, timezone: tz, isAdmin: reg.mode === 'setup', createdAt: now }),
				passkey(userId),
				...(reg.mode === 'invite'
					? [db.update(invites).set({ usedBy: userId }).where(eq(invites.tokenHash, reg.tokenHash))]
					: [])
			]);
		}
		if (!event.locals.user) {
			const { token } = await createSession(db, userId);
			event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url.protocol === 'https:'));
		}
		return json({ ok: true, mode: reg.mode });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'registration failed' }, { status: 400 });
	}
};
