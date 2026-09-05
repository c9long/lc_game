// Thin client for LeetCode's unofficial GraphQL API and judge endpoints.
// Public queries need no cookie. Judge calls and the user's own submissions need LcAuth.
// This module is the only code allowed to see the session cookie.

export interface LcAuth {
	session: string;
	csrf: string;
}

export type LcErrorKind = 'unauthenticated' | 'blocked' | 'rate_limited' | 'not_found' | 'bad_response';

export class LeetCodeError extends Error {
	constructor(
		public kind: LcErrorKind,
		message: string,
		public status?: number
	) {
		super(message);
		this.name = 'LeetCodeError';
	}
}

const GRAPHQL = 'https://leetcode.com/graphql';
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export function lcHeaders(auth?: LcAuth, referer = 'https://leetcode.com/'): Record<string, string> {
	const h: Record<string, string> = {
		'content-type': 'application/json',
		accept: 'application/json',
		referer,
		origin: 'https://leetcode.com',
		'user-agent': UA
	};
	if (auth) {
		h.cookie = `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrf}`;
		h['x-csrftoken'] = auth.csrf;
		h['x-requested-with'] = 'XMLHttpRequest';
	}
	return h;
}

/** Parses a JSON body, turning HTML challenge pages and auth redirects into typed errors. */
export async function parseJson(r: Response): Promise<any> {
	const text = await r.text();
	try {
		return JSON.parse(text);
	} catch {
		if (r.status === 429) throw new LeetCodeError('rate_limited', 'LeetCode rate limit', r.status);
		if (/cf-chl|Just a moment|challenge-platform|Attention Required/i.test(text)) {
			throw new LeetCodeError('blocked', 'LeetCode returned a bot challenge page', r.status);
		}
		if (r.status === 401 || r.status === 403 || /accounts\/login/i.test(r.url)) {
			throw new LeetCodeError('unauthenticated', 'LeetCode session rejected', r.status);
		}
		if (r.status === 404) throw new LeetCodeError('not_found', 'not found', r.status);
		throw new LeetCodeError('bad_response', `non-JSON response (${r.status})`, r.status);
	}
}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}, auth?: LcAuth): Promise<T> {
	const r = await fetch(GRAPHQL, {
		method: 'POST',
		headers: lcHeaders(auth),
		body: JSON.stringify({ query, variables })
	});
	const json = await parseJson(r);
	if (json?.errors?.length) throw new LeetCodeError('bad_response', json.errors[0].message ?? 'GraphQL error');
	return json.data as T;
}

// ---------- public queries ----------

export interface ProblemData {
	questionId: string;
	title: string;
	titleSlug: string;
	difficulty: string;
	isPaidOnly: boolean;
	contentHtml: string | null;
	tags: string[];
	snippets: Record<string, string>;
	exampleTestcases: string | null;
	editorialFree: boolean;
}

const PROBLEM_QUERY = `query problem($slug: String!) {
  question(titleSlug: $slug) {
    questionId title titleSlug difficulty isPaidOnly content
    topicTags { name slug }
    codeSnippets { lang langSlug code }
    exampleTestcases
    solution { id canSeeDetail paidOnly }
  }
}`;

export async function fetchProblem(slug: string): Promise<ProblemData | null> {
	const data = await gql<{ question: any }>(PROBLEM_QUERY, { slug });
	const q = data.question;
	if (!q) return null;
	const snippets: Record<string, string> = {};
	for (const s of q.codeSnippets ?? []) snippets[s.langSlug] = s.code;
	return {
		questionId: String(q.questionId),
		title: q.title,
		titleSlug: q.titleSlug,
		difficulty: q.difficulty,
		isPaidOnly: Boolean(q.isPaidOnly),
		contentHtml: q.content ?? null,
		tags: (q.topicTags ?? []).map((t: any) => t.name),
		snippets,
		exampleTestcases: q.exampleTestcases ?? null,
		editorialFree: Boolean(q.solution && q.solution.canSeeDetail && !q.solution.paidOnly)
	};
}

