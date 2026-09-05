import type { RequestEvent } from '@sveltejs/kit';
import { timingSafeEqual } from '../crypto';

/** Registration is open to a signed-in user (adding a device) or to a bearer of the one-time SETUP_TOKEN. */
export function registrationAllowed(event: RequestEvent): boolean {
	if (event.locals.user) return true;
	const expected = event.platform?.env?.SETUP_TOKEN;
	const token = event.url.searchParams.get('token');
	return Boolean(expected && token && timingSafeEqual(expected, token));
}
