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
    n = rng.randint(2, 20)
    nums = distinct_ints(rng, n, -200, 200)
    if nums is None:
        return None
    i, j = rng.sample(range(n), 2)
    target = nums[i] + nums[j]
    # LeetCode guarantees exactly one answer; a second pair would make the expectation arbitrary.
    pairs = sum(
        1 for a in range(n) for b in range(a + 1, n) if nums[a] + nums[b] == target
    )
    return None if pairs != 1 else [nums, target]


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
    # Ties make the expected answer ambiguous, so frequencies are kept distinct.
    values = distinct_ints(rng, rng.randint(1, 6), -20, 20)
    if values is None:
        return None
    freqs = rng.sample(range(1, 12), len(values))
    nums = [v for v, f in zip(values, freqs) for _ in range(f)]
    rng.shuffle(nums)
    k = rng.randint(1, len(values))
    if len(set(freqs[:k])) != k or (k < len(values) and sorted(freqs)[-k] == sorted(freqs)[-k - 1]):
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
    n = rng.randint(2, 18)
    nums = sorted(ints(rng, n, -100, 100))
    i, j = sorted(rng.sample(range(n), 2))
    target = nums[i] + nums[j]
    pairs = sum(1 for a in range(n) for b in range(a + 1, n) if nums[a] + nums[b] == target)
    return None if pairs != 1 else [nums, target]


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
