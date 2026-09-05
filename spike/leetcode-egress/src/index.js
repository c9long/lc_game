// Phase 0 spike: can a Cloudflare Worker drive LeetCode's run/submit endpoints with a session cookie?
// GET /?key=SPIKE_KEY          -> validates cookie, runs Two Sum against example input (interpret_solution)
// GET /submit?key=SPIKE_KEY    -> same, then a real submission (will appear on your LeetCode profile)
// GET /status?key=SPIKE_KEY    -> cookie validity only
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SLUG = 'two-sum';
const CODE = [
	'class Solution:',
	'    def twoSum(self, nums, target):',
	'        seen = {}',
	'        for i, n in enumerate(nums):',
	'            if target - n in seen:',
	'                return [seen[target - n], i]',
	'            seen[n] = i',
	''
].join('\n');

function headers(env) {
	return {
		'content-type': 'application/json',
		accept: 'application/json',
		cookie: `LEETCODE_SESSION=${env.LEETCODE_SESSION}; csrftoken=${env.CSRF}`,
		'x-csrftoken': env.CSRF,
		referer: `https://leetcode.com/problems/${SLUG}/`,
		origin: 'https://leetcode.com',
		'x-requested-with': 'XMLHttpRequest',
		'user-agent': UA
	};
}

async function call(env, url, init = {}) {
	const r = await fetch(url, { ...init, headers: headers(env) });
	const text = await r.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	return { status: r.status, json, snippet: json ? undefined : text.slice(0, 300) };
}

async function poll(env, id) {
	for (let i = 0; i < 40; i++) {
		const r = await call(env, `https://leetcode.com/submissions/detail/${id}/check/`);
		if (!r.json) return r;
		if (r.json.state === 'SUCCESS') return r.json;
		await new Promise((res) => setTimeout(res, 1000));
	}
	return { error: 'timeout waiting for SUCCESS' };
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (!env.SPIKE_KEY || url.searchParams.get('key') !== env.SPIKE_KEY) {
			return new Response('unauthorized', { status: 401 });
		}
		const out = {};
		out.userStatus = await call(env, 'https://leetcode.com/graphql', {
			method: 'POST',
			body: JSON.stringify({ query: 'query { userStatus { isSignedIn username } }' })
		});
		if (url.pathname === '/status') return Response.json(out);

		const run = await call(env, `https://leetcode.com/problems/${SLUG}/interpret_solution/`, {
			method: 'POST',
			body: JSON.stringify({
				lang: 'python3',
				question_id: '1',
				typed_code: CODE,
				data_input: '[2,7,11,15]\n9\n[3,2,4]\n6'
			})
		});
		out.run = run;
		if (run.json?.interpret_id) out.runResult = await poll(env, run.json.interpret_id);

		if (url.pathname === '/submit') {
			const sub = await call(env, `https://leetcode.com/problems/${SLUG}/submit/`, {
				method: 'POST',
				body: JSON.stringify({ lang: 'python3', question_id: '1', typed_code: CODE })
			});
			out.submit = sub;
			if (sub.json?.submission_id) out.submitResult = await poll(env, sub.json.submission_id);
		}
		return Response.json(out, { headers: { 'cache-control': 'no-store' } });
	}
};
