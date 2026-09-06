import { error, redirect, type Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth/session';

// Paths reachable without a session. Everything else requires the single registered user.
// /pyodide/ carries the judge worker, the WASM runtime and driver.py. The worker and the fetches
// it makes are same-origin and would normally carry the session cookie, but static runtime assets
// have no business going through the auth redirect — same reasoning as /monaco/.
const PUBLIC_PREFIXES = ['/auth/', '/_app/', '/solutions/', '/monaco/', '/pyodide/', '/favicon', '/robots.txt', '/manifest'];

/** D1 reports an unmigrated database as "no such table"; Drizzle wraps it in "Failed query". */
function isMissingSchema(e: unknown): boolean {
	const seen = new Set<unknown>();
	let cur: unknown = e;
	while (cur && typeof cur === 'object' && !seen.has(cur)) {
		seen.add(cur);
		const msg = (cur as { message?: unknown }).message;
		if (typeof msg === 'string' && /no such table/i.test(msg)) return true;
		cur = (cur as { cause?: unknown }).cause;
	}
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionId = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token && event.platform?.env?.DB) {
		let found;
		try {
			found = await validateSession(getDb(event.platform), token);
		} catch (e) {
			if (isMissingSchema(e)) {
				error(
					503,
					'The database has no tables yet. Run `pnpm db:migrate:local` for local dev (also runs automatically before `pnpm dev`) or `pnpm db:migrate:remote` for production, then reload. Note: changing database_id in wrangler.toml switches the local database file.'
				);
			}
			throw e;
		}
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
