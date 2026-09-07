"""Input generators for the in-browser judge (phase D of docs/07-pyodide-judge.md).

Expected outputs come from the oracle, so a suite is only as strong as its INPUTS. Example cases
give two or three per problem, which is enough to accept a wrong solution: `encode-and-decode-
strings` passes a naive `",".join` because neither example contains a comma.

Why these are Python and not a JSON spec: most problems carry preconditions the schema cannot
express — "the array is sorted", "exactly one solution exists", "values are unique", "the tree is a
valid BST". Random data that violates them makes the oracle produce confidently wrong expectations,
which is worse than a thin suite. So a generator may return None to reject a draw, and the harness
retries.

Generation is seeded per slug, so regenerating produces identical files and a diff means an actual
change.

Adding one:

    @generator("some-slug", count=40)
    def gen_some_slug(rng):
        return [arg1, arg2]        # matching metaData's params, or None to redraw
"""
from __future__ import annotations

import random
import string

GENERATORS: dict[str, tuple] = {}
MAX_DRAWS = 400


def generator(slug: str, count: int = 40):
    def register(fn):
        GENERATORS[slug] = (fn, count)
        return fn

    return register


def build(slug: str) -> list | None:
    """Deterministic inputs for one problem, or None if it has no generator."""
    entry = GENERATORS.get(slug)
    if entry is None:
        return None
    fn, count = entry
    rng = random.Random(f"lc-game:{slug}")
    out, draws = [], 0
    while len(out) < count and draws < MAX_DRAWS:
        draws += 1
        args = fn(rng)
        if args is not None:
            out.append(args)
    return out


# ---------- shared shapes ----------

def ints(rng, n, lo=-50, hi=50):
    return [rng.randint(lo, hi) for _ in range(n)]


def distinct_ints(rng, n, lo=-1000, hi=1000):
    if hi - lo + 1 < n:
        return None
    return rng.sample(range(lo, hi + 1), n)


def word(rng, n, alphabet=string.ascii_lowercase):
    return "".join(rng.choice(alphabet) for _ in range(n))


def edge_sizes(rng):
    """Bias towards the boundaries, where solutions actually break."""
    return rng.choice([1, 1, 2, 2, 3, 3, 4, 5, 8, 12, 20, 40])


def tree(rng, n, lo=-20, hi=20):
    """A random binary tree as LeetCode's level-order array with explicit nulls."""
    if n <= 0:
        return []
    out = [rng.randint(lo, hi)]
    slots = 2
    while len([v for v in out if v is not None]) < n and slots > 0:
        if rng.random() < 0.72:
            out.append(rng.randint(lo, hi))
            slots += 1
        else:
            out.append(None)
        slots -= 1
    while out and out[-1] is None:
        out.pop()
    return out


def bst_values(rng, n, lo=-60, hi=60):
    return sorted(rng.sample(range(lo, hi + 1), n)) if hi - lo + 1 >= n else None


def bst(rng, n):
    """A genuinely valid BST, built by balanced insertion so in-order is sorted."""
    vals = bst_values(rng, n)
    if vals is None:
        return None
    nodes: dict[int, int] = {}

    def place(idx, lo, hi):
        if lo > hi:
            return
        mid = (lo + hi) // 2
        nodes[idx] = vals[mid]
        place(2 * idx + 1, lo, mid - 1)
        place(2 * idx + 2, mid + 1, hi)

    place(0, 0, len(vals) - 1)
    if not nodes:
        return []
    out = [nodes.get(i) for i in range(max(nodes) + 1)]
    while out and out[-1] is None:
        out.pop()
    return out


def tree_values(level_order):
    return [v for v in level_order if v is not None]


def linked(rng, n, lo=-30, hi=30):
    return ints(rng, n, lo, hi)


def grid(rng, rows, cols, choices):
    return [[rng.choice(choices) for _ in range(cols)] for _ in range(rows)]


def intervals(rng, n, lo=0, hi=40):
    out = []
    for _ in range(n):
        a = rng.randint(lo, hi)
        out.append([a, a + rng.randint(0, 10)])
    return out


# ---------- Arrays & Hashing ----------

@generator("contains-duplicate")
def _contains_duplicate(rng):
    n = edge_sizes(rng)
    # Half the draws are duplicate-free, so True is not the constant answer.
    if rng.random() < 0.5:
        return [distinct_ints(rng, n)]
    return [ints(rng, n, -8, 8)]


@generator("valid-anagram")
def _valid_anagram(rng):
    n = edge_sizes(rng)
    s = word(rng, n, "abcde")
    roll = rng.random()
    if roll < 0.4:
        t = "".join(rng.sample(s, len(s)))          # a genuine anagram
    elif roll < 0.7:
        t = word(rng, n, "abcde")                   # same length, probably not
    else:
        t = word(rng, max(0, n - 1), "abcde")       # length mismatch
    return [s, t]


@generator("two-sum")
def _two_sum(rng):
    # A narrow value range so duplicates are COMMON. This used to reject any draw with a second
    # valid pair, which is the same thing as rejecting duplicates, so the hardest inputs never
    # appeared. The validator accepts any correct pair, so ambiguity is no longer a problem.
    n = rng.randint(2, 20)
    if rng.random() < 0.35:
        v = rng.randint(-12, 12)                     # force the answer to be a pair of equal values
        nums = ints(rng, n - 2, -12, 12) + [v, v]
        rng.shuffle(nums)
        return [nums, 2 * v]
    nums = ints(rng, n, -12, 12)
    i, j = rng.sample(range(n), 2)
    return [nums, nums[i] + nums[j]]


