"""TLE cases for Linked List (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Reverse Linked List ----------

@tle("reverse-linked-list")
def _reverse_linked_list(rng):
    # Max length 1000, full value range.
    return [[rng.randint(-1000, 1000) for _ in range(1000)]]


no_tle("reverse-linked-list", "list length <= 1000: even re-walking to the tail for every node is ~5 * 10^5 steps, instant")


# ---------- Merge Two Sorted Lists ----------

@tle("merge-two-sorted-lists")
def _merge_two_sorted_lists(rng):
    # Both lists at max length 50, interleaving values so the merge alternates to the very end.
    vals = sorted(rng.randint(-100, 100) for _ in range(100))
    return [vals[0::2], vals[1::2]]


no_tle("merge-two-sorted-lists", "each list has <= 50 nodes: any merge, even re-sorting after every insert, is bounded by ~10^4 steps")


# ---------- Linked List Cycle ----------

@tle("linked-list-cycle")
def _linked_list_cycle(rng):
    # Max length 1000, the cycle closing at the head so the loop is as long as possible.
    return [[rng.randint(-1000, 1000) for _ in range(1000)], 0]


no_tle("linked-list-cycle", "list length <= 1000: a visited-list O(n^2) scan is ~5 * 10^5 comparisons, instant")


# ---------- Reorder List ----------

@tle("reorder-list")
def _reorder_list(rng):
    # Max length 1000.
    return [[rng.randint(1, 1000) for _ in range(1000)]]


no_tle("reorder-list", "list length <= 1000: walking to the tail for every node is ~5 * 10^5 steps, instant")


# ---------- Remove Nth Node From End of List ----------

@tle("remove-nth-node-from-end-of-list")
def _remove_nth(rng):
    # Max length 30, removing the head (n = sz), the case a one-pass solution most often misses.
    return [[rng.randint(0, 100) for _ in range(30)], 30]


no_tle("remove-nth-node-from-end-of-list", "sz <= 30: any approach is a handful of steps")


# ---------- Copy List with Random Pointer ----------

@tle("copy-list-with-random-pointer")
def _copy_random_list(rng):
    # Max length 100, duplicate values, every random pointer set (some to self, some backwards).
    n = 100
    return [[[rng.randint(-100, 100), rng.randrange(n)] for _ in range(n)]]


no_tle("copy-list-with-random-pointer", "n <= 100: even locating every random target by an O(n) walk is 10^4 steps")


# ---------- Add Two Numbers ----------

@tle("add-two-numbers")
def _add_two_numbers(rng):
    # Both numbers 100 digits of 9s and near-9s, so the carry ripples through to a 101st digit.
    l1 = [9] * 100
    l2 = [rng.choice((9, 8, 9, 9)) for _ in range(99)] + [9]
    return [l1, l2]


no_tle("add-two-numbers", "each list has <= 100 digits: any digit-by-digit or big-int approach is instant")


# ---------- Find the Duplicate Number ----------

FIND_DUP_COUNT = 17


@tle("find-the-duplicate-number", count=FIND_DUP_COUNT)
def _find_duplicate(rng):
    # n = 10^4, the one repeated value occupying the last two slots, so a pairwise scan does all
    # ~5 * 10^7 comparisons, and the repeated value is n, so counting candidates 1..n finds it last.
    # One case cannot time out a correct solution: the slowest natural O(n^2) scans are ~3-8 s
    # each here (count-candidates ~2.8 s, pairwise ~3.3 s, n x n ~8 s). But the 15 s budget covers
    # the whole Submit, so 17 distinct maximal cases (a fresh shuffle each) add up to ~47 s, ~56 s
    # and ~136 s, at least 3x the budget, while Floyd's O(n) cycle detection, the reference, stays
    # at a few ms per case (~0.1-0.2 s for the whole Submit).
    n = 10**4
    nums = list(range(1, n))
    rng.shuffle(nums)
    return [nums + [n, n]]


naive("find-the-duplicate-number", "pairwise scan over j > i O(n^2)", """class Solution:
    def findDuplicate(self, nums):
        n = len(nums)
        for i in range(n):
            for j in range(i + 1, n):
                if nums[i] == nums[j]:
                    return nums[i]""")

naive("find-the-duplicate-number", "full n x n double loop with i != j O(n^2)", """class Solution:
    def findDuplicate(self, nums):
        n = len(nums)
        for i in range(n):
            for j in range(n):
                if i != j and nums[i] == nums[j]:
                    return nums[i]""")

naive("find-the-duplicate-number", "count each candidate 1..n by a scan O(n^2)", """class Solution:
    def findDuplicate(self, nums):
        for c in range(1, len(nums)):
            seen = 0
            for x in nums:
                if x == c:
                    seen += 1
            if seen > 1:
                return c""")


# ---------- LRU Cache ----------

@tle("lru-cache")
def _lru_cache(rng, calls=10**5):
    # capacity 3000, 10^5 calls (half the 2 * 10^5 allowed, to keep the file small). Puts cycle
    # through all 10^4 + 1 keys, so every put is a miss that evicts once the cache is full; every
    # fifth call is a get, half on a key just put (a hit at the most-recent end), half on a key long
    # evicted (a miss). Anything that scans the cache per call (list of pairs, oldest-timestamp
    # search) does ~3000 steps a call: ~3 * 10^8 in all.
    cap = 3000
    keys = list(range(10**4 + 1))
    rng.shuffle(keys)
    names, params = ["LRUCache"], [[cap]]
    p = 0
    while len(names) - 1 < calls:
        if len(names) % 5 == 0 and p > cap:
            if rng.random() < 0.5:
                k = keys[(p - 1 - rng.randrange(20)) % len(keys)]
            else:
                k = keys[(p - cap - 500 - rng.randrange(2000)) % len(keys)]
            names.append("get")
            params.append([k])
        else:
            names.append("put")
            params.append([keys[p % len(keys)], rng.randrange(1000)])
            p += 1
    return [names, params]


naive("lru-cache", "list of [key, value] pairs, linear search O(capacity) per call", """class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.items = []  # least recently used first

    def get(self, key):
        for i in range(len(self.items)):
            if self.items[i][0] == key:
                pair = self.items.pop(i)
                self.items.append(pair)
                return pair[1]
        return -1

    def put(self, key, value):
        for i in range(len(self.items)):
            if self.items[i][0] == key:
                self.items.pop(i)
                break
        else:
            if len(self.items) == self.cap:
                self.items.pop(0)
        self.items.append([key, value])""")

naive("lru-cache", "dict + timestamps, scan for the oldest on eviction O(capacity)", """class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.vals = {}
        self.used = {}
        self.clock = 0

    def get(self, key):
        if key not in self.vals:
            return -1
        self.clock += 1
        self.used[key] = self.clock
        return self.vals[key]

    def put(self, key, value):
        self.clock += 1
        if key not in self.vals and len(self.vals) == self.cap:
            oldest = None
            for k in self.vals:
                if oldest is None or self.used[k] < self.used[oldest]:
                    oldest = k
            del self.vals[oldest]
            del self.used[oldest]
        self.vals[key] = value
        self.used[key] = self.clock""")


# ---------- Merge k Sorted Lists ----------

# Max size: 10^4 one-node lists (10^4 nodes in all, k = 10^4). Lists this long used to crash the
# judge on deallocation; commit e053880 frees them node by node, so the case is full size. One case
# cannot time anything out: every natural slow merge is bounded by N k = 10^8 node steps, and was
# measured here at ~4 s per case for merging into the result one list at a time (~N k / 2 hops)
# and ~7.5 s per case for scanning every head for the minimum (N k head checks). But the 15 s
# budget covers the whole Submit, so MERGE_K_COUNT distinct maximal cases add up: ~40 s and ~75 s.
# The count is a balance: the reference costs ~80 ms per case (building and walking 10^4 nodes),
# so the per-case naive / reference ratio is fixed at ~50 by the constraints, and 10 cases split
# it evenly, ~2.6x over the judge's 15 s for the faster naive and ~2.5x under the 2 s reference
# budget (~0.8 s), so neither audit flakes on a loaded or slower machine.
MERGE_K_COUNT = 10
MERGE_K_TOTAL = 10**4


@tle("merge-k-sorted-lists", count=MERGE_K_COUNT)
def _merge_k_sorted_lists(rng):
    # One-node lists, strictly increasing from list to list: merging into the result one list at a
    # time walks the whole result for every list, and every head is scanned for every node.
    vals = sorted(rng.sample(range(-10**4, 10**4 + 1), MERGE_K_TOTAL))
    return [[[v] for v in vals]]


MERGE_K_NAIVE = [("merge one list at a time into the result O(N k)", """class Solution:
    def mergeKLists(self, lists):
        res = None
        for l in lists:
            dummy = tail = ListNode()
            a, b = res, l
            while a and b:
                if a.val <= b.val:
                    tail.next = a
                    a = a.next
                else:
                    tail.next = b
                    b = b.next
                tail = tail.next
            tail.next = a or b
            res = dummy.next
        return res"""), ("scan every head for the minimum O(N k)", """class Solution:
    def mergeKLists(self, lists):
        dummy = tail = ListNode()
        while True:
            best = -1
            for i in range(len(lists)):
                if lists[i] and (best == -1 or lists[i].val < lists[best].val):
                    best = i
            if best == -1:
                break
            tail.next = lists[best]
            tail = tail.next
            lists[best] = lists[best].next
        return dummy.next""")]

for _label, _source in MERGE_K_NAIVE:
    naive("merge-k-sorted-lists", _label, _source)


# ---------- Reverse Nodes in k-Group ----------

@tle("reverse-nodes-in-k-group")
def _reverse_k_group(rng):
    # Max size, n = 5000 (the judge frees long lists node by node since commit e053880), and k = n:
    # one group spanning the whole list, the worst case for reversing a group by walking to its
    # tail for every node (O(k^2), ~1.25 * 10^7 hops).
    n = 5000
    return [[rng.randint(0, 100) for _ in range(n)], n]


no_tle("reverse-nodes-in-k-group", "n <= 5000: the slowest natural correct solution, reversing each group by walking to its tail for every node (O(k^2), ~1.25 * 10^7 hops at k = n = 5000), measured ~0.8 s per maximal case in Pyodide, so one case cannot time it out. Adding cases up against the whole-Submit budget does not work either: the O(n) reference costs ~20 ms per case (building, walking and serializing 5000 nodes), a fixed ratio of only ~35-40, so the >= 3x margin needs ~58 cases (more than tle.MAX_DRAWS = 50), and even 50 cases (~39 s for the naive, 2.6x) put the reference at 1.1-1.8 s quiet and 2.07-2.22 s under load, over its 2 s budget. No case set both kills the O(k^2) walk reliably and keeps the reference within budget")
