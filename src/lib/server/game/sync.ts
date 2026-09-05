import type { Db } from '../db';
import type { User } from '../db/schema';
import { fetchRecentAc } from '../leetcode/client';
import { applyAccepted } from './awards';
import { getState, setState } from './state';

const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Pulls the profile's last 20 accepted submissions so solves made outside the app still count. */
export async function syncRecentAc(
	db: Db,
	user: User,
	now = new Date(),
	force = false
): Promise<{ synced: number; skipped: boolean; error?: string }> {
	if (!user.lcUsername) return { synced: 0, skipped: true };
	const last = await getState<number>(db, 'lastSyncAt', 0);
	if (!force && now.getTime() - last < MIN_INTERVAL_MS) return { synced: 0, skipped: true };
	await setState(db, 'lastSyncAt', now.getTime());

	let list;
	try {
		list = await fetchRecentAc(user.lcUsername);
	} catch (e) {
		return { synced: 0, skipped: false, error: e instanceof Error ? e.message : String(e) };
	}

	let synced = 0;
	for (const s of [...list].sort((a, b) => a.timestamp - b.timestamp)) {
		const r = await applyAccepted(db, user, {
			submissionId: s.id,
			slug: s.titleSlug,
			lang: s.lang,
			acceptedAt: new Date(s.timestamp * 1000),
			external: true
		});
		if (!r.duplicate) synced++;
	}
	return { synced, skipped: false };
}
