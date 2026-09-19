#!/usr/bin/env node
/**
 * The audit that docs/08-test-hardening.md describes, made permanent.
 *
 * scripts/verify-tests.py cannot measure whether a suite is STRONG — it re-runs the same reference
 * that produced the expectations, so it passes by construction. This does the two checks that
 * actually matter, for every problem audited so far:
 *
 *   NEAR-MISS  a solution correct except for one edge case MUST fail. A suite that cannot fail a
 *              plausible wrong answer is not testing anything.
 *   CORRECT    an independent correct solution, written differently from the vendored reference,
 *              MUST pass every case. This is what catches a generator that emits invalid inputs.
 *
 * Add a pair for each problem as its batch is audited. Run with: pnpm run audit
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPyodide } from 'pyodide';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pyodide = await loadPyodide({ indexURL: join(ROOT, 'node_modules', 'pyodide') });
pyodide.FS.mkdirTree('/lc');
pyodide.FS.writeFile('/lc/lc_driver.py', readFileSync(join(ROOT, 'src/lib/pyodide/driver.py'), 'utf8'));
const judge = pyodide.runPython(`
import json, sys
sys.path.insert(0, '/lc')
import lc_driver
def _judge(s, sp, cs): return json.dumps(lc_driver.judge(s, json.loads(sp), json.loads(cs)))
_judge
`);

function run(slug, source) {
	const suite = JSON.parse(readFileSync(join(ROOT, 'data/tests', `${slug}.json`), 'utf8'));
	const r = JSON.parse(judge(source, JSON.stringify(suite), JSON.stringify(suite.cases)));
	return { passed: r.filter((x) => x.ok).length, total: r.length, first: r.find((x) => !x.ok) };
}

// [slug, label, mustPass, source]
const cases = [
  // The reported bug: refuses to pair a value with an equal value.
  ['two-sum-ii-input-array-is-sorted', 'CHEAT cannot pair equal values', false, `class Solution:
    def twoSum(self, numbers, target):
        s = set(numbers)
        for i, n in enumerate(numbers):
            need = target - n
            if need in s and need != n:
                j = numbers.index(need)
                return sorted([i + 1, j + 1])
        return []`],
  ['two-sum', 'CHEAT cannot pair equal values', false, `class Solution:
    def twoSum(self, nums, target):
        s = set(nums)
        for i, n in enumerate(nums):
            need = target - n
            if need in s and need != n:
                return sorted([i, nums.index(need)])
        return []`],
  // Correct solutions must still pass, or the validators over-reject.
  ['two-sum-ii-input-array-is-sorted', 'correct two-pointer', true, `class Solution:
    def twoSum(self, numbers, target):
        l, r = 0, len(numbers) - 1
        while l < r:
            s = numbers[l] + numbers[r]
            if s == target: return [l + 1, r + 1]
            if s < target: l += 1
            else: r -= 1`],
  ['two-sum', 'correct hashmap', true, `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen: return [seen[target - n], i]
            seen[n] = i`],
  ['two-sum', 'correct brute force, returns a DIFFERENT valid pair', true, `class Solution:
    def twoSum(self, nums, target):
        for i in range(len(nums) - 1, -1, -1):
            for j in range(i - 1, -1, -1):
                if nums[i] + nums[j] == target: return [j, i]`],
  ['top-k-frequent-elements', 'correct Counter', true, `class Solution:
    def topKFrequent(self, nums, k):
        from collections import Counter
        return [v for v, _ in Counter(nums).most_common(k)]`],
  ['top-k-frequent-elements', 'CHEAT returns most common 1', false, `class Solution:
    def topKFrequent(self, nums, k):
        from collections import Counter
        return [Counter(nums).most_common(1)[0][0]] * k`],
  ['gas-station', 'correct greedy', true, `class Solution:
    def canCompleteCircuit(self, gas, cost):
        if sum(gas) < sum(cost): return -1
        total, start = 0, 0
        for i in range(len(gas)):
            total += gas[i] - cost[i]
            if total < 0: total, start = 0, i + 1
        return start`],
  ['course-schedule-ii', 'correct Kahn', true, `class Solution:
    def findOrder(self, numCourses, prerequisites):
        from collections import defaultdict, deque
        g, indeg = defaultdict(list), [0]*numCourses
        for a, b in prerequisites:
            g[b].append(a); indeg[a] += 1
        q = deque([i for i in range(numCourses) if indeg[i] == 0]); out = []
        while q:
            n = q.popleft(); out.append(n)
            for m in g[n]:
                indeg[m] -= 1
                if indeg[m] == 0: q.append(m)
        return out if len(out) == numCourses else []`],
  ['course-schedule-ii', 'CHEAT returns 0..n-1 unsorted', false, `class Solution:
    def findOrder(self, numCourses, prerequisites): return list(range(numCourses))`],
  ['k-closest-points-to-origin', 'correct sort', true, `class Solution:
    def kClosest(self, points, k):
        return sorted(points, key=lambda p: p[0]*p[0] + p[1]*p[1])[:k]`],
  ['alien-dictionary', 'correct topological sort', true, `class Solution:
    def alienOrder(self, words):
        from collections import defaultdict
        adj = {c: set() for w in words for c in w}
        for a, b in zip(words, words[1:]):
            minlen = min(len(a), len(b))
            if len(a) > len(b) and a[:minlen] == b[:minlen]: return ""
            for i in range(minlen):
                if a[i] != b[i]:
                    adj[a[i]].add(b[i]); break
        visit, res = {}, []
        def dfs(c):
            if c in visit: return visit[c]
            visit[c] = True
            for nb in adj[c]:
                if dfs(nb): return True
            visit[c] = False
            res.append(c)
            return False
        for c in adj:
            if dfs(c): return ""
        return "".join(reversed(res))`],
  // ---- near-misses: correct except for one edge case. Each MUST fail. ----
  ['contains-duplicate', 'NEAR-MISS compares neighbours only', false, `class Solution:
    def containsDuplicate(self, nums):
        for i in range(len(nums) - 1):
            if nums[i] == nums[i + 1]: return True
        return False`],
  ['valid-anagram', 'NEAR-MISS compares letter sets, not counts', false, `class Solution:
    def isAnagram(self, s, t):
        return len(s) == len(t) and set(s) == set(t)`],
  ['group-anagrams', 'NEAR-MISS groups by letter set', false, `class Solution:
    def groupAnagrams(self, strs):
        d = {}
        for s in strs: d.setdefault(frozenset(s), []).append(s)
        return list(d.values())`],
  ['product-of-array-except-self', 'NEAR-MISS divides by the total product', false, `class Solution:
    def productExceptSelf(self, nums):
        total = 1
        for v in nums: total *= v
        return [total // v if v else 0 for v in nums]`],
  ['valid-sudoku', 'NEAR-MISS checks rows and columns, never the boxes', false, `class Solution:
    def isValidSudoku(self, board):
        def ok(vals):
            v = [x for x in vals if x != "."]
            return len(v) == len(set(v))
        for r in board:
            if not ok(r): return False
        for c in range(9):
            if not ok([board[r][c] for r in range(9)]): return False
        return True`],
  ['longest-consecutive-sequence', 'NEAR-MISS sorts but does not de-duplicate', false, `class Solution:
    def longestConsecutive(self, nums):
        if not nums: return 0
        s = sorted(nums); best = run = 1
        for i in range(1, len(s)):
            if s[i] == s[i-1] + 1: run += 1
            else: run = 1
            best = max(best, run)
        return best`],
  ['encode-and-decode-strings', 'NEAR-MISS length prefix reads a single digit', false, `class Solution:
    def encode(self, strs): return "".join(str(len(s)) + "#" + s for s in strs)
    def decode(self, s):
        out, i = [], 0
        while i < len(s):
            n = int(s[i]); i += 2
            out.append(s[i:i+n]); i += n
        return out`],

  // ---- correct solutions, written differently from the reference. Each MUST pass 100%. ----
  ['contains-duplicate', 'correct set length', true, `class Solution:
    def containsDuplicate(self, nums): return len(set(nums)) != len(nums)`],
  ['valid-anagram', 'correct sorted()', true, `class Solution:
    def isAnagram(self, s, t): return sorted(s) == sorted(t)`],
  ['group-anagrams', 'correct sorted-key', true, `class Solution:
    def groupAnagrams(self, strs):
        d = {}
        for s in strs: d.setdefault("".join(sorted(s)), []).append(s)
        return list(d.values())`],
  ['product-of-array-except-self', 'correct O(n^2) no division', true, `class Solution:
    def productExceptSelf(self, nums):
        out = []
        for i in range(len(nums)):
            p = 1
            for j, v in enumerate(nums):
                if i != j: p *= v
            out.append(p)
        return out`],
  ['valid-sudoku', 'correct rows+cols+boxes', true, `class Solution:
    def isValidSudoku(self, board):
        def ok(vals):
            v = [x for x in vals if x != "."]
            return len(v) == len(set(v))
        for r in board:
            if not ok(r): return False
        for c in range(9):
            if not ok([board[r][c] for r in range(9)]): return False
        for br in range(0, 9, 3):
            for bc in range(0, 9, 3):
                if not ok([board[br+i][bc+j] for i in range(3) for j in range(3)]): return False
        return True`],
  ['longest-consecutive-sequence', 'correct sort + dedupe', true, `class Solution:
    def longestConsecutive(self, nums):
        if not nums: return 0
        s = sorted(set(nums)); best = run = 1
        for i in range(1, len(s)):
            run = run + 1 if s[i] == s[i-1] + 1 else 1
            best = max(best, run)
        return best`],
  ['encode-and-decode-strings', 'correct multi-digit length prefix', true, `class Solution:
    def encode(self, strs): return "".join(str(len(s)) + "#" + s for s in strs)
    def decode(self, s):
        out, i = [], 0
        while i < len(s):
            j = s.index("#", i); n = int(s[i:j]); i = j + 1
            out.append(s[i:i+n]); i += n
        return out`],

	// ---- batch 2: Two Pointers ----
	['valid-palindrome', 'NEAR-MISS filters with isalpha, dropping digits', false, `class Solution:
    def isPalindrome(self, s):
        t = [c.lower() for c in s if c.isalpha()]
        return t == t[::-1]`],
	['valid-palindrome', 'NEAR-MISS never lowercases', false, `class Solution:
    def isPalindrome(self, s):
        t = [c for c in s if c.isalnum()]
        return t == t[::-1]`],
	['valid-palindrome', 'correct two-pointer', true, `class Solution:
    def isPalindrome(self, s):
        l, r = 0, len(s) - 1
        while l < r:
            while l < r and not s[l].isalnum(): l += 1
            while l < r and not s[r].isalnum(): r -= 1
            if s[l].lower() != s[r].lower(): return False
            l += 1; r -= 1
        return True`],

	['3sum', 'NEAR-MISS does not de-duplicate triplets', false, `class Solution:
    def threeSum(self, nums):
        nums.sort(); res = []
        for i in range(len(nums) - 2):
            l, r = i + 1, len(nums) - 1
            while l < r:
                s = nums[i] + nums[l] + nums[r]
                if s < 0: l += 1
                elif s > 0: r -= 1
                else:
                    res.append([nums[i], nums[l], nums[r]]); l += 1; r -= 1
        return res`],
	['3sum', 'correct brute force with a set', true, `class Solution:
    def threeSum(self, nums):
        n = len(nums); out = set()
        for i in range(n):
            for j in range(i + 1, n):
                for k in range(j + 1, n):
                    if nums[i] + nums[j] + nums[k] == 0:
                        out.add(tuple(sorted((nums[i], nums[j], nums[k]))))
        return [list(t) for t in out]`],

	['container-with-most-water', 'NEAR-MISS moves the taller wall inward', false, `class Solution:
    def maxArea(self, height):
        l, r, best = 0, len(height) - 1, 0
        while l < r:
            best = max(best, min(height[l], height[r]) * (r - l))
            if height[l] > height[r]: l += 1
            else: r -= 1
        return best`],
	['container-with-most-water', 'correct O(n^2) brute force', true, `class Solution:
    def maxArea(self, height):
        best = 0
        for i in range(len(height)):
            for j in range(i + 1, len(height)):
                best = max(best, min(height[i], height[j]) * (j - i))
        return best`],

	['trapping-rain-water', 'NEAR-MISS prefix maxima without clamping at zero', false, `class Solution:
    def trap(self, height):
        n = len(height)
        if n == 0: return 0
        left = [0] * n; right = [0] * n
        for i in range(1, n): left[i] = max(left[i-1], height[i-1])
        for i in range(n - 2, -1, -1): right[i] = max(right[i+1], height[i+1])
        return sum(min(left[i], right[i]) - height[i] for i in range(n))`],
	['trapping-rain-water', 'correct per-index min of maxima', true, `class Solution:
    def trap(self, height):
        total = 0
        for i in range(len(height)):
            l = max(height[:i+1]); r = max(height[i:])
            total += min(l, r) - height[i]
        return total`],

	// ---- batch 1 revisited, after researching each problem rather than reasoning alone ----
	['group-anagrams', 'NEAR-MISS skips empty strings', false, `class Solution:
    def groupAnagrams(self, strs):
        d = {}
        for s in strs:
            if not s: continue
            d.setdefault("".join(sorted(s)), []).append(s)
        return list(d.values())`],
	['product-of-array-except-self', 'NEAR-MISS multiplies before storing, including itself', false, `class Solution:
    def productExceptSelf(self, nums):
        n = len(nums); res = [1] * n
        prefix = 1
        for i in range(n):
            prefix *= nums[i]
            res[i] = prefix
        postfix = 1
        for i in range(n - 1, -1, -1):
            postfix *= nums[i]
            res[i] *= postfix
        return res`],
	['contains-duplicate', 'NEAR-MISS assumes at least two elements', false, `class Solution:
    def containsDuplicate(self, nums):
        return len(set(nums)) != len(nums) or len(nums) < 2`],

	// ---- batch 3: Sliding Window ----
	// The alphabet was the whole story for 3 and 76. Both suites used lowercase letters only, so a
	// solution that lowercased its input -- or stripped punctuation -- scored a perfect 43/43.
	['longest-substring-without-repeating-characters', 'NEAR-MISS case-insensitive', false, `class Solution:
    def lengthOfLongestSubstring(self, s):
        s = s.lower()
        seen, l, res = set(), 0, 0
        for r in range(len(s)):
            while s[r] in seen:
                seen.remove(s[l]); l += 1
            seen.add(s[r]); res = max(res, r - l + 1)
        return res`],
	['longest-substring-without-repeating-characters', 'NEAR-MISS 26-slot lowercase table', false, `class Solution:
    def lengthOfLongestSubstring(self, s):
        last = [-1] * 26; l = 0; res = 0
        for r, c in enumerate(s):
            i = ord(c) - ord('a')
            if 0 <= i < 26:
                if last[i] >= l: l = last[i] + 1
                last[i] = r
            res = max(res, r - l + 1)
        return res`],
	['longest-substring-without-repeating-characters', 'NEAR-MISS left pointer jumps backwards', false, `class Solution:
    def lengthOfLongestSubstring(self, s):
        last, l, res = {}, 0, 0
        for r, c in enumerate(s):
            if c in last: l = last[c] + 1
            last[c] = r
            res = max(res, r - l + 1)
        return res`],
	['longest-substring-without-repeating-characters', 'correct last-index map', true, `class Solution:
    def lengthOfLongestSubstring(self, s):
        last, l, res = {}, 0, 0
        for r, c in enumerate(s):
            if c in last: l = max(l, last[c] + 1)
            last[c] = r
            res = max(res, r - l + 1)
        return res`],

	['minimum-window-substring', 'NEAR-MISS case-insensitive', false, `class Solution:
    def minWindow(self, s, t):
        from collections import Counter
        need = Counter(t.lower()); have = {}; cnt, req = 0, len(need)
        res, reslen, l = [-1, -1], float("inf"), 0
        for r in range(len(s)):
            c = s[r].lower(); have[c] = 1 + have.get(c, 0)
            if c in need and have[c] == need[c]: cnt += 1
            while cnt == req:
                if (r - l + 1) < reslen: res, reslen = [l, r], r - l + 1
                d = s[l].lower(); have[d] -= 1
                if d in need and have[d] < need[d]: cnt -= 1
                l += 1
        l, r = res
        return s[l:r+1] if reslen != float("inf") else ""`],
	['minimum-window-substring', 'NEAR-MISS set instead of counts', false, `class Solution:
    def minWindow(self, s, t):
        need = set(t); have = {}
        res, reslen, l = [-1, -1], float("inf"), 0
        for r in range(len(s)):
            have[s[r]] = 1 + have.get(s[r], 0)
            while need <= set(k for k, v in have.items() if v > 0):
                if (r - l + 1) < reslen: res, reslen = [l, r], r - l + 1
                have[s[l]] -= 1; l += 1
        l, r = res
        return s[l:r+1] if reslen != float("inf") else ""`],
	['minimum-window-substring', 'NEAR-MISS shrinks with if, not while', false, `class Solution:
    def minWindow(self, s, t):
        from collections import Counter
        need = Counter(t); have = {}; cnt, req = 0, len(need)
        res, reslen, l = [-1, -1], float("inf"), 0
        for r in range(len(s)):
            c = s[r]; have[c] = 1 + have.get(c, 0)
            if c in need and have[c] == need[c]: cnt += 1
            if cnt == req:
                if (r - l + 1) < reslen: res, reslen = [l, r], r - l + 1
                d = s[l]; have[d] -= 1
                if d in need and have[d] < need[d]: cnt -= 1
                l += 1
        l, r = res
        return s[l:r+1] if reslen != float("inf") else ""`],
	// LeetCode guarantees the answer is unique, so keeping the LAST shortest window is as correct as
	// keeping the first. The generator used to emit ties and this scored 40/43; it must be 43/43.
	['minimum-window-substring', 'correct, keeps the last shortest window', true, `class Solution:
    def minWindow(self, s, t):
        from collections import Counter
        need = Counter(t); have = {}; cnt, req = 0, len(need)
        res, reslen, l = [-1, -1], float("inf"), 0
        for r in range(len(s)):
            c = s[r]; have[c] = 1 + have.get(c, 0)
            if c in need and have[c] == need[c]: cnt += 1
            while cnt == req:
                if (r - l + 1) <= reslen: res, reslen = [l, r], r - l + 1
                d = s[l]; have[d] -= 1
                if d in need and have[d] < need[d]: cnt -= 1
                l += 1
        l, r = res
        return s[l:r+1] if reslen != float("inf") else ""`],

	// The bug that looks identical to the correct line: assignment rather than max().
	['longest-repeating-character-replacement', 'NEAR-MISS assigns maxf instead of max()', false, `class Solution:
    def characterReplacement(self, s, k):
        count = {}; l = 0; maxf = 0; res = 0
        for r in range(len(s)):
            count[s[r]] = 1 + count.get(s[r], 0)
            maxf = count[s[r]]
            if (r - l + 1) - maxf > k: count[s[l]] -= 1; l += 1
            res = max(res, r - l + 1)
        return res`],
	['longest-repeating-character-replacement', 'NEAR-MISS longest run plus k, uncapped', false, `class Solution:
    def characterReplacement(self, s, k):
        best = run = 1
        for i in range(1, len(s)):
            run = run + 1 if s[i] == s[i-1] else 1
            best = max(best, run)
        return best + k`],
	// The non-shrinking window that returns len(s) - l is genuinely correct, not a near-miss: it was
	// checked exhaustively against brute force. It is here so nobody "fixes" the suite to reject it.
	['longest-repeating-character-replacement', 'correct non-shrinking window', true, `class Solution:
    def characterReplacement(self, s, k):
        count = {}; l = 0; maxf = 0
        for r in range(len(s)):
            count[s[r]] = 1 + count.get(s[r], 0)
            maxf = max(maxf, count[s[r]])
            if (r - l + 1) - maxf > k:
                count[s[l]] -= 1; l += 1
        return len(s) - l`],

	['permutation-in-string', 'NEAR-MISS set instead of counts', false, `class Solution:
    def checkInclusion(self, s1, s2):
        n = len(s1)
        if n > len(s2): return False
        return any(set(s2[i:i+n]) == set(s1) for i in range(len(s2) - n + 1))`],
	['permutation-in-string', 'NEAR-MISS never removes the outgoing char', false, `class Solution:
    def checkInclusion(self, s1, s2):
        from collections import Counter
        need = Counter(s1); have = Counter()
        for c in s2:
            have[c] += 1
            if have == need: return True
        return False`],
	['permutation-in-string', 'NEAR-MISS loop bound misses the last window', false, `class Solution:
    def checkInclusion(self, s1, s2):
        from collections import Counter
        n = len(s1)
        if n > len(s2): return False
        need = Counter(s1)
        return any(Counter(s2[i:i+n]) == need for i in range(len(s2) - n))`],
	['permutation-in-string', 'correct sorted-window scan', true, `class Solution:
    def checkInclusion(self, s1, s2):
        n = len(s1); need = sorted(s1)
        return any(sorted(s2[i:i+n]) == need for i in range(len(s2) - n + 1))`],

	// An all-negative window is the only thing that catches a running maximum seeded with 0, and the
	// suite had exactly one such case in 42 before the generator drew from negative-only ranges.
	['sliding-window-maximum', 'NEAR-MISS running max seeded at 0', false, `class Solution:
    def maxSlidingWindow(self, nums, k):
        res = []
        for i in range(len(nums) - k + 1):
            m = 0
            for j in range(i, i + k):
                if nums[j] > m: m = nums[j]
            res.append(m)
        return res`],
	['sliding-window-maximum', 'NEAR-MISS never evicts expired indices', false, `class Solution:
    def maxSlidingWindow(self, nums, k):
        from collections import deque
        q, res = deque(), []
        for i, n in enumerate(nums):
            while q and nums[q[-1]] < n: q.pop()
            q.append(i)
            if i >= k - 1: res.append(nums[q[0]])
        return res`],
	['sliding-window-maximum', 'NEAR-MISS single running max, never recomputed', false, `class Solution:
    def maxSlidingWindow(self, nums, k):
        res = []; m = max(nums[:k]); res.append(m)
        for i in range(k, len(nums)):
            m = max(m, nums[i]); res.append(m)
        return res`],
	['sliding-window-maximum', 'correct deque', true, `class Solution:
    def maxSlidingWindow(self, nums, k):
        from collections import deque
        q, res = deque(), []
        for i, n in enumerate(nums):
            while q and nums[q[-1]] <= n: q.pop()
            q.append(i)
            if q[0] <= i - k: q.popleft()
            if i >= k - 1: res.append(nums[q[0]])
        return res`],

	// prices[i] can be 0, so seeding the running minimum with 0 is a real bug, not a safe default.
	['best-time-to-buy-and-sell-stock', 'NEAR-MISS lowest seeded at 0', false, `class Solution:
    def maxProfit(self, prices):
        res = 0; lowest = 0
        for price in prices:
            if price < lowest: lowest = price
            res = max(res, price - lowest)
        return res`],
	['best-time-to-buy-and-sell-stock', 'NEAR-MISS ignores ordering', false, `class Solution:
    def maxProfit(self, prices):
        return max(prices) - min(prices)`],
	['best-time-to-buy-and-sell-stock', 'NEAR-MISS adjacent days only', false, `class Solution:
    def maxProfit(self, prices):
        best = 0
        for i in range(1, len(prices)):
            best = max(best, prices[i] - prices[i-1])
        return best`],
	['best-time-to-buy-and-sell-stock', 'correct one pass', true, `class Solution:
    def maxProfit(self, prices):
        lo, best = float("inf"), 0
        for p in prices:
            lo = min(lo, p); best = max(best, p - lo)
        return best`],

	// ---- batch 4: Stack ----
	// Two suites were caught by a PUBLISHED EXAMPLE and by nothing else, which is the same as not
	// being tested: car-fleet's tie rule and min-stack's duplicate minimum each failed one case.
	['car-fleet', 'NEAR-MISS a tie starts a new fleet', false, `class Solution:
    def carFleet(self, target, position, speed):
        st = []
        for p, s in sorted(zip(position, speed), reverse=True):
            t = (target - p) / s
            if not st or t >= st[-1]: st.append(t)
        return len(st)`],
	['car-fleet', 'NEAR-MISS walks the cars away from the target first', false, `class Solution:
    def carFleet(self, target, position, speed):
        st = []
        for p, s in sorted(zip(position, speed)):
            t = (target - p) / s
            if st and t <= st[-1]: continue
            st.append(t)
        return len(st)`],
	['car-fleet', 'NEAR-MISS sorts positions and speeds apart', false, `class Solution:
    def carFleet(self, target, position, speed):
        st = []
        for p, s in zip(sorted(position, reverse=True), sorted(speed, reverse=True)):
            t = (target - p) / s
            if not st or t > st[-1]: st.append(t)
        return len(st)`],
	['car-fleet', 'correct monotonic stack', true, `class Solution:
    def carFleet(self, target, position, speed):
        st = []
        for p, s in sorted(zip(position, speed), reverse=True):
            t = (target - p) / s
            if not st or t > st[-1]: st.append(t)
        return len(st)`],

	['min-stack', 'NEAR-MISS records only strict improvements to the minimum', false, `class MinStack:
    def __init__(self): self.st = []; self.mn = []
    def push(self, val):
        self.st.append(val)
        if not self.mn or val < self.mn[-1]: self.mn.append(val)
    def pop(self):
        v = self.st.pop()
        if self.mn and v == self.mn[-1]: self.mn.pop()
    def top(self): return self.st[-1]
    def getMin(self): return self.mn[-1]`],
	['min-stack', 'NEAR-MISS single minimum, never restored on pop', false, `class MinStack:
    def __init__(self): self.st = []; self.mn = None
    def push(self, val):
        self.st.append(val)
        self.mn = val if self.mn is None else min(self.mn, val)
    def pop(self): self.st.pop()
    def top(self): return self.st[-1]
    def getMin(self): return self.mn`],
	['min-stack', 'correct value/min pair stack', true, `class MinStack:
    def __init__(self): self.st = []
    def push(self, val):
        m = val if not self.st else min(val, self.st[-1][1])
        self.st.append((val, m))
    def pop(self): self.st.pop()
    def top(self): return self.st[-1][0]
    def getMin(self): return self.st[-1][1]`],

	// Division truncates toward ZERO, so -7 / 2 is -3 where Python's // gives -4. Only a division
	// with a negative quotient and a non-zero remainder can tell them apart.
	['evaluate-reverse-polish-notation', 'NEAR-MISS floor division', false, `class Solution:
    def evalRPN(self, tokens):
        st = []
        for t in tokens:
            if len(t) == 1 and t in "+-*/":
                b = st.pop(); a = st.pop()
                st.append(a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else a // b)
            else: st.append(int(t))
        return st[-1]`],
	['evaluate-reverse-polish-notation', 'NEAR-MISS isdigit() misreads a negative literal', false, `class Solution:
    def evalRPN(self, tokens):
        st = []
        for t in tokens:
            if t.isdigit(): st.append(int(t))
            else:
                b = st.pop(); a = st.pop()
                st.append(a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else int(a / b))
        return st[-1]`],
	['evaluate-reverse-polish-notation', 'NEAR-MISS swapped operand order', false, `class Solution:
    def evalRPN(self, tokens):
        st = []
        for t in tokens:
            if len(t) == 1 and t in "+-*/":
                a = st.pop(); b = st.pop()
                st.append(a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else int(a / b))
            else: st.append(int(t))
        return st[-1]`],
	// Reads stack[-1] where the vendored reference reads stack[0]. The two agree only while every
	// expression is well formed, which is why this pair is here: two generated cases were not, and
	// the reference answered the first token rather than raising.
	['evaluate-reverse-polish-notation', 'correct, truncating toward zero', true, `import math
class Solution:
    def evalRPN(self, tokens):
        st = []
        for t in tokens:
            if len(t) == 1 and t in "+-*/":
                b = st.pop(); a = st.pop()
                st.append(a + b if t == "+" else a - b if t == "-" else a * b if t == "*" else math.trunc(a / b))
            else: st.append(int(t))
        return st[-1]`],

	['valid-parentheses', 'NEAR-MISS never checks the stack is empty at the end', false, `class Solution:
    def isValid(self, s):
        m = {")": "(", "]": "[", "}": "{"}; st = []
        for c in s:
            if c in m:
                if not st or st.pop() != m[c]: return False
            else: st.append(c)
        return True`],
	['valid-parentheses', 'NEAR-MISS counts brackets instead of matching them', false, `class Solution:
    def isValid(self, s):
        return all(s.count(o) == s.count(c) for o, c in (("(", ")"), ("[", "]"), ("{", "}")))`],
	['valid-parentheses', 'NEAR-MISS tracks depth, ignoring bracket type', false, `class Solution:
    def isValid(self, s):
        d = 0
        for c in s:
            d += 1 if c in "([{" else -1
            if d < 0: return False
        return d == 0`],
	['valid-parentheses', 'correct', true, `class Solution:
    def isValid(self, s):
        m = {")": "(", "]": "[", "}": "{"}; st = []
        for c in s:
            if c in m:
                if not st or st.pop() != m[c]: return False
            else: st.append(c)
        return not st`],

	['daily-temperatures', 'NEAR-MISS treats an equal temperature as warmer', false, `class Solution:
    def dailyTemperatures(self, temperatures):
        res = [0] * len(temperatures); st = []
        for i, t in enumerate(temperatures):
            while st and t >= temperatures[st[-1]]:
                j = st.pop(); res[j] = i - j
            st.append(i)
        return res`],
	['daily-temperatures', 'correct monotonic stack', true, `class Solution:
    def dailyTemperatures(self, temperatures):
        res = [0] * len(temperatures); st = []
        for i, t in enumerate(temperatures):
            while st and t > temperatures[st[-1]]:
                j = st.pop(); res[j] = i - j
            st.append(i)
        return res`],

	['largest-rectangle-in-histogram', 'NEAR-MISS never drains the stack at the end', false, `class Solution:
    def largestRectangleArea(self, heights):
        st = []; best = 0
        for i, h in enumerate(heights):
            start = i
            while st and st[-1][1] > h:
                idx, ht = st.pop(); best = max(best, ht * (i - idx)); start = idx
            st.append((start, h))
        return best`],
	// Strict on both sides makes every bar in a plateau a rectangle of width 1.
	['largest-rectangle-in-histogram', 'NEAR-MISS strict on both sides of a plateau', false, `class Solution:
    def largestRectangleArea(self, heights):
        n = len(heights); best = 0
        for i, h in enumerate(heights):
            l = i
            while l > 0 and heights[l-1] > h: l -= 1
            r = i
            while r < n - 1 and heights[r+1] > h: r += 1
            best = max(best, h * (r - l + 1))
        return best`],
	['largest-rectangle-in-histogram', 'correct with a zero sentinel', true, `class Solution:
    def largestRectangleArea(self, heights):
        hs = heights + [0]; st = []; best = 0
        for i, h in enumerate(hs):
            while st and hs[st[-1]] > h:
                ht = hs[st.pop()]
                w = i if not st else i - st[-1] - 1
                best = max(best, ht * w)
            st.append(i)
        return best`],

	// The unordered comparison sorts rather than de-duplicating, so a list with repeats still fails.
	['generate-parentheses', 'NEAR-MISS insertion, producing duplicates', false, `class Solution:
    def generateParenthesis(self, n):
        out = ["()"]
        for _ in range(n - 1):
            nxt = []
            for s in out:
                for i in range(len(s) + 1): nxt.append(s[:i] + "()" + s[i:])
            out = nxt
        return out`],
	['generate-parentheses', 'NEAR-MISS closes whenever close < n', false, `class Solution:
    def generateParenthesis(self, n):
        res = []
        def go(cur, o, c):
            if len(cur) == 2 * n:
                res.append(cur); return
            if o < n: go(cur + "(", o + 1, c)
            if c < n: go(cur + ")", o, c + 1)
        go("", 0, 0)
        return res`],
	['generate-parentheses', 'correct backtracking', true, `class Solution:
    def generateParenthesis(self, n):
        res = []
        def go(cur, o, c):
            if len(cur) == 2 * n:
                res.append(cur); return
            if o < n: go(cur + "(", o + 1, c)
            if c < o: go(cur + ")", o, c + 1)
        go("", 0, 0)
        return res`],

	// ---- batch 5: Binary Search ----
	// "Rotated between 1 and n times" includes the identity, so an already sorted array is legal --
	// it is LeetCode's own example 3, and the only shape that catches nums[0] as the pivot.
	['find-minimum-in-rotated-sorted-array', 'NEAR-MISS pivots on nums[0]', false, `class Solution:
    def findMin(self, nums):
        l, r = 0, len(nums) - 1
        while l < r:
            m = (l + r) // 2
            if nums[m] >= nums[0]: l = m + 1
            else: r = m
        return nums[l]`],
	['find-minimum-in-rotated-sorted-array', 'correct, pivots on nums[r]', true, `class Solution:
    def findMin(self, nums):
        l, r = 0, len(nums) - 1
        while l < r:
            m = (l + r) // 2
            if nums[m] > nums[r]: l = m + 1
            else: r = m
        return nums[l]`],

	// On a two-element window mid == lo, so the strict test takes the wrong branch. Chance produced
	// one such case in 43; the generator now builds the shape outright.
	['search-in-rotated-sorted-array', 'NEAR-MISS strict nums[l] < nums[m]', false, `class Solution:
    def search(self, nums, target):
        l, r = 0, len(nums) - 1
        while l <= r:
            m = (l + r) // 2
            if nums[m] == target: return m
            if nums[l] < nums[m]:
                if nums[l] <= target < nums[m]: r = m - 1
                else: l = m + 1
            else:
                if nums[m] < target <= nums[r]: l = m + 1
                else: r = m - 1
        return -1`],
	['search-in-rotated-sorted-array', 'NEAR-MISS picks a side by target >= nums[0]', false, `class Solution:
    def search(self, nums, target):
        n = len(nums); l, r = 0, n - 1
        while l < r:
            m = (l + r) // 2
            if nums[m] > nums[r]: l = m + 1
            else: r = m
        p = l
        lo, hi = (p, n - 1) if target >= nums[0] else (0, p - 1)
        while lo <= hi:
            m = (lo + hi) // 2
            if nums[m] == target: return m
            if nums[m] < target: lo = m + 1
            else: hi = m - 1
        return -1`],
	['search-in-rotated-sorted-array', 'correct', true, `class Solution:
    def search(self, nums, target):
        l, r = 0, len(nums) - 1
        while l <= r:
            m = (l + r) // 2
            if nums[m] == target: return m
            if nums[l] <= nums[m]:
                if nums[l] <= target < nums[m]: r = m - 1
                else: l = m + 1
            else:
                if nums[m] < target <= nums[r]: l = m + 1
                else: r = m - 1
        return -1`],

	['binary-search', 'NEAR-MISS closed interval with an exclusive loop test', false, `class Solution:
    def search(self, nums, target):
        l, r = 0, len(nums) - 1
        while l < r:
            m = (l + r) // 2
            if nums[m] == target: return m
            if nums[m] < target: l = m + 1
            else: r = m - 1
        return -1`],
	['binary-search', 'correct', true, `import bisect
class Solution:
    def search(self, nums, target):
        i = bisect.bisect_left(nums, target)
        return i if i < len(nums) and nums[i] == target else -1`],

	// Flattening with the ROW count is silently right on a square matrix, which is why the suite
	// needs rectangles, and 1x1 is legal but was absent.
	['search-a-2d-matrix', 'NEAR-MISS flattens with the row count', false, `class Solution:
    def searchMatrix(self, matrix, target):
        m, n = len(matrix), len(matrix[0])
        l, r = 0, m * n - 1
        while l <= r:
            mid = (l + r) // 2
            v = matrix[mid // m][mid % m]
            if v == target: return True
            if v < target: l = mid + 1
            else: r = mid - 1
        return False`],
	['search-a-2d-matrix', 'NEAR-MISS bisect_left picks the row after the right one', false, `import bisect
class Solution:
    def searchMatrix(self, matrix, target):
        firsts = [row[0] for row in matrix]
        i = bisect.bisect_left(firsts, target)
        if i >= len(matrix): i = len(matrix) - 1
        row = matrix[i]
        j = bisect.bisect_left(row, target)
        return j < len(row) and row[j] == target`],
	['search-a-2d-matrix', 'correct', true, `class Solution:
    def searchMatrix(self, matrix, target):
        m, n = len(matrix), len(matrix[0])
        l, r = 0, m * n - 1
        while l <= r:
            mid = (l + r) // 2
            v = matrix[mid // n][mid % n]
            if v == target: return True
            if v < target: l = mid + 1
            else: r = mid - 1
        return False`],

	['koko-eating-bananas', 'NEAR-MISS floor instead of ceiling hours', false, `class Solution:
    def minEatingSpeed(self, piles, h):
        l, r = 1, max(piles); res = r
        while l <= r:
            k = (l + r) // 2
            if sum(p // k for p in piles) <= h: res = k; r = k - 1
            else: l = k + 1
        return res`],
	['koko-eating-bananas', 'NEAR-MISS upper bound sum(piles)//h', false, `import math
class Solution:
    def minEatingSpeed(self, piles, h):
        l, r = 1, max(1, sum(piles) // h); res = r
        while l <= r:
            k = (l + r) // 2
            if sum(math.ceil(p / k) for p in piles) <= h: res = k; r = k - 1
            else: l = k + 1
        return res`],
	// hi = max(piles) is the correct tight bound, not a bug: at that speed every pile takes one
	// hour and piles.length <= h is guaranteed. Pinned so it is never "fixed" into a near-miss.
	['koko-eating-bananas', 'correct with hi = max(piles)', true, `import math
class Solution:
    def minEatingSpeed(self, piles, h):
        l, r = 1, max(piles); res = r
        while l <= r:
            k = (l + r) // 2
            if sum(math.ceil(p / k) for p in piles) <= h: res = k; r = k - 1
            else: l = k + 1
        return res`],

	// Python's negative index wraps, so a missing >= 0 guard answers the NEWEST value for a query
	// that precedes every stored timestamp, rather than the empty string.
	['time-based-key-value-store', 'NEAR-MISS no guard, negative index wraps', false, `import bisect
class TimeMap:
    def __init__(self): self.d = {}
    def set(self, key, value, timestamp):
        t, v = self.d.setdefault(key, ([], [])); t.append(timestamp); v.append(value)
    def get(self, key, timestamp):
        if key not in self.d: return ""
        ts, vs = self.d[key]
        return vs[bisect.bisect_right(ts, timestamp) - 1]`],
	['time-based-key-value-store', 'NEAR-MISS bisect_left', false, `import bisect
class TimeMap:
    def __init__(self): self.d = {}
    def set(self, key, value, timestamp):
        t, v = self.d.setdefault(key, ([], [])); t.append(timestamp); v.append(value)
    def get(self, key, timestamp):
        if key not in self.d: return ""
        ts, vs = self.d[key]
        i = bisect.bisect_left(ts, timestamp) - 1
        return vs[i] if i >= 0 else ""`],
	['time-based-key-value-store', 'NEAR-MISS keeps the smallest valid timestamp', false, `class TimeMap:
    def __init__(self): self.d = {}
    def set(self, key, value, timestamp):
        t, v = self.d.setdefault(key, ([], [])); t.append(timestamp); v.append(value)
    def get(self, key, timestamp):
        if key not in self.d: return ""
        ts, vs = self.d[key]
        lo, hi, res = 0, len(ts) - 1, ""
        while lo <= hi:
            m = (lo + hi) // 2
            if ts[m] <= timestamp: res = vs[m]; hi = m - 1
            else: lo = m + 1
        return res`],
	['time-based-key-value-store', 'correct', true, `import bisect
class TimeMap:
    def __init__(self): self.d = {}
    def set(self, key, value, timestamp):
        t, v = self.d.setdefault(key, ([], [])); t.append(timestamp); v.append(value)
    def get(self, key, timestamp):
        if key not in self.d: return ""
        ts, vs = self.d[key]
        i = bisect.bisect_right(ts, timestamp) - 1
        return vs[i] if i >= 0 else ""`],

	// j = half - i only goes negative when the array being searched is the LONGER one, so this
	// needs a heavily skewed pair; with both sides drawn from 0..8 it failed a single case.
	['median-of-two-sorted-arrays', 'NEAR-MISS never swaps to the shorter array', false, `class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        A, B = nums1, nums2
        total = len(A) + len(B); half = (total + 1) // 2
        l, r = 0, len(A)
        while True:
            i = (l + r) // 2; j = half - i
            Aleft = A[i-1] if i > 0 else float("-inf")
            Aright = A[i] if i < len(A) else float("inf")
            Bleft = B[j-1] if j > 0 else float("-inf")
            Bright = B[j] if j < len(B) else float("inf")
            if Aleft <= Bright and Bleft <= Aright:
                if total % 2: return float(max(Aleft, Bleft))
                return (max(Aleft, Bleft) + min(Aright, Bright)) / 2
            if Aleft > Bright: r = i - 1
            else: l = i + 1`],
	['median-of-two-sorted-arrays', 'NEAR-MISS left partition one too small', false, `class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        A, B = (nums1, nums2) if len(nums1) <= len(nums2) else (nums2, nums1)
        total = len(A) + len(B); half = total // 2
        l, r = 0, len(A)
        while True:
            i = (l + r) // 2; j = half - i
            Aleft = A[i-1] if i > 0 else float("-inf")
            Aright = A[i] if i < len(A) else float("inf")
            Bleft = B[j-1] if j > 0 else float("-inf")
            Bright = B[j] if j < len(B) else float("inf")
            if Aleft <= Bright and Bleft <= Aright:
                if total % 2: return float(max(Aleft, Bleft))
                return (max(Aleft, Bleft) + min(Aright, Bright)) / 2
            if Aleft > Bright: r = i - 1
            else: l = i + 1`],
	['median-of-two-sorted-arrays', 'NEAR-MISS integer division on an even total', false, `class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        m = sorted(nums1 + nums2); n = len(m)
        if n % 2: return float(m[n//2])
        return (m[n//2 - 1] + m[n//2]) // 2`],
	['median-of-two-sorted-arrays', 'correct merge', true, `class Solution:
    def findMedianSortedArrays(self, nums1, nums2):
        m = sorted(nums1 + nums2); n = len(m)
        return float(m[n//2]) if n % 2 else (m[n//2 - 1] + m[n//2]) / 2`],

	// ---- batch 6: Linked List ----
	// Both of these return a CIRCULAR list. from_linked used to break out of the cycle silently,
	// which left exactly the values a correct answer has, so both scored 100%. It now marks the
	// cycle, and these pairs are what keep that honest.
	['reverse-linked-list', 'NEAR-MISS prev starts at head, so the tail self-links', false, `class Solution:
    def reverseList(self, head):
        prev, cur = head, head
        while cur:
            nxt = cur.next; cur.next = prev; prev = cur; cur = nxt
        return prev`],
	['reverse-linked-list', 'correct', true, `class Solution:
    def reverseList(self, head):
        prev = None
        while head:
            nxt = head.next; head.next = prev; prev = head; head = nxt
        return prev`],
	['reorder-list', 'NEAR-MISS never cuts the list at the midpoint', false, `class Solution:
    def reorderList(self, head):
        slow = fast = head
        while fast and fast.next:
            slow = slow.next; fast = fast.next.next
        second = slow.next
        prev = None
        while second:
            nxt = second.next; second.next = prev; prev = second; second = nxt
        first, second = head, prev
        while second:
            t1, t2 = first.next, second.next
            first.next = second; second.next = t1
            first, second = t1, t2`],
	['reorder-list', 'correct', true, `class Solution:
    def reorderList(self, head):
        vals = []
        cur = head
        while cur: vals.append(cur.val); cur = cur.next
        out = []
        i, j = 0, len(vals) - 1
        while i <= j:
            out.append(vals[i])
            if i != j: out.append(vals[j])
            i += 1; j -= 1
        cur = head
        for v in out: cur.val = v; cur = cur.next
        return head`],

	// "Appears two or more times", not exactly twice -- which is the assumption the arithmetic
	// tricks make. The generator used to place exactly two copies always.
	['find-the-duplicate-number', 'NEAR-MISS sum formula assumes exactly two copies', false, `class Solution:
    def findDuplicate(self, nums):
        n = len(nums) - 1
        return sum(nums) - n * (n + 1) // 2`],
	['find-the-duplicate-number', 'correct Floyd', true, `class Solution:
    def findDuplicate(self, nums):
        slow = fast = 0
        while True:
            slow = nums[slow]; fast = nums[nums[fast]]
            if slow == fast: break
        slow2 = 0
        while slow != slow2:
            slow = nums[slow]; slow2 = nums[slow2]
        return slow`],

	// Values are not unique, so a map keyed by value collapses the list.
	['copy-list-with-random-pointer', 'NEAR-MISS map keyed by value', false, `class Solution:
    def copyRandomList(self, head):
        if not head: return None
        m = {}
        cur = head
        while cur: m[cur.val] = Node(cur.val); cur = cur.next
        cur = head
        while cur:
            m[cur.val].next = m[cur.next.val] if cur.next else None
            m[cur.val].random = m[cur.random.val] if cur.random else None
            cur = cur.next
        return m[head.val]`],
	['copy-list-with-random-pointer', 'correct, keyed by node', true, `class Solution:
    def copyRandomList(self, head):
        m = {None: None}
        cur = head
        while cur: m[cur] = Node(cur.val); cur = cur.next
        cur = head
        while cur:
            m[cur].next = m[cur.next]; m[cur].random = m[cur.random]; cur = cur.next
        return m[head]`],

	['remove-nth-node-from-end-of-list', 'NEAR-MISS no dummy, cannot remove the head', false, `class Solution:
    def removeNthFromEnd(self, head, n):
        fast = head
        for _ in range(n): fast = fast.next
        slow = head
        while fast.next: fast = fast.next; slow = slow.next
        slow.next = slow.next.next
        return head`],
	['remove-nth-node-from-end-of-list', 'correct with a dummy', true, `class Solution:
    def removeNthFromEnd(self, head, n):
        dummy = ListNode(0, head)
        fast = slow = dummy
        for _ in range(n): fast = fast.next
        while fast.next: fast = fast.next; slow = slow.next
        slow.next = slow.next.next
        return dummy.next`],

	['reverse-nodes-in-k-group', 'NEAR-MISS reverses the trailing short group', false, `class Solution:
    def reverseKGroup(self, head, k):
        vals = []
        cur = head
        while cur: vals.append(cur.val); cur = cur.next
        out = []
        for i in range(0, len(vals), k): out += vals[i:i+k][::-1]
        cur = head
        for v in out: cur.val = v; cur = cur.next
        return head`],
	['reverse-nodes-in-k-group', 'correct', true, `class Solution:
    def reverseKGroup(self, head, k):
        vals = []
        cur = head
        while cur: vals.append(cur.val); cur = cur.next
        out = []
        for i in range(0, len(vals), k):
            g = vals[i:i+k]
            out += g[::-1] if len(g) == k else g
        cur = head
        for v in out: cur.val = v; cur = cur.next
        return head`],

	['add-two-numbers', 'NEAR-MISS drops the final carry', false, `class Solution:
    def addTwoNumbers(self, l1, l2):
        dummy = ListNode(); cur = dummy; carry = 0
        while l1 or l2:
            a = l1.val if l1 else 0; b = l2.val if l2 else 0
            s = a + b + carry; carry = s // 10
            cur.next = ListNode(s % 10); cur = cur.next
            l1 = l1.next if l1 else None; l2 = l2.next if l2 else None
        return dummy.next`],
	['add-two-numbers', 'correct', true, `class Solution:
    def addTwoNumbers(self, l1, l2):
        dummy = ListNode(); cur = dummy; carry = 0
        while l1 or l2 or carry:
            a = l1.val if l1 else 0; b = l2.val if l2 else 0
            s = a + b + carry; carry = s // 10
            cur.next = ListNode(s % 10); cur = cur.next
            l1 = l1.next if l1 else None; l2 = l2.next if l2 else None
        return dummy.next`],

	['merge-two-sorted-lists', 'NEAR-MISS never attaches the remainder', false, `class Solution:
    def mergeTwoLists(self, list1, list2):
        dummy = ListNode(); cur = dummy
        while list1 and list2:
            if list1.val <= list2.val: cur.next = list1; list1 = list1.next
            else: cur.next = list2; list2 = list2.next
            cur = cur.next
        return dummy.next`],
	['merge-two-sorted-lists', 'correct', true, `class Solution:
    def mergeTwoLists(self, list1, list2):
        dummy = ListNode(); cur = dummy
        while list1 and list2:
            if list1.val <= list2.val: cur.next = list1; list1 = list1.next
            else: cur.next = list2; list2 = list2.next
            cur = cur.next
        cur.next = list1 or list2
        return dummy.next`],

	// Two lists starting on the same value make Python fall through to comparing ListNodes.
	['merge-k-sorted-lists', 'NEAR-MISS heap tuple with no tiebreaker', false, `import heapq
class Solution:
    def mergeKLists(self, lists):
        h = []
        for node in lists:
            if node: heapq.heappush(h, (node.val, node))
        dummy = ListNode(); cur = dummy
        while h:
            _, node = heapq.heappop(h)
            cur.next = node; cur = node
            if node.next: heapq.heappush(h, (node.next.val, node.next))
        cur.next = None
        return dummy.next`],
	['merge-k-sorted-lists', 'correct with an index tiebreaker', true, `import heapq
class Solution:
    def mergeKLists(self, lists):
        h = []
        for i, node in enumerate(lists):
            if node: heapq.heappush(h, (node.val, i, node))
        dummy = ListNode(); cur = dummy
        while h:
            _, i, node = heapq.heappop(h)
            cur.next = node; cur = node
            if node.next: heapq.heappush(h, (node.next.val, i, node.next))
        cur.next = None
        return dummy.next`],

	// Node values span the full range, so no value is a safe "visited" marker.
	['linked-list-cycle', 'NEAR-MISS marks visited nodes with -1', false, `class Solution:
    def hasCycle(self, head):
        while head:
            if head.val == -1: return True
            head.val = -1
            head = head.next
        return False`],
	['linked-list-cycle', 'correct Floyd', true, `class Solution:
    def hasCycle(self, head):
        slow = fast = head
        while fast and fast.next:
            slow = slow.next; fast = fast.next.next
            if slow is fast: return True
        return False`],

	// Three separate recency bugs, none of which one sequence catches.
	['lru-cache', 'NEAR-MISS put on an existing key does not refresh recency', false, `class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity; self.d = {}; self.order = []
    def get(self, key):
        if key not in self.d: return -1
        self.order.remove(key); self.order.append(key)
        return self.d[key]
    def put(self, key, value):
        if key in self.d:
            self.d[key] = value
            return
        if len(self.d) >= self.cap:
            old = self.order.pop(0); del self.d[old]
        self.d[key] = value; self.order.append(key)`],
	['lru-cache', 'NEAR-MISS get does not refresh recency', false, `class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity; self.d = {}; self.order = []
    def get(self, key): return self.d.get(key, -1)
    def put(self, key, value):
        if key in self.d: self.order.remove(key)
        elif len(self.d) >= self.cap:
            old = self.order.pop(0); del self.d[old]
        self.d[key] = value; self.order.append(key)`],
	['lru-cache', 'correct', true, `from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity; self.d = OrderedDict()
    def get(self, key):
        if key not in self.d: return -1
        self.d.move_to_end(key); return self.d[key]
    def put(self, key, value):
        if key in self.d: self.d.move_to_end(key)
        self.d[key] = value
        if len(self.d) > self.cap: self.d.popitem(last=False)`]
];

let bad = 0;
for (const [slug, label, mustPass, src] of cases) {
	const r = run(slug, src);
	const ok = mustPass ? r.passed === r.total : r.passed < r.total;
	if (!ok) bad++;
	let why = '';
	if (!ok && mustPass && r.first) {
		const d = r.first;
		why = `  <-- ${(d.error ?? `args ${JSON.stringify(d.args)} exp ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`).slice(0, 110)}`;
	}
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${slug.padEnd(46)} ${label.padEnd(50)} ${String(r.passed).padStart(3)}/${r.total}${why}`);
}
console.log(`\n${cases.length - bad}/${cases.length} audit expectations held`);
process.exit(bad ? 1 : 0);
