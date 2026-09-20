import type { NodeView } from './tree';

export type Gate =
	| { node: string; status: 'unlocked' | 'complete' }
	| { solves: number }
	| { hard: number };

export interface BuildingKind {
	id: string;
	name: string;
	emoji: string;
	cost: Record<string, number>;
	gate?: Gate;
	/** Coins per active day at level 1. */
	coins: number;
	/** Production scales with this node's freshness. */
	node?: string;
	effect?: BuildingEffect;
	maxLevel: number;
}

export type BuildingEffect = 'adjacency' | 'hauls' | 'ironworks' | 'monument';

/** What each effect does, for the city page. The Granary and Walls were repurposed on 2026-09-16
 *  when morale went: the Granary held freeze days and Walls halved morale loss, and neither had
 *  anything left to do. Their new effects live in awards.ts, where the haul is computed. */
export const EFFECT_TEXT: Record<BuildingEffect, string> = {
	adjacency: 'neighbouring buildings produce ×1.25',
	hauls: '+1 timber and +1 stone on every solve',
	ironworks: '×1.5 iron from Hard solves',
	monument: 'a monument'
};

/** Six, not the original eight: a wide open grid had one dominant answer — fill it with Hash
 *  Markets — so tiles are scarcer now and spread over three cities with terrain of their own. */
export const GRID_SIZE = 6;
export const UPGRADE_COST_MULT = 1.5;

export type Terrain = 'plains' | 'river' | 'mountain' | 'forest';

/** Terrain is fixed per city and drawn as a picture: one string per row, one character per tile. */
const TERRAIN_BY_CHAR: Record<string, Terrain> = { '.': 'plains', '~': 'river', '^': 'mountain', '*': 'forest' };

export const TERRAIN_META: Record<Terrain, { label: string; emoji: string }> = {
	plains: { label: 'plains', emoji: '' },
	river: { label: 'river', emoji: '🌊' },
	mountain: { label: 'mountain', emoji: '⛰️' },
	forest: { label: 'forest', emoji: '🌲' }
};

/** Which kinds each terrain takes. The lock runs both ways: a kind named here can ONLY be built on
 *  its terrain, and its terrain takes nothing else. Rivers, peaks and woods are therefore a budget
 *  of tiles for those buildings rather than obstacles to clear. */
export const TERRAIN_BUILDINGS: Record<Exclude<Terrain, 'plains'>, string[]> = {
	river: ['pointer-bridge'],
	mountain: ['dp-academy', 'dp-observatory'],
	forest: ['arboretum', 'trie-library']
};

/** The same rule read the other way: kind -> the only terrain it fits. Absent means plains. */
export const TERRAIN_FOR_KIND = new Map<string, Terrain>(
	Object.entries(TERRAIN_BUILDINGS).flatMap(([t, ids]) => ids.map((id) => [id, t as Terrain] as const))
);

export interface City {
	id: number;
	name: string;
	/** The computer scientist the name plays on, shown under the tab. */
	honoree: string;
	/** Lifetime essence needed to found it. Zero for the first city. */
	essence: number;
	/** GRID_SIZE rows of GRID_SIZE characters, indexed [y][x]. */
	terrain: string[];
}

/** Cities are unlocked by essence, which until now was earned on every solve and never spent on
 *  anything. Each is the same size; what differs is how much of it the terrain spoken for. */
export const CITIES: City[] = [
	{
		id: 0,
		name: "Hopper's Humble Hamlet",
		honoree: 'Grace Hopper',
		essence: 0,
		terrain: ['......', '.~~...', '..~*..', '..~**.', '^.....', '^.....']
	},
	{
		id: 1,
		name: "Knuth's Knotted Knolls",
		honoree: 'Donald Knuth',
		essence: 150,
		terrain: ['^^...*', '.^..**', '..~...', '..~..^', '...~^^', '*..~..']
	},
	{
		id: 2,
		name: "Dijkstra's Dizzy Delta",
		honoree: 'Edsger Dijkstra',
		essence: 400,
		terrain: ['..~...', '..~.^.', '.~~...', '.~..*.', '~...*.', '~..*.^']
	}
];

export const CITY_BY_ID = new Map(CITIES.map((c) => [c.id, c]));

