import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { buildings } from '$lib/server/db/schema';
import { readJson, requireUser } from '$lib/server/guard';
import { addResourceStatement, loadSnapshot } from '$lib/server/game/state';
import { BUILDING_BY_ID, costAtLevel } from '$lib/game/city';

/**
 * Demolishes a building and refunds the LEVEL 1 base cost only.
 *
 * Upgrades are deliberately not refunded: their materials, Ingots and coins are spent for good, so
 * demolishing a levelled-up building is a real loss rather than a free undo. Refunding the base
 * cost still means a misplaced building is a mistake you can walk back.
 */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const body = await readJson<{ id?: unknown }>(event.request);
	if (typeof body.id !== 'string') return json({ error: 'bad_request', message: 'id is required' }, { status: 400 });

	const snap = await loadSnapshot(db, user);
	const placed = snap.buildings.find((b) => b.id === body.id);
	if (!placed) return json({ error: 'not_found', message: 'no building on that tile' }, { status: 404 });
	const kind = BUILDING_BY_ID.get(placed.kind);
	if (!kind) return json({ error: 'bad_request', message: 'unknown building' }, { status: 400 });

	const refund = costAtLevel(kind, 1);
	await db.batch([
		db.delete(buildings).where(eq(buildings.id, placed.id)),
		...Object.entries(refund).map(([k, v]) => addResourceStatement(db, k, v))
	]);
	return json({ ok: true, refunded: refund });
};
