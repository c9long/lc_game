"""TLE cases for 2-D Dynamic Programming (see scripts/tle/__init__.py).

Pyodide's recursion limit is 1000 and several reference solutions are top-down memoized DFS, so
inputs keep the reference's recursion depth well under that. The naive solutions are the classic
"same recursion, no memo" versions; where their depth can exceed 1000 they raise the limit, so they
fail by running out of time rather than with a RecursionError.
"""
from tle import naive, tle

LOWER = "abcdefghijklmnopqrstuvwxyz"


# ---------- Unique Paths ----------

@tle("unique-paths")
def _unique_paths(rng):
    # LeetCode guarantees the answer <= 2 * 10^9, which caps the grid well below 100 x 100:
    # 17 x 18 has C(33, 16) = 1,166,803,110 paths, each a leaf of an unmemoized recursion
    # (~2.3 * 10^9 calls).
    return rng.choice([[17, 18], [18, 17]])


naive("unique-paths", "recursion over every path, no memo (exponential)", """class Solution:
    def uniquePaths(self, m, n):
        def dfs(r, c):
            if r == m - 1 or c == n - 1:
                return 1
            return dfs(r + 1, c) + dfs(r, c + 1)
        return dfs(0, 0)""")


# ---------- Longest Common Subsequence ----------

@tle("longest-common-subsequence")
def _lcs(rng):
    # Two random 1000-letter strings: mostly mismatches, so the unmemoized recursion branches
    # into skip-left / skip-right ~everywhere (~2^1000 calls). The DP is 10^6 cells.
    return ["".join(rng.choice(LOWER) for _ in range(1000)) for _ in range(2)]


