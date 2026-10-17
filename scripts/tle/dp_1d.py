"""TLE cases for 1-D Dynamic Programming (see scripts/tle/__init__.py).

Most of these problems have small bounds (n <= 100, s.length <= 200, amount <= 10^4), so a
polynomial solution never times out. What does time out is the learner's first attempt: the
recurrence written as plain recursion WITHOUT memoization, which is exponential -- those are the
naives below, run on max-size inputs that give the recursion no early exit. The palindrome problems
(n <= 1000) only get a worst-case input: their O(n^3) brute force lands right at the budget.
"""
from tle import naive, no_tle, tle


# ---------- Climbing Stairs ----------

@tle("climbing-stairs")
def _climbing_stairs(rng):
    # n = 45 (the suite stops at 40): plain recursion makes fib(46)-ish ~ 3.7 * 10^9 calls.
    return [45]


naive("climbing-stairs", "recursion without memo O(phi^n)", """class Solution:
    def climbStairs(self, n):
        if n <= 2:
            return n
        return self.climbStairs(n - 1) + self.climbStairs(n - 2)""")


# ---------- Min Cost Climbing Stairs ----------

@tle("min-cost-climbing-stairs")
def _min_cost_climbing_stairs(rng):
    # Max length 100: unmemoized min(f(i+1), f(i+2)) recursion makes ~fib(100) calls.
    return [[rng.randint(0, 100) for _ in range(100)]]


naive("min-cost-climbing-stairs", "recursion without memo O(phi^n)", """class Solution:
    def minCostClimbingStairs(self, cost):
        n = len(cost)
        def f(i):
            if i >= n:
                return 0
            return cost[i] + min(f(i + 1), f(i + 2))
        return min(f(0), f(1))""")


# ---------- House Robber ----------

@tle("house-robber")
def _house_robber(rng):
    # Max length 100: unmemoized rob/skip recursion makes ~fib(100) calls.
    return [[rng.randint(0, 100) for _ in range(100)]]


naive("house-robber", "rob/skip recursion without memo O(phi^n)", """class Solution:
    def rob(self, nums):
        def f(i):
            if i >= len(nums):
                return 0
            return max(nums[i] + f(i + 2), f(i + 1))
        return f(0)""")


# ---------- House Robber II ----------

@tle("house-robber-ii")
def _house_robber_ii(rng):
    # Max length 100: each of the two linear passes is an unmemoized ~fib(99)-call recursion.
    return [[rng.randint(0, 200) for _ in range(100)]]


naive("house-robber-ii", "two rob/skip recursions without memo O(phi^n)", """class Solution:
    def rob(self, nums):
        if len(nums) == 1:
            return nums[0]
        def f(i, end):
            if i >= end:
                return 0
            return max(nums[i] + f(i + 2, end), f(i + 1, end))
        return max(f(0, len(nums) - 1), f(1, len(nums)))""")


# ---------- Longest Palindromic Substring ----------

_ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


@tle("longest-palindromic-substring")
def _longest_palindromic_substring(rng):
    # 1000 copies of one character: every substring is a palindrome, so checking all ~5 * 10^5
    # substrings with a two-pointer loop never exits early (~8 * 10^7 character comparisons).
    # (Unmemoized "drop the left or right end" recursion would also be exponential on a random
    # string, but it needs recursion ~n deep and dies of RecursionError first, not of time.)
    return [rng.choice(_ALNUM) * 1000]


no_tle("longest-palindromic-substring", "s.length <= 1000: the worst correct approach, the O(n^3) two-pointer check of every substring on an all-equal string, is ~1.7 * 10^8 comparisons and measured ~14-16 s in Pyodide here, right at the 15 s budget, so not reliably killed; slice-and-reverse brute force runs in C in under a second")


# ---------- Palindromic Substrings ----------

