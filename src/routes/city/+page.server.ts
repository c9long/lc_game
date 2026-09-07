import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { getState, loadSnapshot } from '$lib/server/game/state';
import { freezeCost as freezeCostFor, freezePurchasesThisWeek, type FreezePurchases } from '$lib/game/budget';
import { weekStartOf } from '$lib/game/dates';
import { BUILDINGS, GRID_SIZE, canAfford, costAtLevel, dailyCoins, gateSatisfied, hasEffect } from '$lib/game/city';
import { NODE_BY_ID } from '$lib/game/curriculum';



export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const snap = await loadSnapshot(db, user);

	// Freeze days get more expensive with each one bought this week, so the price has to be read
	// rather than hard-coded in two places as it was.
	const week = weekStartOf(snap.today);
	const freezeRecord = await getState<FreezePurchases | null>(db, 'freezePurchases', null);
	const freezeBought = freezePurchasesThisWeek(freezeRecord, week);
	const freezeCost = freezeCostFor(freezeBought);
	const ctx = { tree: snap.tree, totalSolves: snap.totalSolves, hardSolves: snap.hardSolves };
	const catalog = BUILDINGS.map((b) => ({
		id: b.id,
		name: b.name,
		emoji: b.emoji,
		coins: b.coins,
		effect: b.effect ?? null,
		maxLevel: b.maxLevel,
		cost: costAtLevel(b, 1),
		gateText: !b.gate
			? ''
			: 'node' in b.gate
				? `${NODE_BY_ID.get(b.gate.node)?.pattern} ${b.gate.status}`
				: 'solves' in b.gate
					? `${b.gate.solves} solves`
					: `${b.gate.hard} Hard solves`,
		gated: gateSatisfied(b.gate, ctx),
		affordable: canAfford(snap.resources, costAtLevel(b, 1)),
		nodeFreshness: b.node ? (snap.tree.get(b.node)?.freshness ?? 1) : null
	}));
	const buildings = snap.buildings.map((p) => {
		const kind = BUILDINGS.find((b) => b.id === p.kind)!;
		const next = p.level < kind.maxLevel ? costAtLevel(kind, p.level + 1) : null;
		return { ...p, name: kind.name, emoji: kind.emoji, next, canUpgrade: next ? canAfford(snap.resources, next) : false };
	});
	return {
		size: GRID_SIZE,
		resources: snap.resources,
		buildings,
		catalog,
		morale: snap.morale,
		production: dailyCoins(snap.buildings, snap.tree, snap.morale.morale),
		hasGranary: hasEffect(snap.buildings, 'granary'),
		freezeCost,
		freezeBought
	};
};
