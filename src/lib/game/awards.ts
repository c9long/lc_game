import type { Difficulty } from './curriculum';
import { isBonusLang } from '../langs';

export const RESEARCH: Record<Difficulty, number> = { Easy: 10, Medium: 25, Hard: 60 };
export const RESOURCE_FOR: Record<Difficulty, string> = { Easy: 'timber', Medium: 'stone', Hard: 'iron' };
export const BASE_RESOURCE = 3;
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
	for (const tag of a.tags) resources[`essence:${tag}`] = (resources[`essence:${tag}`] ?? 0) + 1;

	return {
		kind,
		multiplier: mult,
		research: Math.max(1, Math.round(RESEARCH[a.difficulty] * mult)),
		resources
	};
}