@generator("group-anagrams")
def _group_anagrams(rng):
    roots = [word(rng, rng.randint(1, 5), "abc") for _ in range(rng.randint(1, 5))]
    out = []
    for root in roots:
        for _ in range(rng.randint(1, 3)):
            out.append("".join(rng.sample(root, len(root))))
    rng.shuffle(out)
    return [out]


@generator("top-k-frequent-elements")
def _top_k_frequent(rng):
    # "It is guaranteed that the answer is unique", so the k-th and (k+1)-th frequencies must
    # differ; anything else is an input the problem promises will not occur. Ties BELOW the cut are
    # allowed, which the old generator forbade by making every frequency distinct.
    nums = ints(rng, rng.randint(1, 20), -6, 6)
    counts = {}
    for n in nums:
        counts[n] = counts.get(n, 0) + 1
    k = rng.randint(1, len(counts))
    ranked = sorted(counts.values(), reverse=True)
    if k < len(ranked) and ranked[k - 1] == ranked[k]:
        return None
    return [nums, k]


@generator("product-of-array-except-self")
def _product_except_self(rng):
    n = rng.randint(2, 15)
    # Zeros are the interesting case and division-based solutions break on two of them.
    return [[rng.choice([0, 0, rng.randint(-9, 9)]) for _ in range(n)]]


@generator("encode-and-decode-strings")
def _encode_decode(rng):
    # The whole problem is delimiters appearing inside the payload, which no example covers.
    alphabet = rng.choice(["ab#", "ab,", "#,:", "ab", "0123456789#"])
    return [[word(rng, rng.randint(0, 6), alphabet) for _ in range(rng.randint(1, 6))]]


@generator("longest-consecutive-sequence")
def _longest_consecutive(rng):
    nums = []
    for _ in range(rng.randint(1, 4)):
        start = rng.randint(-30, 30)
        nums += list(range(start, start + rng.randint(1, 6)))
    nums += ints(rng, rng.randint(0, 4), -30, 30)
    rng.shuffle(nums)
    return [nums]


# ---------- Two Pointers ----------

@generator("valid-palindrome")
def _valid_palindrome(rng):
    core = word(rng, rng.randint(0, 6), "aba c,:")
    s = core + ("" if rng.random() < 0.5 else core[::-1])
    return [s]


@generator("two-sum-ii-input-array-is-sorted")
def _two_sum_ii(rng):
    # Duplicates are the whole point here: a solution that refuses to pair a value with an equal
    # value passed 43/43 while these were being filtered out.
    n = rng.randint(2, 18)
    if rng.random() < 0.35:
        v = rng.randint(-12, 12)                     # force the answer to be a pair of equal values
        nums = sorted(ints(rng, n - 2, -12, 12) + [v, v])
        return [nums, 2 * v]
    nums = sorted(ints(rng, n, -12, 12))
    i, j = sorted(rng.sample(range(n), 2))
    return [nums, nums[i] + nums[j]]


@generator("3sum")
def _three_sum(rng):
    return [ints(rng, rng.randint(0, 14), -8, 8)]


@generator("container-with-most-water")
def _container(rng):
    return [ints(rng, rng.randint(2, 20), 0, 40)]


# ---------- Sliding Window / Stack ----------

@generator("best-time-to-buy-and-sell-stock")
def _best_time(rng):
    return [ints(rng, edge_sizes(rng), 0, 30)]


@generator("longest-substring-without-repeating-characters")
def _longest_substring(rng):
    return [word(rng, rng.randint(0, 20), rng.choice(["ab", "abc", "abcdef"]))]


@generator("longest-repeating-character-replacement")
def _char_replacement(rng):
    s = word(rng, rng.randint(1, 18), rng.choice(["AB", "ABC"]))
    return [s, rng.randint(0, 4)]


@generator("valid-parentheses")
def _valid_parens(rng):
    return [word(rng, rng.randint(0, 10), "()[]{}")]


@generator("valid-parenthesis-string")
def _valid_paren_string(rng):
    return [word(rng, rng.randint(0, 12), "()*")]


@generator("evaluate-reverse-polish-notation")
def _rpn(rng):
    # Build a provably well-formed expression by construction rather than by rejection.
    tokens = [str(rng.randint(-9, 9))]
    depth = 1
    for _ in range(rng.randint(0, 5)):
        if depth >= 2 and rng.random() < 0.5:
            tokens.append(rng.choice(["+", "-", "*", "/"]))
            depth -= 1
        else:
            tokens.append(str(rng.randint(-9, 9)))
            depth += 1
    while depth > 1:
        tokens.append(rng.choice(["+", "-", "*"]))
        depth -= 1
    return [tokens]


# ---------- Binary Search ----------

@generator("binary-search")
def _binary_search(rng):
    n = rng.randint(1, 20)
    nums = distinct_ints(rng, n, -100, 100)
    if nums is None:
        return None
    nums.sort()
    target = rng.choice(nums) if rng.random() < 0.6 else rng.randint(-110, 110)
    return [nums, target]


@generator("koko-eating-bananas")
def _koko(rng):
    piles = ints(rng, rng.randint(1, 8), 1, 40)
    return [piles, rng.randint(len(piles), len(piles) + 12)]


@generator("find-minimum-in-rotated-sorted-array")
def _find_min_rotated(rng):
    n = rng.randint(1, 15)
    nums = distinct_ints(rng, n, -80, 80)
    if nums is None:
        return None
    nums.sort()
    k = rng.randrange(n)
    return [nums[k:] + nums[:k]]


