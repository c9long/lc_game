"""TLE cases for Bit Manipulation (see scripts/tle/__init__.py).

Every problem in this node has constraints too small for any realistic correct solution to exceed
the judge's budget, so each gets a max-size worst-case input and a no_tle reason, no naive.
"""
from tle import no_tle, tle


# ---------- Single Number ----------

@tle("single-number")
def _single_number(rng):
    # Max length (odd: 4999 pairs + the single = 9999 <= 10^4), all values distinct pairs. The first
    # copies come in one order and the second copies in the same order half the array later, and
    # the single element is last, so a pairwise "find my partner" scan walks ~n/2 per element and
    # the outer loop never exits before the very end.
    values = rng.sample(range(-10**4, 10**4 + 1), 5000)
    single, pairs = values[-1], values[:-1]
    return [pairs + pairs + [single]]


no_tle("single-number", "nums.length <= 10^4: even the O(n^2) pairwise scan is ~5 * 10^7 comparisons, a few seconds in Pyodide")


# ---------- Number of 1 Bits ----------

@tle("number-of-1-bits")
def _number_of_1_bits(rng):
    # 30 of the 31 bits set: a bit-at-a-time or n &= n - 1 loop runs its maximum iterations.
    return [(2**31 - 1) ^ (1 << rng.randrange(31))]


no_tle("number-of-1-bits", "n < 2^31: any bit loop runs at most 31 iterations")


# ---------- Counting Bits ----------

@tle("counting-bits")
def _counting_bits(rng):
    # The maximum n: a per-number popcount loop does ~10^4 steps in total.
    return [1000]


no_tle("counting-bits", "n <= 1000: popcounting each number bit by bit is ~10^4 steps")


# ---------- Reverse Bits ----------

@tle("reverse-bits")
def _reverse_bits(rng):
    # Top bit (30) set and even: a loop that stops when n reaches 0 still runs all 31 iterations.
    return [(1 << 30) | (rng.randrange(1 << 29) << 1)]


no_tle("reverse-bits", "n is a 32-bit integer: reversing takes at most 32 iterations")


# ---------- Missing Number ----------

@tle("missing-number")
def _missing_number(rng):
    # Max n = 1000 with n itself missing, shuffled: a "for i in range(n + 1): if i not in nums"
    # scan does all ~5 * 10^5 comparisons, and sorting-based approaches find nothing early.
    nums = list(range(1000))
    rng.shuffle(nums)
    return [nums]


no_tle("missing-number", "n <= 1000: the O(n^2) 'i not in nums' scan is ~5 * 10^5 comparisons, well under a second")


# ---------- Sum of Two Integers ----------

@tle("sum-of-two-integers")
def _sum_of_two_integers(rng):
    # Opposite signs and equal magnitude near the bound: the carry ripples through every bit of a
    # 32-bit masked add, and a count-by-one loop takes the maximum ~1000 steps.
    a = rng.randrange(900, 1001)
    return [a, -a] if rng.random() < 0.5 else [-a, a]


no_tle("sum-of-two-integers", "|a|, |b| <= 1000: a masked carry loop runs <= 32 rounds and counting by one <= 2000 steps")


# ---------- Reverse Integer ----------

@tle("reverse-integer")
def _reverse_integer(rng):
    # Ten digits (the maximum), negative, with a reverse that overflows 32 bits: the digit loop
    # runs to its full length before the overflow check fires.
    x = -rng.randrange(10**9, 2**31)
    if x % 10 == 0 or abs(int(str(-x)[::-1])) < 2**31:
        return None
    return [x]


no_tle("reverse-integer", "x is a 32-bit integer: at most 10 digits to reverse")
