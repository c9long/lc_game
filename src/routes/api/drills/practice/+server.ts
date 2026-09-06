import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { readJson, requireUser } from '$lib/server/guard';
import { checkPracticeAnswer, isSetComplete, loadDrillSet, pickPracticeDrill } from '$lib/server/game/drills';
import { localDate } from '$lib/game/dates';
import type { DrillSetState } from '$lib/server/game/drills';

const LOCKED = {
	error: 'locked',
	message: 'Finish today’s drill set first; practice unlocks after it.'
};

/** The gate is enforced here, not only in the page, so it cannot be skipped by calling the API. */
async function requireUnlocked(event: Parameters<RequestHandler>[0]): Promise<DrillSetState | Response> {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const set = await loadDrillSet(db, localDate(new Date(), user.timezone));
	if (!isSetComplete(set)) return json(LOCKED, { status: 403 });
	return set!;
}

/** Next practice drill. `exclude` carries the ids already seen this session so it does not repeat. */
export const GET: RequestHandler = async (event) => {
	const gate = await requireUnlocked(event);
	if (gate instanceof Response) return gate;

	const exclude = (event.url.searchParams.get('exclude') ?? '').split(',').filter(Boolean);
	const drill = pickPracticeDrill(gate, exclude);
	if (!drill) return json({ error: 'empty', message: 'No practice drills left in this bank.' }, { status: 404 });

	// The answer stays on the server; practice is checked here exactly as the daily set is.
	return json({
		drill: {
			id: drill.id,
			kind: drill.kind,
			module: drill.module,
			context: drill.context,
			code: drill.code,
			hint: drill.hint ?? null
		}
	});
};

export const POST: RequestHandler = async (event) => {
	const gate = await requireUnlocked(event);
	if (gate instanceof Response) return gate;

	const body = await readJson<{ drillId?: unknown; answer?: unknown }>(event.request);
	if (typeof body.drillId !== 'string' || typeof body.answer !== 'string') {
		return json({ error: 'bad_request', message: 'drillId and answer are required' }, { status: 400 });
	}
	const result = checkPracticeAnswer(body.drillId, body.answer);
	if ('error' in result) return json({ error: 'bad_request', message: result.error }, { status: 400 });
	return json(result);
};
