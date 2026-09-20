import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { drillAttempts, drillState, planItems, type User } from '../db/schema';
import { randomId } from '../crypto';
import { addResourceStatement, getState, setState } from './state';
import { DRILL_BANKS, DRILL_LANGS, drillById } from '$lib/game/drillbank';
import { drillInstance, instanceCount } from '$lib/game/drillvariants';
import { afterDrill, answerNote, buildDrillSet, checkAnswer, ingotsFor, type Drill, type DrillProgress } from '$lib/game/drills';

export interface DrillSetState {
	lang: string;
	ids: string[];
	/** drillId -> correct */
	results: Record<string, boolean>;
	/** drillId -> which generated instance of that drill was served. Absent on sets built before
	 *  drills had instances, and absent entries mean the drill as written. */
	variants?: Record<string, number>;
	ingots: number;
	bonusPaid: boolean;
}

const key = (date: string) => `drillset:${date}`;

export async function loadDrillProgress(db: Db, ids?: string[]): Promise<Map<string, DrillProgress>> {
	const rows = ids
		? ids.length
			? await db.select().from(drillState).where(inArray(drillState.drillId, ids)).all()
			: []
		: await db.select().from(drillState).all();
	return new Map(rows.map((r) => [r.drillId, { srsStep: r.srsStep, dueAt: r.dueAt, correct: r.correct, wrong: r.wrong }]));
}

/** Picks the language for a date's set: rotate through languages that have a bank. */
export function langForDate(date: string): string {
	if (DRILL_LANGS.length === 0) return 'python';
	const dayNum = Math.floor(Date.parse(date + 'T00:00:00Z') / 86_400_000);
	return DRILL_LANGS[dayNum % DRILL_LANGS.length];
}

export async function getOrCreateDrillSet(db: Db, today: string, now: Date): Promise<DrillSetState | null> {
	const existing = await getState<DrillSetState | null>(db, key(today), null);
	if (existing) return existing;
	const lang = langForDate(today);
	const bank = DRILL_BANKS[lang] ?? [];
	if (bank.length === 0) return null;
	const progress = await loadDrillProgress(db);
	const set = buildDrillSet(bank, progress, now);
	if (set.length === 0) return null;
	// Which instance of each drill to serve. Answering correctly moves to the next one, so a drill
	// that keeps coming back does not keep asking about the same data; answering wrong does not, so
	// the instance you missed is the one you meet again.
	const variants: Record<string, number> = {};
	for (const d of set) variants[d.id] = (progress.get(d.id)?.correct ?? 0) % instanceCount(d.id);
	const state: DrillSetState = {
		lang,
		ids: set.map((d) => d.id),
		results: {},
		variants,
		ingots: 0,
		bonusPaid: false
	};
	await setState(db, key(today), state);
	return state;
}

export interface AnswerResult {
	correct: boolean;
	expected: string;
	alternatives: string[];
	url: string;
	api: string | null;
	explain: string | null;
	/** Set on a near miss of the right value in the wrong type; null otherwise. */
	note: string | null;
	ingots: number;
	setDone: boolean;
	setIngots: number;
}

