#!/usr/bin/env python3
"""Checks every case in data/tests/ against its problem's stated constraints.

A generator that emits an input the problem rules out (an empty array where the statement says
1 <= n) makes the player handle a case LeetCode never would. One validator per problem, transcribed
from the Constraints section of LeetCode's statement. The seven Premium problems carry LeetCode's
constraints too, though our own statements in data/premium-descriptions.json omit them.

Usage: python3 scripts/constraints.py   (exit 1 on any violation; CI runs it)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I32 = (-2**31, 2**31 - 1)
LOWER = set("abcdefghijklmnopqrstuvwxyz")
UPPER = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
LETTERS = LOWER | UPPER
DIGITS = set("0123456789")

V = {}


def check(slug):
    def wrap(f):
        V[slug] = f
        return f
    return wrap


class Bad(Exception):
    pass


def need(cond, msg):
    if not cond:
        raise Bad(msg)


def rng(x, lo, hi, what):
    need(isinstance(x, (int, float)) and not isinstance(x, bool) and lo <= x <= hi, f"{what}={x!r} not in [{lo}, {hi}]")


def length(xs, lo, hi, what):
    need(xs is not None and lo <= len(xs) <= hi, f"len({what})={None if xs is None else len(xs)} not in [{lo}, {hi}]")


def each(xs, lo, hi, what):
    for x in xs:
        rng(x, lo, hi, f"{what}[i]")


def chars(s, allowed, what):
    bad = set(s) - allowed
    need(not bad, f"{what} has disallowed characters {sorted(bad)[:5]}")


def unique(xs, what):
    need(len(set(map(lambda v: json.dumps(v), xs))) == len(xs), f"{what} has duplicates")


def matrix(m, rlo, rhi, clo, chi, what, square=False):
    length(m, rlo, rhi, what)
    for row in m:
        length(row, clo, chi, f"{what}[i]")
        need(len(row) == len(m[0]), f"{what} is ragged")
    if square:
        need(len(m) == len(m[0]), f"{what} is not square")


def tree_vals(level):
    return [v for v in level if v is not None]


def sorted_nondec(xs, what):
    need(all(a <= b for a, b in zip(xs, xs[1:])), f"{what} not sorted")


def ops(args):
    names, params = args
    return list(zip(names[1:], params[1:])), params[0]


# ---------- Arrays & Hashing ----------

@check("contains-duplicate")
def _(nums):
    length(nums, 1, 10**5, "nums"); each(nums, -10**9, 10**9, "nums")


@check("valid-anagram")
def _(s, t):
    length(s, 1, 5 * 10**4, "s"); length(t, 1, 5 * 10**4, "t"); chars(s + t, LOWER, "s/t")


@check("two-sum")
def _(nums, target):
    length(nums, 2, 10**4, "nums"); each(nums, -10**9, 10**9, "nums"); rng(target, -10**9, 10**9, "target")
    pairs = sum(1 for i in range(len(nums)) for j in range(i + 1, len(nums)) if nums[i] + nums[j] == target)
    need(pairs == 1, f"{pairs} valid answers, expected exactly one")


@check("group-anagrams")
def _(strs):
    length(strs, 1, 10**4, "strs")
    for s in strs:
        length(s, 0, 100, "strs[i]"); chars(s, LOWER, "strs[i]")


@check("top-k-frequent-elements")
def _(nums, k):
    length(nums, 1, 10**5, "nums"); each(nums, -10**4, 10**4, "nums")
    rng(k, 1, len(set(nums)), "k")
    from collections import Counter
    f = sorted(Counter(nums).values(), reverse=True)
    need(k == len(f) or f[k - 1] != f[k], "answer is not unique")


@check("encode-and-decode-strings")
def _(strs):
    # LeetCode 271: 1 <= strs.length <= 200, 0 <= strs[i].length <= 200, any of the 256 ASCII chars.
    length(strs, 1, 200, "strs")
    for s in strs:
        length(s, 0, 200, "strs[i]"); need(all(ord(c) < 256 for c in s), "strs[i] outside ASCII-256")


@check("product-of-array-except-self")
def _(nums):
    length(nums, 2, 10**5, "nums"); each(nums, -30, 30, "nums")


@check("valid-sudoku")
def _(board):
    matrix(board, 9, 9, 9, 9, "board")
    for row in board:
        chars("".join(row), set("123456789."), "board")


@check("longest-consecutive-sequence")
def _(nums):
    length(nums, 0, 10**5, "nums"); each(nums, -10**9, 10**9, "nums")


# ---------- Two Pointers ----------

@check("valid-palindrome")
def _(s):
    length(s, 1, 2 * 10**5, "s"); need(all(32 <= ord(c) < 127 for c in s), "s not printable ASCII")


@check("two-sum-ii-input-array-is-sorted")
def _(numbers, target):
    length(numbers, 2, 3 * 10**4, "numbers"); each(numbers, -1000, 1000, "numbers"); sorted_nondec(numbers, "numbers")
    rng(target, -1000, 1000, "target")
    pairs = sum(1 for i in range(len(numbers)) for j in range(i + 1, len(numbers)) if numbers[i] + numbers[j] == target)
    need(pairs == 1, f"{pairs} solutions, expected exactly one")


@check("3sum")
def _(nums):
    length(nums, 3, 3000, "nums"); each(nums, -10**5, 10**5, "nums")


@check("container-with-most-water")
def _(height):
    length(height, 2, 10**5, "height"); each(height, 0, 10**4, "height")


@check("trapping-rain-water")
def _(height):
    length(height, 1, 2 * 10**4, "height"); each(height, 0, 10**5, "height")


# ---------- Sliding Window ----------

@check("best-time-to-buy-and-sell-stock")
def _(prices):
    length(prices, 1, 10**5, "prices"); each(prices, 0, 10**4, "prices")


@check("longest-substring-without-repeating-characters")
def _(s):
    length(s, 0, 5 * 10**4, "s"); need(all(32 <= ord(c) < 127 for c in s), "s not letters/digits/symbols/spaces")


@check("longest-repeating-character-replacement")
def _(s, k):
    length(s, 1, 10**5, "s"); chars(s, UPPER, "s"); rng(k, 0, len(s), "k")


@check("permutation-in-string")
def _(s1, s2):
    length(s1, 1, 10**4, "s1"); length(s2, 1, 10**4, "s2"); chars(s1 + s2, LOWER, "s1/s2")


@check("minimum-window-substring")
def _(s, t):
    length(s, 1, 10**5, "s"); length(t, 1, 10**5, "t"); chars(s + t, LETTERS, "s/t")


@check("sliding-window-maximum")
def _(nums, k):
    length(nums, 1, 10**5, "nums"); each(nums, -10**4, 10**4, "nums"); rng(k, 1, len(nums), "k")


# ---------- Stack ----------

@check("valid-parentheses")
def _(s):
    length(s, 1, 10**4, "s"); chars(s, set("()[]{}"), "s")


@check("min-stack")
def _(names, params):
    size = 0
    for name, p in zip(names[1:], params[1:]):
        if name == "push":
            rng(p[0], *I32, "val"); size += 1
        else:
            need(size > 0, f"{name} on an empty stack")
            if name == "pop":
                size -= 1
    need(len(names) - 1 <= 3 * 10**4, "too many calls")


@check("evaluate-reverse-polish-notation")
def _(tokens):
    length(tokens, 1, 10**4, "tokens")
    depth = 0
    for t in tokens:
        if t in "+-*/":
            need(depth >= 2, "operator without two operands"); depth -= 1
        else:
            rng(int(t), -200, 200, "token"); depth += 1
    need(depth == 1, "not a valid expression")


@check("daily-temperatures")
def _(temperatures):
    length(temperatures, 1, 10**5, "temperatures"); each(temperatures, 30, 100, "temperatures")


@check("car-fleet")
def _(target, position, speed):
    length(position, 1, 10**5, "position"); need(len(speed) == len(position), "speed/position lengths differ")
    rng(target, 1, 10**6, "target"); each(position, 0, target - 1, "position"); unique(position, "position")
    each(speed, 1, 10**6, "speed")


@check("largest-rectangle-in-histogram")
def _(heights):
    length(heights, 1, 10**5, "heights"); each(heights, 0, 10**4, "heights")


# ---------- Binary Search ----------

@check("binary-search")
def _(nums, target):
    length(nums, 1, 10**4, "nums"); each(nums, -10**4 + 1, 10**4 - 1, "nums"); rng(target, -10**4 + 1, 10**4 - 1, "target")
    unique(nums, "nums"); sorted_nondec(nums, "nums")


@check("search-a-2d-matrix")
def _(matrix_, target):
    matrix(matrix_, 1, 100, 1, 100, "matrix")
    flat = [v for r in matrix_ for v in r]
    each(flat, -10**4, 10**4, "matrix"); rng(target, -10**4, 10**4, "target")
    for r in matrix_:
        sorted_nondec(r, "matrix row")
    need(all(matrix_[i][0] > matrix_[i - 1][-1] for i in range(1, len(matrix_))), "row start not above previous row end")


@check("koko-eating-bananas")
def _(piles, h):
    length(piles, 1, 10**4, "piles"); rng(h, len(piles), 10**9, "h"); each(piles, 1, 10**9, "piles")


def rotated_unique(nums):
    unique(nums, "nums")
    drops = sum(1 for a, b in zip(nums, nums[1:]) if a > b)
    need(drops == 0 or (drops == 1 and nums[-1] < nums[0]), "not a rotated sorted array")


@check("find-minimum-in-rotated-sorted-array")
def _(nums):
    length(nums, 1, 5000, "nums"); each(nums, -5000, 5000, "nums"); rotated_unique(nums)


@check("search-in-rotated-sorted-array")
def _(nums, target):
    length(nums, 1, 5000, "nums"); each(nums, -10**4, 10**4, "nums"); rotated_unique(nums); rng(target, -10**4, 10**4, "target")


@check("time-based-key-value-store")
def _(names, params):
    last = 0
    for name, p in zip(names[1:], params[1:]):
        key = p[0]
        length(key, 1, 100, "key"); chars(key, LOWER | DIGITS, "key")
        if name == "set":
            length(p[1], 1, 100, "value"); chars(p[1], LOWER | DIGITS, "value")
            rng(p[2], 1, 10**7, "timestamp"); need(p[2] > last, "set timestamps not strictly increasing"); last = p[2]
        else:
            rng(p[1], 1, 10**7, "timestamp")


@check("median-of-two-sorted-arrays")
def _(nums1, nums2):
    length(nums1, 0, 1000, "nums1"); length(nums2, 0, 1000, "nums2"); need(len(nums1) + len(nums2) >= 1, "both arrays empty")
    each(nums1 + nums2, -10**6, 10**6, "nums"); sorted_nondec(nums1, "nums1"); sorted_nondec(nums2, "nums2")


# ---------- Linked List ----------

@check("reverse-linked-list")
def _(head):
    length(head, 0, 5000, "list"); each(head, -5000, 5000, "Node.val")


@check("merge-two-sorted-lists")
def _(list1, list2):
    for l in (list1, list2):
        length(l, 0, 50, "list"); each(l, -100, 100, "Node.val"); sorted_nondec(l, "list")


@check("linked-list-cycle")
def _(head, pos):
    length(head, 0, 10**4, "list"); each(head, -10**5, 10**5, "Node.val")
    need(pos == -1 or 0 <= pos < len(head), f"pos={pos} invalid")


@check("reorder-list")
def _(head):
    length(head, 1, 5 * 10**4, "list"); each(head, 1, 1000, "Node.val")


@check("remove-nth-node-from-end-of-list")
def _(head, n):
    length(head, 1, 30, "list"); each(head, 0, 100, "Node.val"); rng(n, 1, len(head), "n")


@check("copy-list-with-random-pointer")
def _(head):
    length(head, 0, 1000, "list")
    for val, rnd in head:
        rng(val, -10**4, 10**4, "Node.val"); need(rnd is None or 0 <= rnd < len(head), "random out of range")


@check("add-two-numbers")
def _(l1, l2):
    for l in (l1, l2):
        length(l, 1, 100, "list"); each(l, 0, 9, "Node.val")
        need(len(l) == 1 or l[-1] != 0, "number has a leading zero")


@check("find-the-duplicate-number")
def _(nums):
    n = len(nums) - 1
    rng(n, 1, 10**5, "n"); each(nums, 1, n, "nums")
    from collections import Counter
    c = Counter(nums)
    need(sum(1 for v in c.values() if v >= 2) == 1, "not exactly one repeated value")


@check("lru-cache")
def _(names, params):
    rng(params[0][0], 1, 3000, "capacity")
    for name, p in zip(names[1:], params[1:]):
        rng(p[0], 0, 10**4, "key")
        if name == "put":
            rng(p[1], 0, 10**5, "value")


@check("merge-k-sorted-lists")
def _(lists):
    length(lists, 0, 10**4, "lists")
    for l in lists:
        length(l, 0, 500, "lists[i]"); each(l, -10**4, 10**4, "lists[i][j]"); sorted_nondec(l, "lists[i]")
    need(sum(map(len, lists)) <= 10**4, "total length too large")


@check("reverse-nodes-in-k-group")
def _(head, k):
    length(head, 1, 5000, "list"); rng(k, 1, len(head), "k"); each(head, 0, 1000, "Node.val")


# ---------- Trees ----------

def tree_size(level, lo, hi, vlo, vhi, what="tree"):
    vals = tree_vals(level)
    length(vals, lo, hi, f"{what} nodes"); each(vals, vlo, vhi, "Node.val")
    return vals


@check("invert-binary-tree")
def _(root):
    tree_size(root, 0, 100, -100, 100)


@check("maximum-depth-of-binary-tree")
def _(root):
    tree_size(root, 0, 10**4, -100, 100)


@check("diameter-of-binary-tree")
def _(root):
    tree_size(root, 1, 10**4, -100, 100)


@check("balanced-binary-tree")
def _(root):
    tree_size(root, 0, 5000, -10**4, 10**4)


@check("same-tree")
def _(p, q):
    tree_size(p, 0, 100, -10**4, 10**4, "p"); tree_size(q, 0, 100, -10**4, 10**4, "q")


@check("subtree-of-another-tree")
def _(root, subRoot):
    tree_size(root, 1, 2000, -10**4, 10**4, "root"); tree_size(subRoot, 1, 1000, -10**4, 10**4, "subRoot")


@check("lowest-common-ancestor-of-a-binary-search-tree")
def _(root, p, q):
    vals = tree_size(root, 2, 10**5, -10**9, 10**9); unique(vals, "Node.val")
    need(p != q, "p == q"); need(p in vals and q in vals, "p or q not in the tree")


@check("binary-tree-level-order-traversal")
def _(root):
    tree_size(root, 0, 2000, -1000, 1000)


@check("binary-tree-right-side-view")
def _(root):
    tree_size(root, 0, 100, -100, 100)


@check("count-good-nodes-in-binary-tree")
def _(root):
    tree_size(root, 1, 10**5, -10**4, 10**4)


@check("validate-binary-search-tree")
def _(root):
    tree_size(root, 1, 10**4, *I32)


@check("kth-smallest-element-in-a-bst")
def _(root, k):
    vals = tree_size(root, 1, 10**4, 0, 10**4); rng(k, 1, len(vals), "k")


@check("construct-binary-tree-from-preorder-and-inorder-traversal")
def _(preorder, inorder):
    length(preorder, 1, 3000, "preorder"); need(len(inorder) == len(preorder), "lengths differ")
    each(preorder + inorder, -3000, 3000, "values"); unique(preorder, "preorder"); need(sorted(preorder) == sorted(inorder), "different values")


@check("binary-tree-maximum-path-sum")
def _(root):
    tree_size(root, 1, 3 * 10**4, -1000, 1000)


@check("serialize-and-deserialize-binary-tree")
def _(root):
    tree_size(root, 0, 10**4, -1000, 1000)


# ---------- Tries ----------

@check("implement-trie-prefix-tree")
def _(names, params):
    for name, p in zip(names[1:], params[1:]):
        length(p[0], 1, 2000, "word/prefix"); chars(p[0], LOWER, "word/prefix")


@check("design-add-and-search-words-data-structure")
def _(names, params):
    for name, p in zip(names[1:], params[1:]):
        length(p[0], 1, 25, "word")
        if name == "addWord":
            chars(p[0], LOWER, "word")
        else:
            chars(p[0], LOWER | {"."}, "word"); need(p[0].count(".") <= 2, "more than 2 dots")


@check("word-search-ii")
def _(board, words):
    matrix(board, 1, 12, 1, 12, "board"); chars("".join("".join(r) for r in board), LOWER, "board")
    length(words, 1, 3 * 10**4, "words"); unique(words, "words")
    for w in words:
        length(w, 1, 10, "words[i]"); chars(w, LOWER, "words[i]")


# ---------- Heap / Priority Queue ----------

@check("kth-largest-element-in-a-stream")
def _(names, params):
    k, nums = params[0]
    length(nums, 0, 10**4, "nums"); rng(k, 1, len(nums) + 1, "k"); each(nums, -10**4, 10**4, "nums")
    for name, p in zip(names[1:], params[1:]):
        rng(p[0], -10**4, 10**4, "val")
    # "It is guaranteed that there will be at least k elements in the array when you search for the kth element."
    need(len(nums) + len(names) - 1 >= k, "fewer than k elements")
    need(len(nums) + 1 >= k, "first add sees fewer than k elements")


@check("last-stone-weight")
def _(stones):
    length(stones, 1, 30, "stones"); each(stones, 1, 1000, "stones")


@check("k-closest-points-to-origin")
def _(points, k):
    length(points, 1, 10**4, "points"); rng(k, 1, len(points), "k")
    for p in points:
        each(p, -10**4, 10**4, "xi/yi")
    d = sorted(x * x + y * y for x, y in points)
    need(k == len(d) or d[k - 1] != d[k], "answer is not unique")


@check("kth-largest-element-in-an-array")
def _(nums, k):
    length(nums, 1, 10**5, "nums"); rng(k, 1, len(nums), "k"); each(nums, -10**4, 10**4, "nums")


@check("task-scheduler")
def _(tasks, n):
    length(tasks, 1, 10**4, "tasks"); chars("".join(tasks), UPPER, "tasks"); rng(n, 0, 100, "n")


@check("design-twitter")
def _(names, params):
    seen = set()
    for name, p in zip(names[1:], params[1:]):
        if name == "postTweet":
            rng(p[0], 1, 500, "userId"); rng(p[1], 0, 10**4, "tweetId")
            need(p[1] not in seen, "duplicate tweetId"); seen.add(p[1])
        elif name == "getNewsFeed":
            rng(p[0], 1, 500, "userId")
        else:
            rng(p[0], 1, 500, "followerId"); rng(p[1], 1, 500, "followeeId")
            need(p[0] != p[1], "user follows/unfollows themselves")


@check("find-median-from-data-stream")
def _(names, params):
    size = 0
    for name, p in zip(names[1:], params[1:]):
        if name == "addNum":
            rng(p[0], -10**5, 10**5, "num"); size += 1
        else:
            need(size > 0, "findMedian on an empty structure")


# ---------- Backtracking ----------

@check("subsets")
def _(nums):
    length(nums, 1, 10, "nums"); each(nums, -10, 10, "nums"); unique(nums, "nums")


@check("combination-sum")
def _(candidates, target):
    length(candidates, 1, 30, "candidates"); each(candidates, 2, 40, "candidates"); unique(candidates, "candidates")
    rng(target, 1, 40, "target")


@check("combination-sum-ii")
def _(candidates, target):
    length(candidates, 1, 100, "candidates"); each(candidates, 1, 50, "candidates"); rng(target, 1, 30, "target")


@check("permutations")
def _(nums):
    length(nums, 1, 6, "nums"); each(nums, -10, 10, "nums"); unique(nums, "nums")


@check("subsets-ii")
def _(nums):
    length(nums, 1, 10, "nums"); each(nums, -10, 10, "nums")


@check("generate-parentheses")
def _(n):
    rng(n, 1, 8, "n")


@check("word-search")
def _(board, word):
    matrix(board, 1, 6, 1, 6, "board"); chars("".join("".join(r) for r in board) + word, LETTERS, "board/word")
    length(word, 1, 15, "word")


@check("palindrome-partitioning")
def _(s):
    length(s, 1, 16, "s"); chars(s, LOWER, "s")


@check("letter-combinations-of-a-phone-number")
def _(digits):
    # LeetCode raised the floor to 1 in 2024; the empty string is no longer a valid input.
    length(digits, 1, 4, "digits"); chars(digits, set("23456789"), "digits")


@check("n-queens")
def _(n):
    rng(n, 1, 9, "n")


# ---------- Graphs ----------

@check("number-of-islands")
def _(grid):
    matrix(grid, 1, 300, 1, 300, "grid"); chars("".join("".join(r) for r in grid), {"0", "1"}, "grid")


@check("max-area-of-island")
def _(grid):
    matrix(grid, 1, 50, 1, 50, "grid"); need(all(v in (0, 1) for r in grid for v in r), "grid not 0/1")


@check("clone-graph")
def _(adj):
    length(adj, 0, 100, "nodes")
    n = len(adj)
    for i, nbrs in enumerate(adj):
        unique(nbrs, "neighbors"); need(i + 1 not in nbrs, "self-loop")
        for j in nbrs:
            rng(j, 1, n, "neighbor"); need(i + 1 in adj[j - 1], "edge not symmetric")
    if n:
        seen, stack = {1}, [1]
        while stack:
            for j in adj[stack.pop() - 1]:
                if j not in seen:
                    seen.add(j); stack.append(j)
        need(len(seen) == n, "graph not connected")


@check("walls-and-gates")
def _(rooms):
    # LeetCode 286: 1 <= m, n <= 250; rooms[i][j] is -1, 0, or 2^31 - 1.
    matrix(rooms, 1, 250, 1, 250, "rooms"); need(all(v in (-1, 0, 2**31 - 1) for r in rooms for v in r), "bad cell")


@check("rotting-oranges")
def _(grid):
    matrix(grid, 1, 10, 1, 10, "grid"); need(all(v in (0, 1, 2) for r in grid for v in r), "bad cell")


@check("pacific-atlantic-water-flow")
def _(heights):
    matrix(heights, 1, 200, 1, 200, "heights"); each([v for r in heights for v in r], 0, 10**5, "heights")


@check("surrounded-regions")
def _(board):
    matrix(board, 1, 200, 1, 200, "board"); chars("".join("".join(r) for r in board), {"X", "O"}, "board")


@check("course-schedule")
def _(numCourses, prerequisites):
    rng(numCourses, 1, 2000, "numCourses"); length(prerequisites, 0, 5000, "prerequisites")
    for p in prerequisites:
        length(p, 2, 2, "pair"); each(p, 0, numCourses - 1, "course")
    unique(prerequisites, "prerequisites")


@check("course-schedule-ii")
def _(numCourses, prerequisites):
    rng(numCourses, 1, 2000, "numCourses"); length(prerequisites, 0, numCourses * (numCourses - 1), "prerequisites")
    for p in prerequisites:
        length(p, 2, 2, "pair"); each(p, 0, numCourses - 1, "course"); need(p[0] != p[1], "ai == bi")
    unique(prerequisites, "prerequisites")


@check("graph-valid-tree")
def _(n, edges):
    # LeetCode 261: 1 <= n <= 2000, 0 <= edges.length <= 5000, 0 <= ai, bi < n, ai != bi,
    # no self-loops or repeated edges.
    rng(n, 1, 2000, "n"); length(edges, 0, 5000, "edges")
    for a, b in edges:
        rng(a, 0, n - 1, "ai"); rng(b, 0, n - 1, "bi"); need(a != b, "self-loop")
    unique([sorted(e) for e in edges], "edges")


@check("number-of-connected-components-in-an-undirected-graph")
def _(n, edges):
    # LeetCode 323: 1 <= n <= 2000, 1 <= edges.length <= 5000, 0 <= ai <= bi < n, ai != bi,
    # no repeated edges.
    rng(n, 1, 2000, "n"); length(edges, 1, 5000, "edges")
    for a, b in edges:
        rng(a, 0, n - 1, "ai"); rng(b, 0, n - 1, "bi"); need(a != b, "self-loop")
    unique([sorted(e) for e in edges], "edges")


@check("redundant-connection")
def _(edges):
    n = len(edges)
    rng(n, 3, 1000, "n")
    for e in edges:
        length(e, 2, 2, "edge"); need(1 <= e[0] < e[1] <= n, f"edge {e} invalid")
    unique(edges, "edges")


@check("word-ladder")
def _(beginWord, endWord, wordList):
    length(beginWord, 1, 10, "beginWord"); need(len(endWord) == len(beginWord), "endWord length")
    length(wordList, 1, 5000, "wordList"); unique(wordList, "wordList"); need(beginWord != endWord, "beginWord == endWord")
    for w in [beginWord, endWord] + wordList:
        need(len(w) == len(beginWord), "word length differs"); chars(w, LOWER, "word")


# ---------- Advanced Graphs ----------

@check("network-delay-time")
def _(times, n, k):
    rng(n, 1, 100, "n"); rng(k, 1, n, "k"); length(times, 1, 6000, "times")
    for t in times:
        length(t, 3, 3, "times[i]"); rng(t[0], 1, n, "ui"); rng(t[1], 1, n, "vi"); need(t[0] != t[1], "ui == vi")
        rng(t[2], 0, 100, "wi")
    unique([t[:2] for t in times], "(ui, vi)")


@check("reconstruct-itinerary")
def _(tickets):
    length(tickets, 1, 300, "tickets")
    for f, t in tickets:
        length(f, 3, 3, "from"); length(t, 3, 3, "to"); chars(f + t, UPPER, "airport"); need(f != t, "from == to")
    need(any(f == "JFK" for f, _ in tickets), "no ticket leaves JFK")


@check("min-cost-to-connect-all-points")
def _(points):
    length(points, 1, 1000, "points"); unique(points, "points")
    for p in points:
        each(p, -10**6, 10**6, "xi/yi")


@check("swim-in-rising-water")
def _(grid):
    n = len(grid)
    matrix(grid, 1, 50, 1, 50, "grid", square=True)
    flat = [v for r in grid for v in r]
    each(flat, 0, n * n - 1, "grid"); unique(flat, "grid")


@check("alien-dictionary")
def _(words):
    # LeetCode 269: 1 <= words.length <= 100, 1 <= words[i].length <= 100, lowercase letters.
    length(words, 1, 100, "words")
    for w in words:
        length(w, 1, 100, "words[i]"); chars(w, LOWER, "words[i]")


@check("cheapest-flights-within-k-stops")
def _(n, flights, src, dst, k):
    rng(n, 2, 100, "n"); length(flights, 0, n * (n - 1) // 2, "flights")
    for f in flights:
        length(f, 3, 3, "flight"); rng(f[0], 0, n - 1, "from"); rng(f[1], 0, n - 1, "to"); need(f[0] != f[1], "from == to")
        rng(f[2], 1, 10**4, "price")
    unique([f[:2] for f in flights], "(from, to)")
    rng(src, 0, n - 1, "src"); rng(dst, 0, n - 1, "dst"); rng(k, 0, n - 1, "k"); need(src != dst, "src == dst")


# ---------- 1-D Dynamic Programming ----------

@check("climbing-stairs")
def _(n):
    rng(n, 1, 45, "n")


@check("min-cost-climbing-stairs")
def _(cost):
    length(cost, 2, 1000, "cost"); each(cost, 0, 999, "cost")


@check("house-robber")
def _(nums):
    length(nums, 1, 100, "nums"); each(nums, 0, 400, "nums")


@check("house-robber-ii")
def _(nums):
    length(nums, 1, 100, "nums"); each(nums, 0, 1000, "nums")


@check("longest-palindromic-substring")
def _(s):
    length(s, 1, 1000, "s"); chars(s, LETTERS | DIGITS, "s")


@check("palindromic-substrings")
def _(s):
    length(s, 1, 1000, "s"); chars(s, LOWER, "s")


@check("decode-ways")
def _(s):
    length(s, 1, 100, "s"); chars(s, DIGITS, "s")


@check("coin-change")
def _(coins, amount):
    length(coins, 1, 12, "coins"); each(coins, 1, 2**31 - 1, "coins"); rng(amount, 0, 10**4, "amount")


@check("maximum-product-subarray")
def _(nums):
    length(nums, 1, 2 * 10**4, "nums"); each(nums, -10, 10, "nums")


@check("word-break")
def _(s, wordDict):
    length(s, 1, 300, "s"); length(wordDict, 1, 1000, "wordDict"); unique(wordDict, "wordDict")
    chars(s, LOWER, "s")
    for w in wordDict:
        length(w, 1, 20, "wordDict[i]"); chars(w, LOWER, "wordDict[i]")


@check("longest-increasing-subsequence")
def _(nums):
    length(nums, 1, 2500, "nums"); each(nums, -10**4, 10**4, "nums")


@check("partition-equal-subset-sum")
def _(nums):
    length(nums, 1, 200, "nums"); each(nums, 1, 100, "nums")


# ---------- 2-D Dynamic Programming ----------

@check("unique-paths")
def _(m, n):
    rng(m, 1, 100, "m"); rng(n, 1, 100, "n")


@check("longest-common-subsequence")
def _(text1, text2):
    length(text1, 1, 1000, "text1"); length(text2, 1, 1000, "text2"); chars(text1 + text2, LOWER, "text")


@check("best-time-to-buy-and-sell-stock-with-cooldown")
def _(prices):
    length(prices, 1, 5000, "prices"); each(prices, 0, 1000, "prices")


@check("coin-change-ii")
def _(amount, coins):
    length(coins, 1, 300, "coins"); each(coins, 1, 5000, "coins"); unique(coins, "coins"); rng(amount, 0, 5000, "amount")


@check("target-sum")
def _(nums, target):
    length(nums, 1, 20, "nums"); each(nums, 0, 1000, "nums"); rng(sum(nums), 0, 1000, "sum(nums)")
    rng(target, -1000, 1000, "target")


@check("interleaving-string")
def _(s1, s2, s3):
    length(s1, 0, 100, "s1"); length(s2, 0, 100, "s2"); length(s3, 0, 200, "s3"); chars(s1 + s2 + s3, LOWER, "s")


@check("longest-increasing-path-in-a-matrix")
def _(matrix_):
    matrix(matrix_, 1, 200, 1, 200, "matrix"); each([v for r in matrix_ for v in r], 0, 2**31 - 1, "matrix")


@check("distinct-subsequences")
def _(s, t):
    length(s, 1, 1000, "s"); length(t, 1, 1000, "t"); chars(s + t, LETTERS, "s/t")


@check("edit-distance")
def _(word1, word2):
    length(word1, 0, 500, "word1"); length(word2, 0, 500, "word2"); chars(word1 + word2, LOWER, "word")


@check("burst-balloons")
def _(nums):
    length(nums, 1, 300, "nums"); each(nums, 0, 100, "nums")


@check("regular-expression-matching")
def _(s, p):
    length(s, 1, 20, "s"); length(p, 1, 20, "p"); chars(s, LOWER, "s"); chars(p, LOWER | {".", "*"}, "p")
    need(all(i > 0 and p[i - 1] != "*" for i, c in enumerate(p) if c == "*"), "'*' without a preceding character")


# ---------- Greedy ----------

@check("maximum-subarray")
def _(nums):
    length(nums, 1, 10**5, "nums"); each(nums, -10**4, 10**4, "nums")


@check("jump-game")
def _(nums):
    length(nums, 1, 10**4, "nums"); each(nums, 0, 10**5, "nums")


@check("jump-game-ii")
def _(nums):
    length(nums, 1, 10**4, "nums"); each(nums, 0, 1000, "nums")
    reach = 0
    for i, v in enumerate(nums):
        need(i <= reach, "last index unreachable"); reach = max(reach, i + v)


@check("gas-station")
def _(gas, cost):
    length(gas, 1, 10**5, "gas"); need(len(cost) == len(gas), "lengths differ")
    each(gas + cost, 0, 10**4, "gas/cost")
    n = len(gas)
    starts = [s for s in range(n) if all(sum(gas[(s + j) % n] - cost[(s + j) % n] for j in range(i + 1)) >= 0 for i in range(n))]
    need(len(starts) <= 1, "answer is not unique")


@check("hand-of-straights")
def _(hand, groupSize):
    length(hand, 1, 10**4, "hand"); each(hand, 0, 10**9, "hand"); rng(groupSize, 1, len(hand), "groupSize")


@check("merge-triplets-to-form-target-triplet")
def _(triplets, target):
    length(triplets, 1, 10**5, "triplets"); length(target, 3, 3, "target"); each(target, 1, 1000, "target")
    for t in triplets:
        length(t, 3, 3, "triplet"); each(t, 1, 1000, "triplet")


@check("partition-labels")
def _(s):
    length(s, 1, 500, "s"); chars(s, LOWER, "s")


@check("valid-parenthesis-string")
def _(s):
    length(s, 1, 100, "s"); chars(s, set("()*"), "s")


# ---------- Intervals ----------

def interval_list(xs, lo, hi, strict=False):
    for iv in xs:
        length(iv, 2, 2, "interval"); rng(iv[0], lo, hi, "start"); rng(iv[1], lo, hi, "end")
        need(iv[0] < iv[1] if strict else iv[0] <= iv[1], f"interval {iv} has start > end")


@check("insert-interval")
def _(intervals, newInterval):
    length(intervals, 0, 10**4, "intervals"); interval_list(intervals, 0, 10**5); interval_list([newInterval], 0, 10**5)
    sorted_nondec([iv[0] for iv in intervals], "intervals")
    # "intervals ... non-overlapping"
    need(all(a[1] < b[0] for a, b in zip(intervals, intervals[1:])), "intervals overlap")


@check("merge-intervals")
def _(intervals):
    length(intervals, 1, 10**4, "intervals"); interval_list(intervals, 0, 10**4)


@check("non-overlapping-intervals")
def _(intervals):
    length(intervals, 1, 10**5, "intervals"); interval_list(intervals, -5 * 10**4, 5 * 10**4, strict=True)


@check("meeting-rooms")
def _(intervals):
    # LeetCode 252: 0 <= intervals.length <= 10^4, 0 <= starti < endi <= 10^6.
    length(intervals, 0, 10**4, "intervals"); interval_list(intervals, 0, 10**6, strict=True)


@check("meeting-rooms-ii")
def _(intervals):
    # LeetCode 253: 1 <= intervals.length <= 10^4, 0 <= starti < endi <= 10^6.
    length(intervals, 1, 10**4, "intervals"); interval_list(intervals, 0, 10**6, strict=True)


@check("minimum-interval-to-include-each-query")
def _(intervals, queries):
    length(intervals, 1, 10**5, "intervals"); length(queries, 1, 10**5, "queries")
    interval_list(intervals, 1, 10**7); each(queries, 1, 10**7, "queries")


# ---------- Math & Geometry ----------

@check("rotate-image")
def _(m):
    matrix(m, 1, 20, 1, 20, "matrix", square=True); each([v for r in m for v in r], -1000, 1000, "matrix")


@check("spiral-matrix")
def _(m):
    matrix(m, 1, 10, 1, 10, "matrix"); each([v for r in m for v in r], -100, 100, "matrix")


@check("set-matrix-zeroes")
def _(m):
    matrix(m, 1, 200, 1, 200, "matrix"); each([v for r in m for v in r], *I32, "matrix")


@check("happy-number")
def _(n):
    rng(n, 1, 2**31 - 1, "n")


@check("plus-one")
def _(digits):
    length(digits, 1, 100, "digits"); each(digits, 0, 9, "digits")
    need(len(digits) == 1 or digits[0] != 0, "leading zero")


@check("powx-n")
def _(x, n):
    need(-100 < x < 100, f"x={x} out of range"); rng(n, *I32, "n"); need(x != 0 or n > 0, "x == 0 with n <= 0")
    need(-10**4 <= x ** n <= 10**4, f"x^n={x ** n} out of range")


@check("multiply-strings")
def _(num1, num2):
    for s in (num1, num2):
        length(s, 1, 200, "num"); chars(s, DIGITS, "num"); need(s == "0" or s[0] != "0", "leading zero")


@check("detect-squares")
def _(names, params):
    for name, p in zip(names[1:], params[1:]):
        length(p[0], 2, 2, "point"); each(p[0], 0, 1000, "x/y")
    need(len(names) - 1 <= 3000, "too many calls")


# ---------- Bit Manipulation ----------

@check("single-number")
def _(nums):
    length(nums, 1, 3 * 10**4, "nums"); each(nums, -3 * 10**4, 3 * 10**4, "nums")
    from collections import Counter
    c = Counter(nums).values()
    need(sorted(c).count(1) == 1 and all(v in (1, 2) for v in c), "not 'every element twice except one'")


@check("number-of-1-bits")
def _(n):
    rng(n, 1, 2**31 - 1, "n")


@check("counting-bits")
def _(n):
    rng(n, 0, 10**5, "n")


@check("reverse-bits")
def _(n):
    rng(n, 0, 2**31 - 2, "n"); need(n % 2 == 0, "n is odd")


@check("missing-number")
def _(nums):
    n = len(nums)
    rng(n, 1, 10**4, "n"); each(nums, 0, n, "nums"); unique(nums, "nums")


@check("sum-of-two-integers")
def _(a, b):
    rng(a, -1000, 1000, "a"); rng(b, -1000, 1000, "b")


@check("reverse-integer")
def _(x):
    rng(x, *I32, "x")


DESIGN = {"min-stack", "time-based-key-value-store", "lru-cache", "implement-trie-prefix-tree",
          "design-add-and-search-words-data-structure", "kth-largest-element-in-a-stream",
          "design-twitter", "find-median-from-data-stream", "detect-squares"}


def main() -> int:
    problems = json.loads((ROOT / "data" / "neetcode150.json").read_text())
    missing = [p["slug"] for p in problems if p["slug"] not in V]
    if missing:
        print("no validator for:", ", ".join(missing))
        return 1
    bad = 0
    for p in problems:
        slug = p["slug"]
        suite = json.loads((ROOT / "data" / "tests" / f"{slug}.json").read_text())
        for i, case in enumerate(suite["cases"]):
            args = case["args"]
            try:
                V[slug](*args)
            except Bad as e:
                bad += 1
                where = "example" if i < suite.get("exampleCount", 0) else "generated"
                print(f"{slug} case {i} ({where}): {e}  args={json.dumps(args)[:120]}")
    print(f"\n{bad} case(s) violate their problem's constraints")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
