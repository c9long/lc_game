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


def _to_nodes(level_order):
    """Level-order-with-nulls -> a nested {v, l, r} tree, so a shape can be perturbed."""
    if not level_order:
        return None
    nodes = [None if v is None else {"v": v, "l": None, "r": None} for v in level_order]
    kids = iter(nodes[1:])
    for n in nodes:
        if n is None:
            continue
        n["l"] = next(kids, None)
        n["r"] = next(kids, None)
    return nodes[0]


def _to_level_order(root):
    """Back to LeetCode's level-order array, trailing nulls trimmed."""
    if root is None:
        return []
    out, queue = [], [root]
    while queue:
        n = queue.pop(0)
        if n is None:
            out.append(None)
            continue
        out.append(n["v"])
        queue.append(n["l"])
        queue.append(n["r"])
    while out and out[-1] is None:
        out.pop()
    return out


def _balanced_from_sorted(vals):
    """A BST shape over an already sorted list, duplicates included."""
    def place(lo, hi):
        if lo > hi:
            return None
        mid = (lo + hi) // 2
        return {"v": vals[mid], "l": place(lo, mid - 1), "r": place(mid + 1, hi)}
    return place(0, len(vals) - 1)


def _deep_offset_subtree(rng, n):
    """A tree whose longest path lies INSIDE a subtree, not through the root.

    The diameter of a random tree almost always runs through the root, so a solution measuring
    only height(left) + height(right) at the root scored 40/42. Hanging a bushy subtree off a
    one-sided root puts the longest path somewhere the root cannot see.
    """
    inner = tree(rng, max(2, n - 1))
    if not inner:
        return None
    root = {"v": rng.randint(-20, 20), "l": None, "r": None}
    root["l" if rng.random() < 0.5 else "r"] = _to_nodes(inner)
    return _to_level_order(root)


def linked(rng, n, lo=-30, hi=30):
    return ints(rng, n, lo, hi)


def grid(rng, rows, cols, choices):
    return [[rng.choice(choices) for _ in range(cols)] for _ in range(rows)]


def _balanced_brackets(rng, pairs):
    """A properly nested bracket string, built so balanced inputs are common rather than lucky."""
    out = ""
    for _ in range(pairs):
        o, c = rng.choice([("(", ")"), ("[", "]"), ("{", "}")])
        if out and rng.random() < 0.5:               # nest inside what we have
            i = rng.randrange(len(out) + 1)
            out = out[:i] + o + c + out[i:]
        else:
            out = out + o + c
    return out


def intervals(rng, n, lo=0, hi=40):
    out = []
    for _ in range(n):
        a = rng.randint(lo, hi)
        out.append([a, a + rng.randint(0, 10)])
    return out


# ---------- Arrays & Hashing ----------

@generator("contains-duplicate")
def _contains_duplicate(rng):
    n = max(2, edge_sizes(rng))
    if rng.random() < 0.10:
        return [[rng.randint(-50, 50)]]             # the shortest the constraints allow
    if rng.random() < 0.5:
        return [distinct_ints(rng, n)]              # answer False
    # The duplicate is planted at two random positions rather than left to chance, so it is usually
    # far apart: a solution that only compares neighbours has to actually fail.
    nums = distinct_ints(rng, max(n, 4), -50, 50)
    if nums is None:
        return None
    # Separate the pair explicitly. Sampling two indices left them adjacent on short arrays, which
    # is the one arrangement a neighbours-only check survives.
    i = rng.randrange(len(nums) - 2)
    j = rng.randrange(i + 2, len(nums))
    nums[j] = nums[i]
    return [nums]


@generator("valid-anagram")
def _valid_anagram(rng):
    if rng.random() < 0.08:
        a, b = word(rng, 1, "ab"), word(rng, 1, "ab")
        return [a, b]                               # single characters, the shortest allowed
    n = max(2, edge_sizes(rng))
    s = word(rng, n, "abc")
    roll = rng.random()
    if roll < 0.35:
        t = "".join(rng.sample(s, len(s)))          # a genuine anagram
    elif roll < 0.65:
        # Same letters, different counts — "aab" vs "abb". A solution comparing set() instead of
        # counts calls these equal, and it was the case the suite almost never contained.
        letters = sorted(set(s))
        if len(letters) < 2:
            return None
        a, b = rng.sample(letters, 2)
        idx = s.index(a)
        t = s[:idx] + b + s[idx + 1 :]
        if set(t) != set(s) or sorted(t) == sorted(s):
            return None
    elif roll < 0.85:
        t = word(rng, n, "abc")                     # same length, probably not
    else:
        t = word(rng, max(0, n - 1), "abc")         # length mismatch
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
    # The empty string is LeetCode's own example 2 — [""] -> [[""]] — and the generator produced
    # none, because word lengths started at 1. It is its own anagram group.
    if rng.random() < 0.08:
        return [[""] * rng.randint(1, 3)]
    roots = [word(rng, rng.randint(0, 5), "abc") for _ in range(rng.randint(1, 5))]
    out = []
    for root in roots:
        for _ in range(rng.randint(1, 3)):
            out.append("".join(rng.sample(root, len(root))) if root else "")
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
    # The three zero regimes behave completely differently, and picking each element independently
    # buried the interesting two: 29 of 42 cases had three or more zeros, only 2 had none and 2 had
    # exactly one. They are now drawn in roughly equal thirds.
    n = rng.randint(2, 15)
    nonzero = lambda: rng.choice([v for v in range(-9, 10) if v != 0])
    nums = [nonzero() for _ in range(n)]
    roll = rng.random()
    if roll < 0.33:
        return [nums]                               # no zeros: division-based solutions survive
    if roll < 0.66:
        nums[rng.randrange(n)] = 0                  # exactly one zero: one non-zero output
        return [nums]
    for i in rng.sample(range(n), min(n, rng.randint(2, 3))):
        nums[i] = 0                                 # two or more zeros: every output is zero
    return [nums]


@generator("encode-and-decode-strings")
def _encode_decode(rng):
    # Two traps. Delimiters inside the payload, which no example covers; and strings of length >= 10,
    # without which a length-prefixed decoder that reads a SINGLE digit passes everything.
    alphabet = rng.choice(["ab#", "ab,", "#,:", "ab", "0123456789#"])
    lengths = lambda: rng.choice([0, 1, 2, 3, 6, 11, 14, 23])
    return [[word(rng, lengths(), alphabet) for _ in range(rng.randint(1, 6))]]


@generator("longest-consecutive-sequence")
def _longest_consecutive(rng):
    if rng.random() < 0.08:
        return [[]]                                 # the constraints allow an empty array
    if rng.random() < 0.08:
        return [[rng.randint(-10 ** 9, 10 ** 9)]]   # one element, at the far end of the value range
    nums = []
    for _ in range(rng.randint(1, 4)):
        start = rng.randint(-30, 30)
        run = list(range(start, start + rng.randint(1, 6)))
        # Repeat a value inside the run: a counter that does not de-duplicate treats the repeat as
        # extending the sequence and overcounts.
        if run and rng.random() < 0.5:
            run.append(rng.choice(run))
        nums += run
    nums += ints(rng, rng.randint(0, 4), -30, 30)
    rng.shuffle(nums)
    return [nums]


# ---------- Two Pointers ----------

