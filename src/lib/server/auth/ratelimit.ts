// In-memory fixed-window limiter. Per isolate, which is plenty for a single-user app;
// its purpose is to slow down credential guessing and judge spam, not to be exact.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
	const now = Date.now();
	if (buckets.size > 10_000) buckets.clear();
	const b = buckets.get(key);
	if (!b || b.resetAt < now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (b.count >= max) return false;
	b.count += 1;
	return true;
}
