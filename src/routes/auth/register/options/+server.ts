import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { passkeys } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { registrationFor } from '$lib/server/auth/register';
import { CHALLENGE_COOKIE, beginRegistration, relyingParty } from '$lib/server/auth/webauthn';

export const GET: RequestHandler = async (event) => {
	if (!rateLimit(`register:${event.getClientAddress()}`, 10, 10 * 60 * 1000)) {
		return json({ error: 'too many attempts' }, { status: 429 });
	}
	const db = getDb(event.platform);
	const reg = await registrationFor(event, db);
	if (!reg) return json({ error: 'registration closed' }, { status: 403 });
	// Only your own passkeys are excluded: a new player has none yet.
	const existing = reg.mode === 'device' ? await db.select().from(passkeys).where(eq(passkeys.userId, reg.userId)).all() : [];
	const { rpID } = relyingParty(event.url);
	const { options, challengeId } = await beginRegistration(db, rpID, reg.name || 'player', existing);
	event.cookies.set(CHALLENGE_COOKIE, challengeId, {
		path: '/auth',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'strict',
		maxAge: 300
	});
	return json(options);
};
