import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb, getEnv } from '$lib/server/db';
import { randomId } from '$lib/server/crypto';
import { readJson, requireUser } from '$lib/server/guard';
import { addResourceAfter, canPaySql, changedRows, rawBatch } from '$lib/server/game/state';
import { ensurePrices, receivedThisEpoch } from '$lib/server/game/market';
import { hourOf, isMaterial, priceOf, quotes } from '$lib/game/market';
import { epochCap } from '$lib/game/fair-price';
import { resources } from '$lib/server/db/schema';
import { labelFor } from '$lib/game/resources';

/** Buy `amount` of a material with coins, or swap another material for it. Coins and materials go
 *  in; only materials come out. Ingots and essence never trade. */
export const POST: RequestHandler = async (event) => {
	const user = requireUser(event.locals);
	const db = getDb(event.platform);
	const body = await readJson<{ get?: unknown; give?: unknown; amount?: unknown; expect?: unknown }>(event.request);
	const { get, give, amount } = body;
	if (!isMaterial(get) || (give !== 'coins' && !isMaterial(give)) || give === get) {
		return json({ error: 'bad_request', message: 'The market trades coins, timber, stone and iron for timber, stone or iron.' }, { status: 400 });
	}
	if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) {
		return json({ error: 'bad_request', message: 'Amount must be a whole number of at least 1.' }, { status: 400 });
	}

	const now = Date.now();
	const { epoch, fair } = await ensurePrices(db, user.id, new Date(now));
	const cost = priceOf(get, amount, give, quotes(fair, user.id, hourOf(now)));
	// The page showed a price; if the hour turned since and it went up, say so rather than charge it.
	if (typeof body.expect === 'number' && cost > body.expect) {
		return json({ error: 'price_moved', message: `The price changed on the hour: that now costs ${cost} ${labelFor(give).toLowerCase()}.`, cost }, { status: 409 });
	}

	const cap = epochCap(get);
	const [received, held] = await Promise.all([
		receivedThisEpoch(db, user.id, epoch),
		db.select({ amount: resources.amount }).from(resources).where(and(eq(resources.userId, user.id), eq(resources.kind, give))).get()
	]);
	if (received[get] + amount > cap) {
		return json({ error: 'capped', message: `You can get ${Math.max(0, cap - received[get])} more ${get} before the next reprice.` }, { status: 400 });
	}
	if ((held?.amount ?? 0) < cost) {
		return json({ error: 'poor', message: `That costs ${cost} ${labelFor(give).toLowerCase()}; you have ${held?.amount ?? 0}.` }, { status: 400 });
	}

	// The trade is recorded only if, inside the transaction, the player can still pay and is still
	// under the cap; the payment and the goods are chained behind it, so a double click trades once.
	const [traded] = await rawBatch(getEnv(event.platform).DB, [
		sql`INSERT INTO trades (id, user_id, epoch, give_kind, give_amount, get_kind, get_amount, created_at)
			SELECT ${randomId()}, ${user.id}, ${epoch}, ${give}, ${cost}, ${get}, ${amount}, ${now}
			WHERE ${canPaySql(user.id, { [give]: cost })}
			AND (SELECT COALESCE(SUM(get_amount), 0) FROM trades WHERE user_id = ${user.id} AND epoch = ${epoch} AND get_kind = ${get}) + ${amount} <= ${cap}`,
		addResourceAfter(user.id, give, -cost),
		addResourceAfter(user.id, get, amount)
	]);
	if (changedRows(traded) !== 1) {
		return json({ error: 'conflict', message: 'Your resources or trades changed while this was being done, probably from another tab. Nothing was traded; the market now shows where you stand.' }, { status: 409 });
	}
	return json({ ok: true, cost, received: amount });
};
