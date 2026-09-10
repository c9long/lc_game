import type { PageServerLoad } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { getOrCreatePlan } from '$lib/server/game/plan';
import { syncRecentAc } from '$lib/server/game/sync';
import { getLcAuth, getLcStatus } from '$lib/server/leetcode/auth';
import { WEEKLY_BUDGET } from '$lib/game/budget';
import { dailyCoins } from '$lib/game/city';
import { dueRefreshes } from '$lib/game/tree';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const env = getEnv(platform);

	const sync = await syncRecentAc(db, user).catch((e) => ({
		synced: 0,
		skipped: false,
		error: e instanceof Error ? e.message : String(e)
	}));
	const snap = await loadSnapshot(db, user);
	const plan = await getOrCreatePlan(db, snap);
	const status = await getLcStatus(db);
	const connected = Boolean(await getLcAuth(db, env));
	const nodes = [...snap.tree.values()];

	return {
		today: snap.today,
		plan,
		weekly: snap.weekly,
		budget: WEEKLY_BUDGET,
		morale: snap.morale,
		resources: snap.resources,
		production: dailyCoins(snap.buildings, snap.tree, snap.morale.morale),
		tickCoins: snap.tickCoins,
		totalSolves: snap.totalSolves,
		dueCount: dueRefreshes(snap.progress, snap.now).length,
		frontier: nodes
			.filter((n) => n.status === 'available' || n.status === 'unlocked')
			.map((n) => ({ id: n.id, pattern: n.pattern, solved: n.solved, total: n.total, status: n.status })),
		rusting: nodes.filter((n) => n.rusting).map((n) => ({ id: n.id, pattern: n.pattern, due: n.due })),
		lc: { connected, ok: status?.ok ?? false, username: status?.username ?? null, error: status?.error ?? null },
		sync,
		hasUsername: Boolean(user.lcUsername)
	};
};