naive("longest-common-subsequence", "recursion, no memo (exponential)", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def longestCommonSubsequence(self, text1, text2):
        def dfs(i, j):
            if i == len(text1) or j == len(text2):
                return 0
            if text1[i] == text2[j]:
                return 1 + dfs(i + 1, j + 1)
            return max(dfs(i + 1, j), dfs(i, j + 1))
        return dfs(0, 0)""")


# ---------- Best Time to Buy and Sell Stock with Cooldown ----------

@tle("best-time-to-buy-and-sell-stock-with-cooldown")
def _cooldown(rng):
    # 900 random prices, not the 5000 maximum: the reference is a memoized DFS one frame per day,
    # and Pyodide's recursion limit is 1000. The unmemoized buy/sell/cooldown recursion still
    # makes a Fibonacci-like ~1.6^900 calls.
    return [[rng.randint(0, 1000) for _ in range(900)]]


naive("best-time-to-buy-and-sell-stock-with-cooldown", "buy/sell/cooldown recursion, no memo (exponential)", """class Solution:
    def maxProfit(self, prices):
        def dfs(i, buying):
            if i >= len(prices):
                return 0
            cooldown = dfs(i + 1, buying)
            if buying:
                return max(cooldown, dfs(i + 1, False) - prices[i])
            return max(cooldown, dfs(i + 2, True) + prices[i])
        return dfs(0, True)""")


# ---------- Coin Change II ----------

@tle("coin-change-ii")
def _coin_change_ii(rng):
    # 100 distinct multiples of 5 and an amount near the max that is not one: the answer is 0
    # (fits the 32-bit guarantee) but astronomically many multisets sum below it, all of which an
    # unmemoized take/skip recursion enumerates. Coins >= 10 keep the memoized reference's depth
    # (uses + skips) around 600, under Pyodide's recursion limit; multiples of 5 keep its reachable
    # states to ~10^5.
    coins = rng.sample(range(10, 10 + 5 * 150, 5), 100)
    amount = 5000 - rng.randint(1, 4) - 5 * rng.randint(0, 5)
    return [amount, coins]


naive("coin-change-ii", "take/skip recursion, no memo (exponential)", """class Solution:
    def change(self, amount, coins):
        def dfs(i, a):
            if a == 0:
                return 1
            if a < 0 or i == len(coins):
                return 0
            return dfs(i, a - coins[i]) + dfs(i + 1, a)
        return dfs(0, amount)""")


# ---------- Target Sum ----------

@tle("target-sum", count=14)
def _target_sum(rng):
    # Max size: 20 numbers (sum <= 1000), no zeros; every one of the 2^20 sign assignments is a
    # leaf. One case cannot time anything out, but the 15 s budget covers the whole Submit, so 14
    # distinct maximal cases add up: the "try every sign mask, sum the 20 bits" brute force
    # (~2 * 10^7 inner steps per case, measured ~3.4 s per case in Pyodide here, so ~47 s for the
    # 14, ~3x the budget) cannot get through them; LeetCode TLEs it as well. The plain unmemoized
    # recursion (2^21 calls, ~0.35 s per case, ~5 s for all 14) still passes: at n <= 20 no input
    # can stop it, so only the bitmask brute force is a registered naive.
    nums = [rng.randint(1, 50) for _ in range(20)]
    target = rng.choice([-1, 1]) * rng.randint(0, sum(nums))
    return [nums, target]


naive("target-sum", "every sign mask, inner loop over the bits (2^n * n)", """class Solution:
    def findTargetSumWays(self, nums, target):
        n = len(nums)
        count = 0
        for mask in range(1 << n):
            total = 0
            for i in range(n):
                if mask >> i & 1:
                    total += nums[i]
                else:
                    total -= nums[i]
            if total == target:
                count += 1
        return count""")


# ---------- Interleaving String ----------

@tle("interleaving-string")
def _interleaving_string(rng):
    # s1 = s2 = one letter x100, s3 = that letter x199 then another: every prefix interleaves,
    # so the unmemoized recursion walks all C(200, 100) ~ 10^59 interleavings before failing.
    c, d = rng.sample(LOWER, 2)
    return [c * 100, c * 100, c * 199 + d]


naive("interleaving-string", "recursion over (i, j), no memo (exponential)", """class Solution:
    def isInterleave(self, s1, s2, s3):
        if len(s1) + len(s2) != len(s3):
            return False
        def dfs(i, j):
            if i == len(s1) and j == len(s2):
                return True
            if i < len(s1) and s1[i] == s3[i + j] and dfs(i + 1, j):
                return True
            if j < len(s2) and s2[j] == s3[i + j] and dfs(i, j + 1):
                return True
            return False
        return dfs(0, 0)""")


# ---------- Longest Increasing Path in a Matrix ----------

@tle("longest-increasing-path-in-a-matrix")
def _lip(rng):
    # 100 x 100, strictly increasing along every row and column (anti-diagonal band + noise):
    # C(198, 99) increasing paths leave the top-left corner, all walked by a DFS without memo.
    # The longest path is 199 cells, so the memoized reference stays shallow.
    return [[[(i + j) * 10**7 + rng.randrange(10**7) for j in range(100)] for i in range(100)]]


naive("longest-increasing-path-in-a-matrix", "DFS from every cell, no memo (exponential)", """class Solution:
    def longestIncreasingPath(self, matrix):
        R, C = len(matrix), len(matrix[0])
        def dfs(r, c):
            best = 1
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < R and 0 <= nc < C and matrix[nr][nc] > matrix[r][c]:
                    best = max(best, 1 + dfs(nr, nc))
            return best
        return max(dfs(r, c) for r in range(R) for c in range(C))""")


# ---------- Distinct Subsequences ----------

@tle("distinct-subsequences")
def _distinct_subsequences(rng):
    # s = one letter x1000, t = that letter x3: C(1000, 3) = 166,167,000 matches (fits 32 bits),
    # so a recursion without memo has at least that many successful leaves, and enumerating index
    # triples is as many tuples.
    c = rng.choice(LOWER + LOWER.upper())
    return [c * 1000, c * 3]


naive("distinct-subsequences", "take/skip recursion, no memo (exponential)", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def numDistinct(self, s, t):
        def dfs(i, j):
            if j == len(t):
                return 1
            if len(s) - i < len(t) - j:
                return 0
            res = dfs(i + 1, j)
            if s[i] == t[j]:
                res += dfs(i + 1, j + 1)
            return res
        return dfs(0, 0)""")


# ---------- Edit Distance ----------

