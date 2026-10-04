import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { getOrCreatePlan, weeklyExpedition } from '$lib/server/game/plan';
import { syncRecentAc } from '$lib/server/game/sync';
import { dailyCoins } from '$lib/game/city';
import { dueRefreshes } from '$lib/game/tree';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);

	const sync = await syncRecentAc(db, user).catch((e) => ({
		synced: 0,
		skipped: false,
		error: e instanceof Error ? e.message : String(e)
	}));
	const snap = await loadSnapshot(db, user);
	const plan = await getOrCreatePlan(db, snap);
	const nodes = [...snap.tree.values()];

	return {
		today: snap.today,
		plan,
		weekly: snap.weekly,
		// After getOrCreatePlan, so today's offers count.
		expedition: await weeklyExpedition(db, snap),
		resources: snap.resources,
		production: dailyCoins(snap.buildings, snap.tree),
		tickCoins: snap.tickCoins,
		totalSolves: snap.totalSolves,
		dueCount: dueRefreshes(snap.tree, snap.progress, snap.now).length,
		frontier: nodes
			.filter((n) => n.status === 'available' || n.status === 'unlocked')
			.map((n) => ({ id: n.id, pattern: n.pattern, solved: n.solved, total: n.total, status: n.status })),
		rusting: nodes.filter((n) => n.rusting).map((n) => ({ id: n.id, pattern: n.pattern, due: n.due })),
		sync,
		hasUsername: Boolean(user.lcUsername)
	};
};
