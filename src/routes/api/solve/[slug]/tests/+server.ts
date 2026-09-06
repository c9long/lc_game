import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guard';

// Suites are generated offline by scripts/generate-tests.py and committed under data/tests/.
// Lazy glob so each problem is its own chunk rather than ~460 KB of expectations in the bundle.
const suites = import.meta.glob('/data/tests/*.json');

export const GET: RequestHandler = async (event) => {
	requireUser(event.locals);
	const slug = event.params.slug;
	const load = suites[`/data/tests/${slug}.json`];
	if (!load) {
		return json(
			{
				error: 'no_tests',
				message:
					'No test suite for this problem yet. Structure and design problems land in phases B and C; see docs/07-pyodide-judge.md.'
			},
			{ status: 404 }
		);
	}
	const mod = (await load()) as { default: unknown };
	return json(mod.default);
};