@generator("valid-palindrome")
def _valid_palindrome(rng):
    # The old alphabet was "aba c,:" — no digits and no capitals — so the two solutions this problem
    # exists to catch both passed: one that filters with isalpha() and silently drops digits, and one
    # that never lowercases. Each trap is now built deliberately.
    letters = "abcAB"
    roll = rng.random()

    if roll < 0.10:
        return [rng.choice(["", " ", ".,", "  ,  ", "!!!", "_"])]   # filters to empty -> True

    core = word(rng, rng.randint(1, 4), letters)
    palindrome = core + core[::-1]

    if roll < 0.30:
        # DIGIT TRAP, the "0P" case: alphanumeric-only filtering keeps the digit and the answer is
        # False, but dropping digits leaves a palindrome and the answer flips to True.
        return [rng.choice("0123456789") + palindrome]

    if roll < 0.50:
        # CASE TRAP: a palindrome only once lowercased, so skipping .lower() flips it to False.
        return ["".join(ch.upper() if i % 2 else ch.lower() for i, ch in enumerate(palindrome))]

    if roll < 0.75:
        # A genuine palindrome with punctuation, digits and mixed case sprinkled through.
        body = word(rng, rng.randint(1, 3), letters + "019")
        mirrored = body + (rng.choice(letters + "019") if rng.random() < 0.5 else "") + body[::-1]
        out = []
        for ch in mirrored:
            out.append(ch.upper() if rng.random() < 0.5 else ch.lower())
            if rng.random() < 0.3:
                out.append(rng.choice(" ,:!-"))
        return ["".join(out)]

    return [word(rng, rng.randint(1, 10), letters + "019 ,:")]      # usually not a palindrome


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
    # Random arrays gave only 1 case in 43 with three or more zeros, and 26 of 43 had an empty
    # answer, so returning [] scored 26/43. Triplets are now planted so most cases have a real
    # answer, with repeats so that failing to de-duplicate shows up.
    roll = rng.random()
    if roll < 0.08:
        return [[0] * rng.randint(3, 6)]                     # exactly one triplet: [0, 0, 0]
    if roll < 0.14:
        return [ints(rng, rng.randint(0, 2), -8, 8)]         # n < 3 -> []
    if roll < 0.22:
        sign = rng.choice([1, -1])
        return [[sign * rng.randint(1, 9) for _ in range(rng.randint(3, 8))]]   # all one sign -> []

    nums = []
    for _ in range(rng.randint(1, 3)):
        a, b = rng.randint(-8, 8), rng.randint(-8, 8)
        nums += [a, b, -(a + b)]                             # a guaranteed triplet
    nums += ints(rng, rng.randint(0, 5), -8, 8)
    if rng.random() < 0.5 and nums:
        nums += nums[: rng.randint(1, 3)]                    # repeats, so de-duplication matters
    rng.shuffle(nums)
    return [nums]


@generator("container-with-most-water")
def _container(rng):
    n = rng.randint(2, 20)
    roll = rng.random()
    if roll < 0.12:
        return [sorted(ints(rng, n, 0, 40))]                 # monotonic increasing
    if roll < 0.24:
        return [sorted(ints(rng, n, 0, 40), reverse=True)]   # monotonic decreasing
    if roll < 0.32:
        return [[rng.randint(1, 40)] * n]                    # all equal: widest pair wins
    if roll < 0.42:
        return [ints(rng, 2, 0, 40)]                         # the minimum size
    return [ints(rng, n, 0, 40)]


# ---------- Sliding Window / Stack ----------

@generator("best-time-to-buy-and-sell-stock")
def _best_time(rng):
    n = edge_sizes(rng)
    # A flat run is the case where a strictly-increasing check and a >= check disagree, and
    # prices repeat far more often in a narrow band than in [0, 30].
    hi = rng.choice([30, 30, 3, 1])
    return [ints(rng, n, 0, hi)]


@generator("longest-substring-without-repeating-characters")
def _longest_substring(rng):
    # LeetCode's alphabet is "English letters, digits, symbols and spaces" -- not lowercase only.
    # With a lowercase-only suite, a solution that lowercases the input scored 43/43, and so did
    # one that stripped everything non-alphanumeric. Both are wrong: 'aA' has no repeat, and a
    # space is a character like any other.
    alphabet = rng.choice(["ab", "abc", "abcdef", "aA", "aAbB", "ab12", "a b", "a!b?", "aA1! ", "  a"])
    return [word(rng, rng.randint(0, 20), alphabet)]


@generator("longest-repeating-character-replacement")
def _char_replacement(rng):
    s = word(rng, rng.randint(1, 18), rng.choice(["AB", "ABC"]))
    return [s, rng.randint(0, 4)]


@generator("valid-parentheses")
def _valid_parens(rng):
    # The constraint is 1 <= s.length, so an empty string is not a legal input; three of the
    # generated cases used to be empty. Purely random strings are also almost never balanced --
    # only 6 of 45 cases had answer true -- which lets "return False" score most of the suite and
    # leaves the interesting failures (right counts, wrong nesting, like "([)]") to chance.
    roll = rng.random()
    if roll < 0.55:
        s = _balanced_brackets(rng, rng.randint(1, 5))
        if not s:
            return None
        kind = rng.random()
        if kind < 0.3:                               # swap two brackets: counts stay right, the
            i, j = rng.sample(range(len(s)), 2)      # nesting does not, as in "([)]"
            chars = list(s)
            chars[i], chars[j] = chars[j], chars[i]
            s = "".join(chars)
        elif kind < 0.55:                            # substitute one, breaking the match
            i = rng.randrange(len(s))
            s = s[:i] + rng.choice("()[]{}") + s[i + 1:]
        elif kind < 0.7:                             # truncate, leaving an opener unclosed
            s = s[:rng.randrange(1, len(s) + 1)]
        return [s]
    return [word(rng, rng.randint(1, 10), "()[]{}")]


@generator("valid-parenthesis-string")
def _valid_paren_string(rng):
    return [word(rng, rng.randint(0, 12), "()*")]


@generator("evaluate-reverse-polish-notation")
def _rpn(rng):
    """A well-formed expression, built and evaluated together.

    Evaluating as we build is what makes two guarantees possible. First, "there will not be any
    division by zero": the old version drew operands from -9..9 and emitted / blindly, so a zero
    divisor was pure luck. Second, and the point of the rewrite: division truncates toward ZERO,
    so -7 / 2 is -3, while Python's // gives -4. Only a division with a negative quotient AND a
    non-zero remainder tells the two apart, and there were 8 divisions in 43 cases, none of them
    of that shape -- the floor-division bug was caught by LeetCode's own example and nothing else.
    So when a division is placed, prefer operands that disagree.
    """
    def apply(op, a, b):
        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        return int(a / b)                            # truncates toward zero, as the problem says

    def reduce_once():
        op = rng.choice(["+", "-", "*", "/"])
        if op == "/" and vals[-1] == 0:              # "there will not be any division by zero"
            op = rng.choice(["+", "-", "*"])
        tokens.append(op)
        vals[-2:] = [apply(op, vals[-2], vals[-1])]

    tokens = [str(rng.randint(-9, 9))]
    vals = [int(tokens[0])]
    for _ in range(rng.randint(0, 6)):
        roll = rng.random()
        # Append a divisor chosen so that floor and truncation disagree, then divide by it. This
        # appends rather than rewriting: an earlier version replaced tokens[-1], which silently
        # overwrote an operator and left two expressions malformed. The reference returns
        # stack[0], so a leftover stack does not raise -- it quietly answers the first token, and
        # a genuinely correct solution reading stack[-1] was failed by those cases.
        if roll < 0.3 and vals[-1] != 0:
            a = vals[-1]
            choices = [b for b in range(-9, 10) if b != 0 and (a < 0) != (b < 0) and a % b != 0]
            if choices:
                b = rng.choice(choices)
                tokens.append(str(b))
                tokens.append("/")
                vals[-1] = apply("/", a, b)
                continue
        if len(vals) >= 2 and roll < 0.65:
            reduce_once()
        else:
            n = rng.randint(-9, 9)
            tokens.append(str(n))
            vals.append(n)
    while len(vals) > 1:
        reduce_once()
    return [tokens]


