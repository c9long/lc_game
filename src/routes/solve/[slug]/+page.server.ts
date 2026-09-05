import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { attempts, problemState, solutionViews } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { getProblem } from '$lib/server/problems';
import { getLcAuth, getLcStatus } from '$lib/server/leetcode/auth';
import { LANGS } from '$lib/langs';
import { PROBLEM_BY_SLUG } from '$lib/game/curriculum';
import { localDate } from '$lib/game/dates';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const env = getEnv(platform);
	const slug = params.slug;
	if (!/^[a-z0-9-]+$/.test(slug)) error(404, 'no such problem');

	const problem = await getProblem(db, slug);
	if (!problem) error(404, 'problem not found on LeetCode (or LeetCode is unreachable)');
	const cur = PROBLEM_BY_SLUG.get(slug) ?? null;
	const today = localDate(new Date(), user.timezone);

	const state = await db.select().from(problemState).where(eq(problemState.slug, slug)).get();
	const draftRows = await db
		.select({ lang: attempts.lang, code: attempts.code })
		.from(attempts)
		.where(and(eq(attempts.slug, slug), eq(attempts.kind, 'draft')))
		.all();
	const acceptedRows = await db
		.select({ lang: attempts.lang, code: attempts.code, createdAt: attempts.createdAt })
		.from(attempts)
		.where(and(eq(attempts.slug, slug), eq(attempts.kind, 'submit'), eq(attempts.accepted, true)))
		.orderBy(desc(attempts.createdAt))
		.limit(20)
		.all();
	const lastAccepted: Record<string, string> = {};
	for (const r of acceptedRows) if (!(r.lang in lastAccepted)) lastAccepted[r.lang] = r.code;
	const viewed = await db
		.select({ slug: solutionViews.slug })
		.from(solutionViews)
		.where(and(eq(solutionViews.slug, slug), eq(solutionViews.date, today)))
		.get();

	const status = await getLcStatus(db);
	const snippets: Record<string, string> = {};
	for (const l of LANGS) if (problem.snippets[l.slug]) snippets[l.slug] = problem.snippets[l.slug];

	return {
		slug,
		title: problem.title,
		difficulty: problem.difficulty,
		contentHtml: problem.contentHtml,
		tags: problem.tags,
		exampleTestcases: problem.exampleTestcases ?? '',
		isPaidOnly: problem.isPaidOnly,
		editorialFree: problem.editorialFree,
		snippets,
		drafts: Object.fromEntries(draftRows.map((r) => [r.lang, r.code])),
		lastAccepted,
		lc: { connected: Boolean(await getLcAuth(db, env)), ok: status?.ok ?? false },
		solved: (state?.solveCount ?? 0) > 0,
		solveCount: state?.solveCount ?? 0,
		lastLang: state?.lastLang ?? null,
		dueAt: state?.dueAt ?? null,
		viewedToday: Boolean(viewed),
		cur: cur
			? { code: cur.code, nodeId: cur.nodeId, pattern: cur.pattern, premium: cur.premium, solutions: cur.solutions }
			: null,
		langs: LANGS.map((l) => ({ slug: l.slug, name: l.name, monaco: l.monaco, dir: l.dir, ext: l.ext, bonus: l.bonus }))
	};
};
