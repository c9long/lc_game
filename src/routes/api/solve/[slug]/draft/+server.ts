import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { readJson, requireUser } from '$lib/server/guard';
import { upsertDraft, validLang } from '$lib/server/judge';

export const POST: RequestHandler = async (event) => {
	requireUser(event.locals);
	const body = await readJson<{ lang?: unknown; code?: unknown }>(event.request);
	if (!validLang(body.lang) || typeof body.code !== 'string' || body.code.length > 200_000) {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	await upsertDraft(getDb(event.platform), event.params.slug, body.lang, body.code);
	return json({ ok: true });
};
