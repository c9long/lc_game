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
import ownDescriptions from '../../../../data/premium-descriptions.json';

const OWN_DESCRIPTIONS = ownDescriptions as Record<string, { title: string; html: string; starterPython?: string }>;

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
		.select({ lang: attempts.lang, code: attempts.code, createdAt: attempts.createdAt })
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

	// A leftover draft is not work in progress: the draft is autosaved as you type, so on a solved
	// problem it holds whatever was in the editor when the solve happened -- usually the accepted
	// solution itself. Opening a refresh on that lets the repetition be passed without re-deriving
	// anything. Clearing the editor on accept prevents this going forward; dropping stale drafts
	// here covers every problem solved before that shipped.
	//
	// Stale means either byte-identical to an accepted submission, or written no later than the
	// last solve. The timestamp is the load-bearing half: a draft can be leftover without matching
	// any accepted code -- an untouched starter in a language the problem was never solved in, or a
	// solve recorded by profile sync, which stores no attempt row to compare against. Work done
	// since the last solve is newer than it, and is still restored.
	const solvedAt = state?.lastSolvedAt ?? null;
	const acceptedCode = new Set(acceptedRows.map((r) => `${r.lang}\u0000${r.code}`));
	const isStale = (r: { lang: string; code: string; createdAt: Date }) =>
		acceptedCode.has(`${r.lang}\u0000${r.code}`) ||
		(solvedAt !== null && r.createdAt.getTime() <= solvedAt.getTime());
	const drafts = Object.fromEntries(draftRows.filter((r) => !isStale(r)).map((r) => [r.lang, r.code]));
	const viewed = await db
		.select({ slug: solutionViews.slug })
		.from(solutionViews)
		.where(and(eq(solutionViews.slug, slug), eq(solutionViews.date, today)))
		.get();

	const status = await getLcStatus(db);
	const snippets: Record<string, string> = {};
	for (const l of LANGS) if (problem.snippets[l.slug]) snippets[l.slug] = problem.snippets[l.slug];
	// Premium withholds codeSnippets as well as the statement, so the editor opened empty. The
	// signature is derived from the public metaData instead.
	const ownStarter = OWN_DESCRIPTIONS[problem.slug]?.starterPython;
	if (ownStarter && !snippets.python3) snippets.python3 = ownStarter;

	return {
		slug,
		title: problem.title,
		difficulty: problem.difficulty,
		// LeetCode returns content: null for Premium problems, so these pages rendered blank. The
		// statement is supplied from data/premium-descriptions.json instead.
		contentHtml: problem.contentHtml ?? OWN_DESCRIPTIONS[problem.slug]?.html ?? null,
		ownDescription: !problem.contentHtml && Boolean(OWN_DESCRIPTIONS[problem.slug]),
		tags: problem.tags,
		exampleTestcases: problem.exampleTestcases ?? '',
		isPaidOnly: problem.isPaidOnly,
		editorialFree: problem.editorialFree,
		snippets,
		drafts,
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
