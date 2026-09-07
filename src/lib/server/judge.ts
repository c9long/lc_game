import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db';
import { attempts, solutionViews } from './db/schema';
import { randomId } from './crypto';
import { LeetCodeError } from './leetcode/client';
import { markLcStatus } from './leetcode/auth';
import { LANG_BY_SLUG } from '$lib/langs';

export function validLang(lang: unknown): lang is string {
	return typeof lang === 'string' && LANG_BY_SLUG.has(lang);
}

/** Maps LeetCode client failures to JSON responses and records cookie problems. */
export async function judgeErrorResponse(db: Db, e: unknown): Promise<Response> {
	if (e instanceof LeetCodeError) {
		if (e.kind === 'unauthenticated') await markLcStatus(db, { ok: false, error: e.message });
		const status = e.kind === 'unauthenticated' ? 424 : e.kind === 'rate_limited' ? 429 : 502;
		const message =
			e.kind === 'unauthenticated'
				? 'LeetCode rejected the session cookie; reconnect it in Admin.'
				: e.kind === 'rate_limited'
					? 'LeetCode asked us to slow down; wait a few seconds.'
					: e.kind === 'blocked'
						? 'LeetCode served a bot-challenge page to the server. See docs/06-merged-design.md Phase 0.'
						: e.message;
		return json({ error: e.kind, message }, { status });
	}
	return json({ error: 'unknown', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
}

export async function recordAttempt(
	db: Db,
	a: { slug: string; lang: string; kind: 'run' | 'submit'; code: string; lcId: string }
): Promise<void> {
	await db.insert(attempts).values({ id: randomId(), ...a, createdAt: new Date() });
}

export async function upsertDraft(db: Db, slug: string, lang: string, code: string): Promise<void> {
	const existing = await db
		.select({ id: attempts.id })
		.from(attempts)
		.where(and(eq(attempts.slug, slug), eq(attempts.lang, lang), eq(attempts.kind, 'draft')))
		.get();
	const now = new Date();
	if (existing) await db.update(attempts).set({ code, createdAt: now }).where(eq(attempts.id, existing.id));
	else await db.insert(attempts).values({ id: randomId(), slug, lang, kind: 'draft', code, createdAt: now });
}

/** Records that solutions were viewed today, once per problem per day.
 *
 *  Viewing is free. It used to cost 2 essence of the problem's topics, which was meant to make
 *  peeking a decision rather than a reflex — but for someone learning the material the first time,
 *  a solution is the teaching, and taxing it discourages exactly the thing that helps. The record
 *  is still kept: a REFRESH solved after peeking still counts as assisted, since a repetition you
 *  needed help with genuinely has not stuck. First solves carry no penalty either way.
 */
export async function recordSolutionView(db: Db, slug: string, date: string): Promise<void> {
	const existing = await db
		.select({ slug: solutionViews.slug })
		.from(solutionViews)
		.where(and(eq(solutionViews.slug, slug), eq(solutionViews.date, date)))
		.get();
	if (existing) return;
	await db.insert(solutionViews).values({ slug, date, createdAt: new Date() });
}