/** Buildings held out of any city: they keep their kind and level, produce nothing, and can be
 *  placed again for free. Somewhere for a building to go when the grid shrank under it. */
export const STORAGE = -1;

export const BUILDINGS: BuildingKind[] = [
	{ id: 'hut', name: 'Hut', emoji: '🛖', cost: { timber: 5 }, coins: 1, maxLevel: 3 },
	{ id: 'hash-market', name: 'Hash Market', emoji: '🏪', cost: { timber: 10, stone: 5 }, gate: { node: 'arrays-hashing', status: 'unlocked' }, coins: 3, node: 'arrays-hashing', maxLevel: 3 },
	{ id: 'pointer-bridge', name: 'Two-Pointer Bridge', emoji: '🌉', cost: { stone: 8 }, gate: { node: 'two-pointers', status: 'unlocked' }, coins: 2, node: 'two-pointers', maxLevel: 3 },
	{ id: 'stack-tower', name: 'Stack Tower', emoji: '🗼', cost: { stone: 10 }, gate: { node: 'stack', status: 'unlocked' }, coins: 3, node: 'stack', maxLevel: 3 },
	{ id: 'search-lighthouse', name: 'Search Lighthouse', emoji: '🗼', cost: { stone: 12 }, gate: { node: 'binary-search', status: 'unlocked' }, coins: 4, node: 'binary-search', maxLevel: 3 },
	{ id: 'window-mill', name: 'Window Mill', emoji: '🏭', cost: { timber: 12, stone: 6 }, gate: { node: 'sliding-window', status: 'unlocked' }, coins: 4, node: 'sliding-window', maxLevel: 3 },
	{ id: 'chain-foundry', name: 'Chain Foundry', emoji: '⛓️', cost: { stone: 12, iron: 2 }, gate: { node: 'linked-list', status: 'unlocked' }, coins: 4, node: 'linked-list', maxLevel: 3 },
	{ id: 'arboretum', name: 'Arboretum', emoji: '🌳', cost: { stone: 15, iron: 5 }, gate: { node: 'trees', status: 'unlocked' }, coins: 6, node: 'trees', maxLevel: 3 },
	{ id: 'trie-library', name: 'Trie Library', emoji: '📚', cost: { stone: 10, iron: 5 }, gate: { node: 'tries', status: 'unlocked' }, coins: 5, node: 'tries', maxLevel: 3 },
	{ id: 'heap-forge', name: 'Heap Forge', emoji: '⚒️', cost: { stone: 15, iron: 6 }, gate: { node: 'heap', status: 'unlocked' }, coins: 6, node: 'heap', maxLevel: 3 },
	{ id: 'maze', name: 'Backtracking Maze', emoji: '🌀', cost: { stone: 15, iron: 6 }, gate: { node: 'backtracking', status: 'unlocked' }, coins: 6, node: 'backtracking', maxLevel: 3 },
	{ id: 'graph-roads', name: 'Graph Roads', emoji: '🛣️', cost: { stone: 15, iron: 5 }, gate: { node: 'graphs', status: 'unlocked' }, coins: 2, node: 'graphs', effect: 'adjacency', maxLevel: 1 },
	{ id: 'dp-academy', name: 'DP Academy', emoji: '🏫', cost: { stone: 20, iron: 10 }, gate: { node: 'dp-1d', status: 'unlocked' }, coins: 10, node: 'dp-1d', maxLevel: 3 },
	{ id: 'dp-observatory', name: 'DP Observatory', emoji: '🔭', cost: { stone: 25, iron: 12 }, gate: { node: 'dp-2d', status: 'unlocked' }, coins: 12, node: 'dp-2d', maxLevel: 3 },
	{ id: 'greedy-market', name: 'Greedy Bazaar', emoji: '🎪', cost: { stone: 12, iron: 4 }, gate: { node: 'greedy', status: 'unlocked' }, coins: 5, node: 'greedy', maxLevel: 3 },
	{ id: 'interval-clock', name: 'Interval Clocktower', emoji: '🕰️', cost: { stone: 12, iron: 4 }, gate: { node: 'intervals', status: 'unlocked' }, coins: 5, node: 'intervals', maxLevel: 3 },
	{ id: 'bit-workshop', name: 'Bit Workshop', emoji: '🔧', cost: { iron: 10 }, gate: { node: 'bit-manipulation', status: 'unlocked' }, coins: 6, node: 'bit-manipulation', maxLevel: 3 },
	{ id: 'geometry-hall', name: 'Geometry Hall', emoji: '📐', cost: { stone: 20, iron: 10 }, gate: { node: 'math-geometry', status: 'unlocked' }, coins: 8, node: 'math-geometry', maxLevel: 3 },
	{ id: 'granary', name: 'Granary', emoji: '🌾', cost: { timber: 10, stone: 10 }, coins: 0, effect: 'hauls', maxLevel: 1 },
	{ id: 'walls', name: 'Walls', emoji: '🧱', cost: { stone: 30 }, gate: { hard: 3 }, coins: 0, effect: 'ironworks', maxLevel: 1 },
	{ id: 'monument', name: 'Monument', emoji: '🗿', cost: { iron: 50 }, gate: { solves: 100 }, coins: 0, effect: 'monument', maxLevel: 1 }
];

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

