# LeetCode API reference (unofficial)

LeetCode has no official public API. `https://leetcode.com/graphql` is the endpoint the site itself uses, and it answers unauthenticated requests for public data. The community wrappers (`leetcode-query` on npm, `alfa-leetcode-api`) use the same endpoint. Every query below was run with curl from this machine on 2026-09-04 and returned the data shown.

Etiquette, since this is personal use of an unofficial endpoint:

- Cache problem content indefinitely; it rarely changes. Cache solution lists for a day.
- Sync at most once per 5 minutes on page load, plus one scheduled run per day.
- Send `Referer: https://leetcode.com` and a plain `User-Agent`. Keep volume tiny.
- Isolate all of this in one client module so a schema change on their side is a one-file fix.

## Headers

```
Content-Type: application/json
Referer: https://leetcode.com
```

With authentication, add:

```
Cookie: LEETCODE_SESSION=<value>; csrftoken=<value>
x-csrftoken: <csrftoken value>
```

## Public queries (no cookie)

### Problem content, tags and starter code

```graphql
query problem($slug: String!) {
  question(titleSlug: $slug) {
    questionId
    title
    titleSlug
    difficulty
    isPaidOnly
    content                                   # HTML
    topicTags { name slug }
    codeSnippets { lang langSlug code }
    exampleTestcases
    sampleTestCase
    solution { id canSeeDetail paidOnly hasVideoSolution }
  }
}
```

Verified `langSlug` values relevant to you: `python3`, `cpp`, `golang`, `rust`. Two Sum returned `exampleTestcases` as newline-separated inputs (`[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6`) and `solution.canSeeDetail: true, paidOnly: false`, meaning its editorial is free.

### Editorial body (free editorials only)

```graphql
query editorial($slug: String!) {
  question(titleSlug: $slug) {
    solution { id canSeeDetail paidOnly content }   # content is markdown with embedded HTML and $$latex$$
  }
}
```

Verified: Two Sum returns the full editorial markdown without a cookie. When `paidOnly` is true the `content` needs a Premium account's cookie; otherwise link out to `leetcode.com/problems/<slug>/editorial`.

### Last 20 accepted submissions for a username

```graphql
query recentAc($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp        # unix seconds, as a string
    lang             # "python3", "cpp", "golang", "rust", ...
  }
}
```

Sample entry (user `lee215`):

```json
{"id":"2124601864","title":"Count Integers Appearing in a Single Block","titleSlug":"count-integers-appearing-in-a-single-block","timestamp":"1788062725","lang":"java"}
```

`limit` caps at 20. This is the sync primitive. Deduplicate on `id`. An unknown username returns an empty list rather than an error, so validate the username on the admin page by checking `matchedUser` below.

### Solved counts, for reconciliation

```graphql
query stats($username: String!) {
  matchedUser(username: $username) {
    username
    submitStats { acSubmissionNum { difficulty count } }
  }
}
```

Returns totals for All, Easy, Medium and Hard. If the All count grows by more than the number of new submissions the sync saw, the 20-entry window missed some.

### Daily challenge

```graphql
query daily {
  activeDailyCodingChallengeQuestion {
    date                                       # "2026-09-05"
    link                                       # "/problems/smallest-stable-index-ii/"
    question { titleSlug title difficulty }
  }
}
```

Verified. Note the date is LeetCode's UTC day, which may be tomorrow's date in your evening.

### Community solutions, list

```graphql
query solutions($slug: String!, $skip: Int!, $first: Int!, $tags: [String!]) {
  ugcArticleSolutionArticles(
    questionSlug: $slug, orderBy: HOT, skip: $skip, first: $first,
    userInput: "", tagSlugs: $tags
  ) {
    totalNum
    edges {
      node {
        uuid
        title
        slug
        hitCount
        topLevelTopic: topic { id }            # needed to fetch the body
        tags { name slug }
      }
    }
  }
}
```

Verified: Two Sum returns `totalNum: 3000` with per-article tags such as `python3`, `cpp`, `java`, `array`, `hash-table`. Pass `tagSlugs: ["rust"]` to filter to one language. The first result is LeetCode's own article (`topic.id` 127810).

### Community solution, body

```graphql
query article($topicId: ID!) {
  ugcArticleSolutionArticle(topicId: $topicId) {
    uuid
    title
    slug
    content                                    # markdown with embedded HTML, [TOC], and $$latex$$
  }
}
```

Verified with `topicId: 127810`. Render with a markdown library, then sanitise the HTML before inserting it into the page; the content is third-party.

## Authenticated queries (cookie required)

These return `null` fields without the cookie, verified, rather than an error. Their shapes are taken from the `leetcode-query` wrapper and were not run here because that needs your session.

### Full submission history

```graphql
query submissions($offset: Int!, $limit: Int!, $slug: String) {
  questionSubmissionList(offset: $offset, limit: $limit, questionSlug: $slug) {
    lastKey
    hasNext
    submissions { id title titleSlug status statusDisplay lang timestamp }
  }
}
```

Omit `slug` for all submissions across all problems. This removes the 20-entry window, and it also exposes rejected attempts, which a game could reward as effort.

### Submission code and percentiles

```graphql
query submission($id: Int!) {
  submissionDetails(submissionId: $id) {
    code
    runtimePercentile
    memoryPercentile
    lang { name }
    question { titleSlug }
  }
}
```

This is what powers "compare this re-solve against what I wrote last time".

## Cookie lifecycle

- Obtain: log in at leetcode.com, DevTools, Application, Cookies, copy `LEETCODE_SESSION` and `csrftoken`.
- It expires after weeks to months. Detect expiry by an authenticated query returning nulls, show a "reconnect LeetCode" banner, and paste a fresh one on the admin page.
- Storage and handling rules are in [secrets-and-auth.md](secrets-and-auth.md).

## What is not available

- No official API, no OAuth, no webhooks. Polling is the only way to notice a new submission.
- No way to submit code through this endpoint without emulating the site; not worth doing. Solve on leetcode.com.
- No hidden test cases. `exampleTestcases` are the visible examples only, which is why the in-app judge in option 03 is limited to drills and example runs.
