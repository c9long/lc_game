import { describe, expect, it } from 'vitest';
import { JITTER, MATERIALS, epochOf, hourOf, priceOf, quotes, type Material, type Prices } from './market';
import { BASE, MULT_MAX, MULT_MIN, epochCap, nextFair, targetPrices } from './fair-price';

/** A seeded PRNG so the adversary's runs are the same every time. */
function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

describe('market prices', () => {
	it('values materials by how scarce the game makes them', () => {
		expect(BASE.timber).toBe(5);
		expect(BASE.stone).toBeCloseTo(5, 0);
		// Iron comes only from Hard problems, a seventh of the curriculum.
		expect(BASE.iron).toBeGreaterThan(15);
		expect(BASE.iron).toBeLessThan(25);
	});

	it('gives a player with nothing the base prices', () => {
		expect(targetPrices({})).toEqual(BASE);
	});

	it('makes what you hold a lot of cheap and what you lack dear', () => {
		const p = targetPrices({ timber: 180, stone: 5, iron: 10 });
		expect(p.timber).toBeLessThan(BASE.timber);
		expect(p.stone).toBeGreaterThan(BASE.stone);
		expect(p.iron).toBeGreaterThan(BASE.iron);
	});

	it('keeps prices within the clamps however lopsided the stock', () => {
		for (const h of [{ timber: 1e6 }, { stone: 1e6 }, { iron: 1e6 }, { timber: 1e6, stone: 1e6 }]) {
			const p = targetPrices(h);
			for (const m of MATERIALS) {
				expect(p[m] / BASE[m]).toBeGreaterThanOrEqual(MULT_MIN - 1e-9);
				expect(p[m] / BASE[m]).toBeLessThanOrEqual(MULT_MAX + 1e-9);
			}
		}
	});

	it('barely moves a new player off base', () => {
		const p = targetPrices({ timber: 10 });
		for (const m of MATERIALS) expect(Math.abs(p[m] / BASE[m] - 1)).toBeLessThan(0.07);
	});

	it('moves fair price halfway to the target each epoch', () => {
		const h = { timber: 180, stone: 5, iron: 10 };
		const target = targetPrices(h);
		const fair = nextFair(BASE, h);
		for (const m of MATERIALS) expect(fair[m]).toBeCloseTo((BASE[m] + target[m]) / 2, 9);
		expect(nextFair(null, h)).toEqual(target);
	});

	it('quotes within the jitter of fair, the same all hour and different the next', () => {
		const t = Date.UTC(2026, 9, 24, 13, 5);
		const a = quotes(BASE, 'u1', hourOf(t));
		expect(quotes(BASE, 'u1', hourOf(t + 50 * 60_000))).toEqual(a);
		expect(quotes(BASE, 'u1', hourOf(t + 60 * 60_000))).not.toEqual(a);
		expect(quotes(BASE, 'u2', hourOf(t))).not.toEqual(a);
		for (let h = 0; h < 500; h++) {
			const q = quotes(BASE, 'u1', h);
			for (const m of MATERIALS) expect(Math.abs(q[m] / BASE[m] - 1)).toBeLessThanOrEqual(JITTER + 1e-12);
		}
	});

	it('starts a new epoch every 8 hours on the UTC clock', () => {
		expect(epochOf(Date.UTC(2026, 9, 24, 7, 59))).toBe(epochOf(Date.UTC(2026, 9, 24, 0, 0)));
		expect(epochOf(Date.UTC(2026, 9, 24, 8, 0))).toBe(epochOf(Date.UTC(2026, 9, 24, 0, 0)) + 1);
	});

	it('charges coins at the quote and rounds up', () => {
		const q: Prices = { timber: 4.2, stone: 5, iron: 19 };
		expect(priceOf('stone', 10, 'coins', q)).toBe(50);
		expect(priceOf('timber', 1, 'coins', q)).toBe(5);
	});

	it('loses on a swap there and straight back', () => {
		const q = quotes(targetPrices({ timber: 100, stone: 40, iron: 20 }), 'u1', 7);
		for (const [a, b] of [['timber', 'stone'], ['stone', 'iron'], ['iron', 'timber']] as [Material, Material][]) {
			const got = 30;
			const paid = priceOf(b, got, a, q); // units of a given for 30 b
			const back = Math.floor(paid * 0.999); // the most a we could want back
			expect(priceOf(a, back, b, q)).toBeGreaterThan(got);
		}
	});

	it('caps each epoch at about 300 coins of each material', () => {
		expect(epochCap('timber')).toBe(60);
		expect(epochCap('iron')).toBeLessThan(20);
	});

	it('cannot be farmed: no run of swaps ends with more of everything', () => {
		// An adversary that swaps at random through the hours of many epochs, within the caps, under
		// prices that follow its own holdings. If any run ended with at least as much of every
		// material and more of one, the market would be a money pump.
		const rand = mulberry32(42);
		for (let run = 0; run < 400; run++) {
			const start: Prices = {
				timber: Math.floor(rand() * 300),
				stone: Math.floor(rand() * 300),
				iron: Math.floor(rand() * 80)
			};
			const h = { ...start };
			let fair: Prices | null = null;
			for (let epoch = 0; epoch < 12; epoch++) {
				fair = nextFair(fair, h);
				const room = { timber: epochCap('timber'), stone: epochCap('stone'), iron: epochCap('iron') };
				for (let hour = 0; hour < 8; hour++) {
					if (rand() < 0.5) continue;
					const q = quotes(fair, `adv${run}`, epoch * 8 + hour);
					const give = MATERIALS[Math.floor(rand() * 3)];
					const get = MATERIALS[Math.floor(rand() * 3)];
					if (give === get) continue;
					const amount = 1 + Math.floor(rand() * room[get]);
					if (amount > room[get]) continue;
					const cost = priceOf(get, amount, give, q);
					if (cost > h[give]) continue;
					h[give] -= cost;
					h[get] += amount;
					room[get] -= amount;
				}
			}
			const dominates = MATERIALS.every((m) => h[m] >= start[m]) && MATERIALS.some((m) => h[m] > start[m]);
			expect(dominates, `run ${run}: ${JSON.stringify(start)} -> ${JSON.stringify(h)}`).toBe(false);
		}
	});
});