export interface PlacedBuilding {
	id: string;
	kind: string;
	/** Which city it stands in, or STORAGE for one that is held out of play. */
	city: number;
	x: number;
	y: number;
	level: number;
}

export interface GateContext {
	tree: Map<string, NodeView>;
	totalSolves: number;
	hardSolves: number;
}

export function gateSatisfied(gate: Gate | undefined, ctx: GateContext): boolean {
	if (!gate) return true;
	if ('node' in gate) {
		const st = ctx.tree.get(gate.node)?.status;
		return gate.status === 'unlocked' ? st === 'unlocked' || st === 'complete' : st === 'complete';
	}
	if ('solves' in gate) return ctx.totalSolves >= gate.solves;
	return ctx.hardSolves >= gate.hard;
}

export const INGOTS_PER_UPGRADE_LEVEL = 3;
/** Upgrades also cost coins, so daily production — and therefore finishing the expedition — is
 *  what funds a growing city, rather than coins having nothing to be spent on. */
export const COINS_PER_UPGRADE_LEVEL = 15;

/** Upgrades cost the base resources scaled up, plus Ingots (earned only from syntax drills). */
export function costAtLevel(kind: BuildingKind, level: number): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(kind.cost)) out[k] = Math.ceil(v * Math.pow(UPGRADE_COST_MULT, level - 1));
	if (level > 1) {
		out.ingots = INGOTS_PER_UPGRADE_LEVEL * (level - 1);
		out.coins = COINS_PER_UPGRADE_LEVEL * (level - 1);
	}
	return out;
}

export function canAfford(resources: Record<string, number>, cost: Record<string, number>): boolean {
	return Object.entries(cost).every(([k, v]) => (resources[k] ?? 0) >= v);
}

export function inBounds(x: number, y: number, size = GRID_SIZE): boolean {
	return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
}

/** The terrain of one tile, or null when the city or the tile does not exist. */
export function terrainAt(city: number, x: number, y: number): Terrain | null {
	const c = CITY_BY_ID.get(city);
	if (!c || !inBounds(x, y)) return null;
	return TERRAIN_BY_CHAR[c.terrain[y][x]] ?? 'plains';
}

/** The terrain a kind needs. Anything not spoken for by TERRAIN_BUILDINGS belongs on plains. */
export function terrainFor(kindId: string): Terrain {
	return TERRAIN_FOR_KIND.get(kindId) ?? 'plains';
}

export function fitsTerrain(kindId: string, terrain: Terrain): boolean {
	return terrainFor(kindId) === terrain;
}

/** How many cities the essence earned so far has founded. Essence is never spent, so the balance
 *  is also the lifetime total; if it ever gains a sink this needs a counter of its own. */
export function unlockedCities(essence: number): City[] {
	return CITIES.filter((c) => essence >= c.essence);
}

export function cityUnlocked(city: number, essence: number): boolean {
	const c = CITY_BY_ID.get(city);
	return Boolean(c) && essence >= c!.essence;
}

/** The next city to found, for the "82 / 150 essence" line on a locked tab. */
export function nextCity(essence: number): City | null {
	return CITIES.find((c) => essence < c.essence) ?? null;
}

