import type { Difficulty } from './curriculum';
import { isBonusLang } from '../langs';

export const RESEARCH: Record<Difficulty, number> = { Easy: 10, Medium: 25, Hard: 60 };
export const RESOURCE_FOR: Record<Difficulty, string> = { Easy: 'timber', Medium: 'stone', Hard: 'iron' };
export const BASE_RESOURCE = 3;

/** Yields of the easier materials, on top of the difficulty's own.
 *
 *  Difficulty used to pick only the KIND of material, never the amount, which had two bad effects.
 *  A Hard was worth no more than an Easy, despite being worth six times the research. And because
 *  Easy problems run out as you climb the tree, timber — which gates the Hut, Granary, Hash Market
 *  and Window Mill — became unobtainable, while stone piled up with nothing to spend it on.
 *  Yielding downward keeps every supply line open and makes harder strictly better.
 *
 *  The secondary amounts were 1, which was too thin to matter once the actual difficulty mix is
 *  taken into account: the NeetCode 150 is 101 Medium against 28 Easy, so a normal week is mostly
 *  Mediums. At 3 stone and 1 timber apiece that is a flood of stone and a trickle of timber, while
 *  every building reachable before the tree opens — Hut, Hash Market, Granary — is timber-first.
 *  Reaching their 83 timber took about 60 solves, by which point roughly 138 stone had piled up
 *  against the 35 those same buildings need. Timber is now the equal of the primary yield on a
 *  Medium, so the commonest problem feeds the buildings you can actually reach.
 */
export const SECONDARY_RESOURCES: Record<Difficulty, Record<string, number>> = {
	Easy: { stone: 1 },
	Medium: { timber: 3 },
	Hard: { stone: 3, timber: 3 }
};
export const BONUS_LANG_MULT = 1.5;
export const DAILY_MULT = 2;
export const REFRESH_MULT = 0.5;

export type AwardKind = 'new' | 'refresh' | 'translation';

export interface AwardInput {
	difficulty: Difficulty;
	tags: string[];
	lang: string;
	prev: { solveCount: number; lastLang: string | null } | null;
	isDaily: boolean;
	assisted: boolean;
}

export interface Award {
	kind: AwardKind;
	multiplier: number;
	research: number;
	resources: Record<string, number>;
}

export function computeAward(a: AwardInput): Award {
	let kind: AwardKind = 'new';
	if (a.prev && a.prev.solveCount > 0) {
		kind = a.prev.lastLang && a.prev.lastLang !== a.lang ? 'translation' : 'refresh';
	}
	let mult = 1;
	if (isBonusLang(a.lang)) mult *= BONUS_LANG_MULT;
	if (a.isDaily) mult *= DAILY_MULT;
	if (kind === 'refresh') mult *= REFRESH_MULT;
	if (a.assisted) mult *= 0.5;

	const resources: Record<string, number> = {
		[RESOURCE_FOR[a.difficulty]]: Math.max(1, Math.round(BASE_RESOURCE * mult))
	};
	for (const [kind, base] of Object.entries(SECONDARY_RESOURCES[a.difficulty])) {
		resources[kind] = (resources[kind] ?? 0) + Math.max(1, Math.round(base * mult));
	}
	for (const tag of a.tags) resources[`essence:${tag}`] = (resources[`essence:${tag}`] ?? 0) + 1;

	return {
		kind,
		multiplier: mult,
		research: Math.max(1, Math.round(RESEARCH[a.difficulty] * mult)),
		resources
	};
}
