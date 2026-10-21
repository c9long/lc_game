import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { randomId } from '$lib/server/crypto';
import { readJson, requireUser } from '$lib/server/guard';
import { addResourceAfter, rawBatch, canPaySql, changedRows, loadSnapshot } from '$lib/server/game/state';
import { totalEssence } from '$lib/game/resources';
import { BUILDING_BY_ID, canAfford, costAtLevel, gateSatisfied, placementError } from '$lib/game/city';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const body = await readJson<{ kind?: unknown; city?: unknown; x?: unknown; y?: unknown; id?: unknown }>(event.request);
	const snap = await loadSnapshot(db, user);
	const ctx = { tree: snap.tree, totalSolves: snap.totalSolves, hardSolves: snap.hardSolves };

	// Upgrade an existing building.
	if (typeof body.id === 'string') {
		const placed = snap.buildings.find((b) => b.id === body.id);
		if (!placed) return json({ error: 'not_found' }, { status: 404 });
		const kind = BUILDING_BY_ID.get(placed.kind)!;
		if (placed.level >= kind.maxLevel) return json({ error: 'max_level', message: 'already at max level' }, { status: 400 });
		const cost = costAtLevel(kind, placed.level + 1, placed.city);
		if (!canAfford(snap.resources, cost)) return json({ error: 'poor', message: 'not enough resources' }, { status: 400 });
		// Only from the level this request saw, and only if the price is still affordable inside the
		// transaction; the charge is chained behind it, so a double click upgrades once and charges once.
		const [upgraded] = await rawBatch(getEnv(event.platform).DB, [
			sql`UPDATE buildings SET level = ${placed.level + 1}
				WHERE user_id = ${user.id} AND id = ${placed.id} AND level = ${placed.level} AND ${canPaySql(user.id, cost)}`,
			...Object.entries(cost).map(([k, v]) => addResourceAfter(user.id, k, -v))
		]);
		if (changedRows(upgraded) !== 1) return json({ error: 'conflict', message: 'That building changed while this was being done, probably from another tab. Nothing was charged; the city now shows its current state.' }, { status: 409 });
		return json({ ok: true });
	}

	// Place a new building.
	if (typeof body.kind !== 'string' || typeof body.city !== 'number' || typeof body.x !== 'number' || typeof body.y !== 'number') {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	const kind = BUILDING_BY_ID.get(body.kind);
	if (!kind) return json({ error: 'bad_request', message: 'unknown building' }, { status: 400 });
	// City founded, tile real, terrain willing, tile free -- the same check the move endpoint runs.
	const bad = placementError(kind.id, body.city, body.x, body.y, snap.buildings, totalEssence(snap.resources));
	if (bad) return json(bad, { status: 400 });
	if (!gateSatisfied(kind.gate, ctx)) return json({ error: 'gated', message: 'requirements not met' }, { status: 400 });
	if (kind.maxLevel === 1 && kind.effect && snap.buildings.some((b) => b.kind === kind.id)) {
		return json({ error: 'unique', message: `only one ${kind.name} allowed` }, { status: 400 });
	}
	const cost = costAtLevel(kind, 1, body.city);
	if (!canAfford(snap.resources, cost)) return json({ error: 'poor', message: 'not enough resources' }, { status: 400 });
	// Inserted only if still affordable (and, for a one-of-a-kind building, still absent) inside the
	// transaction, with the charge chained behind it. Two builds on one tile at once fail on the
	// (user, city, x, y) unique index, which rolls the whole batch back.
	const unique = kind.maxLevel === 1 && kind.effect
		? sql` AND NOT EXISTS (SELECT 1 FROM buildings WHERE user_id = ${user.id} AND kind = ${kind.id})`
		: sql``;
	let built;
	try {
		[built] = await rawBatch(getEnv(event.platform).DB, [
			sql`INSERT INTO buildings (id, user_id, kind, city, x, y, level, built_at)
				SELECT ${randomId()}, ${user.id}, ${kind.id}, ${body.city}, ${body.x}, ${body.y}, 1, ${Date.now()}
				WHERE ${canPaySql(user.id, cost)}${unique}`,
			...Object.entries(cost).map(([k, v]) => addResourceAfter(user.id, k, -v))
		]);
	} catch {
		return json({ error: 'conflict', message: 'That tile was taken while this was being done, probably from another tab. Nothing was charged; the city now shows its current state.' }, { status: 409 });
	}
	if (changedRows(built) !== 1) return json({ error: 'conflict', message: 'Your resources changed while this was being done, probably from another tab. Nothing was charged; the city now shows its current state.' }, { status: 409 });
	return json({ ok: true });
};
