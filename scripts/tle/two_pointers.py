"""TLE cases for Two Pointers (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Valid Palindrome ----------

@tle("valid-palindrome")
def _valid_palindrome(rng):
    # Max length 1000, a true palindrome (no early mismatch) of mixed-case letters and digits
    # with punctuation sprinkled in, so every character has to be filtered and compared.
    alnum = "abcdefghijklmnopqrstuvwxyz0123456789"
    half = "".join(rng.choice(alnum) for _ in range(500))
    core = list(half + half[::-1])
    out = []
    for c in core:
        out.append(c.upper() if c.isalpha() and rng.random() < 0.5 else c)
    s = "".join(out)
    # Swap a few alphanumerics for punctuation symmetrically (keeps it a palindrome, length 1000).
    s = list(s)
    for i in rng.sample(range(500), 50):
        p = rng.choice(" ,.:;!?'-")
        s[i] = p
        s[999 - i] = rng.choice(" ,.:;!?'-")
    return ["".join(s)]


no_tle("valid-palindrome", "s.length <= 1000: even an O(n^2) approach (rebuilding/reversing per character) is ~10^6 steps, well under a second")


# ---------- Two Sum II ----------

@tle("two-sum-ii-input-array-is-sorted")
def _two_sum_ii(rng):
    # Max size 3 * 10^4. Everything but the last two values is <= 498, the last two are 499 and
    # 501 and target = 1000 (the bound): the only valid pair is the final one, and no pair sum
    # ever exceeds the target, so a pairwise scan (even one that breaks once the sum passes
    # target) checks all ~4.5 * 10^8 pairs.
    n = 3 * 10**4
    numbers = sorted(rng.randint(-1000, 498) for _ in range(n - 2)) + [499, 501]
    return [numbers, 1000]


naive("two-sum-ii-input-array-is-sorted", "pairwise O(n^2)", """class Solution:
    def twoSum(self, numbers, target):
        n = len(numbers)
        for i in range(n):
            for j in range(i + 1, n):
                s = numbers[i] + numbers[j]
                if s == target:
                    return [i + 1, j + 1]
                if s > target:
                    break
        return []""")


# ---------- 3Sum ----------

@tle("3sum")
def _three_sum(rng):
    # Max size 3000 of distinct values (no duplicate-skipping shortcut), 1000 negative and 2000
    # non-negative: a triple loop still makes all ~4.5 * 10^9 checks, while the two-pointer
    # reference, which stops at the first positive anchor, stays well inside its budget.
    nums = rng.sample(range(-10**5, 0), 1000) + rng.sample(range(0, 10**5 + 1), 2000)
    rng.shuffle(nums)
    return [nums]


naive("3sum", "triple loop with a set of sorted triples O(n^3)", """class Solution:
    def threeSum(self, nums):
        n = len(nums)
        found = set()
        for i in range(n):
            for j in range(i + 1, n):
                for k in range(j + 1, n):
                    if nums[i] + nums[j] + nums[k] == 0:
                        found.add(tuple(sorted((nums[i], nums[j], nums[k]))))
        return [list(t) for t in found]""")

naive("3sum", "sorted triple loop, break when the sum passes 0, O(n^3)", """class Solution:
    def threeSum(self, nums):
        nums = sorted(nums)
        n = len(nums)
        res = []
        for i in range(n):
            if i > 0 and nums[i] == nums[i - 1]:
                continue
            for j in range(i + 1, n):
                if j > i + 1 and nums[j] == nums[j - 1]:
                    continue
                for k in range(j + 1, n):
                    s = nums[i] + nums[j] + nums[k]
                    if s == 0:
                        res.append([nums[i], nums[j], nums[k]])
                        break
                    if s > 0:
                        break
        return res""")


# ---------- Container With Most Water ----------

@tle("container-with-most-water")
def _container(rng):
    # Max size 10^5 of random heights: a check-every-pair approach does ~5 * 10^9 area computations.
    return [[rng.randint(0, 10**4) for _ in range(10**5)]]


naive("container-with-most-water", "every pair O(n^2)", """class Solution:
    def maxArea(self, height):
        n = len(height)
        best = 0
        for i in range(n):
            for j in range(i + 1, n):
                area = min(height[i], height[j]) * (j - i)
                if area > best:
                    best = area
        return best""")


# ---------- Trapping Rain Water ----------

@tle("trapping-rain-water")
def _trapping(rng):
    # Max size 2 * 10^4 with heights up to the 10^5 bound (the maximum present): scanning left and
    # right for the walls at every index is ~4 * 10^8 steps, and filling one unit level at a time
    # is ~10^5 levels * 2 * 10^4 cells.
    n = 2 * 10**4
    height = [rng.randint(0, 10**5) for _ in range(n)]
    height[rng.randrange(n // 4, 3 * n // 4)] = 10**5
    return [height]


naive("trapping-rain-water", "scan for both walls at every index O(n^2)", """class Solution:
    def trap(self, height):
        n = len(height)
        res = 0
        for i in range(n):
            left = 0
            for j in range(i + 1):
                if height[j] > left:
                    left = height[j]
            right = 0
            for j in range(i, n):
                if height[j] > right:
                    right = height[j]
            res += min(left, right) - height[i]
        return res""")

naive("trapping-rain-water", "fill one level at a time O(n * max height)", """class Solution:
    def trap(self, height):
        res = 0
        for level in range(1, max(height, default=0) + 1):
            first = last = -1
            for i, h in enumerate(height):
                if h >= level:
                    if first < 0:
                        first = i
                    last = i
            if first < 0:
                break
            for i in range(first, last + 1):
                if height[i] < level:
                    res += 1
        return res""")
