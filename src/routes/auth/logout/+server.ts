import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE, deleteSession } from '$lib/server/auth/session';

export const POST: RequestHandler = async (event) => {
	if (event.locals.sessionId) await deleteSession(getDb(event.platform), event.locals.sessionId);
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/auth/login');
};
