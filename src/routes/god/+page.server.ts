import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { and, eq, like } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { resources } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/guard';
import { GOD_UNLOCK_TREE, getState, setState } from '$lib/server/game/state';
import { RESOURCE_META, totalEssence } from '$lib/game/resources';

/** God mode: set your own resources by hand. Dev server only -- `dev` is false in every build, so in
 *  production this route does not exist (404), whoever asks. */

/** Essence is per topic tag; god mode tops the total up or down through one tag of its own. */
const GOD_ESSENCE = 'essence:god-mode';
const MAX = 1_000_000_000;

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!dev) error(404, 'Not found');
	const user = requireUser(locals);
	const db = getDb(platform);
	const [rows, treeUnlocked] = await Promise.all([
		db.select().from(resources).where(eq(resources.userId, user.id)).all(),
		getState<boolean>(db, user.id, GOD_UNLOCK_TREE, false)
	]);
	const held = Object.fromEntries(rows.map((r) => [r.kind, r.amount])) as Record<string, number>;
	return {
		kinds: RESOURCE_META.map((m) => ({ ...m, amount: held[m.kind] ?? 0 })),
		essence: totalEssence(held),
		treeUnlocked: treeUnlocked === true
	};
};

export const actions: Actions = {
	/** Opens every node of the tech tree, or puts it back to what your solves have earned. Nothing
	 *  about your solves changes either way: loadSnapshot() reads this flag when it computes the tree. */
	tree: async ({ request, locals, platform }) => {
		if (!dev) error(404, 'Not found');
		const user = requireUser(locals);
		const on = (await request.formData()).get('unlock') === 'on';
		await setState(getDb(platform), user.id, GOD_UNLOCK_TREE, on);
		return { tree: on ? 'The whole tree is unlocked.' : 'The tree is back to what your solves have earned.' };
	},
	set: async ({ request, locals, platform }) => {
		if (!dev) error(404, 'Not found');
		const user = requireUser(locals);
		const db = getDb(platform);
		const form = await request.formData();
		const amounts: Record<string, number> = {};
		for (const { kind } of RESOURCE_META) {
			const n = Number(form.get(kind));
			if (!Number.isInteger(n) || n < 0 || n > MAX) return fail(400, { message: `${kind} must be a whole number from 0 to ${MAX}.` });
			amounts[kind] = n;
		}
		const essence = Number(form.get('essence'));
		if (!Number.isInteger(essence) || essence < 0 || essence > MAX) return fail(400, { message: `Essence must be a whole number from 0 to ${MAX}.` });

		// The essence earned from real solves stays; the god-mode tag makes up the difference, or is
		// removed when the earned total is already at or over the target.
		const earned = await db
			.select()
			.from(resources)
			.where(and(eq(resources.userId, user.id), like(resources.kind, 'essence:%')))
			.all();
		const real = earned.filter((r) => r.kind !== GOD_ESSENCE).reduce((s, r) => s + r.amount, 0);
		amounts[GOD_ESSENCE] = Math.max(0, essence - real);

		await db.batch(
			Object.entries(amounts).map(([kind, amount]) =>
				db
					.insert(resources)
					.values({ userId: user.id, kind, amount })
					.onConflictDoUpdate({ target: [resources.userId, resources.kind], set: { amount } })
			) as unknown as Parameters<typeof db.batch>[0]
		);
		return { message: real > essence ? `Saved. Essence stays at ${real}: that much was earned from solves.` : 'Saved.' };
	}
};
