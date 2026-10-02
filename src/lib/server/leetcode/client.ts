// Thin client for LeetCode's unofficial public GraphQL API. Nothing here signs in: judging happens
// in the browser, and every query used is one LeetCode answers anonymously.

export type LcErrorKind = 'blocked' | 'rate_limited' | 'not_found' | 'bad_response';

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

const HEADERS: Record<string, string> = {
	'content-type': 'application/json',
	accept: 'application/json',
	referer: 'https://leetcode.com/',
	origin: 'https://leetcode.com',
	'user-agent': UA
};

/** Parses a JSON body, turning HTML challenge pages and refusals into typed errors. */
async function parseJson(r: Response): Promise<any> {
	const text = await r.text();
	try {
		return JSON.parse(text);
	} catch {
		if (r.status === 429) throw new LeetCodeError('rate_limited', 'LeetCode rate limit', r.status);
		if (/cf-chl|Just a moment|challenge-platform|Attention Required/i.test(text)) {
			throw new LeetCodeError('blocked', 'LeetCode returned a bot challenge page', r.status);
		}
		if (r.status === 401 || r.status === 403) throw new LeetCodeError('blocked', `LeetCode refused the request (${r.status})`, r.status);
		if (r.status === 404) throw new LeetCodeError('not_found', 'not found', r.status);
		throw new LeetCodeError('bad_response', `non-JSON response (${r.status})`, r.status);
	}
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
	const r = await fetch(GRAPHQL, {
		method: 'POST',
		headers: HEADERS,
		body: JSON.stringify({ query, variables })
	});
	const json = await parseJson(r);
	if (json?.errors?.length) throw new LeetCodeError('bad_response', json.errors[0].message ?? 'GraphQL error');
	return json.data as T;
}

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

/** Paid editorials come back with canSeeDetail false, so their content is null. */
export async function fetchEditorial(slug: string): Promise<{ content: string | null; paidOnly: boolean } | null> {
	const data = await gql<{ question: any }>(
		`query editorial($slug: String!) { question(titleSlug: $slug) { solution { canSeeDetail paidOnly content } } }`,
		{ slug }
	);
	const s = data.question?.solution;
	if (!s) return null;
	return { content: s.canSeeDetail ? (s.content ?? null) : null, paidOnly: Boolean(s.paidOnly) };
}
