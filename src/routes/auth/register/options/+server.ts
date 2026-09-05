import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { registrationAllowed } from '$lib/server/auth/register';
import { CHALLENGE_COOKIE, beginRegistration, relyingParty } from '$lib/server/auth/webauthn';

export const GET: RequestHandler = async (event) => {
	if (!rateLimit(`register:${event.getClientAddress()}`, 10, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts' }, { status: 429 });
	}
	if (!registrationAllowed(event)) return json({ error: 'registration closed' }, { status: 403 });
	const db = getDb(event.platform);
	const existing = await db.select().from(passkeys).all();
	const { rpID } = relyingParty(event.url);
	const { options, challengeId } = await beginRegistration(db, rpID, 'chris', existing);
	event.cookies.set(CHALLENGE_COOKIE, challengeId, {
		path: '/auth',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'strict',
		maxAge: 300
	});
	return json(options);
};
