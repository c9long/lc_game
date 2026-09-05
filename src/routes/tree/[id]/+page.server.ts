import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { NODE_BY_ID, problemsForNode } from '$lib/game/curriculum';
import { isDue } from '$lib/game/srs';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	const user = requireUser(locals);
	const node = NODE_BY_ID.get(params.id);
	if (!node) error(404, 'no such node');
	const snap = await loadSnapshot(getDb(platform), user);
	const view = snap.tree.get(node.id)!;
	const problems = problemsForNode(node.id, true).map((p) => {
		const s = snap.progress.get(p.slug);
		return {
			slug: p.slug,
			title: p.title,
			difficulty: p.difficulty,
			premium: p.premium,
			counted: user.hasPremium || !p.premium,
			solveCount: s?.solveCount ?? 0,
			lastLang: s?.lastLang ?? null,
			dueAt: s?.dueAt ?? null,
			due: s ? s.solveCount > 0 && isDue(s, snap.now) : false,
			solutions: Object.entries(p.solutions).filter(([, v]) => v).map(([k]) => k)
		};
	});
	return { view, problems, requires: node.requires.map((r) => ({ id: r, pattern: NODE_BY_ID.get(r)!.pattern })) };
};
