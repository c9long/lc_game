import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { readJson, requireUser } from '$lib/server/guard';

/** Shows or hides problem categories and topic tags for the signed-in player. */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const body = await readJson<{ show?: unknown }>(event.request);
	if (typeof body.show !== 'boolean') return json({ error: 'bad_request' }, { status: 400 });
	await getDb(event.platform).update(users).set({ showTags: body.show }).where(eq(users.id, user.id));
	return json({ ok: true, show: body.show });
};
