import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const bool = (name: string) => integer(name, { mode: 'boolean' });

/** Single user in practice; kept relational so passkeys and sessions have an owner. */
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	lcUsername: text('lc_username'),
	timezone: text('timezone').notNull().default('UTC'),
	hasPremium: bool('has_premium').notNull().default(false),
	createdAt: ts('created_at').notNull()
});

export const passkeys = sqliteTable('passkeys', {
	/** WebAuthn credential id, base64url. */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	/** COSE public key, base64url. */
	publicKey: text('public_key').notNull(),
	counter: integer('counter').notNull().default(0),
	/** JSON array of AuthenticatorTransport. */
	transports: text('transports', { mode: 'json' }).$type<string[]>(),
	deviceName: text('device_name'),
	createdAt: ts('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
	/** SHA-256 of the cookie token; the raw token is never stored. */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: ts('expires_at').notNull(),
	createdAt: ts('created_at').notNull()
});

/** Short-lived WebAuthn challenges keyed by a random id set in a cookie. */
export const challenges = sqliteTable('challenges', {
	id: text('id').primaryKey(),
	challenge: text('challenge').notNull(),
	kind: text('kind', { enum: ['registration', 'authentication'] }).notNull(),
	expiresAt: ts('expires_at').notNull()
});

/** Key/value settings. Rows with encrypted=true hold AES-GCM ciphertext (see settings.ts). */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	encrypted: bool('encrypted').notNull().default(false),
	updatedAt: ts('updated_at').notNull()
});

/** Cache of LeetCode problem content so the API is hit once per problem. */
export const problems = sqliteTable('problems', {
	slug: text('slug').primaryKey(),
	questionId: text('question_id').notNull(),
	title: text('title').notNull(),
	difficulty: text('difficulty').notNull(),
	contentHtml: text('content_html'),
	tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
	/** langSlug -> starter code. */
	snippets: text('snippets', { mode: 'json' }).$type<Record<string, string>>().notNull(),
	exampleTestcases: text('example_testcases'),
	isPaidOnly: bool('is_paid_only').notNull().default(false),
	editorialFree: bool('editorial_free').notNull().default(false),
	fetchedAt: ts('fetched_at').notNull()
});

/** Per-problem progress and spaced-repetition schedule. */
export const problemState = sqliteTable('problem_state', {
	slug: text('slug').primaryKey(),
	firstSolvedAt: ts('first_solved_at'),
	lastSolvedAt: ts('last_solved_at'),
	solveCount: integer('solve_count').notNull().default(0),
	lastLang: text('last_lang'),
	/** Index into the SRS interval ladder; -1 = never solved. */
	srsStep: integer('srs_step').notNull().default(-1),
	dueAt: ts('due_at')
});

/** Editor drafts and judge results. One 'draft' row per slug+lang is upserted; run/submit rows accumulate. */
export const attempts = sqliteTable(
	'attempts',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull(),
		lang: text('lang').notNull(),
		kind: text('kind', { enum: ['draft', 'run', 'submit'] }).notNull(),
		code: text('code').notNull(),
		/** LeetCode interpret_id or submission_id. */
		lcId: text('lc_id'),
		statusMsg: text('status_msg'),
		accepted: bool('accepted').notNull().default(false),
		/** Raw check() response, trimmed. */
		result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
		createdAt: ts('created_at').notNull()
	},
	(t) => [
		index('attempts_slug_lang_idx').on(t.slug, t.lang, t.kind),
		uniqueIndex('attempts_draft_unique').on(t.slug, t.lang, t.kind).where(sql`kind = 'draft'`)
	]
);

/** One row per accepted LeetCode submission; the idempotency key for all rewards. */
export const awards = sqliteTable('awards', {
	submissionId: text('submission_id').primaryKey(),
	slug: text('slug').notNull(),
	lang: text('lang').notNull(),
	kind: text('kind', { enum: ['new', 'refresh', 'translation', 'external'] }).notNull(),
	research: integer('research').notNull(),
	/** resource kind -> amount granted. */
	resources: text('resources', { mode: 'json' }).$type<Record<string, number>>().notNull(),
	/** Local calendar date (YYYY-MM-DD) the award counted toward. */
	date: text('date').notNull(),
	createdAt: ts('created_at').notNull()
});

/** Weekly-budget ledger: at most one credit per problem per local date. */
export const ledger = sqliteTable(
	'ledger',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull(),
		date: text('date').notNull(),
		kind: text('kind', { enum: ['new', 'refresh', 'translation', 'external'] }).notNull(),
		createdAt: ts('created_at').notNull()
	},
	(t) => [uniqueIndex('ledger_slug_date_unique').on(t.slug, t.date), index('ledger_date_idx').on(t.date)]
);

export const resources = sqliteTable('resources', {
	kind: text('kind').primaryKey(),
	amount: integer('amount').notNull().default(0)
});

export const buildings = sqliteTable(
	'buildings',
	{
		id: text('id').primaryKey(),
		kind: text('kind').notNull(),
		x: integer('x').notNull(),
		y: integer('y').notNull(),
		level: integer('level').notNull().default(1),
		builtAt: ts('built_at').notNull()
	},
	(t) => [uniqueIndex('buildings_xy_unique').on(t.x, t.y)]
);

/** Small mutable game-wide values: morale, freeze days, grid size, last tick. */
export const gameState = sqliteTable('game_state', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
	updatedAt: ts('updated_at').notNull()
});

export const plans = sqliteTable('plans', {
	date: text('date').primaryKey(),
	createdAt: ts('created_at').notNull()
});

export const planItems = sqliteTable(
	'plan_items',
	{
		planDate: text('plan_date')
			.notNull()
			.references(() => plans.date),
		slot: integer('slot').notNull(),
		slug: text('slug').notNull(),
		kind: text('kind', { enum: ['new', 'refresh', 'daily', 'drills'] }).notNull(),
		done: bool('done').notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.planDate, t.slot] })]
);

/** Days on which the solutions drawer was opened for a slug before it was accepted; marks that day's solve as assisted. */
export const solutionViews = sqliteTable(
	'solution_views',
	{
		slug: text('slug').notNull(),
		date: text('date').notNull(),
		createdAt: ts('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.slug, t.date] })]
);

export type User = typeof users.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;
export type ProblemRow = typeof problems.$inferSelect;
export type ProblemStateRow = typeof problemState.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type AwardRow = typeof awards.$inferSelect;
export type BuildingRow = typeof buildings.$inferSelect;

/** Spaced-repetition state per syntax drill. */
export const drillState = sqliteTable('drill_state', {
	drillId: text('drill_id').primaryKey(),
	lang: text('lang').notNull(),
	srsStep: integer('srs_step').notNull().default(-1),
	dueAt: ts('due_at'),
	correct: integer('correct').notNull().default(0),
	wrong: integer('wrong').notNull().default(0),
	lastSeenAt: ts('last_seen_at')
});

export const drillAttempts = sqliteTable(
	'drill_attempts',
	{
		id: text('id').primaryKey(),
		drillId: text('drill_id').notNull(),
		date: text('date').notNull(),
		correct: bool('correct').notNull(),
		answer: text('answer').notNull(),
		createdAt: ts('created_at').notNull()
	},
	(t) => [index('drill_attempts_date_idx').on(t.date)]
);

export type DrillStateRow = typeof drillState.$inferSelect;
