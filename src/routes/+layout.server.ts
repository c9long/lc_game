import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user
		? { id: locals.user.id, lcUsername: locals.user.lcUsername, timezone: locals.user.timezone }
		: null
});