export interface RecentAc {
	id: string;
	title: string;
	titleSlug: string;
	timestamp: number;
	lang: string;
}

export async function fetchRecentAc(username: string, limit = 20): Promise<RecentAc[]> {
	const data = await gql<{ recentAcSubmissionList: any[] | null }>(
		`query recentAc($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) { id title titleSlug timestamp lang }
    }`,
		{ username, limit }
	);
	return (data.recentAcSubmissionList ?? []).map((s) => ({ ...s, id: String(s.id), timestamp: Number(s.timestamp) }));
}

export async function fetchUserExists(username: string): Promise<boolean> {
	const data = await gql<{ matchedUser: { username: string } | null }>(
		`query u($username: String!) { matchedUser(username: $username) { username } }`,
		{ username }
	);
	return Boolean(data.matchedUser);
}

export interface Daily {
	date: string;
	slug: string;
	title: string;
	difficulty: string;
}

export async function fetchDaily(): Promise<Daily | null> {
	const data = await gql<{ activeDailyCodingChallengeQuestion: any }>(
		`query daily { activeDailyCodingChallengeQuestion { date question { titleSlug title difficulty } } }`
	);
	const d = data.activeDailyCodingChallengeQuestion;
	if (!d?.question) return null;
	return { date: d.date, slug: d.question.titleSlug, title: d.question.title, difficulty: d.question.difficulty };
}

export interface SolutionArticle {
	uuid: string;
	title: string;
	slug: string;
	hitCount: number;
	topicId: number | null;
	tags: { name: string; slug: string }[];
}

export async function fetchSolutionArticles(
	slug: string,
	opts: { tags?: string[]; first?: number; skip?: number } = {}
): Promise<{ total: number; articles: SolutionArticle[] }> {
	const data = await gql<{ ugcArticleSolutionArticles: any }>(
		`query solutions($slug: String!, $skip: Int!, $first: Int!, $tags: [String!]) {
      ugcArticleSolutionArticles(questionSlug: $slug, orderBy: HOT, skip: $skip, first: $first, userInput: "", tagSlugs: $tags) {
        totalNum
        edges { node { uuid title slug hitCount topic { id } tags { name slug } } }
      }
    }`,
		{ slug, skip: opts.skip ?? 0, first: opts.first ?? 10, tags: opts.tags ?? [] }
	);
	const res = data.ugcArticleSolutionArticles;
	return {
		total: res?.totalNum ?? 0,
		articles: (res?.edges ?? []).map((e: any) => ({
			uuid: e.node.uuid,
			title: e.node.title,
			slug: e.node.slug,
			hitCount: e.node.hitCount,
			topicId: e.node.topic?.id ?? null,
			tags: e.node.tags ?? []
		}))
	};
}

export async function fetchSolutionArticle(topicId: number): Promise<{ title: string; content: string } | null> {
	const data = await gql<{ ugcArticleSolutionArticle: any }>(
		`query article($topicId: ID!) { ugcArticleSolutionArticle(topicId: $topicId) { title content } }`,
		{ topicId }
	);
	return data.ugcArticleSolutionArticle ?? null;
}

export async function fetchEditorial(slug: string, auth?: LcAuth): Promise<{ content: string | null; paidOnly: boolean } | null> {
	const data = await gql<{ question: any }>(
		`query editorial($slug: String!) { question(titleSlug: $slug) { solution { canSeeDetail paidOnly content } } }`,
		{ slug },
		auth
	);
	const s = data.question?.solution;
	if (!s) return null;
	return { content: s.canSeeDetail ? (s.content ?? null) : null, paidOnly: Boolean(s.paidOnly) };
}

// ---------- authenticated ----------

