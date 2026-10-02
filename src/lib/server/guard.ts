import { error } from '@sveltejs/kit';
import type { User } from './db/schema';

export function requireUser(locals: App.Locals): User {
	if (!locals.user) error(401, 'unauthenticated');
	return locals.user;
}

/** Instance-wide settings (invites, everyone's sessions) belong to the admin alone. */
export function requireAdmin(locals: App.Locals): User {
	const user = requireUser(locals);
	if (!user.isAdmin) error(403, 'admin only');
	return user;
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'expected a JSON object body');
	return body as T;
}