@generator("search-in-rotated-sorted-array")
def _search_rotated(rng):
    n = rng.randint(1, 15)
    nums = distinct_ints(rng, n, -80, 80)
    if nums is None:
        return None
    nums.sort()
    k = rng.randrange(n)
    rotated = nums[k:] + nums[:k]
    target = rng.choice(rotated) if rng.random() < 0.6 else rng.randint(-90, 90)
    return [rotated, target]


# ---------- weak suites flagged by verify-tests.py ----------

@generator("jump-game-ii")
def _jump_game_ii(rng):
    n = rng.randint(1, 12)
    # Every index must be able to reach the end, which the problem guarantees.
    return [[rng.randint(1, max(1, n - i - 1)) if i < n - 1 else 0 for i in range(n)]]


@generator("last-stone-weight")
def _last_stone(rng):
    return [ints(rng, rng.randint(1, 12), 1, 30)]


@generator("climbing-stairs")
def _climbing_stairs(rng):
    return [rng.randint(1, 40)]


@generator("min-cost-climbing-stairs")
def _min_cost_stairs(rng):
    return [ints(rng, rng.randint(2, 15), 0, 40)]


@generator("house-robber")
def _house_robber(rng):
    return [ints(rng, rng.randint(1, 15), 0, 40)]


@generator("maximum-subarray")
def _max_subarray(rng):
    return [ints(rng, rng.randint(1, 18), -20, 20)]


# ---------- Trees ----------
# Note on preconditions: any binary tree is valid input for most of these, but kthSmallest and the
# BST lowest-common-ancestor require a genuinely valid BST, and buildTree requires traversals that
# describe a real tree.

@generator("invert-binary-tree")
def _invert_tree(rng):
    return [tree(rng, rng.randint(0, 12))]


@generator("maximum-depth-of-binary-tree")
def _max_depth(rng):
    return [tree(rng, rng.randint(0, 14))]


@generator("diameter-of-binary-tree")
def _diameter(rng):
    return [tree(rng, rng.randint(1, 14))]


@generator("balanced-binary-tree")
def _balanced(rng):
    # Half balanced-by-construction, half arbitrary, so True is not the constant answer.
    return [bst(rng, rng.randint(1, 12)) if rng.random() < 0.5 else tree(rng, rng.randint(1, 12))]


@generator("same-tree")
def _same_tree(rng):
    a = tree(rng, rng.randint(0, 8))
    return [a, list(a)] if rng.random() < 0.35 else [a, tree(rng, rng.randint(0, 8))]


@generator("subtree-of-another-tree")
def _subtree(rng):
    root = tree(rng, rng.randint(1, 12))
    return [root, tree(rng, rng.randint(1, 4))]


@generator("binary-tree-level-order-traversal")
def _level_order(rng):
    return [tree(rng, rng.randint(0, 14))]


@generator("binary-tree-right-side-view")
def _right_side(rng):
    return [tree(rng, rng.randint(0, 14))]


@generator("count-good-nodes-in-binary-tree")
def _good_nodes(rng):
    return [tree(rng, rng.randint(1, 14))]


@generator("validate-binary-search-tree")
def _validate_bst(rng):
    # A real BST roughly half the time; otherwise an arbitrary tree, which is usually invalid.
    if rng.random() < 0.5:
        t = bst(rng, rng.randint(1, 10))
        return None if t is None else [t]
    return [tree(rng, rng.randint(1, 10))]


@generator("kth-smallest-element-in-a-bst")
def _kth_smallest(rng):
    n = rng.randint(1, 12)
    t = bst(rng, n)
    if not t:
        return None
    return [t, rng.randint(1, len(tree_values(t)))]


@generator("lowest-common-ancestor-of-a-binary-search-tree")
def _lca_bst(rng):
    t = bst(rng, rng.randint(2, 12))
    if not t:
        return None
    vals = tree_values(t)
    p, q = rng.sample(vals, 2)
    return [t, p, q]


@generator("binary-tree-maximum-path-sum")
def _max_path_sum(rng):
    return [tree(rng, rng.randint(1, 12), -15, 15)]


@generator("construct-binary-tree-from-preorder-and-inorder-traversal")
def _build_tree(rng):
    # The two traversals must describe the same real tree with unique values, so a shape is chosen
    # and both are read off it: preorder appends the root before its subtrees, inorder between them.
    n = rng.randint(1, 12)
    vals = rng.sample(range(-40, 41), n)
    pre, ino = [], []

    def walk(items):
        if not items:
            return
        k = rng.randrange(len(items))
        walk_root = items[k]
        pre.append(walk_root)
        walk(items[:k])
        ino.append(walk_root)
        walk(items[k + 1:])

    walk(vals)
    return [pre, ino]


@generator("serialize-and-deserialize-binary-tree")
def _serialize_tree(rng):
    return [tree(rng, rng.randint(0, 14))]


# ---------- Linked List ----------

@generator("reverse-linked-list")
def _reverse_list(rng):
    return [linked(rng, rng.randint(0, 12))]


@generator("merge-two-sorted-lists")
def _merge_two(rng):
    return [sorted(linked(rng, rng.randint(0, 8))), sorted(linked(rng, rng.randint(0, 8)))]


@generator("reorder-list")
def _reorder(rng):
    return [linked(rng, rng.randint(1, 12))]


@generator("remove-nth-node-from-end-of-list")
def _remove_nth(rng):
    n = rng.randint(1, 12)
    return [linked(rng, n), rng.randint(1, n)]


