"""TLE cases for Sliding Window (see scripts/tle/__init__.py)."""
from tle import naive, no_tle, tle

UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
LOWER = "abcdefghijklmnopqrstuvwxyz"


# ---------- Best Time to Buy and Sell Stock ----------

@tle("best-time-to-buy-and-sell-stock")
def _best_time(rng):
    # Max size (100 prices), mostly falling with the best buy late and the best sell at the very
    # end, so a pairwise scan cannot settle early.
    prices = sorted((rng.randrange(20, 101) for _ in range(97)), reverse=True)
    prices += [rng.randrange(0, 5), rng.randrange(40, 60), 100]
    return [prices]


no_tle("best-time-to-buy-and-sell-stock", "prices.length <= 100: the O(n^2) pairwise scan is ~5 * 10^3 comparisons, instant")


# ---------- Longest Substring Without Repeating Characters ----------

@tle("longest-substring-without-repeating-characters")
def _longest_substring(rng):
    # Max length 5 * 10^4 over all 95 printable characters: the answer is short (<= 95), so
    # checking every substring (or every length from n down) does ~n^2 / 2 = 1.25 * 10^9 checks.
    alphabet = [chr(c) for c in range(32, 127)]
    return ["".join(rng.choice(alphabet) for _ in range(5 * 10**4))]


naive("longest-substring-without-repeating-characters", "check every substring O(n^2)", """class Solution:
    def lengthOfLongestSubstring(self, s):
        best = 0
        for i in range(len(s)):
            for j in range(i + 1, len(s) + 1):
                if j - i > best and len(set(s[i:j])) == j - i:
                    best = j - i
        return best""")

naive("longest-substring-without-repeating-characters", "try lengths from longest down O(n^2)", """class Solution:
    def lengthOfLongestSubstring(self, s):
        for length in range(len(s), 0, -1):
            for i in range(len(s) - length + 1):
                if len(set(s[i:i + length])) == length:
                    return length
        return 0""")


# ---------- Longest Repeating Character Replacement ----------

@tle("longest-repeating-character-replacement")
def _char_replacement(rng):
    # Max length 10^5, random uppercase, k = n / 2: the best window is ~half the string, so
    # extending from every start (even with a break once the window is invalid) is ~n^2 / 3.
    n = 10**5
    return ["".join(rng.choice(UPPER) for _ in range(n)), n // 2]


naive("longest-repeating-character-replacement", "extend from every start O(26 n^2)", """class Solution:
    def characterReplacement(self, s, k):
        best = 0
        for i in range(len(s)):
            count = {}
            for j in range(i, len(s)):
                count[s[j]] = count.get(s[j], 0) + 1
                if (j - i + 1) - max(count.values()) <= k:
                    best = max(best, j - i + 1)
                else:
                    break
        return best""")

naive("longest-repeating-character-replacement", "every window, track max count O(n^2)", """class Solution:
    def characterReplacement(self, s, k):
        best = 0
        n = len(s)
        for i in range(n):
            count = [0] * 26
            maxf = 0
            for j in range(i, n):
                c = ord(s[j]) - 65
                count[c] += 1
                maxf = max(maxf, count[c])
                if (j - i + 1) - maxf <= k:
                    best = max(best, j - i + 1)
        return best""")


# ---------- Permutation in String ----------

@tle("permutation-in-string")
def _permutation(rng):
    # s1 = a multiset A plus one 'z'; s2 repeats a shuffle of A plus one 'y' with period len(s1),
    # so every window has the multiset A + 'y': never a permutation (answer False, no early
    # exit), yet each window matches s1 on all but one character. len(s1) = len(s2) / 2
    # maximises windows * window length -- but that is only 2.5 * 10^7, so an O(n m) check per
    # window (sorted / Counter / 26 counts) finishes in 3-7 s; only O(m^2)-per-window checks die.
    m, n = 5 * 10**3, 10**4
    body = [rng.choice(LOWER[:24]) for _ in range(m - 1)]
    s1 = body[:]
    rng.shuffle(s1)
    s1.append("z")  # last, so a letter-by-letter check of s1 meets the mismatch only at the end
    period = body + ["y"]
    rng.shuffle(period)
    s2 = (period * (n // m + 1))[:n]
    return ["".join(s1), "".join(s2)]


naive("permutation-in-string", "count each letter of s1 in every window O(n m^2)", """class Solution:
    def checkInclusion(self, s1, s2):
        m = len(s1)
        for i in range(len(s2) - m + 1):
            window = s2[i:i + m]
            if all(s1.count(c) == window.count(c) for c in s1):
                return True
        return False""")

naive("permutation-in-string", "remove window letters from a copy of s1 O(n m^2)", """class Solution:
    def checkInclusion(self, s1, s2):
        m = len(s1)
        for i in range(len(s2) - m + 1):
            left = list(s1)
            for c in s2[i:i + m]:
                if c not in left:
                    break
                left.remove(c)
            else:
                return True
        return False""")


# ---------- Minimum Window Substring ----------

@tle("minimum-window-substring")
def _min_window(rng):
    # Max length 10^5; t = "aZ" and the only 'Z' is the last character of s, so expanding from
    # every start until the window covers t walks to the end each time: ~n^2 / 2 = 5 * 10^9.
    n = 10**5
    s = "".join(rng.choice(LOWER) for _ in range(n - 1)) + "Z"
    return [s, "aZ"]


naive("minimum-window-substring", "expand from every start O(n^2)", """class Solution:
    def minWindow(self, s, t):
        need = {}
        for c in t:
            need[c] = need.get(c, 0) + 1
        res = ""
        for i in range(len(s)):
            have = {}
            missing = len(t)
            for j in range(i, len(s)):
                c = s[j]
                have[c] = have.get(c, 0) + 1
                if have[c] <= need.get(c, 0):
                    missing -= 1
                if missing == 0:
                    if res == "" or j - i + 1 < len(res):
                        res = s[i:j + 1]
                    break
        return res""")


# ---------- Sliding Window Maximum ----------

@tle("sliding-window-maximum")
def _sliding_max(rng):
    # Max length 10^5, non-increasing (values 10^4 down to -10^4, ~5 repeats each), k = n / 2:
    # the window's max leaves at every step, so even "rescan only when the max drops out" rescans
    # all ~5 * 10^4 windows of 5 * 10^4 elements.
    n = 10**5
    nums = sorted((rng.randrange(-10**4, 10**4 + 1) for _ in range(n)), reverse=True)
    return [nums, n // 2]


naive("sliding-window-maximum", "max of every window slice O(n k)", """class Solution:
    def maxSlidingWindow(self, nums, k):
        return [max(nums[i:i + k]) for i in range(len(nums) - k + 1)]""")

naive("sliding-window-maximum", "rescan when the max leaves O(n k)", """class Solution:
    def maxSlidingWindow(self, nums, k):
        res = []
        cur = None
        for i in range(len(nums) - k + 1):
            if cur is None or nums[i - 1] == cur:
                cur = nums[i]
                for j in range(i, i + k):
                    if nums[j] > cur:
                        cur = nums[j]
            elif nums[i + k - 1] > cur:
                cur = nums[i + k - 1]
            res.append(cur)
        return res""")
