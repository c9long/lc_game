import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { readJson, requireUser } from '$lib/server/guard';

/** Turns editor autocomplete on or off for the signed-in player. */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const body = await readJson<{ on?: unknown }>(event.request);
	if (typeof body.on !== 'boolean') return json({ error: 'bad_request' }, { status: 400 });
	await getDb(event.platform).update(users).set({ codeCompletion: body.on }).where(eq(users.id, user.id));
	return json({ ok: true, on: body.on });
};
