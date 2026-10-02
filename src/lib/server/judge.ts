import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { attempts, problemState, solutionViews } from './db/schema';
import { randomId } from './crypto';
import { LeetCodeError } from './leetcode/client';
import { LANG_BY_SLUG } from '$lib/langs';

export function validLang(lang: unknown): lang is string {
	return typeof lang === 'string' && LANG_BY_SLUG.has(lang);
}

/** Maps LeetCode client failures to JSON responses. */
export async function judgeErrorResponse(db: Db, e: unknown): Promise<Response> {
	if (e instanceof LeetCodeError) {
		const status = e.kind === 'rate_limited' ? 429 : 502;
		const message =
			e.kind === 'rate_limited'
				? 'LeetCode asked us to slow down; wait a few seconds.'
				: e.kind === 'blocked'
					? 'LeetCode served a bot-challenge page to the server. See docs/06-merged-design.md Phase 0.'
					: e.message;
		return json({ error: e.kind, message }, { status });
	}
	return json({ error: 'unknown', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

export async function upsertDraft(db: Db, uid: string, slug: string, lang: string, code: string): Promise<void> {
	const existing = await db
		.select({ id: attempts.id })
		.from(attempts)
		.where(and(eq(attempts.userId, uid), eq(attempts.slug, slug), eq(attempts.lang, lang), eq(attempts.kind, 'draft')))
		.get();
	const now = new Date();
	if (existing)
		await db
			.update(attempts)
			.set({ code, createdAt: now })
			.where(and(eq(attempts.userId, uid), eq(attempts.id, existing.id)));
	else await db.insert(attempts).values({ id: randomId(), userId: uid, slug, lang, kind: 'draft', code, createdAt: now });
}

/** Records that solutions were looked at, once per problem per day -- but only when it matters.
 *
 *  Viewing is free. It used to cost 2 essence of the problem's topics, which was meant to make
 *  peeking a decision rather than a reflex — but for someone learning the material the first time,
 *  a solution is the teaching, and taxing it discourages exactly the thing that helps. The record
 *  is kept for one purpose: a REFRESH solved after peeking counts as assisted, since a repetition
 *  you needed help with genuinely has not stuck.
 *
 *  So a solved problem that is not due yet is looked at freely and nothing is written. That is the
 *  case of comparing a fresh solution with the previous one straight after a clean refresh, which
 *  used to be charged to the next refresh. Awards apply the same rule (a look counts only from
 *  the due date on); skipping the write here as well is what closes the same-day gap, since the
 *  table keeps one row per problem per day.
 */
export async function recordSolutionView(db: Db, uid: string, slug: string, date: string): Promise<void> {
	const now = new Date();
	const state = await db
		.select({ solveCount: problemState.solveCount, dueAt: problemState.dueAt })
		.from(problemState)
		.where(and(eq(problemState.userId, uid), eq(problemState.slug, slug)))
		.get();
	const dueAt = state && state.solveCount > 0 ? state.dueAt : null;
	if (dueAt && dueAt.getTime() > now.getTime()) return; // solved and not due: a free look

	const existing = await db
		.select({ createdAt: solutionViews.createdAt })
		.from(solutionViews)
		.where(and(eq(solutionViews.userId, uid), eq(solutionViews.slug, slug), eq(solutionViews.date, date)))
		.get();
	if (!existing) {
		await db.insert(solutionViews).values({ userId: uid, slug, date, createdAt: now });
		return;
	}
	// One row per day: a row left from earlier today, before the problem fell due (only possible
	// for rows written under the old rule), must not stand in for a look taken now that it is due.
	if (dueAt && existing.createdAt.getTime() < dueAt.getTime()) {
		await db
			.update(solutionViews)
			.set({ createdAt: now })
			.where(and(eq(solutionViews.userId, uid), eq(solutionViews.slug, slug), eq(solutionViews.date, date)));
	}
}

