import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { readJson, requireUser } from '$lib/server/guard';
import { getProblem } from '$lib/server/problems';
import { getLcAuth } from '$lib/server/leetcode/auth';
import { interpret } from '$lib/server/leetcode/client';
import { rateLimit } from '$lib/server/auth/ratelimit';
import { judgeErrorResponse, recordAttempt, validLang } from '$lib/server/judge';

export const POST: RequestHandler = async (event) => {
	requireUser(event.locals);
	const db = getDb(event.platform);
	const auth = await getLcAuth(db, getEnv(event.platform));
	if (!auth) return json({ error: 'no_cookie', message: 'Connect LeetCode in Admin first.' }, { status: 424 });
	if (!rateLimit('judge', 30, 60 * 1000)) return json({ error: 'rate_limited', message: 'Too many runs; wait a minute.' }, { status: 429 });

	const body = await readJson<{ lang?: unknown; code?: unknown; input?: unknown }>(event.request);
	if (!validLang(body.lang) || typeof body.code !== 'string' || typeof body.input !== 'string') {
		return json({ error: 'bad_request', message: 'lang, code and input are required' }, { status: 400 });
	}
	const problem = await getProblem(db, event.params.slug);
	if (!problem) return json({ error: 'not_found', message: 'unknown problem' }, { status: 404 });
	try {
		const id = await interpret(auth, {
			slug: problem.slug,
			questionId: problem.questionId,
			lang: body.lang,
			code: body.code,
			input: body.input
		});
		await recordAttempt(db, { slug: problem.slug, lang: body.lang, kind: 'run', code: body.code, lcId: id });
		return json({ id });
	} catch (e) {
		return judgeErrorResponse(db, e);
	}
};
