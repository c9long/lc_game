import variants from '../../../data/drills/variants.json';
import type { Drill, DrillVariant } from './drills';

/** Generated alternate instances, keyed by drill id (scripts/generate-drill-variants.py).
 *
 *  Deliberately its own module rather than part of drillbank.ts: the bank is imported by the plan,
 *  and so by every request to the home page, while the variants are only needed on /drills. */
const BY_ID = (variants as { variants: Record<string, DrillVariant[]> }).variants;

/** The alternates for a drill, not counting the drill itself. */
export function variantsFor(id: string): DrillVariant[] {
	return BY_ID[id] ?? [];
}

/** How many instances of a drill exist, the original included. Always at least 1. */
export function instanceCount(id: string): number {
	return 1 + variantsFor(id).length;
}

/** Index 0 is the drill as written — which is what a first sight should be, since the curated
 *  explanation was written about it. */
export function drillInstance(drill: Drill, index: number): Drill {
	const alt = variantsFor(drill.id)[index - 1];
	return alt ? { ...drill, ...alt } : drill;
}
