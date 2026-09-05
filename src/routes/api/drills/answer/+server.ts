import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { readJson, requireUser } from '$lib/server/guard';
import { answerDrill } from '$lib/server/game/drills';
import { localDate } from '$lib/game/dates';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const body = await readJson<{ drillId?: unknown; answer?: unknown }>(event.request);
	if (typeof body.drillId !== 'string' || typeof body.answer !== 'string') {
		return json({ error: 'bad_request', message: 'drillId and answer are required' }, { status: 400 });
	}
	const now = new Date();
	const result = await answerDrill(getDb(event.platform), user, localDate(now, user.timezone), now, body.drillId, body.answer);
	if ('error' in result) return json({ error: 'bad_request', message: result.error }, { status: 400 });
	return json(result);
};
