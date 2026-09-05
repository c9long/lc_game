import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { syncRecentAc } from '$lib/server/game/sync';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	return json(await syncRecentAc(getDb(event.platform), user, new Date(), true));
};
