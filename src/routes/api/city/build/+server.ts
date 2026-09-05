import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { buildings } from '$lib/server/db/schema';
import { randomId } from '$lib/server/crypto';
import { readJson, requireUser } from '$lib/server/guard';
import { addResourceStatement, loadSnapshot } from '$lib/server/game/state';
import { BUILDING_BY_ID, canAfford, costAtLevel, gateSatisfied, inBounds } from '$lib/game/city';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const body = await readJson<{ kind?: unknown; x?: unknown; y?: unknown; id?: unknown }>(event.request);
	const snap = await loadSnapshot(db, user);
	const ctx = { tree: snap.tree, totalSolves: snap.totalSolves, hardSolves: snap.hardSolves };

	// Upgrade an existing building.
	if (typeof body.id === 'string') {
		const placed = snap.buildings.find((b) => b.id === body.id);
		if (!placed) return json({ error: 'not_found' }, { status: 404 });
		const kind = BUILDING_BY_ID.get(placed.kind)!;
		if (placed.level >= kind.maxLevel) return json({ error: 'max_level', message: 'already at max level' }, { status: 400 });
		const cost = costAtLevel(kind, placed.level + 1);
		if (!canAfford(snap.resources, cost)) return json({ error: 'poor', message: 'not enough resources' }, { status: 400 });
		await db.batch([
			db.update(buildings).set({ level: placed.level + 1 }).where(eq(buildings.id, placed.id)),
			...Object.entries(cost).map(([k, v]) => addResourceStatement(db, k, -v))
		]);
		return json({ ok: true });
	}

	// Place a new building.
	if (typeof body.kind !== 'string' || typeof body.x !== 'number' || typeof body.y !== 'number') {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	const kind = BUILDING_BY_ID.get(body.kind);
	if (!kind) return json({ error: 'bad_request', message: 'unknown building' }, { status: 400 });
	if (!inBounds(body.x, body.y)) return json({ error: 'bad_request', message: 'off the grid' }, { status: 400 });
	if (snap.buildings.some((b) => b.x === body.x && b.y === body.y)) return json({ error: 'occupied', message: 'tile is occupied' }, { status: 400 });
	if (!gateSatisfied(kind.gate, ctx)) return json({ error: 'gated', message: 'requirements not met' }, { status: 400 });
	if (kind.maxLevel === 1 && kind.effect && snap.buildings.some((b) => b.kind === kind.id)) {
		return json({ error: 'unique', message: `only one ${kind.name} allowed` }, { status: 400 });
	}
	const cost = costAtLevel(kind, 1);
	if (!canAfford(snap.resources, cost)) return json({ error: 'poor', message: 'not enough resources' }, { status: 400 });
	await db.batch([
		db.insert(buildings).values({ id: randomId(), kind: kind.id, x: body.x, y: body.y, level: 1, builtAt: new Date() }),
		...Object.entries(cost).map(([k, v]) => addResourceStatement(db, k, -v))
	]);
	return json({ ok: true });
};
