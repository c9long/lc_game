"""TLE cases for Greedy (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Maximum Subarray ----------

@tle("maximum-subarray")
def _maximum_subarray(rng):
    # Max length 10^5, random signs: every (i, j) pair is a candidate, ~5 * 10^9 sums for O(n^2).
    return [[rng.randint(-10**4, 10**4) for _ in range(10**5)]]


naive("maximum-subarray", "every start, running sum O(n^2)", """class Solution:
    def maxSubArray(self, nums):
        best = nums[0]
        for i in range(len(nums)):
            cur = 0
            for j in range(i, len(nums)):
                cur += nums[j]
                if cur > best:
                    best = cur
        return best""")

naive("maximum-subarray", "prefix sums, every pair O(n^2)", """class Solution:
    def maxSubArray(self, nums):
        prefix = [0]
        for x in nums:
            prefix.append(prefix[-1] + x)
        best = nums[0]
        for i in range(len(nums)):
            for j in range(i + 1, len(nums) + 1):
                best = max(best, prefix[j] - prefix[i])
        return best""")


# ---------- Jump Game ----------

@tle("jump-game")
def _jump_game(rng):
    # n = 1000, last index unreachable: every index i jumps at most to n - 2, where nums is 0.
    # Nearly every index can reach every later one, so a DFS without memo walks ~2^n paths.
    n = 1000
    nums = [max(1, n - 2 - i - rng.randint(0, 3)) for i in range(n - 2)] + [0, rng.randint(0, 1000)]
    return [nums]


naive("jump-game", "DFS over every jump, no memo (exponential)", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def canJump(self, nums):
        last = len(nums) - 1
        def dfs(i):
            if i >= last:
                return True
            for step in range(nums[i], 0, -1):
                if dfs(i + step):
                    return True
            return False
        return dfs(0)""")


# ---------- Jump Game II ----------

@tle("jump-game-ii")
def _jump_game_ii(rng):
    # n = 1000 with long jumps everywhere: the number of jump sequences is astronomical, and an
    # unmemoized min-over-every-jump recursion has no early exit.
    return [[rng.randint(50, 100) for _ in range(1000)]]


naive("jump-game-ii", "min over every jump, no memo (exponential)", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def jump(self, nums):
        last = len(nums) - 1
        def dfs(i):
            if i >= last:
                return 0
            best = float('inf')
            for step in range(nums[i], 0, -1):
                best = min(best, 1 + dfs(i + step))
            return best
        return dfs(0)""")


# ---------- Gas Station ----------

@tle("gas-station")
def _gas_station(rng):
    # n = 10^5, gas == cost everywhere except a -1000 drop at n - 2 and a +1000 refill at n - 1,
    # the unique answer. Trying starts 0, 1, ... each runs (with a 0 tank) all the way to the drop
    # before failing: ~5 * 10^9 steps.
    n = 10**5
    gas = [rng.randint(0, 1000) for _ in range(n)]
    cost = list(gas)
    gas[n - 2], cost[n - 2] = 0, 1000
    gas[n - 1], cost[n - 1] = 1000, 0
    return [gas, cost]


naive("gas-station", "simulate from every start O(n^2)", """class Solution:
    def canCompleteCircuit(self, gas, cost):
        n = len(gas)
        for s in range(n):
            tank = 0
            ok = True
            for k in range(n):
                i = (s + k) % n
                tank += gas[i] - cost[i]
                if tank < 0:
                    ok = False
                    break
            if ok:
                return s
        return -1""")


# ---------- Hand of Straights ----------

@tle("hand-of-straights")
def _hand_of_straights(rng):
    # Max size, a valid hand (no early exit): 1000 straights of 10 at random starts, shuffled.
    hand = []
    for _ in range(1000):
        start = rng.randint(0, 990)
        hand.extend(range(start, start + 10))
    rng.shuffle(hand)
    return [hand, 10]


no_tle("hand-of-straights", "hand.length <= 10^4: even a quadratic rescan is ~10^8 / 2 steps, and the natural "
       "sort-and-list.remove approach runs in C; nothing correct reliably exceeds 15 s")


# ---------- Merge Triplets to Form Target Triplet ----------

@tle("merge-triplets-to-form-target-triplet")
def _merge_triplets(rng):
    # 1000 triplets, answer False with no early exit: every usable triplet (all coordinates within
    # the target) misses the target's third coordinate, and the ones that hit it overshoot another.
    target = [rng.randint(50, 99), rng.randint(50, 99), rng.randint(50, 100)]
    triplets = []
    for _ in range(1000):
        if rng.random() < 0.9:
            t = [rng.randint(1, target[0]), rng.randint(1, target[1]), rng.randint(1, target[2] - 1)]
        else:
            t = [rng.randint(1, target[0]), rng.randint(1, target[1]), target[2]]
            k = rng.randrange(2)
            t[k] = rng.randint(target[k] + 1, 100)
        triplets.append(t)
    return [triplets, target]


naive("merge-triplets-to-form-target-triplet", "try every subset (exponential)", """from itertools import combinations
class Solution:
    def mergeTriplets(self, triplets, target):
        for r in range(1, len(triplets) + 1):
            for combo in combinations(triplets, r):
                merged = [max(t[0] for t in combo), max(t[1] for t in combo), max(t[2] for t in combo)]
                if merged == target:
                    return True
        return False""")


# ---------- Partition Labels ----------

@tle("partition-labels")
def _partition_labels(rng):
    # Length 100 = 25 contiguous blocks of 4 copies of one letter (25 distinct letters, shuffled):
    # every block boundary is a valid cut, so a brute force that tries every valid cut and keeps the
    # split with the most parts explores all 2^24 compositions.
    letters = list("abcdefghijklmnopqrstuvwxyz")
    rng.shuffle(letters)
    return ["".join(c * 4 for c in letters[:25])]


naive("partition-labels", "try every valid cut, keep most parts, no memo (exponential)", """class Solution:
    def partitionLabels(self, s):
        n = len(s)
        def best(i):
            if i == n:
                return []
            res = None
            for j in range(i + 1, n + 1):
                if not set(s[i:j]) & set(s[j:]):
                    cand = [j - i] + best(j)
                    if res is None or len(cand) > len(res):
                        res = cand
            return res
        return best(0)""")


# ---------- Valid Parenthesis String ----------

@tle("valid-parenthesis-string")
def _valid_parenthesis_string(rng):
    # Length 100, answer False: a prefix of mostly '*' (each with 3 choices) then more ')' than the
    # prefix could ever open, so trying every '*' replacement explores ~3^k paths and none succeed.
    prefix = ["*" if rng.random() < 0.9 else "(" for _ in range(48)]
    return ["".join(prefix) + ")" * 52]


naive("valid-parenthesis-string", "try every '*' choice, no memo (exponential)", """class Solution:
    def checkValidString(self, s):
        def dfs(i, left):
            if left < 0:
                return False
            if i == len(s):
                return left == 0
            if s[i] == '(':
                return dfs(i + 1, left + 1)
            if s[i] == ')':
                return dfs(i + 1, left - 1)
            return dfs(i + 1, left + 1) or dfs(i + 1, left - 1) or dfs(i + 1, left)
        return dfs(0, 0)""")
