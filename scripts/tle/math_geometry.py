"""TLE cases for Math & Geometry (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


def _nth_call(rng, key):
    """0, 1, 2, ... for successive calls of one generator within one build. The counter lives on
    the rng that build() creates fresh per problem, so the cases depend on nothing but the seed."""
    n = getattr(rng, key, 0)
    setattr(rng, key, n + 1)
    return n


# ---------- Rotate Image ----------

@tle("rotate-image")
def _rotate_image(rng):
    # Max size: a 20 x 20 matrix of distinct-ish values across the full range.
    return [[[rng.randint(-1000, 1000) for _ in range(20)] for _ in range(20)]]


no_tle("rotate-image", "n <= 20: the matrix has at most 400 cells, so even rotating one cell at a time with copies is a few thousand steps")


# ---------- Spiral Matrix ----------

@tle("spiral-matrix")
def _spiral_matrix(rng):
    # Max size: 10 x 10.
    return [[[rng.randint(-100, 100) for _ in range(10)] for _ in range(10)]]


no_tle("spiral-matrix", "m, n <= 10: at most 100 cells, so even a visited-set walk that rescans the matrix per step is ~10^4 steps")


# ---------- Set Matrix Zeroes ----------

@tle("set-matrix-zeroes")
def _set_matrix_zeroes(rng):
    # Max size 200 x 200, nearly all zeros (~1 in 1000 cells non-zero, so the answer is all
    # zeros): the worst case for "record the zeros' positions, then for every cell scan that list
    # for a zero in its row or column" -- ~4 * 10^4 cells x ~4 * 10^4 zeros = 1.6 * 10^9 steps.
    # The variant that stops at the first match (any(...)) cannot be timed out: its worst case is a
    # 100-column zero block (10^4 zeros) that every other cell scans deep into, ~2 * 10^8 generator
    # steps at most, and a 100 x 100 block measured 13.2 s here -- under the 15 s budget.
    lo, hi = -2**31, 2**31 - 1

    def nonzero():
        v = 0
        while v == 0:
            v = rng.randint(lo, hi)
        return v

    return [[[nonzero() if rng.random() < 0.001 else 0 for _ in range(200)] for _ in range(200)]]


naive("set-matrix-zeroes", "scan the zero list for every cell O(mn * zeros)", """class Solution:
    def setZeroes(self, matrix):
        m, n = len(matrix), len(matrix[0])
        zeros = []
        for i in range(m):
            for j in range(n):
                if matrix[i][j] == 0:
                    zeros.append((i, j))
        for i in range(m):
            for j in range(n):
                for r, c in zeros:
                    if r == i or c == j:
                        matrix[i][j] = 0""")


# ---------- Happy Number ----------

@tle("happy-number")
def _happy_number(rng):
    # The upper bound, n = 1000 (happy; 999 is the unhappy neighbour the suite can cover).
    return [1000]


no_tle("happy-number", "n <= 1000: digit-square sums drop below 243 at once and any cycle is found within ~20 steps")


# ---------- Plus One ----------

@tle("plus-one")
def _plus_one(rng):
    # Max length, all nines: the carry ripples through every digit and the result grows by one.
    return [[9] * 100]


no_tle("plus-one", "digits.length <= 100: even converting to an int and back, or re-copying the list per carry, is ~10^4 steps")


# ---------- Pow(x, n) ----------

@tle("powx-n", count=2)
def _powx_n(rng):
    # |n| at the 32-bit extremes with x just off 1 (never exactly 1, 0 or -1, so no shortcut),
    # keeping x^n inside [-10^4, 10^4]. Multiplying x in a loop |n| times is ~2.1 * 10^9 steps.
    # Case 1: n = 2^31 - 1; case 2: n = -2^31.
    eps = rng.uniform(1e-10, 2e-9)
    n = 2**31 - 1 if _nth_call(rng, "_powx_n_calls") % 2 == 0 else -2**31
    x = 1 + eps if n > 0 else 1 - eps
    if rng.random() < 0.5:
        x = -x  # odd/even n decides the sign; |x^n| is unchanged
    return [x, n]


naive("powx-n", "multiply |n| times O(n)", """class Solution:
    def myPow(self, x, n):
        res = 1.0
        for _ in range(abs(n)):
            res *= x
        return res if n >= 0 else 1 / res""")


# ---------- Multiply Strings ----------

@tle("multiply-strings")
def _multiply_strings(rng):
    # Max length, no zero digits (no skipped rows) and leading 9s for the longest carries.
    a = "9" + "".join(rng.choice("123456789") for _ in range(199))
    b = "9" + "".join(rng.choice("123456789") for _ in range(199))
    return [a, b]


# Repeated addition (add the longer number to an accumulator "shorter" times) is a correct learner
# approach whose cost is exponential in the shorter operand's length: the regular suite's shorter
# operands have <= 6 digits (<= 10^6 additions), while this case needs ~10^199. Schoolbook
# multiplication of 200 x 200 digits (4 * 10^4 products) cannot be timed out.
naive("multiply-strings", "repeated addition, shorter number as the counter", """class Solution:
    def multiply(self, num1, num2):
        if len(num1) > len(num2):
            num1, num2 = num2, num1
        def to_int(s):
            v = 0
            for ch in s:
                v = v * 10 + (ord(ch) - 48)
            return v
        times = to_int(num1)
        step = to_int(num2)
        acc = 0
        while times > 0:
            acc += step
            times -= 1
        return str(acc)""")


# ---------- Detect Squares ----------

CX = CY = 500


@tle("detect-squares")
def _detect_squares(rng):
    # 2000 adds then 600 counts, all about one centre (500, 500). Half the added points are
    # diagonal partners of the centre and the rest are the matching corners, so every count sees
    # ~1000 diagonals. A count that looks up each diagonal's two corners by scanning the point list
    # does ~1000 * 2000 Python steps (~1.2 * 10^9 over the run), and a count that tries every pair
    # of stored points does 4 * 10^6 per count (~2.4 * 10^9 overall). The reference walks the 2000
    # points once per count (~1.2 * 10^6 steps). Adds outnumber counts because the reference is
    # linear in adds while both naives are quadratic in them.
    ds = rng.sample(range(1, 401), 40)
    steps = []
    for _ in range(2000):
        dx = rng.choice(ds) * rng.choice((-1, 1))
        dy = abs(dx) * rng.choice((-1, 1))
        kind = rng.random()
        if kind < 1 / 2:
            pt = [CX + dx, CY + dy]
        elif kind < 3 / 4:
            pt = [CX + dx, CY]
        else:
            pt = [CX, CY + dy]
        steps.append(("add", pt))
    for _ in range(600):
        steps.append(("count", [CX, CY] if rng.random() < 0.8 else [CX + rng.choice((-1, 1)), CY]))
    names = ["DetectSquares"] + [s[0] for s in steps]
    params = [[]] + [[s[1]] for s in steps]
    return [names, params]


naive("detect-squares", "scan the point list for each corner", """class DetectSquares:
    def __init__(self):
        self.pts = []

    def add(self, point):
        self.pts.append((point[0], point[1]))

    def count(self, point):
        px, py = point
        res = 0
        for x, y in self.pts:
            if x == px or y == py or abs(x - px) != abs(y - py):
                continue
            a = 0
            b = 0
            for q in self.pts:
                if q[0] == x and q[1] == py:
                    a += 1
                if q[0] == px and q[1] == y:
                    b += 1
            res += a * b
        return res""")

naive("detect-squares", "every pair of stored points per count O(n^2)", """from collections import Counter
class DetectSquares:
    def __init__(self):
        self.pts = []
        self.cnt = Counter()

    def add(self, point):
        self.pts.append((point[0], point[1]))
        self.cnt[(point[0], point[1])] += 1

    def count(self, point):
        px, py = point
        res = 0
        for a in self.pts:
            for b in self.pts:
                # a shares the query's x, b shares its y, and the sides match: the fourth corner
                # is (b.x, a.y), which must be a stored point.
                if a[0] == px and b[1] == py and a[1] != py and b[0] != px and abs(a[1] - py) == abs(b[0] - px):
                    res += self.cnt[(b[0], a[1])]
        return res""")
