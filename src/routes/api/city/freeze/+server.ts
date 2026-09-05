import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { addResourceStatement, loadSnapshot, setState } from '$lib/server/game/state';
import { MAX_FREEZE_DAYS } from '$lib/game/budget';
import { hasEffect } from '$lib/game/city';

const FREEZE_COST = 20;

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const snap = await loadSnapshot(db, user);
	if (!hasEffect(snap.buildings, 'granary')) return json({ error: 'gated', message: 'build a Granary first' }, { status: 400 });
	if (snap.morale.freezeDays >= MAX_FREEZE_DAYS) return json({ error: 'full', message: 'granary is full' }, { status: 400 });
	if ((snap.resources.coins ?? 0) < FREEZE_COST) return json({ error: 'poor', message: 'not enough coins' }, { status: 400 });
	await addResourceStatement(db, 'coins', -FREEZE_COST);
	await setState(db, 'morale', { ...snap.morale, freezeDays: snap.morale.freezeDays + 1 });
	return json({ ok: true });
};
