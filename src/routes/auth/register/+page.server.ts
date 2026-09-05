import type { PageServerLoad } from './$types';
import { registrationAllowed } from '$lib/server/auth/register';

export const load: PageServerLoad = async (event) => ({
	allowed: registrationAllowed(event),
	token: event.url.searchParams.get('token') ?? '',
	signedIn: Boolean(event.locals.user)
});