# ---------- Binary Search ----------

@generator("binary-search")
def _binary_search(rng):
    # A one-element array is the shortest legal input and the one a `while l < r` loop with
    # `r = mid - 1` never examines; there were two cases in 42.
    n = rng.choice([1, 1, 2, 2, 3, 4, 6, 9, 13, 20])
    nums = distinct_ints(rng, n, -100, 100)
    if nums is None:
        return None
    nums.sort()
    target = rng.choice(nums) if rng.random() < 0.6 else rng.randint(-110, 110)
    return [nums, target]


@generator("koko-eating-bananas")
def _koko(rng):
    piles = ints(rng, rng.randint(1, 8), 1, 40)
    # h == len(piles) is the tightest legal budget, where the answer is exactly max(piles); a very
    # large h is the other end, where the answer is 1. Three and one case covered those.
    roll = rng.random()
    if roll < 0.2:
        h = len(piles)
    elif roll < 0.35:
        h = sum(piles) + rng.randint(0, 20)
    else:
        h = rng.randint(len(piles), len(piles) + 12)
    return [piles, h]


@generator("find-minimum-in-rotated-sorted-array")
def _find_min_rotated(rng):
    # "Rotated between 1 and n times" includes n times, which is the identity, so an already
    # sorted array is a legal input -- it is LeetCode's own example 3. It is also the only shape
    # that catches comparing against nums[0] rather than nums[right]. Short arrays matter for the
    # same reason: with n <= 2 the midpoint coincides with an endpoint.
    n = rng.choice([1, 1, 2, 2, 3, 3, 5, 7, 10, 15])
    nums = distinct_ints(rng, n, -80, 80)
    if nums is None:
        return None
    nums.sort()
    k = 0 if rng.random() < 0.3 else rng.randrange(n)
    return [nums[k:] + nums[:k]]


@generator("search-in-rotated-sorted-array")
def _search_rotated(rng):
    # A two-element array is where `nums[lo] < nums[mid]` and `nums[lo] <= nums[mid]` diverge:
    # mid == lo, so the strict form takes the wrong branch. One case in 43 was length 2, and the
    # bug scored 42/43 on the strength of it. Unrotated arrays matter too -- "possibly rotated".
    # The one shape that separates `nums[l] < nums[m]` from `nums[l] <= nums[m]`: on a
    # two-element window mid == lo, so the strict form falls into the "right half is sorted"
    # branch and discards the target when it is the smaller, rotated-round element. Left to
    # chance this appeared once in 43 cases, and raising the odds only moved it somewhere else,
    # so it is constructed outright.
    if rng.random() < 0.12:
        lo_v, hi_v = sorted(rng.sample(range(-80, 81), 2))
        return [[hi_v, lo_v], lo_v]
    n = rng.choice([1, 2, 2, 3, 3, 4, 6, 9, 12, 15])
    nums = distinct_ints(rng, n, -80, 80)
    if nums is None:
        return None
    nums.sort()
    k = 0 if rng.random() < 0.25 else rng.randrange(n)
    rotated = nums[k:] + nums[:k]
    target = rng.choice(rotated) if rng.random() < 0.65 else rng.randint(-90, 90)
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
    # The answer is in EDGES, and the case that matters is a diameter that does not pass through
    # the root -- there were two in 42, so measuring only at the root scored 40/42.
    if rng.random() < 0.4:
        t = _deep_offset_subtree(rng, rng.randint(6, 14))
        if t:
            return [t]
    return [tree(rng, rng.randint(1, 14))]


@generator("balanced-binary-tree")
def _balanced(rng):
    # Half balanced-by-construction, half arbitrary, so True is not the constant answer.
    return [bst(rng, rng.randint(1, 12)) if rng.random() < 0.5 else tree(rng, rng.randint(1, 12))]


@generator("same-tree")
def _same_tree(rng):
    # Comparing preorder VALUES without null markers reads [1,2] and [1,null,2] as the same tree:
    # identical value sequences, mirrored shapes. Perturbing the structure while keeping the
    # values produces that case on purpose.
    a = tree(rng, rng.randint(0, 8))
    roll = rng.random()
    if roll < 0.3:
        return [a, list(a)]
    if roll < 0.55 and a:
        root = _to_nodes(list(a))
        nodes = []

        def collect(n):
            if n is None:
                return
            nodes.append(n)
            collect(n["l"])
            collect(n["r"])

        collect(root)
        single = [n for n in nodes if (n["l"] is None) != (n["r"] is None)]
        if single:
            n = rng.choice(single)
            n["l"], n["r"] = n["r"], n["l"]            # same values, mirrored at one node
            return [a, _to_level_order(root)]
    return [a, tree(rng, rng.randint(0, 8))]


@generator("subtree-of-another-tree")
def _subtree(rng):
    """root plus a subRoot that is often a REAL subtree of it, or a near-miss of one.

    A randomly drawn subRoot is essentially never a subtree, so exactly one case in 42 answered
    true and `return False` scored 41/42. Lifting a genuine subtree out of root fixes that; taking
    a genuine subtree and then DROPPING its descendants produces the other trap, where a match
    that stops when subRoot runs out reports a subtree that is really only a prefix.
    """
    root = tree(rng, rng.randint(1, 12))
    if not root:
        return None
    roll = rng.random()
    if roll < 0.55:
        nodes = []

        def collect(n):
            if n is None:
                return
            nodes.append(n)
            collect(n["l"])
            collect(n["r"])

        collect(_to_nodes(root))
        if not nodes:
            return None
        picked = rng.choice(nodes)
        if roll < 0.35:
            return [root, _to_level_order(picked)]         # a genuine subtree: true
        trimmed = {"v": picked["v"], "l": None, "r": None}  # the same node, descendants cut
        if picked["l"] or picked["r"]:
            return [root, _to_level_order(trimmed)]        # a prefix, not a subtree: false
        return [root, _to_level_order(picked)]
    return [root, tree(rng, rng.randint(1, 4))]


@generator("binary-tree-level-order-traversal")
def _level_order(rng):
    return [tree(rng, rng.randint(0, 14))]


@generator("binary-tree-right-side-view")
def _right_side(rng):
    return [tree(rng, rng.randint(0, 14))]


@generator("count-good-nodes-in-binary-tree")
def _good_nodes(rng):
    # Node values may be negative, so seeding the running maximum with 0 rather than the root is a
    # real bug -- but only an all-negative tree shows it, and there were three in 43.
    lo, hi = rng.choice([(-20, 20), (-20, 20), (-20, -1), (-10000, -1)])
    return [tree(rng, rng.randint(1, 14), lo, hi)]


