/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { repriceAll } from '$lib/server/game/market';
import { epochOf } from '$lib/game/market';

/**
 * The market's repricing cron, deployed as its own Worker (wrangler.cron.toml) on the app's D1.
 *
 * It cannot live in the app's worker: adapter-cloudflare writes its generated worker over whatever
 * wrangler.toml's `main` names, and that worker exports only fetch(). At 00:00, 08:00 and 16:00 UTC
 * this sets every player's fair prices for the epoch just begun, from what they hold at that moment.
 */
export default {
	async scheduled(controller: ScheduledController, env: { DB: D1Database }, ctx: ExecutionContext) {
		const epoch = epochOf(controller.scheduledTime);
		ctx.waitUntil(
			repriceAll(drizzle(env.DB, { schema }), epoch).then((n) => console.log(`market: priced ${n} players for epoch ${epoch}`))
		);
	}
} satisfies ExportedHandler<{ DB: D1Database }>;
