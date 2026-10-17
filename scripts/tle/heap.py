"""TLE cases for Heap / Priority Queue (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Kth Largest Element in a Stream ----------

@tle("kth-largest-element-in-a-stream")
def _kth_largest_stream(rng):
    # k = 1000 over 1000 low starting values, then LeetCode's maximum of 10^4 adds climbing slowly
    # from -1000 to 1000. A solution that re-selects the top k from the whole history on every add
    # (heapq.nlargest, a Python-level pass) walks ~10^4 * 10^4 elements, and because the history
    # keeps rising nearly every element evicts the current k-th largest, so each step also does a
    # heap replacement. (Re-sorting a copy per add is C-speed timsort and cannot be told apart from
    # the budget at these bounds, so it is not registered.)
    nums = sorted(rng.randint(-1000, -950) for _ in range(1000))
    adds = [[min(1000, -1000 + (2000 * i) // 10**4 + rng.randint(0, 1))] for i in range(10**4)]
    return [["KthLargest"] + ["add"] * len(adds), [[1000, nums]] + adds]


naive("kth-largest-element-in-a-stream", "heapq.nlargest over the history per add", """import heapq
class KthLargest:
    def __init__(self, k, nums):
        self.k = k
        self.nums = list(nums)

    def add(self, val):
        self.nums.append(val)
        return heapq.nlargest(self.k, self.nums)[-1]""")


# ---------- Last Stone Weight ----------

@tle("last-stone-weight")
def _last_stone_weight(rng):
    # Max size: 20 stones near the top of the weight range.
    return [[rng.randint(50, 100) for _ in range(20)]]


no_tle("last-stone-weight", "stones.length <= 20: at most 19 smashes, so even re-sorting every round is a few hundred steps")


# ---------- K Closest Points to Origin ----------

@tle("k-closest-points-to-origin")
def _k_closest(rng):
    # Max size 1000 with k = 500 and a unique answer (the 500th and 501st distances differ).
    points = [[rng.randint(-100, 100), rng.randint(-100, 100)] for _ in range(1000)]
    d = sorted(x * x + y * y for x, y in points)
    return [points, 500] if d[499] != d[500] else None


no_tle("k-closest-points-to-origin", "points.length <= 1000: even k rounds of a linear min-scan are ~10^6 steps, well under a second")


# ---------- Kth Largest Element in an Array ----------

@tle("kth-largest-element-in-an-array")
def _kth_largest_array(rng):
    # Max size 10^4 in ascending order (the worst case for first/last-element-pivot quickselect and
    # insertion-style sorts), with k at the median so selecting the top k does the most work.
    nums = sorted(rng.randint(-1000, 1000) for _ in range(10**4))
    return [nums, 5000]


no_tle("kth-largest-element-in-an-array", "nums.length <= 10^4: even a pure-Python O(n^2) selection is ~5 * 10^7 steps, a few seconds in Pyodide -- not reliably past 15 s")


# ---------- Task Scheduler ----------

@tle("task-scheduler")
def _task_scheduler(rng):
    # 10^4 tasks, almost all "A", with n = 100: the schedule is ~10^6 time slots, nearly all idle,
    # so a simulation that recounts the remaining tasks every slot does ~10^6 * 10^4 work.
    tasks = ["A"] * (10**4 - 25) + [chr(ord("B") + i) for i in range(25)]
    rng.shuffle(tasks)
    return [tasks, 100]


naive("task-scheduler", "slot-by-slot simulation recounting the remaining tasks", """class Solution:
    def leastInterval(self, tasks, n):
        remaining = list(tasks)
        last = {}
        time = 0
        while remaining:
            best = None
            for t in set(remaining):
                if t in last and time - last[t] <= n:
                    continue
                if best is None or remaining.count(t) > remaining.count(best):
                    best = t
            if best is not None:
                remaining.remove(best)
                last[best] = time
            time += 1
        return time""")


# ---------- Design Twitter ----------

@tle("design-twitter")
def _design_twitter(rng):
    # LeetCode's maximum of 3 * 10^4 calls: 10^4 tweets spread over users 2..11, user 1 follows all
    # ten, then every remaining call is getNewsFeed(1). Gathering every followed tweet and sorting
    # them per feed is ~2 * 10^4 sorts of 10^4 tweets; the heap merge touches ~20 per feed.
    authors = list(range(2, 12))
    names, params = ["Twitter"], [[]]
    for tweet in rng.sample(range(10**4 + 1), 10**4):
        names.append("postTweet")
        params.append([rng.choice(authors), tweet])
    for a in authors:
        names.append("follow")
        params.append([1, a])
    while len(names) - 1 < 3 * 10**4:
        names.append("getNewsFeed")
        params.append([1])
    return [names, params]


naive("design-twitter", "gather every followed tweet and sort per feed", """class Twitter:
    def __init__(self):
        self.time = 0
        self.tweets = {}
        self.following = {}

    def postTweet(self, userId, tweetId):
        self.tweets.setdefault(userId, []).append((self.time, tweetId))
        self.time += 1

    def getNewsFeed(self, userId):
        users = self.following.get(userId, set()) | {userId}
        feed = []
        for u in users:
            feed.extend(self.tweets.get(u, []))
        feed.sort(reverse=True)
        return [t for _, t in feed[:10]]

    def follow(self, followerId, followeeId):
        self.following.setdefault(followerId, set()).add(followeeId)

    def unfollow(self, followerId, followeeId):
        self.following.get(followerId, set()).discard(followeeId)""")


# ---------- Find Median from Data Stream ----------

@tle("find-median-from-data-stream")
def _find_median(rng):
    # LeetCode's maximum of 5 * 10^4 calls: 4 * 10^4 random adds with a findMedian after every
    # fourth. Sorting a copy per findMedian is ~10^4 sorts of ~2 * 10^4 values; keeping a sorted
    # list by linear-scan insertion walks ~half of it per add (~4 * 10^8 steps).
    names, params = ["MedianFinder"], [[]]
    for i in range(4 * 10**4):
        names.append("addNum")
        params.append([rng.randint(-10**5, 10**5)])
        if i % 4 == 3:
            names.append("findMedian")
            params.append([])
    return [names, params]


naive("find-median-from-data-stream", "sort a copy per findMedian", """class MedianFinder:
    def __init__(self):
        self.nums = []

    def addNum(self, num):
        self.nums.append(num)

    def findMedian(self):
        s = sorted(self.nums)
        n = len(s)
        if n % 2:
            return s[n // 2]
        return (s[n // 2 - 1] + s[n // 2]) / 2""")

naive("find-median-from-data-stream", "linear-scan insertion into a sorted list", """class MedianFinder:
    def __init__(self):
        self.nums = []

    def addNum(self, num):
        i = 0
        while i < len(self.nums) and self.nums[i] < num:
            i += 1
        self.nums.insert(i, num)

    def findMedian(self):
        s = self.nums
        n = len(s)
        if n % 2:
            return s[n // 2]
        return (s[n // 2 - 1] + s[n // 2]) / 2""")
