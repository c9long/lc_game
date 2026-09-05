import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../db';
import { drillAttempts, drillState, planItems, type User } from '../db/schema';
import { randomId } from '../crypto';
import { addResourceStatement, getState, setState } from './state';
import { DRILL_BANKS, DRILL_LANGS, drillById } from '$lib/game/drillbank';
import { afterDrill, buildDrillSet, checkAnswer, ingotsFor, type Drill, type DrillProgress } from '$lib/game/drills';

export interface DrillSetState {
	lang: string;
	ids: string[];
	/** drillId -> correct */
	results: Record<string, boolean>;
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
	const state: DrillSetState = { lang, ids: set.map((d) => d.id), results: {}, ingots: 0, bonusPaid: false };
	await setState(db, key(today), state);
	return state;
}

export interface AnswerResult {
	correct: boolean;
	expected: string;
	alternatives: string[];
	url: string;
	api: string | null;
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
	const drill: Drill | undefined = drillById(drillId);
	if (!drill) return { error: 'unknown drill' };

	const correct = checkAnswer(drill, answer);
	const prev = await db.select().from(drillState).where(eq(drillState.drillId, drillId)).get();
	const srs = afterDrill(prev ? { srsStep: prev.srsStep, dueAt: prev.dueAt } : null, correct, now);
	const nextState = {
		drillId,
		lang: drill.lang,
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
		ingots: delta,
		setDone,
		setIngots: set.ingots
	};
}