@generator("validate-binary-search-tree")
def _validate_bst(rng):
    """Valid BSTs, arbitrary trees, and the two shapes that are only SUBTLY wrong.

    A tree that is either a real BST or a random jumble does not test this problem: both the
    classic bugs scored 42/42. The two that matter:

      ancestor bound  every parent/child pair is ordered correctly, but a node sits on the wrong
                      side of a grandparent -- LeetCode's [2,null,3,1]. A check that only compares
                      a node with its direct children cannot see it.
      duplicate       the BST property is STRICT, so equal values are invalid. An in-order scan
                      written with <= instead of < accepts them.
    """
    roll = rng.random()
    if roll < 0.3:
        t = bst(rng, rng.randint(1, 10))
        return None if t is None else [t]
    if roll < 0.55:
        # Strictly-invalid duplicate: build over a sorted list with one value repeated, so the
        # in-order sequence is non-decreasing but not increasing.
        n = rng.randint(2, 9)
        vals = bst_values(rng, n)
        if vals is None:
            return None
        i = rng.randrange(len(vals))
        vals = sorted(vals + [vals[i]])
        return [_to_level_order(_balanced_from_sorted(vals))]
    if roll < 0.8:
        t = bst(rng, rng.randint(3, 10))
        if not t:
            return None
        root = _to_nodes(t)
        # Find a node that lies in some ancestor's subtree on a known side and has a child there;
        # move that child across the ancestor's bound while leaving its parent ordering intact.
        spots = []

        def walk(n, ancestors):
            if n is None:
                return
            for anc, side in ancestors:
                if side == "r" and n["l"] is not None and anc["v"] < n["v"]:
                    spots.append((n["l"], anc["v"] - 1, n["v"]))
                if side == "l" and n["r"] is not None and anc["v"] > n["v"]:
                    spots.append((n["r"], anc["v"] + 1, n["v"]))
            walk(n["l"], ancestors + [(n, "l")])
            walk(n["r"], ancestors + [(n, "r")])

        walk(root, [])
        usable = [(node, v) for node, v, parent in spots
                  if (v < parent if node is not None else False)] or \
                 [(node, v) for node, v, parent in spots if (v > parent if node is not None else False)]
        if not usable:
            return None
        node, newval = rng.choice(usable)
        node["v"] = newval
        return [_to_level_order(root)]
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
    # The path must be non-empty, so an all-negative tree answers with its largest single node --
    # which is what catches a best-so-far initialised to 0. Two cases in 42 were all-negative.
    lo, hi = rng.choice([(-15, 15), (-15, 15), (-15, -1), (-1000, -1)])
    return [tree(rng, rng.randint(1, 12), lo, hi)]


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
    # A single node is a fixed point, and the shortest legal input: it is where a split that
    # assumes at least two nodes crashes. There were none.
    return [linked(rng, rng.choice([1, 1, 2, 2, 3, 4, 5, 7, 9, 12]))]


@generator("remove-nth-node-from-end-of-list")
def _remove_nth(rng):
    n = rng.randint(1, 12)
    return [linked(rng, n), rng.randint(1, n)]


@generator("copy-list-with-random-pointer")
def _copy_random(rng):
    # Values are not unique, and a list whose values are ALL the same is what catches a map keyed
    # by value rather than by node -- LeetCode's example 3 is exactly that. Drawing from a 61-wide
    # range made it near-impossible: two cases in 43 had every value equal.
    n = rng.randint(0, 8)
    pool = rng.choice([range(-30, 31), range(-30, 31), range(0, 3), range(3, 4)])
    return [[[rng.choice(pool), rng.choice([None] + list(range(n)))] for _ in range(n)]]


@generator("add-two-numbers")
def _add_two(rng):
    def digits(k):
        # Stored least-significant first, so the last digit must not be a leading zero.
        d = [rng.randint(0, 9) for _ in range(k - 1)] + [rng.randint(1, 9)]
        return d if k > 1 else [rng.randint(0, 9)]

    return [digits(rng.randint(1, 7)), digits(rng.randint(1, 7))]


@generator("linked-list-cycle")
def _has_cycle(rng):
    # Node values span -10^5..10^5, so no value is a safe "visited" marker; -1 and 0 are what
    # people reach for, and an acyclic list containing one must still answer false.
    n = rng.randint(0, 10)
    pos = -1 if (n == 0 or rng.random() < 0.5) else rng.randrange(n)
    vals = linked(rng, n)
    if vals and rng.random() < 0.4:
        vals[rng.randrange(len(vals))] = rng.choice([-1, 0])
    return [vals, pos]


@generator("find-the-duplicate-number")
def _find_duplicate(rng):
    """n+1 values from 1..n where exactly one value repeats -- possibly many times.

    The constraint is "appears two or more times", and the old generator always placed exactly two
    copies. That is precisely the assumption the sum-formula solution makes, so subtracting
    n(n+1)/2 scored 42/43, failing only LeetCode's own example 3 ([3,3,3,3,3]). Floyd's cycle
    detection and the count-based binary search are indifferent to the repeat count; the
    arithmetic tricks are not.
    """
    n = rng.randint(1, 12)
    dup = rng.randint(1, n)
    others = [v for v in range(1, n + 1) if v != dup]
    k = 2 if rng.random() < 0.55 else rng.randint(2, n + 1)   # how many copies of dup
    k = min(k, n + 1)
    nums = [dup] * k + rng.sample(others, n + 1 - k)
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
    # With no fresh orange the answer is 0 whether or not anything is rotten -- nothing needs to
    # happen. A solution that bails out with -1 as soon as it sees no rotten orange gets that
    # wrong, and it was invisible: only 2 of 43 grids had no fresh orange, and both had a rotten
    # one. So some grids draw from {empty, rotten} or are empty outright.
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    cells = rng.choice([[0, 1, 1, 2], [0, 1, 1, 2], [0, 1, 1, 2], [0, 2], [0], [0, 0, 1]])
    return [grid(rng, r, c, cells)]


