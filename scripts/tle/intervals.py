"""TLE cases for Intervals (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Insert Interval ----------

@tle("insert-interval")
def _insert_interval(rng):
    # Max size: 10^4 sorted, non-overlapping intervals in [0, 10^5] (gaps >= 1), and a new
    # interval that swallows a long middle stretch, so every approach must walk the whole list
    # and a merge-by-restarting one merges thousands of times.
    starts = sorted(rng.sample(range(0, 10**5 // 2), 10**4))
    intervals = []
    for i, s in enumerate(starts):
        a = 2 * s
        nxt = 2 * starts[i + 1] if i + 1 < len(starts) else 10**5 + 1
        b = min(a + rng.randrange(0, 4), nxt - 1, 10**5)
        intervals.append([a, b])
    lo = rng.randrange(10**5 // 4, 10**5 // 3)
    hi = rng.randrange(2 * 10**5 // 3, 3 * 10**5 // 4)
    return [intervals, [lo, hi]]


naive("insert-interval", "append, merge any overlapping pair and restart O(n^2 * merges)", """class Solution:
    def insert(self, intervals, newInterval):
        ivs = [list(iv) for iv in intervals] + [list(newInterval)]
        changed = True
        while changed:
            changed = False
            n = len(ivs)
            for i in range(n):
                a = ivs[i]
                for j in range(i + 1, n):
                    b = ivs[j]
                    if a[0] <= b[1] and b[0] <= a[1]:
                        ivs[i] = [min(a[0], b[0]), max(a[1], b[1])]
                        ivs.pop(j)
                        changed = True
                        break
                if changed:
                    break
        return sorted(ivs)""")


# ---------- Merge Intervals ----------

@tle("merge-intervals")
def _merge_intervals(rng):
    # Max size 1000 with values <= 1000: 575 pairwise-disjoint points [v, v] (v < 999) up front
    # that a pairwise scan has to check against everything every round, then 425 intervals in
    # [999, 1000] that all overlap each other, so a "find any overlapping pair, merge, restart"
    # loop does 424 rounds of ~5.7 * 10^5 checks (~1.9 * 10^8 in all; 575/425 maximises
    # k * m * (k + m / 2), the most this loop shape allows at n <= 1000). The full double loop
    # measured ~31 s in Pyodide here; the j > i variant (~1.2 * 10^8 checks) finished in ~18.5 s,
    # too close to the budget to register as a naive.
    disjoint = [[v, v] for v in rng.sample(range(999), 575)]
    cluster = [rng.choice(([999, 1000], [999, 999], [1000, 1000], [999, 1000])) for _ in range(425)]
    cluster[0] = [999, 1000]
    return [disjoint + cluster]


naive("merge-intervals", "find any overlapping pair (full double loop), merge, restart O(n^3)", """class Solution:
    def merge(self, intervals):
        ivs = [list(iv) for iv in intervals]
        changed = True
        while changed:
            changed = False
            n = len(ivs)
            for i in range(n):
                for j in range(n):
                    if i != j and ivs[i][0] <= ivs[j][1] and ivs[j][0] <= ivs[i][1]:
                        ivs[i] = [min(ivs[i][0], ivs[j][0]), max(ivs[i][1], ivs[j][1])]
                        ivs.pop(j)
                        changed = True
                        break
                if changed:
                    break
        return sorted(ivs)""")


# ---------- Non-overlapping Intervals ----------

@tle("non-overlapping-intervals")
def _non_overlapping(rng):
    # 10^5 unit intervals tiling [-5 * 10^4, 5 * 10^4], shuffled: nothing overlaps, so the O(n^2)
    # LIS-style DP compares every pair and a "check against every kept interval" greedy keeps
    # all 10^5 of them.
    intervals = [[x, x + 1] for x in range(-5 * 10**4, 5 * 10**4)]
    rng.shuffle(intervals)
    return [intervals]


naive("non-overlapping-intervals", "LIS-style DP O(n^2)", """class Solution:
    def eraseOverlapIntervals(self, intervals):
        intervals = sorted(intervals)
        n = len(intervals)
        dp = [1] * n
        for i in range(n):
            for j in range(i):
                if intervals[j][1] <= intervals[i][0] and dp[j] + 1 > dp[i]:
                    dp[i] = dp[j] + 1
        return n - max(dp)""")

naive("non-overlapping-intervals", "greedy by end, check every kept interval O(n * kept)", """class Solution:
    def eraseOverlapIntervals(self, intervals):
        kept = []
        for s, e in sorted(intervals, key=lambda iv: iv[1]):
            if all(e2 <= s or e <= s2 for s2, e2 in kept):
                kept.append((s, e))
        return len(intervals) - len(kept)""")


# ---------- Meeting Rooms ----------

@tle("meeting-rooms")
def _meeting_rooms(rng):
    # Max size 500, all disjoint (answer True, no early exit), shuffled.
    cuts = sorted(rng.sample(range(0, 10**6 + 1), 1000))
    intervals = [[cuts[2 * i], cuts[2 * i + 1]] for i in range(500)]
    rng.shuffle(intervals)
    return [intervals]


no_tle("meeting-rooms", "intervals.length <= 500: a pairwise O(n^2) check is ~1.25 * 10^5 comparisons, instant")


# ---------- Meeting Rooms II ----------

@tle("meeting-rooms-ii")
def _meeting_rooms_ii(rng):
    # 10^5 meetings that all overlap (every one spans 5 * 10^5): the answer is 10^5 rooms, so
    # "scan the open rooms for a free one" scans ever more rooms and per-meeting counting is n^2.
    intervals = [[rng.randrange(0, 5 * 10**5), rng.randrange(5 * 10**5 + 1, 10**6 + 1)] for _ in range(10**5)]
    return [intervals]


naive("meeting-rooms-ii", "scan rooms for a free one O(n * rooms)", """class Solution:
    def minMeetingRooms(self, intervals):
        rooms = []
        for s, e in sorted(intervals):
            for k in range(len(rooms)):
                if rooms[k] <= s:
                    rooms[k] = e
                    break
            else:
                rooms.append(e)
        return len(rooms)""")

naive("meeting-rooms-ii", "count meetings live at each start O(n^2)", """class Solution:
    def minMeetingRooms(self, intervals):
        best = 0
        for s, _ in intervals:
            live = 0
            for s2, e2 in intervals:
                if s2 <= s < e2:
                    live += 1
            best = max(best, live)
        return best""")


# ---------- Minimum Interval to Include Each Query ----------

@tle("minimum-interval-to-include-each-query")
def _min_interval(rng):
    # 10^5 intervals: 99,999 small ones inside [1, 9999] plus one big [1, 99999]. 7 * 10^4 queries,
    # 90% above 9999, where only the big (largest) interval covers them: a per-query scan of all
    # intervals, or of intervals sorted by size, walks all 10^5 for each. Small coordinates keep
    # the file under 2.5 MB.
    intervals = []
    for _ in range(10**5 - 1):
        a = rng.randrange(1, 10**4)
        intervals.append([a, min(a + rng.randrange(0, 50), 9999)])
    intervals.insert(rng.randrange(len(intervals) + 1), [1, 99999])
    queries = [rng.randrange(10**4, 10**5) if rng.random() < 0.9 else rng.randrange(1, 10**4)
               for _ in range(7 * 10**4)]
    return [intervals, queries]


naive("minimum-interval-to-include-each-query", "scan every interval per query O(n * q)", """class Solution:
    def minInterval(self, intervals, queries):
        res = []
        for q in queries:
            best = -1
            for l, r in intervals:
                if l <= q <= r and (best == -1 or r - l + 1 < best):
                    best = r - l + 1
            res.append(best)
        return res""")

naive("minimum-interval-to-include-each-query", "sort by size, first containing per query O(n * q)", """class Solution:
    def minInterval(self, intervals, queries):
        by_size = sorted(intervals, key=lambda iv: iv[1] - iv[0])
        res = []
        for q in queries:
            ans = -1
            for l, r in by_size:
                if l <= q <= r:
                    ans = r - l + 1
                    break
            res.append(ans)
        return res""")
