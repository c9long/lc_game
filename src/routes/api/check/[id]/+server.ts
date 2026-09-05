import { json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { attempts } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { getLcAuth } from '$lib/server/leetcode/auth';
import { check, summarizeCheck } from '$lib/server/leetcode/client';
import { judgeErrorResponse } from '$lib/server/judge';
import { applyAccepted } from '$lib/server/game/awards';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const id = event.params.id;
	const attempt = await db
		.select()
		.from(attempts)
		.where(eq(attempts.lcId, id))
		.orderBy(desc(attempts.createdAt))
		.get();
	if (!attempt) return json({ error: 'not_found', message: 'unknown judge id' }, { status: 404 });
	if (attempt.result && attempt.statusMsg) {
		return json({ state: 'SUCCESS', result: attempt.result, cached: true });
	}
	const auth = await getLcAuth(db, getEnv(event.platform));
	if (!auth) return json({ error: 'no_cookie', message: 'Connect LeetCode in Admin first.' }, { status: 424 });

	try {
		const res = await check(auth, id, attempt.slug);
		if (res.state !== 'SUCCESS') return json({ state: res.state ?? 'PENDING' });
		const result = summarizeCheck(res);
		const accepted = attempt.kind === 'submit' && res.status_msg === 'Accepted';
		await db
			.update(attempts)
			.set({ statusMsg: res.status_msg ?? res.state, accepted, result })
			.where(eq(attempts.id, attempt.id));
		let award = null;
		if (accepted) {
			award = await applyAccepted(db, user, {
				submissionId: id,
				slug: attempt.slug,
				lang: attempt.lang,
				acceptedAt: new Date(),
				external: false
			});
		}
		return json({ state: 'SUCCESS', result, award });
	} catch (e) {
		return judgeErrorResponse(db, e);
	}
};