@generator("surrounded-regions")
def _surrounded(rng):
    # Regions connect only horizontally and vertically, so an interior O that touches a border O
    # only at a CORNER is still captured. Random boards rarely line O's up diagonally with nothing
    # orthogonal between them, so treating a diagonal touch as safe failed three cases in 42. Some
    # boards lay a diagonal chain of O's in from a border cell on purpose.
    r, c = rng.randint(1, 5), rng.randint(1, 5)
    if rng.random() < 0.3 and r >= 3 and c >= 3:
        board = [["X"] * c for _ in range(r)]
        sr, sc = rng.choice([(0, 0), (0, c - 1), (r - 1, 0), (r - 1, c - 1)])
        dr = 1 if sr == 0 else -1
        dc = 1 if sc == 0 else -1
        rr, cc = sr, sc
        while 0 <= rr < r and 0 <= cc < c:
            board[rr][cc] = "O"
            rr += dr
            cc += dc
        return [board]
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
    """An n x n permutation of 0..n*n-1, sometimes one whose best path has to double back.

    A DP that only moves down and right is wrong whenever the cheapest route turns up or left,
    and random permutations rarely force that: it failed only LeetCode's own example. For n = 5,
    placing the smallest values along a zigzag -- right along row 0, down, LEFT along row 2, down,
    right along row 4 -- and the largest everywhere else makes every down-and-right path cross a
    large cell. Transposing gives the same trap with an upward step.
    """
    if rng.random() < 0.3:
        n = 5
        path = [(0, c) for c in range(5)] + [(1, 4)] + [(2, c) for c in range(4, -1, -1)] \
            + [(3, 0)] + [(4, c) for c in range(5)]
        if rng.random() < 0.5:
            path = [(c, r) for r, c in path]
        on = set(path)
        low = list(range(len(path)))
        high = list(range(len(path), n * n))
        rng.shuffle(low)
        rng.shuffle(high)
        g = [[0] * n for _ in range(n)]
        for (r, c), v in zip(path, low):
            g[r][c] = v
        rest = [(r, c) for r in range(n) for c in range(n) if (r, c) not in on]
        for (r, c), v in zip(rest, high):
            g[r][c] = v
        # The start and end cells are on the path, so the zigzag's maximum is len(path) - 1.
        return [g]
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
    """Prerequisite graphs, with the two kinds of cycle the random ones missed.

    207, unlike 210, has no `ai != bi` clause, so a self-loop [a, a] is legal and makes the
    schedule impossible; _distinct_edges never produced one. And random sparse graphs close
    mostly two-node cycles, so a check that looks only for [a, b] alongside [b, a] failed just two
    cases in 42. A longer ring is built outright.
    """
    n = rng.randint(1, 8)
    roll = rng.random()
    if roll < 0.18:
        # Otherwise ACYCLIC, so the self-loop is the only thing making the answer false: edges run
        # from a lower to a higher position in a random ordering, which cannot form a cycle.
        order = rng.sample(range(n), n)
        edges = []
        for _ in range(rng.randint(0, n)):
            i, j = sorted(rng.sample(range(n), 2)) if n >= 2 else (0, 0)
            if i != j and [order[j], order[i]] not in edges:
                edges.append([order[j], order[i]])
        a = rng.randrange(n)
        edges.append([a, a])
        rng.shuffle(edges)
        return [n, edges]
    if roll < 0.35 and n >= 3:
        ring = rng.sample(range(n), rng.randint(3, n))
        edges = [[ring[i], ring[(i + 1) % len(ring)]] for i in range(len(ring))]
        present = {tuple(e) for e in edges}
        for u, v in _distinct_edges(rng, n, rng.randint(0, 3), directed=True):
            if (u, v) not in present and (v, u) not in present:
                edges.append([u, v])
        rng.shuffle(edges)
        return [n, edges]
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
    """A tree needs BOTH n-1 edges AND connectivity, and each alone is a plausible shortcut.

    The input that separates them is n-1 edges that contain a cycle: the edge count is exactly
    right, but the cycle uses up an edge that should have reached the last node, so it is left
    isolated. There were none, so `return len(edges) == n - 1` scored 42/42.
    """
    n = rng.randint(1, 8)
    roll = rng.random()
    if roll < 0.4:                                  # a genuine tree
        return [n, [[rng.randint(0, v - 1), v] for v in range(1, n)]]
    if roll < 0.65 and n >= 4:
        # A tree over nodes 0..n-2 plus one extra edge among them: n-1 edges, a cycle, and node
        # n-1 disconnected.
        m = n - 1
        edges = [[rng.randint(0, v - 1), v] for v in range(1, m)]
        present = {tuple(sorted(e)) for e in edges}
        extra = [(u, v) for u in range(m) for v in range(u + 1, m) if (u, v) not in present]
        if not extra:
            return None
        edges.append(list(rng.choice(extra)))
        rng.shuffle(edges)
        return [n, edges]
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
    # Edge weights make breadth-first order meaningless: a node first reached by one dear direct
    # edge may be reachable far more cheaply through a detour found later. A BFS that fixes each
    # node's time on first discovery failed a single case in 43. Some graphs now contain exactly
    # that detour, with the labels permuted.
    if rng.random() < 0.25:
        n = rng.randint(3, 6)
        k, mid, far = rng.sample(range(1, n + 1), 3)
        direct = rng.randint(15, 40)
        a, b = rng.randint(1, 5), rng.randint(1, 5)
        times = [[k, far, direct], [k, mid, a], [mid, far, b]]
        for u in range(1, n + 1):                   # reach everything else so the answer is not -1
            if u not in (k, mid, far):
                times.append([k, u, rng.randint(1, 10)])
        rng.shuffle(times)
        return [times, n, k]
    n = rng.randint(1, 7)
    times = [[u + 1, v + 1, rng.randint(0, 20)] for u, v in _distinct_edges(rng, n, rng.randint(0, n + 3), directed=True)]
    return [times, n, rng.randint(1, n)]


@generator("cheapest-flights-within-k-stops")
def _cheapest_flights(rng):
    """k STOPS is k+1 flights, and the cheapest route overall may break that limit.

    That is exactly what plain Dijkstra gets wrong: it finds the globally cheapest route and never
    asks how many stops it used. Random sparse graphs rarely have a cheap long route competing with
    a dear short one, so both Dijkstra and a Bellman-Ford that reads distances updated in the same
    round failed only a few cases, mostly LeetCode's own example. Here a cheap chain of hops and a
    dear direct route are built on purpose, with k chosen to cut the chain.
    """
    roll = rng.random()
    if roll < 0.2:
        # A node reached CHEAPLY by a longer route and dearly by a shorter one, where the
        # destination is only in budget from the shorter one. Dijkstra with a per-node visited set
        # settles the node on the cheap long route, then discards the later arrival that still has
        # stops to spare -- and scored 43/43, because nothing here needed that later arrival.
        # Labels are permuted so the shape is not always the same five nodes.
        base = [[0, 1, 5], [1, 2, 5], [0, 3, 2], [3, 1, 2], [1, 4, 1], [4, 2, 1]]
        labels = rng.sample(range(5), 5)
        flights = [[labels[u], labels[v], w] for u, v, w in base]
        rng.shuffle(flights)
        return [5, flights, labels[0], labels[2], 2]
    if roll < 0.55:
        hops = rng.randint(2, 4)
        n = hops + 1 + rng.randint(0, 2)
        chain = list(range(hops + 1))                # 0 -> 1 -> ... -> hops, cheap per leg
        flights = [[chain[i], chain[i + 1], rng.randint(1, 10)] for i in range(hops)]
        flights.append([0, hops, rng.randint(40, 90)])   # the dear direct flight
        for _ in range(rng.randint(0, 2)):
            u, v = rng.sample(range(n), 2)
            if not any(f[0] == u and f[1] == v for f in flights):
                flights.append([u, v, rng.randint(5, 60)])
        rng.shuffle(flights)
        return [n, flights, 0, hops, rng.randint(0, hops - 1)]
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
    """Breakable and unbreakable strings, including the two shapes that defeat greedy matching.

    Building s by joining dictionary words means taking the longest match almost never walks into
    a dead end, so greedy longest-match scored 43/43. Two traps are now constructed:

      longest      words x, xy, yz and s = xyz: the longest first match is xy, which strands z,
                   while x + yz breaks it -- LeetCode's own ("aab", ["a","aa","ab"]) shape
      shortest     a word p that is a proper prefix of s, where s is itself a word: the shortest
                   first match p strands the rest -- ("aaa", ["aa","aaa"])
    """
    roll = rng.random()
    if roll < 0.2:
        x, y, z = (word(rng, rng.randint(1, 2), "abc") for _ in range(3))
        words = sorted({x, x + y, y + z} | {word(rng, rng.randint(1, 3), "abc") for _ in range(rng.randint(0, 2))})
        return [x + y + z, words]
    if roll < 0.32:
        whole = word(rng, rng.randint(3, 5), "ab")
        cut = rng.randint(1, len(whole) - 1)
        return [whole, sorted({whole[:cut], whole})]
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
    # 1 <= text1.length, text2.length: an empty string is not a legal input.
    return [word(rng, rng.randint(1, 12), "abc"), word(rng, rng.randint(1, 12), "abc")]


@generator("best-time-to-buy-and-sell-stock-with-cooldown")
def _cooldown(rng):
    return [ints(rng, rng.randint(1, 12), 0, 20)]


