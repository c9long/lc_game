import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import {
	BUILDINGS,
	CITIES,
	EFFECT_TEXT,
	GRID_SIZE,
	STORAGE,
	TERRAIN_META,
	buildingYield,
	canAfford,
	costAtLevel,
	cityUnlocked,
	dailyCoins,
	gateSatisfied,
	nearTerrainFor,
	terrainLabel,
	terrainsFor
} from '$lib/game/city';
import { totalEssence } from '$lib/game/resources';
import { NODE_BY_ID } from '$lib/game/curriculum';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const snap = await loadSnapshot(db, user);
	const ctx = { tree: snap.tree, totalSolves: snap.totalSolves, hardSolves: snap.hardSolves };
	const essence = totalEssence(snap.resources);
	const catalog = BUILDINGS.map((b) => {
		const terrains = terrainsFor(b.id);
		return {
			id: b.id,
			name: b.name,
			emoji: b.emoji,
			coins: b.coins,
			effect: b.effect ? EFFECT_TEXT[b.effect] : null,
			maxLevel: b.maxLevel,
			cost: costAtLevel(b, 1),
			terrains,
			nearTerrain: nearTerrainFor(b.id),
			terrainLabel: terrainLabel(b.id),
			terrainEmoji: terrains.length === 1 ? TERRAIN_META[terrains[0]].emoji : '',
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
		};
	});
	const view = (p: (typeof snap.buildings)[number]) => {
		const kind = BUILDINGS.find((b) => b.id === p.kind)!;
		const next = p.level < kind.maxLevel ? costAtLevel(kind, p.level + 1) : null;
		return {
			...p,
			name: kind.name,
			emoji: kind.emoji,
			next,
			canUpgrade: next ? canAfford(snap.resources, next) : false,
			refund: costAtLevel(kind, 1),
			rate: kind.coins,
			hasNode: Boolean(kind.node),
			terrainLabel: terrainLabel(kind.id),
			effect: kind.effect ? EFFECT_TEXT[kind.effect] : null,
			// Computed with the same function the city total sums, so the two always agree.
			yield: buildingYield(p, snap.buildings, snap.tree)
		};
	};
	return {
		size: GRID_SIZE,
		essence,
		cities: CITIES.map((c) => ({
			id: c.id,
			name: c.name,
			honoree: c.honoree,
			essence: c.essence,
			unlocked: cityUnlocked(c.id, essence),
			terrain: c.terrain
		})),
		resources: snap.resources,
		buildings: snap.buildings.filter((b) => b.city !== STORAGE).map(view),
		/** Buildings the 6x6 move had nowhere to put. They cost nothing to place again. */
		stored: snap.buildings.filter((b) => b.city === STORAGE).map(view),
		catalog,
		production: dailyCoins(snap.buildings, snap.tree)
	};
};
