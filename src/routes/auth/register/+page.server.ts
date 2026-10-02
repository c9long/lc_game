import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { registrationFor } from '$lib/server/auth/register';

export const load: PageServerLoad = async (event) => {
	const reg = await registrationFor(event, getDb(event.platform));
	return {
		mode: reg?.mode ?? null,
		name: reg?.name ?? '',
		// Carried through to the options and verify calls, which check it again.
		query: event.url.search
	};
};
