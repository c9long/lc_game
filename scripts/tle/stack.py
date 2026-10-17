"""TLE cases for Stack (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle


# ---------- Valid Parentheses ----------

@tle("valid-parentheses")
def _valid_parentheses(rng):
    # Max length 1000, valid, nested to depth 500 (no early exit; a "remove innermost pair" loop
    # needs the full 500 passes).
    opens = [rng.choice("([{") for _ in range(500)]
    close = {"(": ")", "[": "]", "{": "}"}
    return ["".join(opens) + "".join(close[c] for c in reversed(opens))]


no_tle("valid-parentheses", "s.length <= 1000: even the repeated replace('()', '') approach is ~500 passes over 1000 chars, a few ms")


# ---------- Min Stack ----------

@tle("min-stack")
def _min_stack(rng):
    # At most 3 * 10^4 calls: 15000 pushes then 14999 getMin on the full stack maximises
    # (stack size) * (getMin calls) ~ 2.25 * 10^8 for an O(n) getMin.
    vals = [rng.randrange(-2**31, 2**31) for _ in range(15000)]
    names = ["MinStack"] + ["push"] * 15000 + ["getMin"] * 14999
    params = [[]] + [[v] for v in vals] + [[] for _ in range(14999)]
    return [names, params]


naive("min-stack", "sort a copy on every getMin O(n log n) per call", """class MinStack:
    def __init__(self):
        self.stack = []

    def push(self, val):
        self.stack.append(val)

    def pop(self):
        self.stack.pop()

    def top(self):
        return self.stack[-1]

    def getMin(self):
        return sorted(self.stack)[0]""")


# ---------- Evaluate Reverse Polish Notation ----------

@tle("evaluate-reverse-polish-notation")
def _evaluate_rpn(rng):
    # Max length (9999 tokens): all 5000 operands first, then the 4999 operators, so the stack
    # reaches depth 5000 and a "find the first operator, reduce, rescan" loop scans furthest.
    # Only + and - keep the value small (|result| <= 10^6) and avoid division by zero.
    nums = [str(rng.randint(-200, 200)) for _ in range(5000)]
    ops = [rng.choice("+-") for _ in range(4999)]
    return [nums + ops]


no_tle("evaluate-reverse-polish-notation", "tokens.length <= 10^4: the rescan-from-the-start reduction is ~1.25 * 10^7 scan steps (~1 s); O(n^2) at n = 10^4 cannot reach the budget")


# ---------- Daily Temperatures ----------

@tle("daily-temperatures")
def _daily_temperatures(rng):
    # 10^5 temperatures, non-increasing from 99 down to 30, then a single 100 at the end: every
    # day's next warmer day is the last one, so a forward scan from each day walks to the end
    # (~5 * 10^9 comparisons).
    n = 10**5
    body = sorted((rng.randint(30, 99) for _ in range(n - 1)), reverse=True)
    return [body + [100]]


naive("daily-temperatures", "scan forward from each day O(n^2)", """class Solution:
    def dailyTemperatures(self, temperatures):
        n = len(temperatures)
        res = [0] * n
        for i in range(n):
            for j in range(i + 1, n):
                if temperatures[j] > temperatures[i]:
                    res[i] = j - i
                    break
        return res""")


# ---------- Car Fleet ----------

@tle("car-fleet")
def _car_fleet(rng):
    # 10^5 cars, none of which catches the one ahead (arrival time strictly increases as position
    # decreases), so every car is its own fleet and a "does any car ahead arrive no earlier"
    # check scans all cars ahead (~5 * 10^9 comparisons).
    target = 10**6
    position = rng.sample(range(target), 10**5)
    # Speed 1 everywhere: time = target - p, distinct and exact, strictly increasing backwards.
    speed = [1] * len(position)
    return [target, position, speed]


naive("car-fleet", "check every car ahead O(n^2)", """class Solution:
    def carFleet(self, target, position, speed):
        cars = sorted(zip(position, speed), reverse=True)
        times = [(target - p) / s for p, s in cars]
        fleets = 0
        for i in range(len(times)):
            caught = False
            for j in range(i):
                if times[j] >= times[i]:
                    caught = True
                    break
            if not caught:
                fleets += 1
        return fleets""")

naive("car-fleet", "max of the prefix slice per car O(n^2)", """class Solution:
    def carFleet(self, target, position, speed):
        cars = sorted(zip(position, speed), reverse=True)
        times = [(target - p) / s for p, s in cars]
        fleets = 0
        for i in range(len(times)):
            if i == 0 or times[i] > max(times[:i]):
                fleets += 1
        return fleets""")


# ---------- Largest Rectangle in Histogram ----------

@tle("largest-rectangle-in-histogram")
def _largest_rectangle(rng):
    # 10^5 bars sorted ascending: expanding each bar to the right always runs to the end
    # (~5 * 10^9 steps), and divide-and-conquer on the minimum splits off one bar at a time.
    return [sorted(rng.randint(0, 10**4) for _ in range(10**5))]


naive("largest-rectangle-in-histogram", "expand left and right from each bar O(n^2)", """class Solution:
    def largestRectangleArea(self, heights):
        n = len(heights)
        best = 0
        for i in range(n):
            h = heights[i]
            l = i
            while l > 0 and heights[l - 1] >= h:
                l -= 1
            r = i
            while r < n - 1 and heights[r + 1] >= h:
                r += 1
            best = max(best, h * (r - l + 1))
        return best""")

naive("largest-rectangle-in-histogram", "every start with a running min O(n^2)", """class Solution:
    def largestRectangleArea(self, heights):
        n = len(heights)
        best = 0
        for i in range(n):
            m = heights[i]
            for j in range(i, n):
                if heights[j] < m:
                    m = heights[j]
                best = max(best, m * (j - i + 1))
        return best""")
