"""TLE cases for Arrays & Hashing (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


@tle("contains-duplicate")
def _contains_duplicate(rng):
    # 10^5 distinct values: no early exit, so a pairwise check makes all ~5 * 10^9 comparisons.
    return [rng.sample(range(-10**9, 10**9), 10**5)]


naive("contains-duplicate", "pairwise O(n^2)", """class Solution:
    def containsDuplicate(self, nums):
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] == nums[j]:
                    return True
        return False""")


# ---------- Valid Anagram ----------

@tle("valid-anagram")
def _valid_anagram(rng):
    # Max length 5 * 10^4, a true anagram (no early exit). s runs a..z and t runs z..a, so a
    # "find the first unused match in t" scan walks past ~all of t for every early letter of s.
    counts = [1] * 26
    for _ in range(5 * 10**4 - 26):
        counts[rng.randrange(26)] += 1
    letters = "abcdefghijklmnopqrstuvwxyz"
    s = "".join(c * n for c, n in zip(letters, counts))
    return [s, s[::-1]]


naive("valid-anagram", "match each char by scanning t O(n^2)", """class Solution:
    def isAnagram(self, s, t):
        if len(s) != len(t):
            return False
        used = [False] * len(t)
        for c in s:
            found = False
            for j in range(len(t)):
                if not used[j] and t[j] == c:
                    used[j] = True
                    found = True
                    break
            if not found:
                return False
        return True""")


# ---------- Two Sum ----------

@tle("two-sum")
def _two_sum(rng):
    # Max size, the only valid pair at the very end so a pairwise scan makes every comparison.
    nums = rng.sample(range(-10**7, 10**7 + 1), 1000)
    target = nums[-2] + nums[-1]
    if not -10**7 <= target <= 10**7:
        return None
    seen, pairs = {}, 0
    for x in nums:
        pairs += seen.get(target - x, 0)
        seen[x] = seen.get(x, 0) + 1
    return [nums, target] if pairs == 1 else None


no_tle("two-sum", "nums.length <= 1000: the O(n^2) pairwise scan is ~5 * 10^5 comparisons, well under a second")


# ---------- Group Anagrams ----------

@tle("group-anagrams")
def _group_anagrams(rng):
    # 10^4 strings of length 100, no two anagrams of each other: 10^4 singleton groups, so a
    # compare-against-every-group (or every-other-string) approach does ~5 * 10^7 sorted() calls.
    letters = "abcdefghijklmnopqrstuvwxyz"
    seen, strs = set(), []
    while len(strs) < 10**4:
        s = "".join(rng.choice(letters) for _ in range(100))
        key = "".join(sorted(s))
        if key not in seen:
            seen.add(key)
            strs.append(s)
    return [strs]


naive("group-anagrams", "compare with each group's representative O(n^2 L log L)", """class Solution:
    def groupAnagrams(self, strs):
        groups = []
        for s in strs:
            for g in groups:
                if sorted(g[0]) == sorted(s):
                    g.append(s)
                    break
            else:
                groups.append([s])
        return groups""")

naive("group-anagrams", "pairwise with used flags O(n^2 L log L)", """class Solution:
    def groupAnagrams(self, strs):
        used = [False] * len(strs)
        res = []
        for i in range(len(strs)):
            if used[i]:
                continue
            used[i] = True
            group = [strs[i]]
            for j in range(i + 1, len(strs)):
                if not used[j] and sorted(strs[i]) == sorted(strs[j]):
                    used[j] = True
                    group.append(strs[j])
            res.append(group)
        return res""")


# ---------- Top K Frequent Elements ----------

@tle("top-k-frequent-elements")
def _top_k_frequent(rng):
    # All 2001 values in [-1000, 1000] present, n = 10^4, k = every distinct value (so the answer
    # is unique): an approach that re-finds the most frequent value k times by recounting is
    # ~k * distinct * n.
    values = list(range(-1000, 1001))
    nums = values[:]
    while len(nums) < 10**4:
        nums.append(rng.choice(values))
    rng.shuffle(nums)
    return [nums, len(values)]


naive("top-k-frequent-elements", "k rounds of max(set, key=count) O(k * distinct * n)", """class Solution:
    def topKFrequent(self, nums, k):
        res = []
        nums = list(nums)
        for _ in range(k):
            best = max(set(nums), key=nums.count)
            res.append(best)
            nums = [x for x in nums if x != best]
        return res""")


# ---------- Encode and Decode Strings ----------

@tle("encode-and-decode-strings")
def _encode_decode(rng):
    # Max size (99 strings of 199 chars) over all 256 characters, heavy on digits and '#'
    # so a delimiter-based codec has to escape properly.
    alphabet = [chr(i) for i in range(256)] + list("0123456789#") * 20
    return [["".join(rng.choice(alphabet) for _ in range(199)) for _ in range(99)]]


no_tle("encode-and-decode-strings", "strs.length < 100 and strs[i].length < 200: under 2 * 10^4 characters in total, so even quadratic string building finishes instantly")


# ---------- Product of Array Except Self ----------

@tle("product-of-array-except-self")
def _product_except_self(rng):
    # 10^5 nonzero values (no zero shortcut). Mostly +-1 with a few small factors, so every prefix
    # and suffix product fits in 32 bits (|total| = 2^10 * 3^5 * 5^2 = 6,220,800).
    nums = [rng.choice((1, -1)) for _ in range(10**5)]
    factors = [2] * 10 + [3] * 5 + [5] * 2
    for i, f in zip(rng.sample(range(10**5), len(factors)), factors):
        nums[i] = f * rng.choice((1, -1))
    return [nums]


naive("product-of-array-except-self", "nested loops O(n^2)", """class Solution:
    def productExceptSelf(self, nums):
        n = len(nums)
        res = [1] * n
        for i in range(n):
            p = 1
            for j in range(n):
                if j != i:
                    p *= nums[j]
            res[i] = p
        return res""")

naive("product-of-array-except-self", "math.prod of slices O(n^2)", """import math
class Solution:
    def productExceptSelf(self, nums):
        return [math.prod(nums[:i]) * math.prod(nums[i + 1:]) for i in range(len(nums))]""")


# ---------- Valid Sudoku ----------

@tle("valid-sudoku")
def _valid_sudoku(rng):
    # The board is always 9x9: a fully filled VALID board, so no checker can exit early.
    digits = list("123456789")
    rng.shuffle(digits)
    bands = rng.sample(range(3), 3)
    rows = [b * 3 + r for b in bands for r in rng.sample(range(3), 3)]
    stacks = rng.sample(range(3), 3)
    cols = [s * 3 + c for s in stacks for c in rng.sample(range(3), 3)]
    base = lambda r, c: (3 * (r % 3) + r // 3 + c) % 9
    return [[[digits[base(r, c)] for c in cols] for r in rows]]


no_tle("valid-sudoku", "the board is always 9x9 (81 cells): any checker, however naive, does a bounded amount of work")


# ---------- Longest Consecutive Sequence ----------

@tle("longest-consecutive-sequence")
def _longest_consecutive(rng):
    # One run of 10^5 consecutive values, shuffled: counting upward from EVERY element (not just
    # run starts) costs ~n^2 / 2 = 5 * 10^9 lookups.
    start = rng.randrange(-10**9, 10**9 - 10**5 + 2)
    nums = list(range(start, start + 10**5))
    rng.shuffle(nums)
    return [nums]


naive("longest-consecutive-sequence", "count up from every element O(n^2)", """class Solution:
    def longestConsecutive(self, nums):
        s = set(nums)
        best = 0
        for x in nums:
            length = 1
            while x + length in s:
                length += 1
            best = max(best, length)
        return best""")

naive("longest-consecutive-sequence", "list membership, count up from starts O(n^2)", """class Solution:
    def longestConsecutive(self, nums):
        best = 0
        for x in nums:
            if x - 1 in nums:
                continue
            length = 1
            while x + length in nums:
                length += 1
            best = max(best, length)
        return best""")
