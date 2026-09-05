import python from '../../../data/drills/python.json';
import curation from '../../../data/drills/curation.json';
import type { Drill } from './drills';

interface Bank {
	lang: string;
	drills: Drill[];
}
interface Curation {
	exclude: string[];
	/** Cap per module so one huge page (stdtypes) does not dominate. */
	maxPerModule: number;
	/** Hand-written drills, same shape as mined ones. */
	extra: Drill[];
}

const cur = curation as Curation;
const excluded = new Set(cur.exclude);

function curate(bank: Bank): Drill[] {
	const perModule = new Map<string, number>();
	const out: Drill[] = [];
	for (const d of bank.drills as Drill[]) {
		if (excluded.has(d.id)) continue;
		const n = perModule.get(d.module) ?? 0;
		if (n >= cur.maxPerModule) continue;
		perModule.set(d.module, n + 1);
		out.push(d);
	}
	return out;
}

export const DRILL_BANKS: Record<string, Drill[]> = {
	python: [...cur.extra.filter((d) => d.lang === 'python'), ...curate(python as unknown as Bank)]
};

export const DRILL_LANGS = Object.keys(DRILL_BANKS).filter((l) => DRILL_BANKS[l].length > 0);

export function drillById(id: string): Drill | undefined {
	for (const bank of Object.values(DRILL_BANKS)) {
		const d = bank.find((x) => x.id === id);
		if (d) return d;
	}
	return undefined;
}
