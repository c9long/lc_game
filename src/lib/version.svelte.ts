import { version } from '$app/environment';

/**
 * Notices when a newer build is deployed while this page is open.
 *
 * Replaces SvelteKit's own `version.pollInterval`, which treated ANY difference between this
 * page's build and /_app/version.json as an update -- including an older version.json from a stale
 * cache -- and said nothing about which build was which, so a banner 12 hours after the last
 * deploy (2026-10-14) could not be explained. Here a page is outdated only when the server's
 * build is strictly NEWER than its own, and both build times are kept for the banner.
 *
 * Versions are build timestamps in ms (SvelteKit's default `version.name`). A tab that was hidden,
 * frozen by the browser or asleep checks as soon as it is visible again rather than waiting out a
 * timer that may not have run.
 */
const POLL_MS = 5 * 60_000;

class BuildVersion {
	/** This page's build time. */
	readonly page = Number(version);
	/** The deployed build's time, once one newer than this page has been seen. */
	server = $state<number | null>(null);
	outdated = $derived(this.server !== null && this.server > this.page);

	async check(): Promise<boolean> {
		try {
			const r = await fetch('/_app/version.json', { cache: 'no-store' });
			if (!r.ok) return this.outdated;
			const v = Number(((await r.json()) as { version?: unknown }).version);
			if (Number.isFinite(v) && v > this.page) this.server = v;
		} catch {
			// Offline or mid-deploy: try again on the next tick.
		}
		return this.outdated;
	}

	start(): () => void {
		const timer = setInterval(() => void this.check(), POLL_MS);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void this.check();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}
}

export const build = new BuildVersion();

export function fmtBuild(ms: number | null): string {
	if (!ms || !Number.isFinite(ms)) return 'unknown';
	return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
