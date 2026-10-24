/**
 * The materials market: coins buy timber, stone and iron, and the three swap among themselves.
 * Coins only go in (nothing is sold for coins), and Ingots and essence never trade at all.
 *
 * Prices are in coins and are each player's own. fair-price.ts sets a FAIR price per material once
 * per 8-hour epoch, from the player's own stock; this module turns it into the QUOTE, which wobbles a
 * few percent around fair, hour by hour, from a hash rather than a stored roll so the server and
 * the page always agree, and prices trades at the quote. It is kept apart from fair-price.ts, which
 * reads the whole curriculum, so the page can price a trade without shipping it.
 */

export const MATERIALS = ['timber', 'stone', 'iron'] as const;
export type Material = (typeof MATERIALS)[number];
export type Prices = Record<Material, number>;
/** What a trade may be paid with. Coins can be given, never received. */
export type Payment = Material | 'coins';

/** The quote is fair price plus or minus this much, changing on the hour. */
export const JITTER = 0.04;
/** Swaps lose this share of what is given; buying with coins has no fee. */
export const SWAP_FEE = 0.1;

export const HOUR_MS = 3_600_000;
export const EPOCH_MS = 8 * HOUR_MS;

/** floor(unix ms / 8 h): epochs begin at 00:00, 08:00 and 16:00 UTC, when the cron reprices. */
export function epochOf(ms: number): number {
	return Math.floor(ms / EPOCH_MS);
}

export function hourOf(ms: number): number {
	return Math.floor(ms / HOUR_MS);
}

export function isMaterial(k: unknown): k is Material {
	return typeof k === 'string' && (MATERIALS as readonly string[]).includes(k);
}

/** FNV-1a then a murmur finaliser: a well-spread uniform [0, 1) from a string, synchronously. */
export function hashUnit(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return (h >>> 0) / 2 ** 32;
}

/** This hour's prices for one player: fair, plus or minus JITTER. */
export function quotes(fair: Prices, uid: string, hour: number): Prices {
	const q = (m: Material) => fair[m] * (1 + JITTER * (2 * hashUnit(`${uid}|${m}|${hour}`) - 1));
	return { timber: q('timber'), stone: q('stone'), iron: q('iron') };
}

/** What `amount` of `get` costs, paid in `give`: coins at the quote, or another material at its own
 *  quote less the swap fee. Always rounded up, so rounding never pays out. */
export function priceOf(get: Material, amount: number, give: Payment, q: Prices): number {
	const coins = amount * q[get];
	const raw = give === 'coins' ? coins : coins / (q[give] * (1 - SWAP_FEE));
	return Math.ceil(raw - 1e-9);
}
