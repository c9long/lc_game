import { error, redirect, type Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth/session';

// Paths reachable without a session. Everything else requires the single registered user.
const PUBLIC_PREFIXES = ['/auth/', '/_app/', '/solutions/', '/monaco/', '/favicon', '/robots.txt', '/manifest'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token && event.platform?.env?.DB) {
		const found = await validateSession(getDb(event.platform), token);
		if (found) {
			event.locals.user = found.user;
			event.locals.sessionId = found.sessionId;
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

	// Same-origin check for state-changing API calls (session cookie is SameSite=Lax as well).
	if (path.startsWith('/api/') && event.request.method !== 'GET') {
		const origin = event.request.headers.get('origin');
		if (origin && origin !== event.url.origin) error(403, 'cross-origin request rejected');
	}

	if (!event.locals.user && !isPublic) {
		if (path.startsWith('/api/')) error(401, 'unauthenticated');
		redirect(303, `/auth/login?next=${encodeURIComponent(path + event.url.search)}`);
	}

	const response = await resolve(event);
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	if (event.url.protocol === 'https:') {
		response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};
