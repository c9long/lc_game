/** Presentation for resource kinds.
 *
 *  Emoji rather than image files, matching the building art: no assets to license, host or ship,
 *  and they inherit the text colour and size wherever they are placed.
 */
export interface ResourceMeta {
	kind: string;
	emoji: string;
	label: string;
}

/** Order is the order they appear in the bar: currency first, then materials, then drill output. */
export const RESOURCE_META: ResourceMeta[] = [
	{ kind: 'coins', emoji: '🪙', label: 'Coins' },
	{ kind: 'timber', emoji: '🪵', label: 'Timber' },
	{ kind: 'stone', emoji: '🪨', label: 'Stone' },
	{ kind: 'iron', emoji: '🔩', label: 'Iron' },
	{ kind: 'ingots', emoji: '⚙️', label: 'Ingots' }
];

export const ESSENCE_META: ResourceMeta = { kind: 'essence', emoji: '✨', label: 'Essence' };

export const META_BY_KIND = new Map(RESOURCE_META.map((m) => [m.kind, m]));

export function emojiFor(kind: string): string {
	if (kind.startsWith('essence:')) return ESSENCE_META.emoji;
	return META_BY_KIND.get(kind)?.emoji ?? '';
}

export function labelFor(kind: string): string {
	if (kind.startsWith('essence:')) return `${kind.slice(8)} essence`;
	return META_BY_KIND.get(kind)?.label ?? kind;
}

/** Essence is per topic tag, so a bar would run to thirty entries. One total stands in for them. */
export function totalEssence(resources: Record<string, number>): number {
	let n = 0;
	for (const [k, v] of Object.entries(resources)) if (k.startsWith('essence:')) n += v;
	return n;
}

/** "5 🪵 timber, 3 🪨 stone" — used wherever a cost or refund is spelled out. */
export function formatCost(cost: Record<string, number>): string {
	return Object.entries(cost)
		.map(([k, v]) => `${v} ${emojiFor(k)} ${labelFor(k).toLowerCase()}`.replace(/\s+/g, ' '))
		.join(', ');
}
