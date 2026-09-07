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
	effect?: 'adjacency' | 'walls' | 'granary' | 'monument';
	maxLevel: number;
}

export const GRID_SIZE = 8;
export const UPGRADE_COST_MULT = 1.5;

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
	{ id: 'granary', name: 'Granary', emoji: '🌾', cost: { timber: 10, stone: 10 }, coins: 0, effect: 'granary', maxLevel: 1 },
	{ id: 'walls', name: 'Walls', emoji: '🧱', cost: { stone: 30 }, gate: { hard: 3 }, coins: 0, effect: 'walls', maxLevel: 1 },
	{ id: 'monument', name: 'Monument', emoji: '🗿', cost: { iron: 50 }, gate: { solves: 100 }, coins: 0, effect: 'monument', maxLevel: 1 }
];

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

export interface PlacedBuilding {
	id: string;
	kind: string;
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

/** Upgrades cost the base resources scaled up, plus Ingots (earned only from syntax drills). */
export function costAtLevel(kind: BuildingKind, level: number): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [k, v] of Object.entries(kind.cost)) out[k] = Math.ceil(v * Math.pow(UPGRADE_COST_MULT, level - 1));
	if (level > 1) out.ingots = INGOTS_PER_UPGRADE_LEVEL * (level - 1);
	return out;
}

export function canAfford(resources: Record<string, number>, cost: Record<string, number>): boolean {
	return Object.entries(cost).every(([k, v]) => (resources[k] ?? 0) >= v);
}

export function inBounds(x: number, y: number, size = GRID_SIZE): boolean {
	return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
}

/** Coins produced by the city for one active day, before the morale factor. */
export function baseProduction(placed: PlacedBuilding[], tree: Map<string, NodeView>): number {
	const roads = new Set(
		placed.filter((b) => BUILDING_BY_ID.get(b.kind)?.effect === 'adjacency').map((b) => `${b.x},${b.y}`)
	);
	let total = 0;
	for (const b of placed) {
		const kind = BUILDING_BY_ID.get(b.kind);
		if (!kind || kind.coins === 0) continue;
		let coins = kind.coins * b.level;
		if (kind.node) coins *= tree.get(kind.node)?.freshness ?? 1;
		const adjacent = [
			[b.x + 1, b.y],
			[b.x - 1, b.y],
			[b.x, b.y + 1],
			[b.x, b.y - 1]
		].some(([x, y]) => roads.has(`${x},${y}`));
		if (adjacent) coins *= 1.25;
		total += coins;
	}
	return total;
}

export function dailyCoins(placed: PlacedBuilding[], tree: Map<string, NodeView>, morale: number): number {
	return Math.round(baseProduction(placed, tree) * (Math.max(0, Math.min(100, morale)) / 100));
}

export function hasEffect(placed: PlacedBuilding[], effect: BuildingKind['effect']): boolean {
	return placed.some((b) => BUILDING_BY_ID.get(b.kind)?.effect === effect);
}

/** Settles daily production for every day that is ready to be paid.
 *
 *  A day is only payable once its ledger means something. Production used to be paid inside the
 *  morale tick, which runs for TODAY on the first page load of the day — at that moment nothing has
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
	moraleByDate: Map<string, number>;
	currentMorale: number;
	perDay: (morale: number) => number;
	addDays: (date: string, n: number) => string;
}): { coins: number; coinsAsOf: string } {
	const { today, earliest, active, moraleByDate, currentMorale, perDay, addDays } = input;
	let coinsAsOf = input.coinsAsOf < earliest ? addDays(earliest, -1) : input.coinsAsOf;
	const yesterday = addDays(today, -1);
	let coins = 0;

	for (let d = addDays(coinsAsOf, 1); d <= yesterday; d = addDays(d, 1)) {
		if (active.has(d)) coins += perDay(moraleByDate.get(d) ?? currentMorale);
		coinsAsOf = d;
	}
	// Today is paid the moment it has a solve, and only once.
	if (coinsAsOf < today && active.has(today)) {
		coins += perDay(currentMorale);
		coinsAsOf = today;
	}
	return { coins, coinsAsOf };
}
