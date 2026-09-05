import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { sessions, users, type User } from '../db/schema';
import { randomId, sha256Hex } from '../crypto';

export const SESSION_COOKIE = 'lc_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(db: Db, userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = randomId(32);
	const id = await sha256Hex(token);
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
	await db.insert(sessions).values({ id, userId, expiresAt, createdAt: now });
	return { token, expiresAt };
}

export async function validateSession(
	db: Db,
	token: string
): Promise<{ sessionId: string; user: User } | null> {
	const id = await sha256Hex(token);
	const row = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;
	const now = Date.now();
	if (row.session.expiresAt.getTime() < now) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return null;
	}
	if (row.session.expiresAt.getTime() - now < SESSION_TTL_MS / 2) {
		await db
			.update(sessions)
			.set({ expiresAt: new Date(now + SESSION_TTL_MS) })
			.where(eq(sessions.id, id));
	}
	return { sessionId: id, user: row.user };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteAllSessions(db: Db): Promise<void> {
	await db.delete(sessions);
}

export function sessionCookieOptions(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax' as const,
		maxAge: SESSION_TTL_MS / 1000
	};
}
