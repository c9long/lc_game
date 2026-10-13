import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { getProblem } from '$lib/server/problems';
import { fetchSolutionArticle, fetchSolutionArticles } from '$lib/server/leetcode/client';
import { judgeErrorResponse, recordSolutionView } from '$lib/server/judge';
import { localDate } from '$lib/game/dates';
import { LANG_BY_SLUG } from '$lib/langs';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const slug = event.params.slug;
	const kind = event.url.searchParams.get('kind') ?? 'list';
	// Refuse an unknown kind before recording anything: a page still running an older build could
	// ask for 'editorial' (removed 2026-10-13), and that must not mark the refresh assisted.
	if (!['reference', 'own', 'community', 'article'].includes(kind)) return json({ error: 'bad_request' }, { status: 400 });
	const problem = await getProblem(db, slug);
	if (!problem) return json({ error: 'not_found' }, { status: 404 });

	// Every kind records a view, including 'own': loading your last accepted solution into the
	// editor is as much a peek as opening the NeetCode reference, so on a refresh it must count as
	// assisted in exactly the same way. The code itself never leaves the page loader; this call
	// exists only to leave the record.
	await recordSolutionView(db, user.id, slug, localDate(new Date(), user.timezone));

	try {
		if (kind === 'reference' || kind === 'own') return json({ ok: true });
		if (kind === 'community') {
			const lang = event.url.searchParams.get('lang') ?? '';
			const tag = LANG_BY_SLUG.has(lang) ? [lang] : [];
			return json({ data: await fetchSolutionArticles(slug, { tags: tag, first: 12 }) });
		}
		if (kind === 'article') {
			const topicId = Number(event.url.searchParams.get('topicId'));
			if (!Number.isInteger(topicId)) return json({ error: 'bad_request' }, { status: 400 });
			return json({ data: await fetchSolutionArticle(topicId) });
		}
		return json({ error: 'bad_request' }, { status: 400 });
	} catch (e) {
		return judgeErrorResponse(db, e);
	}
};