/** Everything the build and move endpoints check about a tile, in one place so the two cannot
 *  disagree: the city is founded, the tile exists, its terrain takes this kind, and it is free. */
export function placementError(
	kindId: string,
	city: number,
	x: number,
	y: number,
	placed: PlacedBuilding[],
	essence: number
): { error: string; message: string } | null {
	if (!CITY_BY_ID.has(city)) return { error: 'bad_request', message: 'no such city' };
	if (!cityUnlocked(city, essence)) return { error: 'locked', message: 'that city is not founded yet' };
	const terrain = terrainAt(city, x, y);
	if (!terrain) return { error: 'bad_request', message: 'off the grid' };
	if (!fitsTerrain(kindId, terrain)) {
		const needs = terrainFor(kindId);
		const message =
			needs === 'plains'
				? `cannot be built on ${TERRAIN_META[terrain].label}`
				: `can only be built on ${TERRAIN_META[needs].label}`;
		return { error: 'terrain', message };
	}
	if (placed.some((b) => b.city === city && b.x === x && b.y === y)) return { error: 'occupied', message: 'tile is occupied' };
	return null;
}

/** Coins produced by the city for one active day. */
export const ROAD_ADJACENCY_BONUS = 1.25;

/** Each DIFFERENT kind of building next door adds this much. Four distinct neighbours is ×1.6.
 *  This is what a street of nothing but Hash Markets gives up: identical neighbours add nothing,
 *  so a mixed quarter out-earns the one building that happens to unlock first. */
export const DIVERSITY_BONUS_PER_KIND = 0.15;

/** What one building contributes per active day, and where the number comes from. */
export interface BuildingYield {
	/** The building's rate at level 1, times its level, before any scaling. */
	base: number;
	/** The node's freshness, or 1 for a building not tied to a node. */
	freshness: number;
	/** ROAD_ADJACENCY_BONUS when it neighbours Graph Roads, else 1. */
	adjacency: number;
	/** 1 + DIVERSITY_BONUS_PER_KIND per distinct neighbouring kind other than its own. */
	diversity: number;
	/** Coins per active day. Unrounded: the city total is rounded once after summing, so
	 *  per-building figures will not always add up to it exactly. */
	perDay: number;
}

/**
 * The per-building half of the production formula.
 *
 * baseProduction() sums this rather than repeating the arithmetic, so the breakdown shown on a
 * tile and the city's total can never drift apart.
 */
export function buildingYield(
	b: PlacedBuilding,
	placed: PlacedBuilding[],
	tree: Map<string, NodeView>
): BuildingYield {
	const kind = BUILDING_BY_ID.get(b.kind);
	const none = { base: 0, freshness: 1, adjacency: 1, diversity: 1, perDay: 0 };
	// A building in storage stands in no city and earns nothing until it is placed again.
	if (!kind || kind.coins === 0 || b.city === STORAGE) return none;

	// Only the four orthogonal tiles of the SAME city are neighbours: two cities share coordinates.
	const neighbours = placed.filter(
		(p) => p.city === b.city && Math.abs(p.x - b.x) + Math.abs(p.y - b.y) === 1
	);
	const base = kind.coins * b.level;
	const freshness = kind.node ? (tree.get(kind.node)?.freshness ?? 1) : 1;
	const adjacency = neighbours.some((p) => BUILDING_BY_ID.get(p.kind)?.effect === 'adjacency')
		? ROAD_ADJACENCY_BONUS
		: 1;
	const distinct = new Set(neighbours.map((p) => p.kind).filter((k) => k !== b.kind)).size;
	const diversity = 1 + DIVERSITY_BONUS_PER_KIND * distinct;
	return { base, freshness, adjacency, diversity, perDay: base * freshness * adjacency * diversity };
}

export function baseProduction(placed: PlacedBuilding[], tree: Map<string, NodeView>): number {
	let total = 0;
	for (const b of placed) total += buildingYield(b, placed, tree).perDay;
	return total;
}

export function dailyCoins(placed: PlacedBuilding[], tree: Map<string, NodeView>): number {
	return Math.round(baseProduction(placed, tree));
}

export interface Relocation {
	id: string;
	city: number;
	x: number;
	y: number;
}

