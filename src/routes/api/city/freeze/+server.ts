import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guard';
import { addResourceStatement, getState, loadSnapshot, setState } from '$lib/server/game/state';
import { MAX_FREEZE_DAYS, freezeCost, freezePurchasesThisWeek, type FreezePurchases } from '$lib/game/budget';
import { hasEffect } from '$lib/game/city';
import { weekStartOf } from '$lib/game/dates';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const snap = await loadSnapshot(db, user);
	if (!hasEffect(snap.buildings, 'granary')) return json({ error: 'gated', message: 'build a Granary first' }, { status: 400 });
	if (snap.morale.freezeDays >= MAX_FREEZE_DAYS) return json({ error: 'full', message: 'granary is full' }, { status: 400 });

	// Each freeze bought this week costs double the last, so production cannot simply be converted
	// into permanent immunity. The count resets on Monday.
	const week = weekStartOf(snap.today);
	const record = await getState<FreezePurchases | null>(db, 'freezePurchases', null);
	const bought = freezePurchasesThisWeek(record, week);
	const cost = freezeCost(bought);

	if ((snap.resources.coins ?? 0) < cost) {
		return json({ error: 'poor', message: `not enough coins (this one costs ${cost})` }, { status: 400 });
	}
	await addResourceStatement(db, 'coins', -cost);
	await setState(db, 'morale', { ...snap.morale, freezeDays: snap.morale.freezeDays + 1 });
	await setState(db, 'freezePurchases', { week, count: bought + 1 });
	return json({ ok: true, spent: cost, nextCost: freezeCost(bought + 1) });
};
