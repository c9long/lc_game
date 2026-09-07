/** Calendar helpers. "Local date" strings are YYYY-MM-DD in the user's timezone. */

export function localDate(now: Date, timeZone: string): string {
	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function localHour(now: Date, timeZone: string): number {
	const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now);
	return Number(h) % 24;
}

function toUtcMs(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
	return new Date(toUtcMs(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** b - a in whole days. */
export function daysBetween(a: string, b: string): number {
	return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export function isValidTimeZone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** The Monday on or before `date`. The budget's 7-day window rolls, so anything that must RESET
 *  weekly needs a fixed boundary instead. */
export function weekStartOf(date: string): string {
	const day = new Date(toUtcMs(date)).getUTCDay(); // 0 = Sunday
	return addDays(date, -((day + 6) % 7));
}
