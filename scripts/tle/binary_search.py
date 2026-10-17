"""TLE cases for Binary Search (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Binary Search ----------

@tle("binary-search")
def _binary_search(rng):
    # Max size 10^4 with the target absent (but inside the value range), so a linear scan reads
    # every element.
    pool = list(range(-10**4 + 1, 10**4))
    nums = sorted(rng.sample(pool, 10**4))
    present = set(nums)
    missing = [v for v in pool if v not in present and nums[0] < v < nums[-1]]
    return [nums, rng.choice(missing)]


no_tle("binary-search", "nums.length <= 10^4: a linear scan is 10^4 comparisons, instant")


# ---------- Search a 2D Matrix ----------

@tle("search-a-2d-matrix")
def _search_2d_matrix(rng):
    # Max 100x100 with the target absent (between values near the bottom-right), so a full scan
    # visits every cell.
    flat = sorted(rng.sample(range(-10**4, 10**4 + 1, 2), 10**4))
    target = flat[-3] + 1
    return [[flat[i * 100:(i + 1) * 100] for i in range(100)], target]


no_tle("search-a-2d-matrix", "m, n <= 100: a full scan of the matrix is 10^4 cells, instant")


# ---------- Koko Eating Bananas ----------

@tle("koko-eating-bananas")
def _koko(rng):
    # 10^4 piles near 10^9 with h = 2n, so the answer sits near 5 * 10^8: trying speeds one by one,
    # upward from 1 or downward from max(piles), takes ~5 * 10^8 speeds, each an O(n) check.
    n = 10**4
    piles = [rng.randint(9 * 10**8, 10**9) for _ in range(n)]
    return [piles, 2 * n]


naive("koko-eating-bananas", "try every speed upward from 1", """class Solution:
    def minEatingSpeed(self, piles, h):
        k = 1
        while True:
            hours = 0
            for p in piles:
                hours += (p + k - 1) // k
                if hours > h:
                    break
            if hours <= h:
                return k
            k += 1""")

naive("koko-eating-bananas", "try every speed downward from max(piles)", """class Solution:
    def minEatingSpeed(self, piles, h):
        k = max(piles)
        while k > 1:
            hours = 0
            for p in piles:
                hours += (p + k - 2) // (k - 1)
            if hours > h:
                return k
            k -= 1
        return 1""")


# ---------- Find Minimum in Rotated Sorted Array ----------

@tle("find-minimum-in-rotated-sorted-array")
def _find_min_rotated(rng):
    # Max size 1000, rotated so the minimum is the LAST element: a scan for the drop goes the
    # whole way.
    nums = sorted(rng.sample(range(-1000, 1001), 1000))
    return [nums[1:] + nums[:1]]


no_tle("find-minimum-in-rotated-sorted-array", "nums.length <= 1000: a linear scan is 1000 steps, instant")


# ---------- Search in Rotated Sorted Array ----------

@tle("search-in-rotated-sorted-array")
def _search_rotated(rng):
    # Max size 1000 with a random rotation and the target absent, so a linear scan reads it all.
    nums = sorted(rng.sample(range(-1000, 1001), 1000))
    present = set(nums)
    k = rng.randrange(1, 1000)
    target = rng.choice([v for v in range(-1000, 1001) if v not in present])
    return [nums[k:] + nums[:k], target]


no_tle("search-in-rotated-sorted-array", "nums.length <= 1000: a linear scan is 1000 steps, instant")


# ---------- Time Based Key-Value Store ----------

@tle("time-based-key-value-store")
def _time_map(rng):
    # S sets on one key at timestamps 1..S, then G gets at timestamps near 10^7, far past the last
    # set. A forward linear scan of the history never hits a later timestamp to stop at, so each
    # get walks all S entries: G * S = 5.1 * 10^8 steps. Counting the timestamp down until one was
    # set costs ~10^7 per get: 1.7 * 10^11 in total. Only ~47k calls in all, so the per-call cost
    # of the reference stays small even on a loaded machine.
    S, G = 30_000, 17_000
    names, params = ["TimeMap"], [[]]
    for t in range(1, S + 1):
        names.append("set")
        params.append(["a", format(t, "x"), t])
    for _ in range(G):
        names.append("get")
        params.append(["a", rng.randint(10**7 - 1000, 10**7)])
    return [names, params]


naive("time-based-key-value-store", "linear scan of the key's history per get", """class TimeMap:
    def __init__(self):
        self.store = {}

    def set(self, key, value, timestamp):
        self.store.setdefault(key, []).append((timestamp, value))

    def get(self, key, timestamp):
        res = ""
        for t, v in self.store.get(key, []):
            if t <= timestamp:
                res = v
            else:
                break
        return res""")

naive("time-based-key-value-store", "count the timestamp down until one was set", """class TimeMap:
    def __init__(self):
        self.store = {}

    def set(self, key, value, timestamp):
        self.store.setdefault(key, {})[timestamp] = value

    def get(self, key, timestamp):
        d = self.store.get(key)
        if not d:
            return ""
        for t in range(timestamp, -1, -1):
            if t in d:
                return d[t]
        return \"\"""")


# ---------- Median of Two Sorted Arrays ----------

@tle("median-of-two-sorted-arrays")
def _median_two_sorted(rng):
    # Max size (1000 + 1000), interleaving values so a merge alternates sides throughout.
    vals = sorted(rng.sample(range(-10**6, 10**6 + 1), 2000))
    return [vals[0::2], vals[1::2]]


no_tle("median-of-two-sorted-arrays", "m, n <= 1000: merging or even sorting the 2000 values is instant")