/** Is this building standing somewhere it is allowed to stand? */
export function wellPlaced(b: PlacedBuilding): boolean {
	if (b.city === STORAGE) return true;
	const terrain = terrainAt(b.city, b.x, b.y);
	return terrain !== null && fitsTerrain(b.kind, terrain);
}

/**
 * Where every misplaced building has to move to, now that the grid is 6x6 with terrain on it.
 *
 * Buildings predating the change sit anywhere in an open 8x8: off the new edge, or on ground that
 * now belongs to a river. Rather than destroy them, each is moved to the nearest tile it fits in
 * its own city, keeping its level. What will not fit goes to storage, to be placed for free later.
 *
 * Pure and idempotent: run on a valid city it returns nothing, which is why loadSnapshot can call
 * it on every load without a migration flag to remember whether it has run.
 */
export function relocate(placed: PlacedBuilding[]): Relocation[] {
	const misplaced = placed.filter((b) => !wellPlaced(b));
	if (misplaced.length === 0) return [];

	const taken = new Set(placed.filter(wellPlaced).map((b) => `${b.city},${b.x},${b.y}`));
	// Biggest first: if tiles run short, the levelled-up and higher-earning buildings keep theirs.
	const order = [...misplaced].sort(
		(a, b) => b.level - a.level || (BUILDING_BY_ID.get(b.kind)?.coins ?? 0) - (BUILDING_BY_ID.get(a.kind)?.coins ?? 0) || a.id.localeCompare(b.id)
	);
	let storageSlot = Math.max(-1, ...placed.filter((b) => b.city === STORAGE).map((b) => b.x)) + 1;
	const moves: Relocation[] = [];

	for (const b of order) {
		const city = CITY_BY_ID.has(b.city) ? b.city : CITIES[0].id;
		let best: { x: number; y: number; d: number } | null = null;
		for (let y = 0; y < GRID_SIZE; y++) {
			for (let x = 0; x < GRID_SIZE; x++) {
				if (taken.has(`${city},${x},${y}`)) continue;
				if (!fitsTerrain(b.kind, terrainAt(city, x, y)!)) continue;
				const d = Math.abs(x - b.x) + Math.abs(y - b.y);
				if (!best || d < best.d) best = { x, y, d };
			}
		}
		if (best) {
			taken.add(`${city},${best.x},${best.y}`);
			moves.push({ id: b.id, city, x: best.x, y: best.y });
		} else {
			moves.push({ id: b.id, city: STORAGE, x: storageSlot++, y: 0 });
		}
	}
	return moves;
}

export function hasEffect(placed: PlacedBuilding[], effect: BuildingKind['effect']): boolean {
	return placed.some((b) => BUILDING_BY_ID.get(b.kind)?.effect === effect);
}

/** Settles daily production for every day that is ready to be paid.
 *
 *  A day is only payable once its ledger means something. Production used to be paid inside the
 *  daily tick, which runs for TODAY on the first page load of the day — at that moment nothing has
 *  been solved yet, so the "at least one solve" test failed and the day was written off for good.
 *  So: finished days are paid from their final ledger, and today is paid as soon as it has a solve.
 *
 *  Pure so the rule can be tested without a database. `earliest` bounds the walk, since the ledger
 *  is only loaded for a recent window.
 */
export function settleProduction(input: {
	coinsAsOf: string;
	today: string;
	earliest: string;
	active: Set<string>;
	/** The city's output for one active day, at today's freshness. Earlier days are paid at this
	 *  rate too: freshness is not recorded per day, and morale -- which was -- is gone. */
	perDay: number;
	addDays: (date: string, n: number) => string;
}): { coins: number; coinsAsOf: string } {
	const { today, earliest, active, perDay, addDays } = input;
	let coinsAsOf = input.coinsAsOf < earliest ? addDays(earliest, -1) : input.coinsAsOf;
	const yesterday = addDays(today, -1);
	let coins = 0;

	for (let d = addDays(coinsAsOf, 1); d <= yesterday; d = addDays(d, 1)) {
		if (active.has(d)) coins += perDay;
		coinsAsOf = d;
	}
	// Today is paid the moment it has a solve, and only once.
	if (coinsAsOf < today && active.has(today)) {
		coins += perDay;
		coinsAsOf = today;
	}
	return { coins, coinsAsOf };
}