@tle("edit-distance")
def _edit_distance(rng):
    # 100 letters from a..m against 100 from n..z: no character ever matches, so the unmemoized
    # insert/delete/replace recursion branches three ways at every step (~3^100 calls).
    return ["".join(rng.choice(LOWER[:13]) for _ in range(100)),
            "".join(rng.choice(LOWER[13:]) for _ in range(100))]


naive("edit-distance", "insert/delete/replace recursion, no memo (exponential)", """class Solution:
    def minDistance(self, word1, word2):
        def dfs(i, j):
            if i == len(word1):
                return len(word2) - j
            if j == len(word2):
                return len(word1) - i
            if word1[i] == word2[j]:
                return dfs(i + 1, j + 1)
            return 1 + min(dfs(i + 1, j), dfs(i, j + 1), dfs(i + 1, j + 1))
        return dfs(0, 0)""")


# ---------- Burst Balloons ----------

@tle("burst-balloons")
def _burst_balloons(rng):
    # 130 balloons, not the 300 maximum: the O(n^3) reference takes ~6.7 s in Pyodide at n = 300
    # (~0.5 s at 150), over the 2 s reference budget. Trying every burst order (n!) or memoizing on
    # the remaining tuple (2^n states) cannot finish either way.
    return [[rng.randint(1, 100) for _ in range(130)]]


naive("burst-balloons", "try every next balloon, no memo (n!)", """class Solution:
    def maxCoins(self, nums):
        def dfs(arr):
            if not arr:
                return 0
            best = 0
            for k in range(len(arr)):
                left = arr[k - 1] if k > 0 else 1
                right = arr[k + 1] if k + 1 < len(arr) else 1
                best = max(best, left * arr[k] * right + dfs(arr[:k] + arr[k + 1:]))
            return best
        return dfs(nums)""")

naive("burst-balloons", "memo on the remaining balloons (2^n states)", """class Solution:
    def maxCoins(self, nums):
        memo = {}
        def dfs(arr):
            if not arr:
                return 0
            if arr in memo:
                return memo[arr]
            best = 0
            for k in range(len(arr)):
                left = arr[k - 1] if k > 0 else 1
                right = arr[k + 1] if k + 1 < len(arr) else 1
                best = max(best, left * arr[k] * right + dfs(arr[:k] + arr[k + 1:]))
            memo[arr] = best
            return best
        return dfs(tuple(nums))""")


# ---------- Regular Expression Matching ----------

@tle("regular-expression-matching", count=3)
def _regex(rng):
    # s = c x19 then d, p = "c*" x10: every split of the 19 c's among the ten stars is tried
    # before the final d fails, ~5 * 10^7 calls of an unmemoized recursion. That is the most the
    # |s|, |p| <= 20 bounds allow for one case (a search over other patterns found nothing above
    # 5 * 10^7), ~18-21 s (index recursion) and ~27 s (slicing) in Pyodide. The 15 s budget covers
    # the whole Submit, so three such cases with different letter pairs (~3x the budget for the
    # index recursion) make the margin hold on faster machines; the reference takes ~4 ms each.
    c, d = rng.sample(LOWER, 2)
    return [c * 19 + d, (c + "*") * 10]


naive("regular-expression-matching", "recursion over (i, j), no memo (exponential)", """class Solution:
    def isMatch(self, s, p):
        def dfs(i, j):
            if j == len(p):
                return i == len(s)
            match = i < len(s) and (s[i] == p[j] or p[j] == '.')
            if j + 1 < len(p) and p[j + 1] == '*':
                return dfs(i, j + 2) or (match and dfs(i + 1, j))
            return match and dfs(i + 1, j + 1)
        return dfs(0, 0)""")

naive("regular-expression-matching", "recursion with string slicing, no memo (exponential)", """class Solution:
    def isMatch(self, s, p):
        if not p:
            return not s
        first = bool(s) and p[0] in (s[0], '.')
        if len(p) >= 2 and p[1] == '*':
            return self.isMatch(s, p[2:]) or (first and self.isMatch(s[1:], p))
        return first and self.isMatch(s[1:], p[1:])""")
