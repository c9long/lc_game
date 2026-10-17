"""TLE cases for Backtracking (see scripts/tle/__init__.py).

The constraints here are tiny (n <= 10 and the like), so polynomial brute force never times out.
What does time out is the exponential blow-up a learner gets by enumerating ORDERED choices and
deduplicating afterwards (a permutation-style search for a combination problem), or by not
skipping duplicate values -- those are the naives below.
"""
from tle import naive, no_tle, tle


# ---------- Subsets ----------

@tle("subsets")
def _subsets(rng):
    # Max size: 10 distinct values. A permutation-style search (append ANY unused element, then
    # dedupe) visits sum_k 10!/(10-k)! ~= 9.9 * 10^6 ordered prefixes for 2^10 subsets, each
    # checked against the result list. (Even a set dedupe takes ~35 s here.)
    return [rng.sample(range(-10, 11), 10)]


naive("subsets", "pick any unused element + `not in res` dedupe", """class Solution:
    def subsets(self, nums):
        res = []
        cur = []
        def dfs():
            s = sorted(cur)
            if s not in res:
                res.append(s)
            for x in nums:
                if x not in cur:
                    cur.append(x)
                    dfs()
                    cur.pop()
        dfs()
        return res""")


# ---------- Combination Sum ----------

@tle("combination-sum")
def _combination_sum(rng):
    # Max size with the smallest allowed values (2..21) and the largest target (30): ordered
    # sequences summing to <= 30 number ~1.3 * 10^6, each trying all 20 candidates, so a search
    # without a start index makes ~2.7 * 10^7 calls and reaches 30 by ~5 * 10^5 orderings of only
    # 1017 distinct combinations (each checked against the result list). Enumerating a count for
    # every candidate is prod(30 // c + 1) ~= 2.9 * 10^11 count vectors.
    cands = list(range(2, 22))
    rng.shuffle(cands)
    return [cands, 30]


naive("combination-sum", "try every count of every candidate, check the sum at the end", """class Solution:
    def combinationSum(self, candidates, target):
        res = []
        counts = [0] * len(candidates)
        def dfs(i):
            if i == len(candidates):
                if sum(k * c for k, c in zip(counts, candidates)) == target:
                    res.append([c for k, c in zip(counts, candidates) for _ in range(k)])
                return
            for k in range(target // candidates[i] + 1):
                counts[i] = k
                dfs(i + 1)
            counts[i] = 0
        dfs(0)
        return res""")


# ---------- Combination Sum II ----------

@tle("combination-sum-ii")
def _combination_sum_ii(rng):
    # Max size, target 30, half the candidates equal to 1: a search that does not skip equal
    # values explores every SUBSET of the fifty 1s (C(50, <=30) ~ 10^15 index sets) before
    # deduplicating; skipping duplicates leaves only a few thousand distinct multisets.
    cands = [1] * 50 + [rng.randint(2, 50) for _ in range(50)]
    rng.shuffle(cands)
    return [cands, 30]


naive("combination-sum-ii", "include/exclude without skipping duplicates + set dedupe", """class Solution:
    def combinationSum2(self, candidates, target):
        candidates = sorted(candidates)
        seen = set()
        cur = []
        def dfs(i, total):
            if total == target:
                seen.add(tuple(cur))
                return
            if i == len(candidates) or total > target:
                return
            cur.append(candidates[i])
            dfs(i + 1, total + candidates[i])
            cur.pop()
            dfs(i + 1, total)
        dfs(0, 0)
        return [list(t) for t in seen]""")

naive("combination-sum-ii", "loop backtracking with `not in res` dedupe", """class Solution:
    def combinationSum2(self, candidates, target):
        candidates = sorted(candidates)
        res = []
        def dfs(start, cur, remaining):
            if remaining == 0:
                if cur not in res:
                    res.append(cur[:])
                return
            for i in range(start, len(candidates)):
                if candidates[i] > remaining:
                    break
                cur.append(candidates[i])
                dfs(i + 1, cur, remaining - candidates[i])
                cur.pop()
        dfs(0, [], target)
        return res""")


# ---------- Permutations ----------

@tle("permutations")
def _permutations(rng):
    return [rng.sample(range(-10, 11), 6)]


no_tle("permutations", "nums.length <= 6: 720 permutations; even trying all 6^6 = 46656 sequences and keeping the repeat-free ones is instant")


# ---------- Subsets II ----------

@tle("subsets-ii")
def _subsets_ii(rng):
    # Max size (10) with exactly one repeated value (768 distinct subsets, the most): a
    # permutation-style search over unused INDICES visits ~9.9 * 10^6 ordered prefixes whatever
    # the duplicates, each checked against the result list.
    while True:
        nums = [rng.randint(-10, 10) for _ in range(10)]
        if len(set(nums)) == 9:
            return [nums]


naive("subsets-ii", "pick any unused index + `not in res` dedupe", """class Solution:
    def subsetsWithDup(self, nums):
        n = len(nums)
        used = [False] * n
        cur = []
        res = []
        def dfs():
            s = sorted(cur)
            if s not in res:
                res.append(s)
            for i in range(n):
                if not used[i]:
                    used[i] = True
                    cur.append(nums[i])
                    dfs()
                    cur.pop()
                    used[i] = False
        dfs()
        return res""")


# ---------- Generate Parentheses ----------

# No generator: n is 1..7 and the regular suite already has every n, so a TLE case would repeat one.
no_tle("generate-parentheses", "1 <= n <= 7 and the suite already has every n; filtering all 2^14 = 16384 bracket strings is instant (only a permutations-of-the-characters brute force, 14!, is slower, and it already times out on the suite)")


# ---------- Word Search ----------

@tle("word-search")
def _word_search(rng):
    # 5x5 board of one letter, word = 9 of that letter then a letter not on the board: a DFS
    # without the "rarer end first" trick walks every self-avoiding path from all 25 cells.
    letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    a, b = rng.sample(letters, 2)
    return [[[a] * 5 for _ in range(5)], a * 9 + b]


no_tle("word-search", "board <= 5x5 and word.length <= 10: an unpruned DFS visits only ~5.7 * 10^4 self-avoiding paths (25 starts, depth 9)")


# ---------- Palindrome Partitioning ----------

@tle("palindrome-partitioning")
def _palindrome_partitioning(rng):
    # Max length, 15 equal letters and one other at an end: 2^14 = 16384 valid partitions. (All 16
    # equal gives 2^15, but the judge's unordered comparison of that output alone takes the
    # reference over a second.)
    a, b = rng.sample("abcdefghijklmnopqrstuvwxyz", 2)
    return [a * 15 + b if rng.random() < 0.5 else b + a * 15]


no_tle("palindrome-partitioning", "s.length <= 16: at most 2^15 = 32768 cut patterns, so even checking each piece of each pattern is ~5 * 10^5 character comparisons")


# ---------- Letter Combinations of a Phone Number ----------

@tle("letter-combinations-of-a-phone-number")
def _letter_combinations(rng):
    # 4 digits from the 4-letter keys: the largest output, 4^4 = 256 strings.
    return ["".join(rng.choice("79") for _ in range(4))]


no_tle("letter-combinations-of-a-phone-number", "digits.length <= 4: at most 4^4 = 256 combinations")


# ---------- N-Queens ----------

# No generator: n is 1..8 and the regular suite already has every n, so a TLE case would repeat one.
no_tle("n-queens", "1 <= n <= 8 and the suite already has every n; brute force over all 8! = 40320 column permutations is instant")
