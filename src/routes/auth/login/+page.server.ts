import { redirect } from '@sveltejs/kit';
import { count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { passkeys } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (locals.user) redirect(303, '/');
	const db = getDb(platform);
	const [{ n }] = await db.select({ n: count() }).from(passkeys);
	return { hasPasskey: n > 0, next: url.searchParams.get('next') ?? '/' };
};