@generator("coin-change-ii")
def _coin_change_ii(rng):
    return [rng.randint(0, 40), sorted(rng.sample(range(1, 25), rng.randint(1, 4)))]


@generator("target-sum")
def _target_sum(rng):
    nums = ints(rng, rng.randint(1, 10), 0, 8)
    total = sum(nums)
    # The target ranges over -1000..1000 whatever the numbers add up to, so it can lie beyond
    # anything reachable. Drawing it from [-sum, sum] never did, and a solution that indexes
    # (sum + target) // 2 with no range check scored 42/42.
    if rng.random() < 0.25:
        # Beyond the reachable range by an EVEN amount, so (sum + target) is even and a solution
        # gets past the parity test to the index. Negative mostly: in Python a negative index into
        # the dp table does not raise, it quietly reads the other end.
        beyond = total + 2 * rng.randint(1, 3)
        return [nums, -beyond if rng.random() < 0.75 else beyond]
    return [nums, rng.randint(-total, total) if total else 0]


@generator("interleaving-string")
def _interleaving(rng):
    if rng.random() < 0.15:
        # s1 = p, s2 = p + q with q starting differently from p, s3 = p + q + p. The only way
        # through is s2 first; a greedy walk that prefers s1 whenever it matches takes p from
        # s1, then meets q with s1 exhausted and s2 still starting with p. ("a", "ab", "aba".)
        a, b = rng.sample("ab", 2)
        pre = a + word(rng, rng.randint(0, 1), "ab")
        q = b + word(rng, rng.randint(0, 1), "ab")
        return [pre, pre + q, pre + q + pre]
    s1 = word(rng, rng.randint(0, 6), "ab")
    s2 = word(rng, rng.randint(0, 6), "ab")
    if rng.random() < 0.5:                          # a genuine interleaving
        a, b, out = list(s1), list(s2), []
        while a or b:
            take_a = a and (not b or rng.random() < 0.5)
            out.append(a.pop(0) if take_a else b.pop(0))
        s3 = "".join(out)
        # s3 always had exactly len(s1) + len(s2) characters, so a solution that never checks the
        # lengths could not be caught, and scored 43/43. A genuine interleaving with its last
        # character or two dropped is the case that matters: every character still matches, the
        # walk simply runs out of s3 first and a missing check reports success.
        if s3 and rng.random() < 0.3:
            s3 = s3[:-rng.randint(1, min(2, len(s3)))]
        return [s1, s2, s3]
    return [s1, s2, word(rng, len(s1) + len(s2), "ab")]


@generator("distinct-subsequences")
def _distinct_subseq(rng):
    # 1 <= s.length, t.length. An empty t would answer 1, which is not a case the problem poses.
    return [word(rng, rng.randint(1, 12), "ab"), word(rng, rng.randint(1, 4), "ab")]


@generator("edit-distance")
def _edit_distance(rng):
    return [word(rng, rng.randint(0, 10), "abc"), word(rng, rng.randint(0, 10), "abc")]


@generator("burst-balloons", count=25)
def _burst_balloons(rng):
    return [ints(rng, rng.randint(1, 8), 0, 12)]    # the reference is O(n^3)


@generator("regular-expression-matching")
def _regex_match(rng):
    """A pattern, and a string that often matches it with some starred element used ZERO times.

    '*' is zero or more, and zero is the case people get wrong -- "a*b" matches "b". Random strings
    against random patterns rarely hit it, so reading '*' as one-or-more failed two cases in 43.
    Here the string is often built from the pattern itself, each x* expanded to 0, 1 or 2 copies
    with 0 the likeliest. The constraints also require 1 <= s.length, which the old draw from
    0..6 did not respect.
    """
    p = ""
    while len(p) < rng.randint(1, 6):
        ch = rng.choice("ab.")
        p += ch
        if rng.random() < 0.35:
            p += "*"                                # only ever after a real character
    if rng.random() < 0.55:
        out, i = [], 0
        while i < len(p):
            ch = p[i]
            starred = i + 1 < len(p) and p[i + 1] == "*"
            reps = rng.choice([0, 0, 1, 2]) if starred else 1
            out += [rng.choice("ab") if ch == "." else ch for _ in range(reps)]
            i += 2 if starred else 1
        s = "".join(out)
        if s and rng.random() < 0.25:               # nudge it off the pattern for some false ones
            j = rng.randrange(len(s))
            s = s[:j] + ("b" if s[j] == "a" else "a") + s[j + 1:]
        if s:
            return [s, p]
    return [word(rng, rng.randint(1, 6), "ab"), p]


# ---------- Backtracking ----------

@generator("subsets", count=25)
def _subsets(rng):
    return [distinct_ints(rng, rng.randint(0, 8), -20, 20)]


@generator("subsets-ii", count=25)
def _subsets_ii(rng):
    # 1 <= nums.length, so an empty array is not a legal input.
    return [ints(rng, rng.randint(1, 7), -3, 3)]


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


@generator("n-queens", count=12)
def _n_queens(rng):
    # 1 <= n <= 9. n = 2 and n = 3 have no solutions at all, and the largest boards are where a
    # diagonal bookkeeping mistake shows up as a count that is merely wrong rather than empty.
    # Drawn uniformly, twelve cases left several sizes out, so every legal n is listed.
    return [rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 6, 8])]


def _walk_word(rng, board, length, steps=((1, 0), (-1, 0), (0, 1), (0, -1))):
    """Read a word off a self-avoiding walk, so it is genuinely present on the board.

    With diagonal steps the word is usually NOT present, because the problem allows only
    horizontal and vertical neighbours -- which is what catches a search that steps diagonally.
    """
    rows, cols = len(board), len(board[0])
    r, c = rng.randrange(rows), rng.randrange(cols)
    seen, out = {(r, c)}, [board[r][c]]
    while len(out) < length:
        moves = [(r + dr, c + dc) for dr, dc in steps
                 if 0 <= r + dr < rows and 0 <= c + dc < cols and (r + dr, c + dc) not in seen]
        if not moves:
            break
        r, c = rng.choice(moves)
        seen.add((r, c))
        out.append(board[r][c])
    return "".join(out)


@generator("word-search")
def _word_search(rng):
    """A board and a word chosen to separate the three ways this is usually got wrong.

    A random word over a random board is almost never present -- 17 of 43 cases answered true --
    and none of them had the shape that catches a search which never restores a cell it marked.
    Each branch below targets one bug:

      walk        the word is read off a self-avoiding orthogonal walk, so it IS on the board,
                  and reversing it means the row-major scan tries the wrong end first, dead-ends,
                  and only succeeds if the cells it blanked were released
      diagonal    the word is laid out on a diagonal, so under the real adjacency rule it is
                  usually absent and a search that steps diagonally says true
      case flip   one letter's case is flipped, so a case-insensitive search says true

    The alphabet matters as much as the shapes. Over three letters the board is dense enough that
    almost every sequence has SOME orthogonal path, which made the diagonal words reachable the
    proper way too and the answer true either way.
    """
    letters = rng.choice(["abc", "abcd", "abcde", "aAbB", "aAbBcC"])
    roll = rng.random()

    if roll < 0.3:                                   # diagonal: needs room to turn
        r = c = rng.randint(3, 4)
        board = grid(rng, r, c, list(letters))
        # Longer is better here: the more letters a diagonal word has, the less likely the board
        # happens to offer an orthogonal path for the same sequence.
        w = _walk_word(rng, board, rng.randint(4, 6),
                       steps=((1, 1), (1, -1), (-1, 1), (-1, -1)))
        return [board, w] if len(w) >= 4 else None

    r, c = rng.randint(1, 4), rng.randint(1, 4)
    board = grid(rng, r, c, list(letters))

    if roll < 0.4 and any(ch.isupper() for ch in letters):
        w = _walk_word(rng, board, rng.randint(2, 5))
        if len(w) >= 2:
            i = rng.randrange(len(w))
            flipped = w[:i] + (w[i].lower() if w[i].isupper() else w[i].upper()) + w[i + 1:]
            return [board, flipped]

    if roll < 0.72:
        w = _walk_word(rng, board, rng.randint(1, 6))
        if w:
            return [board, w[::-1] if rng.random() < 0.5 else w]

    return [board, word(rng, rng.randint(1, 5), letters)]


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