@generator("copy-list-with-random-pointer")
def _copy_random(rng):
    n = rng.randint(0, 8)
    return [[[rng.randint(-30, 30), rng.choice([None] + list(range(n)))] for _ in range(n)]]


@generator("add-two-numbers")
def _add_two(rng):
    def digits(k):
        # Stored least-significant first, so the last digit must not be a leading zero.
        d = [rng.randint(0, 9) for _ in range(k - 1)] + [rng.randint(1, 9)]
        return d if k > 1 else [rng.randint(0, 9)]

    return [digits(rng.randint(1, 7)), digits(rng.randint(1, 7))]


@generator("linked-list-cycle")
def _has_cycle(rng):
    n = rng.randint(0, 10)
    pos = -1 if (n == 0 or rng.random() < 0.5) else rng.randrange(n)
    return [linked(rng, n), pos]


@generator("find-the-duplicate-number")
def _find_duplicate(rng):
    # n+1 values drawn from 1..n with exactly one value repeated, as the problem guarantees.
    n = rng.randint(1, 12)
    dup = rng.randint(1, n)
    nums = list(range(1, n + 1)) + [dup]
    rng.shuffle(nums)
    return [nums]


@generator("merge-k-sorted-lists")
def _merge_k(rng):
    return [[sorted(linked(rng, rng.randint(0, 6))) for _ in range(rng.randint(0, 5))]]


@generator("reverse-nodes-in-k-group")
def _reverse_k(rng):
    n = rng.randint(1, 12)
    return [linked(rng, n), rng.randint(1, n)]


# ---------- Graphs and grids ----------

@generator("number-of-islands")
def _num_islands(rng):
    r, c = rng.randint(1, 6), rng.randint(1, 6)
    return [grid(rng, r, c, ["0", "1", "1"])]


@generator("max-area-of-island")
def _max_area_island(rng):
    r, c = rng.randint(1, 6), rng.randint(1, 6)
    return [grid(rng, r, c, [0, 1, 1])]


