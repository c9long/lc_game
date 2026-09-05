import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '$lib/server/auth/session';
import { CHALLENGE_COOKIE, finishAuthentication, relyingParty } from '$lib/server/auth/webauthn';

export const POST: RequestHandler = async (event) => {
	if (!rateLimit(`login:${event.getClientAddress()}`, 20, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts, try later' }, { status: 429 });
	}
	const db = getDb(event.platform);
	const challengeId = event.cookies.get(CHALLENGE_COOKIE);
	event.cookies.delete(CHALLENGE_COOKIE, { path: '/auth' });
	if (!challengeId) return json({ error: 'missing challenge; reload and try again' }, { status: 400 });

	const response = (await event.request.json().catch(() => null)) as AuthenticationResponseJSON | null;
	if (!response?.id) return json({ error: 'bad assertion' }, { status: 400 });
	const passkey = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).get();
	if (!passkey) return json({ error: 'unknown passkey' }, { status: 400 });

	try {
		const { rpID, origin } = relyingParty(event.url);
		const newCounter = await finishAuthentication(db, { challengeId, response, rpID, origin, passkey });
		await db.update(passkeys).set({ counter: newCounter }).where(eq(passkeys.id, passkey.id));
		const { token } = await createSession(db, passkey.userId);
		event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.url.protocol === 'https:'));
		return json({ ok: true });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'verification failed' }, { status: 400 });
	}
};