@generator("generate-parentheses", count=16)
def _generate_parens(rng):
    # 1 <= n <= 8. n = 8 is the only case big enough (1430 strings) to catch a solution that is
    # right for small n by luck, and it was missing entirely; drawn uniformly it stayed missing,
    # so it is weighted.
    return [rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 8, 8])]


@generator("daily-temperatures")
def _daily_temps(rng):
    # A later day at the SAME temperature is not warmer, which is what separates > from >=. Over
    # the full 30..100 range ties are uncommon, so draw from a narrow band much of the time.
    lo, hi = rng.choice([(30, 100), (30, 100), (70, 73), (40, 42), (50, 50)])
    return [ints(rng, rng.randint(1, 15), lo, hi)]


@generator("car-fleet")
def _car_fleet(rng):
    # "If a car catches up to a fleet AT the mile target, it is still part of that fleet", so a
    # tie in arrival time must merge. Random positions and speeds essentially never tie: exactly
    # one case in 43 did, and it was LeetCode's own example. The bug that counts a tie as a new
    # fleet therefore scored 42/43 -- it was caught by the published example and nothing else.
    # So build ties outright: fix a whole-number arrival time T and place cars at target - T * s.
    target = rng.randint(10, 80)
    if rng.random() < 0.55:
        T = rng.randint(1, 8)
        speeds = rng.sample(range(1, 11), rng.randint(2, 4))
        tied = [(target - T * sp, sp) for sp in speeds]
        cars = [(p, sp) for p, sp in tied if 0 <= p < target]
        if len(cars) < 2:
            return None
        used = {p for p, _ in cars}
        for _ in range(rng.randint(0, 5)):          # plus ordinary cars around them
            p = rng.randrange(0, target)
            if p not in used:
                used.add(p)
                cars.append((p, rng.randint(1, 10)))
        rng.shuffle(cars)
        return [target, [p for p, _ in cars], [sp for _, sp in cars]]
    n = rng.choice([1, 1, 2, 3, 4, 5, 6, 7, 8, 9])  # n == 1 always answers 1, and must appear
    pos = rng.sample(range(0, target), n)           # positions are distinct, and below target
    return [target, pos, [rng.randint(1, 10) for _ in range(n)]]


@generator("largest-rectangle-in-histogram")
def _largest_rectangle(rng):
    n = rng.randint(1, 14)
    shape = rng.random()
    if shape < 0.2:                                  # plateaus: the prev/next-smaller strictness bug
        out = []
        while len(out) < n:
            out += [rng.randint(0, 20)] * rng.randint(2, 4)
        return [out[:n]]
    if shape < 0.3:                                  # monotonic: everything comes from the final flush
        vals = sorted(ints(rng, n, 0, 20), reverse=rng.random() < 0.5)
        return [vals]
    return [ints(rng, n, 0, 20)]


@generator("permutation-in-string")
def _permutation_in_string(rng):
    # A two-letter alphabet makes "same letters, different counts" -- the input that defeats
    # comparing sets instead of counts -- much rarer than it should be, so widen it sometimes.
    alphabet = rng.choice(["ab", "ab", "abc", "abcd"])
    return [word(rng, rng.randint(1, 5), alphabet), word(rng, rng.randint(1, 12), alphabet)]


def minimal_windows(s: str, t: str) -> set:
    """Every distinct shortest substring of s containing all of t's characters, with multiplicity."""
    need: dict[str, int] = {}
    for c in t:
        need[c] = need.get(c, 0) + 1
    best, out = None, set()
    for i in range(len(s)):
        have: dict[str, int] = {}
        for j in range(i, len(s)):
            have[s[j]] = have.get(s[j], 0) + 1
            if all(have.get(c, 0) >= n for c, n in need.items()):
                length = j - i + 1
                if best is None or length < best:
                    best, out = length, {s[i:j + 1]}
                elif length == best:
                    out.add(s[i:j + 1])
                break
    return out


@generator("minimum-window-substring")
def _min_window(rng):
    # s and t are upper AND lower case English letters. With a lowercase-only alphabet a
    # case-insensitive solution scored 43/43, though 'a' and 'A' are different characters here.
    alphabet = rng.choice(["abc", "abc", "aAb", "aABb", "ABC"])
    s = word(rng, rng.randint(1, 14), alphabet)
    t = word(rng, rng.randint(1, 4), alphabet)
    # "The testcases will be generated such that the answer is unique." Two different shortest
    # windows is an input the problem promises never occurs, and a correct solution keeping the
    # LAST shortest window rather than the first is then wrongly failed -- it scored 40/43 before
    # this filter. Unlike the two-sum rejection this deletes nothing hard: a tie is a coincidence
    # of the letters, uncorrelated with the traps (t with repeats, an answer at either end).
    if len(minimal_windows(s, t)) > 1:
        return None
    return [s, t]


@generator("sliding-window-maximum")
def _sliding_max(rng):
    # An all-negative window is what catches a running maximum initialised to 0, and random
    # values in [-20, 20] almost never produce one: there was a single case in 42.
    lo, hi = rng.choice([(-20, 20), (-20, 20), (-20, -1), (-10000, -1)])
    nums = ints(rng, rng.randint(1, 15), lo, hi)
    return [nums, rng.randint(1, len(nums))]


@generator("search-a-2d-matrix")
def _search_2d(rng):
    # 1 <= m, n, so a 1x1 matrix is legal and was absent. Square matrices matter for the opposite
    # reason: they are where flattening with // m instead of // n is silently correct.
    r, c = (1, 1) if rng.random() < 0.1 else (rng.randint(1, 5), rng.randint(1, 5))
    vals = sorted(rng.sample(range(-60, 61), r * c))
    matrix = [vals[i * c:(i + 1) * c] for i in range(r)]
    target = rng.choice(vals) if rng.random() < 0.6 else rng.randint(-70, 70)
    return [matrix, target]


@generator("median-of-two-sorted-arrays")
def _median_two(rng):
    # 0 <= m, n and 1 <= m + n, so one array may be empty but not both. The partition index
    # j = half - i goes negative only when the array being searched is the LONGER one, so a
    # solution that never swaps to the shorter array needs a heavily skewed pair to expose it --
    # with both sides drawn from 0..8 it failed a single case in 42. Total length 1, the smallest
    # legal input, was missing outright.
    roll = rng.random()
    if roll < 0.12:
        a, b = (1, 0) if rng.random() < 0.5 else (0, 1)
    elif roll < 0.4:
        a, b = rng.randint(4, 12), rng.randint(0, 1)   # skewed, either way round
        if rng.random() < 0.5:
            a, b = b, a
    else:
        a, b = rng.randint(0, 8), rng.randint(0, 8)
    if a + b == 0:
        return None
    return [sorted(ints(rng, a, -40, 40)), sorted(ints(rng, b, -40, 40))]


