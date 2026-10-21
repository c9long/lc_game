import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { readJson, requireUser } from '$lib/server/guard';
import { addResourceAfter, rawBatch, changedRows, loadSnapshot } from '$lib/server/game/state';
import { BUILDING_BY_ID, costAtLevel } from '$lib/game/city';

/**
 * Demolishes a building and refunds the LEVEL 1 base cost only, at the price of the city it stands in.
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

	const refund = costAtLevel(kind, 1, placed.city);
	// The delete only matches the building as this request saw it, and the refund is chained behind
	// it: a second destroy of the same building (a double click) deletes nothing and refunds nothing.
	const [deleted] = await rawBatch(getEnv(event.platform).DB, [
		sql`DELETE FROM buildings WHERE user_id = ${user.id} AND id = ${placed.id}
			AND level = ${placed.level} AND city = ${placed.city} AND x = ${placed.x} AND y = ${placed.y}`,
		...Object.entries(refund).map(([k, v]) => addResourceAfter(user.id, k, v))
	]);
	if (changedRows(deleted) !== 1) return json({ error: 'conflict', message: 'That building changed while this was being done, probably from another tab. Nothing was charged; the city now shows its current state.' }, { status: 409 });
	return json({ ok: true, refunded: refund });
};
