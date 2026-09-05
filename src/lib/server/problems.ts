import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { problems, type ProblemRow } from './db/schema';
import { fetchProblem } from './leetcode/client';

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Problem content from D1, fetched from LeetCode on first use (and refreshed monthly). */
export async function getProblem(db: Db, slug: string): Promise<ProblemRow | null> {
	const cached = await db.select().from(problems).where(eq(problems.slug, slug)).get();
	if (cached && Date.now() - cached.fetchedAt.getTime() < STALE_MS) return cached;
	let fresh;
	try {
		fresh = await fetchProblem(slug);
	} catch {
		return cached ?? null;
	}
	if (!fresh) return cached ?? null;
	const row: ProblemRow = {
		slug,
		questionId: fresh.questionId,
		title: fresh.title,
		difficulty: fresh.difficulty,
		contentHtml: fresh.contentHtml,
		tags: fresh.tags,
		snippets: fresh.snippets,
		exampleTestcases: fresh.exampleTestcases,
		isPaidOnly: fresh.isPaidOnly,
		editorialFree: fresh.editorialFree,
		fetchedAt: new Date()
	};
	await db
		.insert(problems)
		.values(row)
		.onConflictDoUpdate({ target: problems.slug, set: { ...row } });
	return row;
}