@tle("palindromic-substrings")
def _palindromic_substrings(rng):
    # 1000 copies of one letter: all ~5 * 10^5 substrings are palindromes, so a two-pointer check
    # of each never exits early: ~8 * 10^7 character comparisons.
    return [rng.choice("abcdefghijklmnopqrstuvwxyz") * 1000]


no_tle("palindromic-substrings", "s.length <= 1000: the worst correct approach, the O(n^3) two-pointer check of every substring on an all-equal string, is ~1.7 * 10^8 comparisons and measured ~14-16 s in Pyodide here, right at the 15 s budget, so not reliably killed; slice-and-reverse brute force runs in C in under a second")


# ---------- Decode Ways ----------

@tle("decode-ways")
def _decode_ways(rng):
    # The answer must fit in 32 bits (LeetCode's guarantee), which caps the branching: 55 digits
    # from 3-9 (no two-digit code starts with them) then 45 digits from {1, 2}, where every
    # position can take one or two digits. Answer fib(46) = 1,836,311,903; the unmemoized recursion
    # makes ~2 * fib(46) ~ 3.7 * 10^9 calls.
    s = "".join(rng.choice("3456789") for _ in range(55)) + "".join(rng.choice("12") for _ in range(45))
    ways = {len(s): 1, len(s) + 1: 0}
    for i in range(len(s) - 1, -1, -1):
        ways[i] = (ways[i + 1] if s[i] != "0" else 0) + (ways[i + 2] if 10 <= int(s[i:i + 2]) <= 26 else 0)
    assert ways[0] < 2**31, ways[0]
    return [s]


naive("decode-ways", "recursion without memo O(phi^n)", """class Solution:
    def numDecodings(self, s):
        def f(i):
            if i == len(s):
                return 1
            if s[i] == "0":
                return 0
            res = f(i + 1)
            if i + 1 < len(s) and 10 <= int(s[i:i + 2]) <= 26:
                res += f(i + 2)
            return res
        return f(0)""")


# ---------- Coin Change ----------

@tle("coin-change")
def _coin_change(rng):
    # Ten even coins and an odd amount near the cap: the answer is -1, so no search can stop early.
    # Unmemoized recursion over the coins explores an astronomically large tree; the reference DP is
    # 10^4 * 10 steps.
    # Coins >= 20 keep the recursion <= 500 deep, so it dies of time, not RecursionError.
    coins = rng.sample(range(20, 81, 2), 10)
    return [coins, rng.randrange(9001, 10**4, 2)]


# Plain unmemoized recursion is no use as a naive here: with a 1-coin it already explodes on the
# regular suite's small amounts (46 -> ~2^46 calls). The branch-and-bound DFS learners write instead
# (largest coin first, stop once count + k >= best) is instant whenever an answer exists, but with
# the answer -1 best never drops below infinity, nothing is pruned, and it enumerates every
# multiset of the ten coins that fits under the amount.
naive("coin-change", "largest-first DFS with best-so-far pruning, no memo (exponential when -1)", """class Solution:
    def coinChange(self, coins, amount):
        coins = sorted(coins, reverse=True)
        best = [float("inf")]
        def dfs(i, rem, cnt):
            if rem == 0:
                best[0] = min(best[0], cnt)
                return
            if i == len(coins):
                return
            c = coins[i]
            for k in range(rem // c, -1, -1):
                if cnt + k >= best[0]:
                    break
                dfs(i + 1, rem - k * c, cnt + k)
        dfs(0, amount, 0)
        return -1 if best[0] == float("inf") else best[0]""")


# ---------- Maximum Product Subarray ----------

@tle("maximum-product-subarray")
def _maximum_product_subarray(rng):
    # 2 * 10^4 nonzero values (no zero to reset or break on), mostly +-1 with a few small factors
    # so every subarray product fits in 32 bits (|whole product| = 2^10 * 3^5 * 5^2 = 6,220,800).
    # Every-subarray approaches do ~2 * 10^8 steps.
    n = 2 * 10**4
    nums = [rng.choice((1, -1)) for _ in range(n)]
    factors = [2] * 10 + [3] * 5 + [5] * 2
    for i, f in zip(rng.sample(range(n), len(factors)), factors):
        nums[i] = f * rng.choice((1, -1))
    return [nums]