@generator("rotting-oranges")
def _rotting(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [grid(rng, r, c, [0, 1, 1, 2])]


@generator("surrounded-regions")
def _surrounded(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [grid(rng, r, c, ["X", "O"])]


@generator("walls-and-gates")
def _walls_gates(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    # 2147483647 is the problem's INF marker for an empty room.
    return [grid(rng, r, c, [-1, 0, 2147483647, 2147483647])]


@generator("pacific-atlantic-water-flow")
def _pacific_atlantic(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [[[rng.randint(0, 6) for _ in range(c)] for _ in range(r)]]


@generator("longest-increasing-path-in-a-matrix")
def _longest_increasing_path(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [[[rng.randint(0, 9) for _ in range(c)] for _ in range(r)]]


@generator("swim-in-rising-water")
def _swim(rng):
    # The grid must be an n x n permutation of 0..n*n-1.
    n = rng.randint(1, 5)
    vals = list(range(n * n))
    rng.shuffle(vals)
    return [[vals[i * n:(i + 1) * n] for i in range(n)]]


@generator("clone-graph")
def _clone_graph(rng):
    # Adjacency list for nodes 1..n; the graph is connected and undirected, as the problem states.
    n = rng.randint(0, 6)
    if n == 0:
        return [[]]
    adj = {i: set() for i in range(1, n + 1)}
    for v in range(2, n + 1):                       # spanning tree keeps it connected
        u = rng.randint(1, v - 1)
        adj[u].add(v)
        adj[v].add(u)
    for _ in range(rng.randint(0, n)):
        u, v = rng.randint(1, n), rng.randint(1, n)
        if u != v:
            adj[u].add(v)
            adj[v].add(u)
    return [[sorted(adj[i]) for i in range(1, n + 1)]]


def _distinct_edges(rng, n, count, directed=False):
    seen, out = set(), []
    for _ in range(count * 3):
        if len(out) >= count:
            break
        u, v = rng.randrange(n), rng.randrange(n)
        if u == v:
            continue
        key = (u, v) if directed else tuple(sorted((u, v)))
        if key in seen:
            continue
        seen.add(key)
        out.append([u, v])
    return out


@generator("course-schedule")
def _course_schedule(rng):
    n = rng.randint(1, 8)
    return [n, _distinct_edges(rng, n, rng.randint(0, n + 2), directed=True)]


@generator("course-schedule-ii")
def _course_schedule_ii(rng):
    # Arbitrary prerequisite graphs, not just chains. The validator checks the returned ordering
    # respects every edge, so the many valid orders of a wide graph are all accepted.
    n = rng.randint(1, 8)
    return [n, _distinct_edges(rng, n, rng.randint(0, n + 3), directed=True)]


@generator("number-of-connected-components-in-an-undirected-graph")
def _connected_components(rng):
    n = rng.randint(1, 8)
    return [n, _distinct_edges(rng, n, rng.randint(0, n))]


@generator("graph-valid-tree")
def _graph_valid_tree(rng):
    n = rng.randint(1, 8)
    if rng.random() < 0.5:                          # a genuine tree
        return [n, [[rng.randint(0, v - 1), v] for v in range(1, n)]]
    return [n, _distinct_edges(rng, n, rng.randint(0, n + 1))]


@generator("redundant-connection")
def _redundant_connection(rng):
    # The input is guaranteed to be a tree plus exactly one extra edge.
    n = rng.randint(3, 8)
    edges = [[rng.randint(1, v - 1), v] for v in range(2, n + 1)]
    present = {tuple(sorted(e)) for e in edges}
    for _ in range(40):
        u, v = rng.randint(1, n), rng.randint(1, n)
        if u != v and tuple(sorted((u, v))) not in present:
            edges.append([u, v])
            rng.shuffle(edges)
            return [edges]
    return None


@generator("network-delay-time")
def _network_delay(rng):
    n = rng.randint(1, 7)
    times = [[u + 1, v + 1, rng.randint(0, 20)] for u, v in _distinct_edges(rng, n, rng.randint(0, n + 3), directed=True)]
    return [times, n, rng.randint(1, n)]


@generator("cheapest-flights-within-k-stops")
def _cheapest_flights(rng):
    n = rng.randint(2, 7)
    flights = [[u, v, rng.randint(1, 50)] for u, v in _distinct_edges(rng, n, rng.randint(1, n + 3), directed=True)]
    src, dst = rng.sample(range(n), 2)
    return [n, flights, src, dst, rng.randint(0, n)]


@generator("min-cost-to-connect-all-points")
def _min_cost_points(rng):
    n = rng.randint(1, 8)
    pts = rng.sample([[x, y] for x in range(-10, 11) for y in range(-10, 11)], n)
    return [pts]


@generator("word-ladder")
def _word_ladder(rng):
    length = rng.randint(2, 4)
    begin = word(rng, length, "abc")
    end = word(rng, length, "abc")
    pool = {word(rng, length, "abc") for _ in range(rng.randint(1, 10))}
    pool.add(end)
    pool.discard(begin)
    return [begin, end, sorted(pool)]


@generator("alien-dictionary")
def _alien_dictionary(rng):
    # Real multi-letter word lists, not just single letters. Words are sorted by a secret alphabet
    # so the input is satisfiable, then sometimes perturbed to contradict itself. The validator
    # accepts any ordering consistent with the words, so partial constraints are fine.
    letters = rng.sample(string.ascii_lowercase[:6], rng.randint(1, 5))
    rank = {c: i for i, c in enumerate(letters)}
    words = [word(rng, rng.randint(1, 3), "".join(letters)) for _ in range(rng.randint(1, 6))]
    words.sort(key=lambda w: [rank[c] for c in w])
    if rng.random() < 0.3 and len(words) > 1:
        i = rng.randrange(len(words) - 1)
        words[i], words[i + 1] = words[i + 1], words[i]
    return [words]


@generator("reconstruct-itinerary")
def _itinerary(rng):
    # Tickets must admit an Eulerian path from JFK, so they are produced by walking one.
    codes = ["JFK"] + [word(rng, 3, "ABC").upper() for _ in range(rng.randint(1, 4))]
    here, tickets = "JFK", []
    for _ in range(rng.randint(1, 6)):
        nxt = rng.choice(codes)
        tickets.append([here, nxt])
        here = nxt
    rng.shuffle(tickets)
    return [tickets]


# ---------- 1-D Dynamic Programming ----------

@generator("house-robber-ii")
def _rob_ii(rng):
    return [ints(rng, rng.randint(1, 14), 0, 40)]


@generator("longest-palindromic-substring")
def _longest_palindrome(rng):
    # Ties are possible and any longest palindrome is correct, so this pairs with the
    # "same-length" comparison rule in tests-curation.json.
    return [word(rng, rng.randint(1, 16), rng.choice(["ab", "abc"]))]


@generator("palindromic-substrings")
def _count_palindromes(rng):
    return [word(rng, rng.randint(1, 16), rng.choice(["ab", "abc"]))]


@generator("decode-ways")
def _decode_ways(rng):
    return ["".join(rng.choice("0123456789") for _ in range(rng.randint(1, 10)))]


@generator("coin-change")
def _coin_change(rng):
    coins = sorted(rng.sample(range(1, 30), rng.randint(1, 5)))
    return [coins, rng.randint(0, 60)]


@generator("maximum-product-subarray")
def _max_product(rng):
    return [ints(rng, rng.randint(1, 12), -6, 6)]


@generator("word-break")
def _word_break(rng):
    words = list({word(rng, rng.randint(1, 3), "abc") for _ in range(rng.randint(1, 6))})
    s = "".join(rng.choice(words) for _ in range(rng.randint(1, 5)))
    if rng.random() < 0.35:
        s += word(rng, 1, "de")                     # usually makes it unsatisfiable
    return [s, words]


@generator("longest-increasing-subsequence")
def _lis(rng):
    return [ints(rng, rng.randint(1, 16), -25, 25)]


@generator("partition-equal-subset-sum")
def _partition_equal(rng):
    return [ints(rng, rng.randint(1, 12), 1, 25)]


# ---------- 2-D Dynamic Programming ----------

@generator("unique-paths")
def _unique_paths(rng):
    return [rng.randint(1, 12), rng.randint(1, 12)]


@generator("longest-common-subsequence")
def _lcs(rng):
    return [word(rng, rng.randint(0, 12), "abc"), word(rng, rng.randint(0, 12), "abc")]


@generator("best-time-to-buy-and-sell-stock-with-cooldown")
def _cooldown(rng):
    return [ints(rng, rng.randint(1, 12), 0, 20)]


@generator("coin-change-ii")
def _coin_change_ii(rng):
    return [rng.randint(0, 40), sorted(rng.sample(range(1, 25), rng.randint(1, 4)))]


@generator("target-sum")
def _target_sum(rng):
    nums = ints(rng, rng.randint(1, 10), 0, 8)
    return [nums, rng.randint(-sum(nums), sum(nums)) if sum(nums) else 0]


@generator("interleaving-string")
def _interleaving(rng):
    s1 = word(rng, rng.randint(0, 6), "ab")
    s2 = word(rng, rng.randint(0, 6), "ab")
    if rng.random() < 0.5:                          # a genuine interleaving
        a, b, out = list(s1), list(s2), []
        while a or b:
            take_a = a and (not b or rng.random() < 0.5)
            out.append(a.pop(0) if take_a else b.pop(0))
        return [s1, s2, "".join(out)]
    return [s1, s2, word(rng, len(s1) + len(s2), "ab")]


@generator("distinct-subsequences")
def _distinct_subseq(rng):
    return [word(rng, rng.randint(0, 12), "ab"), word(rng, rng.randint(0, 4), "ab")]


@generator("edit-distance")
def _edit_distance(rng):
    return [word(rng, rng.randint(0, 10), "abc"), word(rng, rng.randint(0, 10), "abc")]


@generator("burst-balloons", count=25)
def _burst_balloons(rng):
    return [ints(rng, rng.randint(1, 8), 0, 12)]    # the reference is O(n^3)


@generator("regular-expression-matching")
def _regex_match(rng):
    s = word(rng, rng.randint(0, 6), "ab")
    p = ""
    while len(p) < rng.randint(1, 6):
        ch = rng.choice("ab.")
        p += ch
        if rng.random() < 0.35:
            p += "*"                                # only ever after a real character
    return [s, p]


# ---------- Backtracking ----------

@generator("subsets", count=25)
def _subsets(rng):
    return [distinct_ints(rng, rng.randint(0, 8), -20, 20)]


@generator("subsets-ii", count=25)
def _subsets_ii(rng):
    return [ints(rng, rng.randint(0, 7), -3, 3)]


@generator("permutations", count=20)
def _permutations(rng):
    return [distinct_ints(rng, rng.randint(1, 6), -10, 10)]


@generator("combination-sum", count=25)
def _combination_sum(rng):
    return [sorted(rng.sample(range(2, 15), rng.randint(1, 5))), rng.randint(1, 20)]


@generator("combination-sum-ii", count=25)
def _combination_sum_ii(rng):
    return [sorted(ints(rng, rng.randint(1, 8), 1, 9)), rng.randint(1, 20)]


@generator("palindrome-partitioning", count=25)
def _palindrome_partition(rng):
    return [word(rng, rng.randint(1, 9), "ab")]


@generator("letter-combinations-of-a-phone-number")
def _letter_combinations(rng):
    return ["".join(rng.choice("23456789") for _ in range(rng.randint(0, 3)))]


@generator("n-queens", count=8)
def _n_queens(rng):
    return [rng.randint(1, 7)]


@generator("word-search")
def _word_search(rng):
    r, c = rng.randint(1, 4), rng.randint(1, 4)
    return [grid(rng, r, c, ["a", "b", "c"]), word(rng, rng.randint(1, 5), "abc")]


@generator("word-search-ii")
def _word_search_ii(rng):
    r, c = rng.randint(1, 4), rng.randint(1, 4)
    words = sorted({word(rng, rng.randint(1, 4), "abc") for _ in range(rng.randint(1, 5))})
    return [grid(rng, r, c, ["a", "b", "c"]), words]


# ---------- Bit Manipulation ----------

@generator("single-number")
def _single_number(rng):
    # Every value appears twice except one, exactly as the problem guarantees.
    vals = distinct_ints(rng, rng.randint(1, 8), -50, 50)
    if not vals:
        return None
    nums = [v for v in vals[1:] for _ in (0, 1)] + [vals[0]]
    rng.shuffle(nums)
    return [nums]


@generator("missing-number")
def _missing_number(rng):
    # A permutation of 0..n with exactly one value removed.
    n = rng.randint(1, 15)
    nums = list(range(n + 1))
    nums.remove(rng.randint(0, n))
    rng.shuffle(nums)
    return [nums]


@generator("number-of-1-bits")
def _hamming_weight(rng):
    return [rng.choice([0, 1, rng.randint(0, 2**31 - 1), 2**31 - 1, 2**16])]


@generator("counting-bits")
def _counting_bits(rng):
    return [rng.randint(0, 30)]


@generator("reverse-bits")
def _reverse_bits(rng):
    return [rng.choice([0, 1, 2**32 - 1, rng.randint(0, 2**32 - 1)])]


@generator("sum-of-two-integers")
def _get_sum(rng):
    return [rng.randint(-1000, 1000), rng.randint(-1000, 1000)]


@generator("reverse-integer")
def _reverse_integer(rng):
    # Overflow past a signed 32-bit integer must return 0, which small inputs never exercise.
    return [rng.choice([0, rng.randint(-100, 100), rng.randint(-2**31, 2**31 - 1), 1534236469, -2147483648])]


# ---------- Greedy ----------

@generator("jump-game")
def _jump_game(rng):
    return [ints(rng, rng.randint(1, 14), 0, 4)]


@generator("gas-station")
def _gas_station(rng):
    n = rng.randint(1, 10)
    # Several valid starting stations are fine now: the validator checks that the station returned
    # actually completes the circuit, rather than matching whichever one the oracle found.
    return [ints(rng, n, 0, 15), ints(rng, n, 0, 15)]


@generator("hand-of-straights")
def _hand_of_straights(rng):
    n = rng.randint(1, 12)
    return [ints(rng, n, 1, 12), rng.randint(1, max(1, n))]


@generator("merge-triplets-to-form-target-triplet")
def _merge_triplets(rng):
    return [[ints(rng, 3, 1, 8) for _ in range(rng.randint(1, 6))], ints(rng, 3, 1, 8)]


@generator("partition-labels")
def _partition_labels(rng):
    return [word(rng, rng.randint(1, 16), "abcd")]


# ---------- Heap ----------

@generator("k-closest-points-to-origin")
def _k_closest(rng):
    # Tied and repeated points are deliberate now; the validator accepts any k of the closest.
    pts = [[rng.randint(-6, 6), rng.randint(-6, 6)] for _ in range(rng.randint(1, 8))]
    return [pts, rng.randint(1, len(pts))]


@generator("kth-largest-element-in-an-array")
def _kth_largest_array(rng):
    nums = ints(rng, rng.randint(1, 15), -30, 30)
    return [nums, rng.randint(1, len(nums))]


@generator("task-scheduler")
def _task_scheduler(rng):
    return [[rng.choice("ABCD") for _ in range(rng.randint(1, 14))], rng.randint(0, 4)]


# ---------- Intervals ----------

@generator("insert-interval")
def _insert_interval(rng):
    base = sorted(intervals(rng, rng.randint(0, 6)), key=lambda x: x[0])
    merged = []
    for iv in base:                                 # the list must be non-overlapping and sorted
        if merged and iv[0] <= merged[-1][1]:
            continue
        merged.append(iv)
    a = rng.randint(0, 40)
    return [merged, [a, a + rng.randint(0, 10)]]


@generator("merge-intervals")
def _merge_intervals(rng):
    return [intervals(rng, rng.randint(1, 8))]


@generator("non-overlapping-intervals")
def _non_overlapping(rng):
    return [intervals(rng, rng.randint(1, 8))]


@generator("meeting-rooms")
def _meeting_rooms(rng):
    return [intervals(rng, rng.randint(0, 8))]


@generator("meeting-rooms-ii")
def _meeting_rooms_ii(rng):
    return [intervals(rng, rng.randint(0, 8))]


@generator("minimum-interval-to-include-each-query")
def _min_interval(rng):
    return [intervals(rng, rng.randint(1, 7)), ints(rng, rng.randint(1, 7), 0, 45)]


# ---------- Stack / Sliding Window / Binary Search ----------

@generator("generate-parentheses", count=8)
def _generate_parens(rng):
    return [rng.randint(1, 7)]


@generator("daily-temperatures")
def _daily_temps(rng):
    return [ints(rng, rng.randint(1, 15), 30, 100)]


@generator("car-fleet")
def _car_fleet(rng):
    n = rng.randint(1, 9)
    pos = rng.sample(range(0, 60), n)               # positions are distinct
    target = max(pos) + rng.randint(1, 20)
    return [target, pos, [rng.randint(1, 10) for _ in range(n)]]


@generator("largest-rectangle-in-histogram")
def _largest_rectangle(rng):
    return [ints(rng, rng.randint(1, 14), 0, 20)]


@generator("permutation-in-string")
def _permutation_in_string(rng):
    return [word(rng, rng.randint(1, 5), "ab"), word(rng, rng.randint(1, 12), "ab")]


@generator("minimum-window-substring")
def _min_window(rng):
    return [word(rng, rng.randint(1, 14), "abc"), word(rng, rng.randint(1, 4), "abc")]


@generator("sliding-window-maximum")
def _sliding_max(rng):
    nums = ints(rng, rng.randint(1, 15), -20, 20)
    return [nums, rng.randint(1, len(nums))]


@generator("search-a-2d-matrix")
def _search_2d(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    vals = sorted(rng.sample(range(-60, 61), r * c))
    matrix = [vals[i * c:(i + 1) * c] for i in range(r)]
    target = rng.choice(vals) if rng.random() < 0.6 else rng.randint(-70, 70)
    return [matrix, target]


@generator("median-of-two-sorted-arrays")
def _median_two(rng):
    a, b = rng.randint(0, 8), rng.randint(0, 8)
    if a + b == 0:
        return None
    return [sorted(ints(rng, a, -40, 40)), sorted(ints(rng, b, -40, 40))]


@generator("trapping-rain-water")
def _trapping_rain(rng):
    return [ints(rng, rng.randint(0, 15), 0, 10)]


# ---------- Math & Geometry ----------

@generator("rotate-image")
def _rotate_image(rng):
    n = rng.randint(1, 5)
    return [[[rng.randint(-30, 30) for _ in range(n)] for _ in range(n)]]


@generator("spiral-matrix")
def _spiral(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [[[rng.randint(-30, 30) for _ in range(c)] for _ in range(r)]]


@generator("set-matrix-zeroes")
def _set_zeroes(rng):
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    return [[[rng.choice([0, rng.randint(-9, 9)]) for _ in range(c)] for _ in range(r)]]


@generator("happy-number")
def _happy_number(rng):
    return [rng.randint(1, 500)]


@generator("plus-one")
def _plus_one(rng):
    n = rng.randint(1, 8)
    # No leading zeros, and all-nines is the carry case.
    if rng.random() < 0.2:
        return [[9] * n]
    return [[rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(n - 1)]]


@generator("powx-n")
def _pow_x_n(rng):
    # Floating point, so this pairs with the "approx" comparison rule: correct algorithms differ
    # in the last bits. The exponent stays small to keep magnitudes finite.
    return [round(rng.uniform(-2.5, 2.5), 3), rng.randint(-12, 12)]


@generator("multiply-strings")
def _multiply_strings(rng):
    def num(k):
        return "0" if k == 0 else str(rng.randint(1, 9)) + "".join(rng.choice("0123456789") for _ in range(k))

    return [num(rng.randint(0, 6)), num(rng.randint(0, 6))]


@generator("valid-sudoku")
def _valid_sudoku(rng):
    board = [["." for _ in range(9)] for _ in range(9)]
    for _ in range(rng.randint(1, 20)):
        board[rng.randrange(9)][rng.randrange(9)] = str(rng.randint(1, 9))
    return [board]


# ---------- Design problems ----------
# Operation sequences need state tracking, not random draws: popping an empty MinStack or asking a
# MedianFinder for a median before any number is added is undefined, and TimeMap requires strictly
# increasing set timestamps.

def _design(classname, ctor_args, steps):
    ops = [classname] + [name for name, _ in steps]
    args = [ctor_args] + [a for _, a in steps]
    return [ops, args]


@generator("lru-cache")
def _lru_cache_gen(rng):
    steps = []
    for _ in range(rng.randint(4, 16)):
        if rng.random() < 0.55:
            steps.append(("put", [rng.randint(1, 6), rng.randint(1, 20)]))
        else:
            steps.append(("get", [rng.randint(1, 6)]))
    return _design("LRUCache", [rng.randint(1, 4)], steps)


@generator("min-stack")
def _min_stack_gen(rng):
    steps, size = [], 0
    for _ in range(rng.randint(4, 18)):
        roll = rng.random()
        if size == 0 or roll < 0.45:               # top/pop/getMin need a non-empty stack
            steps.append(("push", [rng.randint(-20, 20)]))
            size += 1
        elif roll < 0.6:
            steps.append(("pop", []))
            size -= 1
        elif roll < 0.8:
            steps.append(("top", []))
        else:
            steps.append(("getMin", []))
    return _design("MinStack", [], steps)


@generator("implement-trie-prefix-tree")
def _trie_gen(rng):
    pool = [word(rng, rng.randint(1, 4), "ab") for _ in range(rng.randint(1, 5))]
    steps = []
    for _ in range(rng.randint(4, 16)):
        roll = rng.random()
        target = rng.choice(pool)
        if roll < 0.4:
            steps.append(("insert", [target]))
        elif roll < 0.7:
            # Strict prefixes are the case that separates search from startsWith.
            steps.append(("search", [target[: rng.randint(1, len(target))]]))
        else:
            steps.append(("startsWith", [target[: rng.randint(1, len(target))]]))
    return _design("Trie", [], steps)


@generator("design-add-and-search-words-data-structure")
def _word_dictionary_gen(rng):
    pool = [word(rng, rng.randint(1, 4), "ab") for _ in range(rng.randint(1, 5))]
    steps = []
    for _ in range(rng.randint(4, 16)):
        if rng.random() < 0.4:
            steps.append(("addWord", [rng.choice(pool)]))
        else:
            pattern = "".join(rng.choice([c, "."]) for c in rng.choice(pool))
            steps.append(("search", [pattern]))
    return _design("WordDictionary", [], steps)


@generator("kth-largest-element-in-a-stream")
def _kth_largest_stream_gen(rng):
    k = rng.randint(1, 4)
    # The stream must already hold at least k-1 values so the first add can answer.
    nums = ints(rng, rng.randint(max(0, k - 1), k + 4), -20, 20)
    steps = [("add", [rng.randint(-20, 20)]) for _ in range(rng.randint(3, 10))]
    return _design("KthLargest", [k, nums], steps)


@generator("time-based-key-value-store")
def _time_map_gen(rng):
    keys = [word(rng, 2, "ab") for _ in range(rng.randint(1, 3))]
    steps, clock = [], 0
    for _ in range(rng.randint(4, 16)):
        if rng.random() < 0.5:
            clock += rng.randint(1, 3)             # set timestamps are strictly increasing
            steps.append(("set", [rng.choice(keys), word(rng, 3, "xyz"), clock]))
        else:
            steps.append(("get", [rng.choice(keys), rng.randint(0, clock + 3)]))
    return _design("TimeMap", [], steps)


@generator("find-median-from-data-stream")
def _median_finder_gen(rng):
    steps, added = [], 0
    for _ in range(rng.randint(4, 16)):
        if added == 0 or rng.random() < 0.6:       # a median needs at least one number
            steps.append(("addNum", [rng.randint(-20, 20)]))
            added += 1
        else:
            steps.append(("findMedian", []))
    if added == 0:
        return None
    return _design("MedianFinder", [], steps)


@generator("detect-squares")
def _detect_squares_gen(rng):
    steps = []
    for _ in range(rng.randint(4, 16)):
        point = [rng.randint(0, 6), rng.randint(0, 6)]
        steps.append(("add", [point]) if rng.random() < 0.6 else ("count", [point]))
    return _design("DetectSquares", [], steps)


@generator("design-twitter")
def _twitter_gen(rng):
    steps, tweet_id = [], 0
    for _ in range(rng.randint(4, 16)):
        roll = rng.random()
        if roll < 0.4:
            tweet_id += 1                          # distinct, increasing ids keep the feed order well defined
            steps.append(("postTweet", [rng.randint(1, 4), tweet_id]))
        elif roll < 0.7:
            steps.append(("getNewsFeed", [rng.randint(1, 4)]))
        else:
            a, b = rng.sample(range(1, 5), 2)      # never follow yourself
            steps.append((rng.choice(["follow", "unfollow"]), [a, b]))
    return _design("Twitter", [], steps)
