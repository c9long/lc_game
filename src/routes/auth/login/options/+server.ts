import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { CHALLENGE_COOKIE, beginAuthentication, relyingParty } from '$lib/server/auth/webauthn';

export const GET: RequestHandler = async (event) => {
	if (!rateLimit(`login:${event.getClientAddress()}`, 20, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts, try later' }, { status: 429 });
	}
	const db = getDb(event.platform);
	const all = await db.select().from(passkeys).all();
	if (all.length === 0) return json({ error: 'no passkey registered' }, { status: 400 });
	const { rpID } = relyingParty(event.url);
	const { options, challengeId } = await beginAuthentication(db, rpID, all);
	event.cookies.set(CHALLENGE_COOKIE, challengeId, {
		path: '/auth',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'strict',
		maxAge: 300
	});
	return json(options);
};