@generator("trapping-rain-water")
def _trapping_rain(rng):
    roll = rng.random()
    if roll < 0.06:
        return [[]]
    if roll < 0.12:
        return [ints(rng, rng.randint(1, 2), 0, 10)]         # too short to hold anything
    if roll < 0.24:
        s = sorted(ints(rng, rng.randint(3, 12), 0, 10))
        return [s if rng.random() < 0.5 else s[::-1]]        # monotonic: traps nothing
    if roll < 0.32:
        return [[rng.randint(0, 10)] * rng.randint(3, 8)]    # a plateau: traps nothing
    if roll < 0.48:
        # One basin with the global maximum at an end. A prefix-max solution that takes the max
        # STRICTLY to one side goes negative here unless it clamps at zero.
        wall = rng.randint(5, 10)
        middle = [rng.randint(0, wall - 1) for _ in range(rng.randint(1, 6))]
        return [[wall] + middle + [rng.randint(1, wall)]]
    return [ints(rng, rng.randint(3, 15), 0, 10)]


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


def _sudoku_place(board, r, c, d):
    """Place d at (r, c) only if it breaks no rule, so 'valid' boards really are valid."""
    if board[r][c] != ".":
        return False
    for i in range(9):
        if board[r][i] == d or board[i][c] == d:
            return False
    br, bc = r // 3 * 3, c // 3 * 3
    for i in range(3):
        for j in range(3):
            if board[br + i][bc + j] == d:
                return False
    board[r][c] = d
    return True


@generator("valid-sudoku")
def _valid_sudoku(rng):
    # Scattering random digits gave 1 box-only conflict in 42 cases, so a checker that verified rows
    # and columns but never the 3x3 boxes scored 41/42. Each violation is now built on purpose.
    board = [["." for _ in range(9)] for _ in range(9)]
    for _ in range(rng.randint(8, 22)):
        _sudoku_place(board, rng.randrange(9), rng.randrange(9), str(rng.randint(1, 9)))

    roll = rng.random()
    if roll < 0.35:
        return [board]                              # valid by construction

    d = str(rng.randint(1, 9))
    if roll < 0.55:                                 # row conflict, in two different boxes
        r = rng.randrange(9)
        c1, c2 = rng.sample(range(9), 2)
        if c1 // 3 == c2 // 3:
            return None
        board[r][c1] = board[r][c2] = d
    elif roll < 0.75:                               # column conflict, in two different boxes
        c = rng.randrange(9)
        r1, r2 = rng.sample(range(9), 2)
        if r1 // 3 == r2 // 3:
            return None
        board[r1][c] = board[r2][c] = d
    else:
        # BOX-ONLY: same digit twice inside one 3x3 box, on different rows AND different columns,
        # so neither the row nor the column rule can catch it.
        br, bc = rng.randrange(3) * 3, rng.randrange(3) * 3
        # Choose the rows and the columns separately so the two cells always differ in both. Drawing
        # two cells at random and rejecting the rest threw away half the draws.
        r1, r2 = rng.sample(range(3), 2)
        c1, c2 = rng.sample(range(3), 2)
        for r, c in ((br + r1, bc + c1), (br + r2, bc + c2)):
            for i in range(9):                      # keep the row and column clean of d
                if board[r][i] == d:
                    board[r][i] = "."
                if board[i][c] == d:
                    board[i][c] = "."
        board[br + r1][bc + c1] = board[br + r2][bc + c2] = d
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
    """Operations over a key pool barely larger than the capacity.

    Three separate bugs live here and no single sequence catches all of them: `put` on an existing
    key failing to refresh recency, `get` failing to refresh it, and evicting before checking
    membership so a pure update throws something out. All three need the cache to be FULL and the
    same keys to recur. Keys drawn from 1..6 against a capacity of 1..4 left the interesting
    collisions to chance -- the put-refresh bug scored 42/43.
    """
    cap = rng.randint(1, 3)
    if rng.random() < 0.3:
        # Constructed: fill to capacity, touch the least-recently-used key, then force one
        # eviction and read everything back. Which key survives is the whole question, and random
        # traffic produced the deciding order rarely enough that the put-refresh bug scored 42/43.
        keys = list(range(1, cap + 1))
        steps = [("put", [k, 10 + k]) for k in keys]
        touch = keys[0]                                  # the current LRU
        if rng.random() < 0.5:
            steps.append(("put", [touch, 99]))           # an update must count as a use
        else:
            steps.append(("get", [touch]))               # and so must a read
        steps.append(("put", [cap + 1, 77]))             # evicts whichever is now the LRU
        steps += [("get", [k]) for k in keys + [cap + 1]]
        return _design("LRUCache", [cap], steps)
    keys = list(range(1, cap + rng.randint(1, 2) + 1))
    steps = []
    for _ in range(rng.randint(8, 20)):
        if rng.random() < 0.55:
            steps.append(("put", [rng.choice(keys), rng.randint(1, 20)]))
        else:
            steps.append(("get", [rng.choice(keys)]))
    return _design("LRUCache", [cap], steps)


@generator("min-stack")
def _min_stack_gen(rng):
    # Pushing the CURRENT MINIMUM a second time and then popping once is the classic failure:
    # a min-stack that only records strict improvements pops its single copy and then reports the
    # wrong minimum, or empties itself. Values drawn independently from a 41-wide range almost
    # never repeat, so that sequence never appeared and the bug scored 42/43 -- caught only by a
    # hand-written extra case. Push from a narrow pool, and sometimes re-push the minimum
    # outright, so duplicate minima are ordinary rather than lucky.
    pool = rng.choice([range(-20, 21), range(-3, 4), range(0, 3)])
    steps, live = [], []
    for _ in range(rng.randint(4, 18)):
        roll = rng.random()
        if not live or roll < 0.45:                # top/pop/getMin need a non-empty stack
            if live and rng.random() < 0.35:
                val = min(live)                    # duplicate the minimum on purpose
            else:
                val = rng.choice(pool)
            steps.append(("push", [val]))
            live.append(val)
        elif roll < 0.6:
            steps.append(("pop", []))
            live.pop()
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
            # "There will be at most 2 dots in word for search queries." The old version dotted
            # each character independently, so all-dot patterns of any length were common -- inputs
            # the problem promises never occur, which would wrongly fail a solution that leans on
            # the guarantee.
            base = list(rng.choice(pool))
            for i in rng.sample(range(len(base)), min(len(base), rng.randint(0, 2))):
                base[i] = "."
            steps.append(("search", ["".join(base)]))
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
    # Tweet ids are unique but NOT increasing over time, and the feed is ordered by when a tweet
    # was posted. The old generator handed out 1, 2, 3, ... in order, which made the two orderings
    # identical, so sorting by tweetId instead of by post time scored 42/42. Ids are now drawn in
    # a shuffled order, which keeps them unique and stops id order standing in for time order.
    ids = list(range(1, 40))
    rng.shuffle(ids)
    steps, used = [], 0
    for _ in range(rng.randint(4, 16)):
        roll = rng.random()
        if roll < 0.4:
            steps.append(("postTweet", [rng.randint(1, 4), ids[used]]))
            used += 1
        elif roll < 0.7:
            steps.append(("getNewsFeed", [rng.randint(1, 4)]))
        else:
            a, b = rng.sample(range(1, 5), 2)      # never follow yourself
            steps.append((rng.choice(["follow", "unfollow"]), [a, b]))
    return _design("Twitter", [], steps)
