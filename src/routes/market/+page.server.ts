import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { ensurePrices, receivedThisEpoch, recentTrades } from '$lib/server/game/market';
import { EPOCH_MS, HOUR_MS, MATERIALS, hourOf, quotes } from '$lib/game/market';
import { BASE, MULT_MAX, MULT_MIN, epochCap } from '$lib/game/fair-price';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	// Settles the day's coins first, so what the page offers to spend is what there is.
	const snap = await loadSnapshot(db, user);
	const now = Date.now();
	const { epoch, fair, prev } = await ensurePrices(db, user.id, new Date(now));
	const [received, trades] = await Promise.all([receivedThisEpoch(db, user.id, epoch), recentTrades(db, user.id)]);
	const caps = { timber: epochCap('timber'), stone: epochCap('stone'), iron: epochCap('iron') };
	return {
		quotes: quotes(fair, user.id, hourOf(now)),
		fair,
		prev,
		base: BASE,
		band: { min: MULT_MIN, max: MULT_MAX },
		room: Object.fromEntries(MATERIALS.map((m) => [m, Math.max(0, caps[m] - received[m])])) as Record<(typeof MATERIALS)[number], number>,
		held: {
			coins: snap.resources.coins ?? 0,
			timber: snap.resources.timber ?? 0,
			stone: snap.resources.stone ?? 0,
			iron: snap.resources.iron ?? 0
		},
		hourEndsAt: (hourOf(now) + 1) * HOUR_MS,
		repriceAt: (epoch + 1) * EPOCH_MS,
		trades
	};
};