export async function answerDrill(
	db: Db,
	user: User,
	today: string,
	now: Date,
	drillId: string,
	answer: string
): Promise<AnswerResult | { error: string }> {
	const set = await getState<DrillSetState | null>(db, key(today), null);
	if (!set || !set.ids.includes(drillId)) return { error: 'that drill is not in today\'s set' };
	if (drillId in set.results) return { error: 'already answered' };
	const base: Drill | undefined = drillById(drillId);
	if (!base) return { error: 'unknown drill' };
	// Grade against the instance that was actually on screen, not against the drill as written.
	const drill = drillInstance(base, set.variants?.[drillId] ?? 0);

	const correct = checkAnswer(drill, answer);
	const prev = await db.select().from(drillState).where(eq(drillState.drillId, drillId)).get();
	const srs = afterDrill(prev ? { srsStep: prev.srsStep, dueAt: prev.dueAt } : null, correct, now);
	const nextState = {
		drillId,
		lang: base.lang,
		srsStep: srs.srsStep,
		dueAt: srs.dueAt,
		correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
		wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
		lastSeenAt: now
	};

	set.results[drillId] = correct;
	const results = set.ids.map((id) => set.results[id]).filter((r): r is boolean => r !== undefined);
	const setDone = results.length === set.ids.length;
	const earnedSoFar = set.ingots;
	const total = setDone ? ingotsFor(results) : results.filter(Boolean).length;
	const delta = total - earnedSoFar;
	set.ingots = total;
	set.bonusPaid = setDone;

	const statements: BatchItem<'sqlite'>[] = [
		db.insert(drillState).values(nextState).onConflictDoUpdate({ target: drillState.drillId, set: nextState }),
		db.insert(drillAttempts).values({ id: randomId(), drillId, date: today, correct, answer: answer.slice(0, 500), createdAt: now })
	];
	if (delta > 0) statements.push(addResourceStatement(db, 'ingots', delta));
	if (setDone) {
		statements.push(
			db
				.update(planItems)
				.set({ done: true })
				.where(and(eq(planItems.planDate, today), eq(planItems.kind, 'drills')))
		);
	}
	await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
	await setState(db, key(today), set);

	return {
		correct,
		expected: drill.answer,
		alternatives: drill.alternatives ?? [],
		url: drill.url,
		api: drill.api ?? null,
		explain: drill.explain ?? null,
		note: correct ? null : answerNote(drill, answer),
		ingots: delta,
		setDone,
		setIngots: set.ingots
	};
}

// ---------- unlimited practice ----------
//
// Practice unlocks only once the day's set is finished, and earns nothing: no Ingots, and no
// writes to drill_state or drill_attempts. That is deliberate rather than an omission. The daily
// set is chosen from the spaced-repetition ladder, so letting practice advance srsStep would let
// an evening of grinding empty tomorrow's set — practising ahead would quietly consume the
// schedule it is meant to support. Keeping it ephemeral means "no rewards" has no asterisk.

export async function loadDrillSet(db: Db, today: string): Promise<DrillSetState | null> {
	return getState<DrillSetState | null>(db, key(today), null);
}

export function isSetComplete(set: DrillSetState | null): boolean {
	return Boolean(set && set.ids.length > 0 && set.ids.every((id) => id in set.results));
}

/** A drill for free practice: never one from today's set, and preferring ones not just seen. The
 *  instance is drawn at random too, since practice has no schedule to walk through. */
export function pickPracticeDrill(set: DrillSetState, exclude: string[] = []): { drill: Drill; variant: number } | null {
	const bank = DRILL_BANKS[set.lang] ?? [];
	if (bank.length === 0) return null;
	const today = new Set(set.ids);
	const rest = bank.filter((d) => !today.has(d.id));
	if (rest.length === 0) return null;
	// Unlimited means the pool has to wrap: once everything has been seen this session, start over
	// rather than running dry.
	const seen = new Set(exclude);
	const pool = rest.filter((d) => !seen.has(d.id));
	const from = pool.length > 0 ? pool : rest;
	const drill = from[Math.floor(Math.random() * from.length)];
	const variant = Math.floor(Math.random() * instanceCount(drill.id));
	return { drill: drillInstance(drill, variant), variant };
}

export interface PracticeResult {
	correct: boolean;
	expected: string;
	alternatives: string[];
	url: string;
	api: string | null;
	explain: string | null;
	note: string | null;
}

/** Checks a practice answer. Records nothing: practice never touches scheduling or history.
 *  `variant` says which instance the client was shown; it is clamped rather than trusted, and there
 *  is nothing to protect here anyway since practice writes nothing. */
export function checkPracticeAnswer(drillId: string, answer: string, variant = 0): PracticeResult | { error: string } {
	const base = drillById(drillId);
	if (!base) return { error: 'unknown drill' };
	const i = Number.isInteger(variant) ? Math.min(Math.max(variant, 0), instanceCount(drillId) - 1) : 0;
	const drill = drillInstance(base, i);
	const correct = checkAnswer(drill, answer);
	return {
		correct,
		expected: drill.answer,
		alternatives: drill.alternatives ?? [],
		url: drill.url,
		api: drill.api ?? null,
		explain: drill.explain ?? null,
		note: correct ? null : answerNote(drill, answer)
	};
}