naive("maximum-product-subarray", "running product from every start O(n^2)", """class Solution:
    def maxProduct(self, nums):
        best = nums[0]
        for i in range(len(nums)):
            p = 1
            for j in range(i, len(nums)):
                p *= nums[j]
                best = max(best, p)
        return best""")

naive("maximum-product-subarray", "math.prod of every slice O(n^3)", """import math
class Solution:
    def maxProduct(self, nums):
        n = len(nums)
        return max(math.prod(nums[i:j]) for i in range(n) for j in range(i + 1, n + 1))""")


# ---------- Word Break ----------

@tle("word-break")
def _word_break(rng):
    # The classic: s = "a" * 199 + "b" with words "a", "aa", ..., "a" * 20 (plus filler that never
    # matches). The answer is False only because of the last character, so unmemoized recursion
    # tries every composition of 199 into parts <= 20 -- ~2^199 paths.
    words = ["a" * k for k in range(1, 21)]
    filler = set()
    while len(filler) < 80:
        w = "".join(rng.choice("cdefghijklmnopqrstuvwxyz") for _ in range(rng.randint(1, 20)))
        filler.add(w)
    words += sorted(filler)
    rng.shuffle(words)
    return ["a" * 199 + "b", words]


naive("word-break", "try each word, recurse without memo O(2^n)", """class Solution:
    def wordBreak(self, s, wordDict):
        def f(i):
            if i == len(s):
                return True
            for w in wordDict:
                if s.startswith(w, i) and f(i + len(w)):
                    return True
            return False
        return f(0)""")

naive("word-break", "try each prefix, recurse on the rest without memo O(2^n)", """class Solution:
    def wordBreak(self, s, wordDict):
        words = set(wordDict)
        def f(t):
            if not t:
                return True
            for k in range(1, len(t) + 1):
                if t[:k] in words and f(t[k:]):
                    return True
            return False
        return f(s)""")


# ---------- Longest Increasing Subsequence ----------

@tle("longest-increasing-subsequence")
def _longest_increasing_subsequence(rng):
    # 200 ascending blocks of 5 descending values (block k holds 10k+4, ..., 10k, shifted into
    # [-1000, 999]): the LIS is 200 long, so recursion stays 200 deep, yet there are ~5^200
    # increasing subsequences for an unmemoized "extend from every later larger element" search.
    nums = []
    for k in range(200):
        base = -1000 + 10 * k + rng.randrange(6)
        nums += sorted(rng.sample(range(base, base + 5), 5), reverse=True)
    return [nums]


naive("longest-increasing-subsequence", "extend from every larger later element without memo O(2^n)", """class Solution:
    def lengthOfLIS(self, nums):
        def f(i):
            best = 1
            for j in range(i + 1, len(nums)):
                if nums[j] > nums[i]:
                    best = max(best, 1 + f(j))
            return best
        return max(f(i) for i in range(len(nums)))""")


# ---------- Partition Equal Subset Sum ----------

@tle("partition-equal-subset-sum")
def _partition_equal_subset_sum(rng):
    # 100 even values whose total is 2 mod 4: the sum is even (no parity shortcut) but the half is
    # odd, unreachable with even values -- so include/exclude recursion never finds it and explores
    # its whole (pruned or not) tree.
    nums = [rng.randrange(2, 51, 2) for _ in range(100)]
    if sum(nums) % 4 != 2:
        return None
    return [nums]


naive("partition-equal-subset-sum", "include/exclude recursion without memo O(2^n)", """class Solution:
    def canPartition(self, nums):
        total = sum(nums)
        if total % 2:
            return False
        def f(i, t):
            if t == 0:
                return True
            if i == len(nums) or t < 0:
                return False
            return f(i + 1, t - nums[i]) or f(i + 1, t)
        return f(0, total // 2)""")
