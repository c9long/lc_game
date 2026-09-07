import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { resources } from '$lib/server/db/schema';

/** Route prefixes where the resource bar is hidden: they want the screen for the task at hand. */
const NO_BAR = ['/solve/', '/drills', '/tree'];

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
	const user = locals.user
		? { id: locals.user.id, lcUsername: locals.user.lcUsername, timezone: locals.user.timezone }
		: null;

	const showResourceBar = Boolean(user) && !NO_BAR.some((p) => url.pathname.startsWith(p));
	if (!showResourceBar) return { user, showResourceBar, resources: {} as Record<string, number> };

	// A plain read rather than loadSnapshot(), which has side effects. The page's own load settles
	// production, so on the first visit of a day the bar can trail the page by one navigation.
	const rows = await getDb(platform).select().from(resources).all();
	return {
		user,
		showResourceBar,
		resources: Object.fromEntries(rows.map((r) => [r.kind, r.amount])) as Record<string, number>
	};
};
