import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guard';
import neetcode from '../../../../../../data/neetcode150.json';

// Suites are generated offline by scripts/generate-tests.py and committed under data/tests/.
// Lazy glob so each problem is its own chunk rather than the whole corpus in the bundle.
const suites = import.meta.glob('/data/tests/*.json');

const IN_CURRICULUM = new Set((neetcode as { slug: string }[]).map((p) => p.slug));

export const GET: RequestHandler = async (event) => {
	requireUser(event.locals);
	const slug = event.params.slug;
	const load = suites[`/data/tests/${slug}.json`];

	if (!load) {
		// Expected outputs come from running the vendored NeetCode reference solution as an oracle,
		// and those exist only for the 150. Outside the curriculum there is nothing to judge against.
		const message = IN_CURRICULUM.has(slug)
			? 'This problem is in the curriculum but its test suite is missing. Run `pnpm run tests:generate`.'
			: 'This problem is not in the NeetCode 150, so there is no reference solution to generate a test suite from. It cannot be judged in-app.';
		return json({ error: 'no_tests', message, inCurriculum: IN_CURRICULUM.has(slug) }, { status: 404 });
	}

	const mod = (await load()) as { default: unknown };
	return json(mod.default);
};
