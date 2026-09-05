import { json } from '@sveltejs/kit';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys, users } from '$lib/server/db/schema';
import { randomId } from '$lib/server/crypto';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { registrationAllowed } from '$lib/server/auth/register';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '$lib/server/auth/session';
import { CHALLENGE_COOKIE, finishRegistration, relyingParty } from '$lib/server/auth/webauthn';
import { isValidTimeZone } from '$lib/game/dates';

export const POST: RequestHandler = async (event) => {
	if (!rateLimit(`register:${event.getClientAddress()}`, 10, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts' }, { status: 429 });
	}
	if (!registrationAllowed(event)) return json({ error: 'registration closed' }, { status: 403 });
	const db = getDb(event.platform);
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

		let userId = event.locals.user?.id;
		if (!userId) {
			const existing = await db.select({ id: users.id }).from(users).get();
			if (existing) userId = existing.id;
			else {
				userId = randomId();
				const tz = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : 'UTC';
				await db.insert(users).values({ id: userId, timezone: tz, createdAt: now });
			}
		}
		await db.insert(passkeys).values({
			id: cred.id,
			userId,
			publicKey: cred.publicKey,
			counter: cred.counter,
			transports: cred.transports,
			deviceName: (body.deviceName ?? '').slice(0, 60) || null,
			createdAt: now
		});
		if (!event.locals.user) {
			const { token } = await createSession(db, userId);
			event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url.protocol === 'https:'));
		}
		return json({ ok: true });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'registration failed' }, { status: 400 });
	}
};
