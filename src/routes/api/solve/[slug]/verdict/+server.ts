import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import { readJson, requireUser } from '$lib/server/guard';
import { getProblem } from '$lib/server/problems';
import { randomId } from '$lib/server/crypto';
import { validLang } from '$lib/server/judge';
import { applyAccepted } from '$lib/server/game/awards';

const VERDICTS = new Set([
	'Accepted',
	'Wrong Answer',
	'Runtime Error',
	'Compile Error',
	'Time Limit Exceeded'
]);

/**
 * Records the outcome of a browser-side judge run and, for an accepted submission, applies the
 * award.
 *
 * The verdict is asserted by the client because execution happens in the browser under Pyodide
 * (docs/07-pyodide-judge.md). That is acceptable for a single-user app — the only person who can
 * be cheated is Chris — but it is why the code and the per-case counts are stored alongside: a
 * future server-side runner can re-verify the history rather than making him re-earn it.
 */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);

	const body = await readJson<{
		lang?: unknown;
		code?: unknown;
		kind?: unknown;
		verdict?: unknown;
		passed?: unknown;
		total?: unknown;
		elapsedMs?: unknown;
	}>(event.request);

	const kind = body.kind === 'submit' ? 'submit' : 'run';
	if (!validLang(body.lang) || typeof body.code !== 'string') {
		return json({ error: 'bad_request', message: 'lang and code are required' }, { status: 400 });
	}
	if (typeof body.verdict !== 'string' || !VERDICTS.has(body.verdict)) {
		return json({ error: 'bad_request', message: 'unknown verdict' }, { status: 400 });
	}

	const problem = await getProblem(db, event.params.slug);
	if (!problem) return json({ error: 'not_found', message: 'unknown problem' }, { status: 404 });

	const passed = Number(body.passed ?? 0);
	const total = Number(body.total ?? 0);
	const accepted = kind === 'submit' && body.verdict === 'Accepted' && total > 0 && passed === total;

	const id = randomId();
	await db.insert(attempts).values({
		id: randomId(),
		slug: problem.slug,
		lang: body.lang,
		kind,
		code: body.code,
		lcId: id,
		statusMsg: body.verdict,
		accepted,
		result: {
			verdict: body.verdict,
			passed,
			total,
			elapsedMs: Number(body.elapsedMs ?? 0),
			judge: 'pyodide'
		},
		createdAt: new Date()
	});

	const award = accepted
		? await applyAccepted(db, user, {
				submissionId: id,
				slug: problem.slug,
				lang: body.lang,
				acceptedAt: new Date(),
				external: false
			})
		: null;

	return json({ id, accepted, award });
};