export async function fetchUserStatus(auth: LcAuth): Promise<{ isSignedIn: boolean; username: string | null }> {
	const data = await gql<{ userStatus: any }>(`query { userStatus { isSignedIn username } }`, {}, auth);
	return { isSignedIn: Boolean(data.userStatus?.isSignedIn), username: data.userStatus?.username ?? null };
}

// ---------- judge ----------

export interface CheckResult {
	state: string;
	status_msg?: string;
	status_code?: number;
	run_success?: boolean;
	total_correct?: number | null;
	total_testcases?: number | null;
	code_answer?: string[];
	expected_code_answer?: string[];
	std_output_list?: string[];
	compile_error?: string;
	full_compile_error?: string;
	runtime_error?: string;
	full_runtime_error?: string;
	status_runtime?: string;
	status_memory?: string;
	runtime_percentile?: number | null;
	memory_percentile?: number | null;
	last_testcase?: string;
	expected_output?: string;
	code_output?: string | string[];
	lang?: string;
	pretty_lang?: string;
	submission_id?: string;
	[k: string]: unknown;
}

function judgeHeaders(auth: LcAuth, slug: string) {
	return lcHeaders(auth, `https://leetcode.com/problems/${slug}/`);
}

function throwIfJudgeError(json: any) {
	if (json && typeof json === 'object' && typeof json.error === 'string') {
		const msg: string = json.error;
		if (/too soon|too fast|rate/i.test(msg)) throw new LeetCodeError('rate_limited', msg);
		throw new LeetCodeError('bad_response', msg);
	}
}

export async function interpret(
	auth: LcAuth,
	p: { slug: string; questionId: string; lang: string; code: string; input: string }
): Promise<string> {
	const r = await fetch(`https://leetcode.com/problems/${p.slug}/interpret_solution/`, {
		method: 'POST',
		headers: judgeHeaders(auth, p.slug),
		body: JSON.stringify({ lang: p.lang, question_id: p.questionId, typed_code: p.code, data_input: p.input })
	});
	const json = await parseJson(r);
	throwIfJudgeError(json);
	if (!json?.interpret_id) throw new LeetCodeError('bad_response', 'no interpret_id in response', r.status);
	return String(json.interpret_id);
}

export async function submit(
	auth: LcAuth,
	p: { slug: string; questionId: string; lang: string; code: string }
): Promise<string> {
	const r = await fetch(`https://leetcode.com/problems/${p.slug}/submit/`, {
		method: 'POST',
		headers: judgeHeaders(auth, p.slug),
		body: JSON.stringify({ lang: p.lang, question_id: p.questionId, typed_code: p.code })
	});
	const json = await parseJson(r);
	throwIfJudgeError(json);
	if (!json?.submission_id) throw new LeetCodeError('bad_response', 'no submission_id in response', r.status);
	return String(json.submission_id);
}

export async function check(auth: LcAuth, id: string, slug: string): Promise<CheckResult> {
	const r = await fetch(`https://leetcode.com/submissions/detail/${encodeURIComponent(id)}/check/`, {
		headers: judgeHeaders(auth, slug)
	});
	const json = await parseJson(r);
	throwIfJudgeError(json);
	return json as CheckResult;
}

/** Trim a check() payload to what the UI needs and what is worth storing. */
export function summarizeCheck(c: CheckResult): Record<string, unknown> {
	const keep = [
		'state', 'status_msg', 'status_code', 'run_success', 'total_correct', 'total_testcases',
		'code_answer', 'expected_code_answer', 'std_output_list', 'compile_error', 'full_compile_error',
		'runtime_error', 'full_runtime_error', 'status_runtime', 'status_memory', 'runtime_percentile',
		'memory_percentile', 'last_testcase', 'expected_output', 'code_output', 'lang', 'pretty_lang', 'submission_id'
	];
	const out: Record<string, unknown> = {};
	for (const k of keep) if (c[k] !== undefined) out[k] = c[k];
	return out;
}
