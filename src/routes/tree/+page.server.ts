import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const snap = await loadSnapshot(getDb(platform), user);
	return { nodes: [...snap.tree.values()], totalSolves: snap.totalSolves };
};
