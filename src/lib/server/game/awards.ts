import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db';
import { awards, ledger, planItems, problemState, solutionViews, type User } from '../db/schema';
import { randomId } from '../crypto';
import { getProblem } from '../problems';
import { addResourceStatement, getState } from './state';
import { computeAward, type Award } from '$lib/game/awards';
import { PROBLEM_BY_SLUG, type Difficulty } from '$lib/game/curriculum';
import { localDate } from '$lib/game/dates';
import { afterSolve } from '$lib/game/srs';
import type { Daily } from '../leetcode/client';

export interface AcceptedInput {
	submissionId: string;
	slug: string;
	lang: string;
	acceptedAt: Date;
	/** true when discovered via profile sync rather than an in-app submit. */
	external: boolean;
}

export interface ApplyResult {
	/** This submission id was already rewarded. */
	duplicate: boolean;
	/** false when the problem already earned its credit today. */
	counted: boolean;
	award?: Award;
	date: string;
	nodeId?: string;
	title?: string;
}

/** Turns an accepted LeetCode submission into research, resources, a ledger credit and a new SRS schedule. Idempotent on submissionId. */
export async function applyAccepted(db: Db, user: User, input: AcceptedInput): Promise<ApplyResult> {
	const date = localDate(input.acceptedAt, user.timezone);
	const existing = await db
		.select({ id: awards.submissionId })
		.from(awards)
		.where(eq(awards.submissionId, input.submissionId))
		.get();
	if (existing) return { duplicate: true, counted: false, date };

	const cur = PROBLEM_BY_SLUG.get(input.slug);
	const cached = await getProblem(db, input.slug);
	const difficulty = (cur?.difficulty ?? cached?.difficulty ?? 'Medium') as Difficulty;
	const tags = cached?.tags ?? [];
	const title = cur?.title ?? cached?.title;

	const prev = await db.select().from(problemState).where(eq(problemState.slug, input.slug)).get();
	const alreadyToday = await db
		.select({ id: ledger.id })
		.from(ledger)
		.where(and(eq(ledger.slug, input.slug), eq(ledger.date, date)))
		.get();
	const now = input.acceptedAt;

	if (alreadyToday) {
		await db.insert(awards).values({
			submissionId: input.submissionId,
			slug: input.slug,
			lang: input.lang,
			kind: prev && prev.solveCount > 0 ? 'refresh' : 'new',
			research: 0,
			resources: {},
			date,
			createdAt: now
		});
		return { duplicate: false, counted: false, date, nodeId: cur?.nodeId, title };
	}

	// Assistance is measured from the last solve rather than from midnight. A refresh worked across
	// two days -- peek in the evening, finish in the morning -- fell outside a same-day window and
	// was recorded as clean, advancing the ladder for a repetition that had needed the answer.
	const since = prev?.lastSolvedAt ?? null;
	const viewed = await db
		.select({ slug: solutionViews.slug })
		.from(solutionViews)
		.where(
			and(
				eq(solutionViews.slug, input.slug),
				since ? gt(solutionViews.createdAt, since) : eq(solutionViews.date, date)
			)
		)
		.get();
	const isRefresh = Boolean(prev && prev.solveCount > 0);
	const assisted = isRefresh && Boolean(viewed);
	const daily = await getState<Daily | null>(db, `daily:${date}`, null);

	const award = computeAward({
		difficulty,
		tags,
		lang: input.lang,
		prev: prev ? { solveCount: prev.solveCount, lastLang: prev.lastLang } : null,
		isDaily: daily?.slug === input.slug,
		assisted
	});
	const srs = afterSolve(
		prev ? { srsStep: prev.srsStep, dueAt: prev.dueAt } : null,
		assisted ? 'assisted' : 'clean',
		now
	);
	const nextState = {
		slug: input.slug,
		firstSolvedAt: prev?.firstSolvedAt ?? now,
		lastSolvedAt: now,
		solveCount: (prev?.solveCount ?? 0) + 1,
		lastLang: input.lang,
		srsStep: srs.srsStep,
		dueAt: srs.dueAt
	};

	await db.batch([
		db.insert(awards).values({
			submissionId: input.submissionId,
			slug: input.slug,
			lang: input.lang,
			kind: award.kind,
			research: award.research,
			resources: award.resources,
			date,
			createdAt: now
		}),
		db.insert(ledger).values({ id: randomId(), slug: input.slug, date, kind: award.kind, createdAt: now }),
		db
			.insert(problemState)
			.values(nextState)
			.onConflictDoUpdate({ target: problemState.slug, set: nextState }),
		...Object.entries(award.resources).map(([kind, amount]) => addResourceStatement(db, kind, amount)),
		db
			.update(planItems)
			.set({ done: true })
			.where(and(eq(planItems.planDate, date), eq(planItems.slug, input.slug)))
	]);

	return { duplicate: false, counted: true, award, date, nodeId: cur?.nodeId, title };
}
