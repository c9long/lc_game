import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { getOrCreateDrillSet, isSetComplete, loadDrillProgress } from '$lib/server/game/drills';
import { DRILL_BANKS } from '$lib/game/drillbank';
import { drillById } from '$lib/game/drillbank';

export const load: PageServerLoad = async ({ locals, platform }) => {
	const user = requireUser(locals);
	const db = getDb(platform);
	const snap = await loadSnapshot(db, user);
	const set = await getOrCreateDrillSet(db, snap.today, snap.now);
	const progress = await loadDrillProgress(db);

	const drills = (set?.ids ?? [])
		.map((id) => drillById(id))
		.filter((d): d is NonNullable<typeof d> => Boolean(d))
		.map((d) => ({
			id: d.id,
			kind: d.kind,
			module: d.module,
			context: d.context,
			code: d.code,
			hint: d.hint ?? null,
			answered: set ? set.results[d.id] : undefined
		}));

	const modules: Record<string, { total: number; seen: number; mastered: number }> = {};
	for (const [lang, bank] of Object.entries(DRILL_BANKS)) {
		for (const d of bank) {
			const k = `${lang}/${d.module}`;
			const m = (modules[k] ??= { total: 0, seen: 0, mastered: 0 });
			m.total++;
			const p = progress.get(d.id);
			if (p) m.seen++;
			if (p && p.srsStep >= 3) m.mastered++;
		}
	}

	const practiceUnlocked = isSetComplete(set);

	return {
		today: snap.today,
		lang: set?.lang ?? null,
		practiceUnlocked,
		// How much there is to practise, so the unlock says something concrete.
		practicePool: set ? Math.max(0, (DRILL_BANKS[set.lang]?.length ?? 0) - set.ids.length) : 0,
		drills,
		setIngots: set?.ingots ?? 0,
		ingots: snap.resources.ingots ?? 0,
		modules: Object.entries(modules).map(([k, v]) => ({ key: k, ...v })),
		dueCount: [...progress.values()].filter((p) => p.dueAt && p.dueAt.getTime() <= snap.now.getTime()).length
	};
};
