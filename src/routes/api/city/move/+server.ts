import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { buildings } from '$lib/server/db/schema';
import { readJson, requireUser } from '$lib/server/guard';
import { loadSnapshot } from '$lib/server/game/state';
import { totalEssence } from '$lib/game/resources';
import { BUILDING_BY_ID, placementError } from '$lib/game/city';

/**
 * Moves a building to another tile, in its city or any other founded one, keeping its level.
 *
 * Free, and deliberately so. Demolishing and rebuilding already rearranges a city for the price of
 * the upgrades; charging for a move would only mean losing levels is the cheaper way to do it.
 * It is also how a building comes back out of storage after the grid shrank beneath it.
 */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const body = await readJson<{ id?: unknown; city?: unknown; x?: unknown; y?: unknown }>(event.request);
	if (typeof body.id !== 'string' || typeof body.city !== 'number' || typeof body.x !== 'number' || typeof body.y !== 'number') {
		return json({ error: 'bad_request', message: 'id, city, x and y are required' }, { status: 400 });
	}

	const snap = await loadSnapshot(db, user);
	const placed = snap.buildings.find((b) => b.id === body.id);
	if (!placed) return json({ error: 'not_found', message: 'no such building' }, { status: 404 });
	const kind = BUILDING_BY_ID.get(placed.kind);
	if (!kind) return json({ error: 'bad_request', message: 'unknown building' }, { status: 400 });
	if (placed.city === body.city && placed.x === body.x && placed.y === body.y) return json({ ok: true });

	// The tile it is leaving does not count as occupied, so a swap within a city is not blocked.
	const others = snap.buildings.filter((b) => b.id !== placed.id);
	const bad = placementError(kind.id, body.city, body.x, body.y, others, totalEssence(snap.resources));
	if (bad) return json(bad, { status: 400 });

	await db.update(buildings).set({ city: body.city, x: body.x, y: body.y }).where(eq(buildings.id, placed.id));
	return json({ ok: true });
};
