import { BASE_RESOURCE, RESOURCE_FOR, SECONDARY_RESOURCES } from './awards';
import { BALANCE_LEVEL, BUILDINGS, CITIES, investedCost } from './city';
import { PROBLEMS } from './curriculum';
import { MATERIALS, isMaterial, type Material, type Prices } from './market';

/**
 * Where a player's fair market prices come from (market.ts turns them into quotes and trades).
 *
 * A material's BASE value is how scarce the game makes it: what building everything asks for over
 * what solving everything pays, so it follows any retune of either. A player's TARGET scales that
 * by their own stock: what they hold more of than building needs is cheap for them, what they are
 * short of is dear. Each 8-hour epoch the FAIR price moves halfway from the last one to the target.
 *
 * Because prices follow your own holdings, swapping A for B makes A dearer and B cheaper for you
 * at the next reprice: the way back is always worse, so there is nothing to farm.
 */

/** Coins one timber is worth at base. A Medium solve's 3 timber and 3 stone come to about 30 coins,
 *  against 45 coins for an upgrade level. */
export const COIN_ANCHOR = 5;
/** Keeps a material you hold none of from pricing at the clamp off a zero share. */
export const SHARE_SMOOTHING = 0.05;
/** How hard price answers abundance: price multiplier = abundance ^ -ELASTICITY, clamped. */
export const ELASTICITY = 0.35;
export const MULT_MIN = 0.75;
export const MULT_MAX = 4 / 3;
/** Base-coins of stock at which a player's prices are halfway to fully their own. A new player with a
 *  few timber sees near-base prices rather than wild ones off a tiny sample. */
export const CONFIDENCE_SCALE = 200;
/** How far each reprice moves fair price toward the new target. */
export const FAIR_STEP = 0.5;
/** Base-coins' worth of each material a player can receive per epoch. */
export const EPOCH_CAP_VALUE = 300;

function perMaterial(f: (m: Material) => number): Prices {
	return { timber: f('timber'), stone: f('stone'), iron: f('iron') };
}

/** Units of each material asked for by one of every building, built and upgraded to BALANCE_LEVEL. */
export function materialDemand(): Prices {
	const out = perMaterial(() => 0);
	for (const kind of BUILDINGS) {
		const paid = investedCost(kind, Math.min(kind.maxLevel, BALANCE_LEVEL), CITIES[0].id);
		for (const m of MATERIALS) out[m] += paid[m] ?? 0;
	}
	return out;
}

/** Units of each material paid by one plain solve of every problem in the curriculum. */
export function materialSupply(): Prices {
	const out = perMaterial(() => 0);
	for (const p of PROBLEMS) {
		const primary = RESOURCE_FOR[p.difficulty];
		if (isMaterial(primary)) out[primary] += BASE_RESOURCE;
		for (const [k, n] of Object.entries(SECONDARY_RESOURCES[p.difficulty])) if (isMaterial(k)) out[k] += n;
	}
	return out;
}

/** Coins per unit at base: scarcity (demand over supply), scaled so timber is COIN_ANCHOR. */
export function baseValues(): Prices {
	const demand = materialDemand();
	const supply = materialSupply();
	const scarcity = perMaterial((m) => demand[m] / supply[m]);
	return perMaterial((m) => (COIN_ANCHOR * scarcity[m]) / scarcity.timber);
}

export const BASE: Prices = baseValues();

/** The share of a balanced stock's value each material makes up: what building asks for, by value. */
export const TARGET_SHARE: Prices = (() => {
	const demand = materialDemand();
	const total = MATERIALS.reduce((s, m) => s + demand[m] * BASE[m], 0);
	return perMaterial((m) => (demand[m] * BASE[m]) / total);
})();

/** Above 1: holds more of it than building needs. Below 1: short of it. 1 when holding nothing. */
export function abundance(holdings: Partial<Record<string, number>>): Prices {
	const value = perMaterial((m) => Math.max(0, holdings[m] ?? 0) * BASE[m]);
	const total = MATERIALS.reduce((s, m) => s + value[m], 0);
	if (total <= 0) return perMaterial(() => 1);
	return perMaterial((m) => (value[m] / total + SHARE_SMOOTHING) / (TARGET_SHARE[m] + SHARE_SMOOTHING));
}

/** Where this player's prices are heading: base, scaled by their own abundance. */
export function targetPrices(holdings: Partial<Record<string, number>>): Prices {
	const a = abundance(holdings);
	const stock = MATERIALS.reduce((s, m) => s + Math.max(0, holdings[m] ?? 0) * BASE[m], 0);
	const confidence = stock / (stock + CONFIDENCE_SCALE);
	return perMaterial((m) => {
		const mult = Math.min(MULT_MAX, Math.max(MULT_MIN, a[m] ** -ELASTICITY));
		return BASE[m] * mult ** confidence;
	});
}

/** The fair price for a new epoch: FAIR_STEP of the way from the last one to the target. */
export function nextFair(prev: Prices | null, holdings: Partial<Record<string, number>>): Prices {
	const target = targetPrices(holdings);
	if (!prev) return target;
	return perMaterial((m) => prev[m] + FAIR_STEP * (target[m] - prev[m]));
}

/** Units of a material a player can receive per epoch. */
export function epochCap(m: Material): number {
	return Math.floor(EPOCH_CAP_VALUE / BASE[m]);
}
