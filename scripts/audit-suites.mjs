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
        if len(self.d) > self.cap: self.d.popitem(last=False)`],

	// ---- batch 7: Trees ----
	// Trees that were either valid BSTs or random jumbles tested neither classic bug: both scored
	// 42/42. The generator now also builds trees that are only subtly wrong.
	['validate-binary-search-tree', 'NEAR-MISS compares a node only with its own children', false, `class Solution:
    def isValidBST(self, root):
        def go(n):
            if not n: return True
            if n.left and n.left.val >= n.val: return False
            if n.right and n.right.val <= n.val: return False
            return go(n.left) and go(n.right)
        return go(root)`],
	['validate-binary-search-tree', 'NEAR-MISS in-order accepts equal neighbours', false, `class Solution:
    def isValidBST(self, root):
        out = []
        def go(n):
            if not n: return
            go(n.left); out.append(n.val); go(n.right)
        go(root)
        return all(out[i] <= out[i+1] for i in range(len(out)-1))`],
	['validate-binary-search-tree', 'correct, bounds carried down', true, `class Solution:
    def isValidBST(self, root):
        def go(n, lo, hi):
            if not n: return True
            if not (lo < n.val < hi): return False
            return go(n.left, lo, n.val) and go(n.right, n.val, hi)
        return go(root, float("-inf"), float("inf"))`],

	// A randomly drawn subRoot is never a subtree, so one case in 42 answered true.
	['subtree-of-another-tree', 'NEAR-MISS always false', false, `class Solution:
    def isSubtree(self, root, subRoot): return False`],
	['subtree-of-another-tree', 'NEAR-MISS stops when subRoot runs out', false, `class Solution:
    def isSubtree(self, root, subRoot):
        def same(a, b):
            if not b: return True
            if not a: return False
            return a.val == b.val and same(a.left, b.left) and same(a.right, b.right)
        def go(a):
            if not a: return False
            return same(a, subRoot) or go(a.left) or go(a.right)
        return go(root)`],
	['subtree-of-another-tree', 'correct', true, `class Solution:
    def isSubtree(self, root, subRoot):
        def same(a, b):
            if not a and not b: return True
            if not a or not b: return False
            return a.val == b.val and same(a.left, b.left) and same(a.right, b.right)
        def go(a):
            if not a: return False
            return same(a, subRoot) or go(a.left) or go(a.right)
        return go(root)`],

	// The answer is in EDGES, and the interesting shape is a diameter the root cannot see.
	['diameter-of-binary-tree', 'NEAR-MISS measures only through the root', false, `class Solution:
    def diameterOfBinaryTree(self, root):
        def h(n): return 0 if not n else 1 + max(h(n.left), h(n.right))
        return h(root.left) + h(root.right) if root else 0`],
	['diameter-of-binary-tree', 'NEAR-MISS counts nodes, not edges', false, `class Solution:
    def diameterOfBinaryTree(self, root):
        best = 0
        def h(n):
            nonlocal best
            if not n: return 0
            l, r = h(n.left), h(n.right); best = max(best, l + r + 1); return 1 + max(l, r)
        h(root); return best`],
	['diameter-of-binary-tree', 'correct', true, `class Solution:
    def diameterOfBinaryTree(self, root):
        best = 0
        def h(n):
            nonlocal best
            if not n: return 0
            l, r = h(n.left), h(n.right); best = max(best, l + r); return 1 + max(l, r)
        h(root); return best`],

	// The path is non-empty, so an all-negative tree answers with its largest single node.
	['binary-tree-maximum-path-sum', 'NEAR-MISS best initialised to 0', false, `class Solution:
    def maxPathSum(self, root):
        best = 0
        def go(n):
            nonlocal best
            if not n: return 0
            l = max(go(n.left), 0); r = max(go(n.right), 0)
            best = max(best, n.val + l + r)
            return n.val + max(l, r)
        go(root); return best`],
	['binary-tree-maximum-path-sum', 'NEAR-MISS child contributions not clamped', false, `class Solution:
    def maxPathSum(self, root):
        best = float("-inf")
        def go(n):
            nonlocal best
            if not n: return 0
            l, r = go(n.left), go(n.right)
            best = max(best, n.val + l + r)
            return n.val + max(l, r)
        go(root); return int(best)`],
	['binary-tree-maximum-path-sum', 'correct', true, `class Solution:
    def maxPathSum(self, root):
        best = float("-inf")
        def go(n):
            nonlocal best
            if not n: return 0
            l = max(go(n.left), 0); r = max(go(n.right), 0)
            best = max(best, n.val + l + r)
            return n.val + max(l, r)
        go(root); return int(best)`],

	['count-good-nodes-in-binary-tree', 'NEAR-MISS running maximum seeded at 0', false, `class Solution:
    def goodNodes(self, root):
        def go(n, mx):
            if not n: return 0
            good = 1 if n.val >= mx else 0
            m = max(mx, n.val)
            return good + go(n.left, m) + go(n.right, m)
        return go(root, 0)`],
	// Ties count as good, so a strict comparison undercounts.
	['count-good-nodes-in-binary-tree', 'NEAR-MISS strict greater-than', false, `class Solution:
    def goodNodes(self, root):
        def go(n, mx):
            if not n: return 0
            good = 1 if n.val > mx else 0
            m = max(mx, n.val)
            return good + go(n.left, m) + go(n.right, m)
        return go(root, float("-inf"))`],
	['count-good-nodes-in-binary-tree', 'correct', true, `class Solution:
    def goodNodes(self, root):
        def go(n, mx):
            if not n: return 0
            good = 1 if n.val >= mx else 0
            m = max(mx, n.val)
            return good + go(n.left, m) + go(n.right, m)
        return go(root, float("-inf"))`],

	// [1,2] and [1,null,2] have identical value sequences and mirrored shapes.
	['same-tree', 'NEAR-MISS compares preorder values with no null markers', false, `class Solution:
    def isSameTree(self, p, q):
        def enc(n):
            return [] if not n else [n.val] + enc(n.left) + enc(n.right)
        return enc(p) == enc(q)`],
	['same-tree', 'correct', true, `class Solution:
    def isSameTree(self, p, q):
        if not p and not q: return True
        if not p or not q: return False
        return p.val == q.val and self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)`],

	['binary-tree-right-side-view', 'NEAR-MISS walks the right-child chain', false, `class Solution:
    def rightSideView(self, root):
        out = []
        while root: out.append(root.val); root = root.right
        return out`],
	['binary-tree-right-side-view', 'NEAR-MISS depth-first, left before right', false, `class Solution:
    def rightSideView(self, root):
        out = []
        def go(n, d):
            if not n: return
            if d == len(out): out.append(n.val)
            go(n.left, d + 1); go(n.right, d + 1)
        go(root, 0); return out`],
	['binary-tree-right-side-view', 'correct', true, `class Solution:
    def rightSideView(self, root):
        out = []
        def go(n, d):
            if not n: return
            if d == len(out): out.append(n.val)
            go(n.right, d + 1); go(n.left, d + 1)
        go(root, 0); return out`],

	['invert-binary-tree', 'NEAR-MISS second assignment reads the first', false, `class Solution:
    def invertTree(self, root):
        if not root: return None
        root.left = self.invertTree(root.right)
        root.right = self.invertTree(root.left)
        return root`],
	['invert-binary-tree', 'correct', true, `class Solution:
    def invertTree(self, root):
        if not root: return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`],

	// p may be an ancestor of q, and nothing says p.val < q.val.
	['lowest-common-ancestor-of-a-binary-search-tree', 'NEAR-MISS assumes p.val < q.val', false, `class Solution:
    def lowestCommonAncestor(self, root, p, q):
        node = root
        while node:
            if q.val < node.val: node = node.left
            elif p.val > node.val: node = node.right
            else: return node
        return None`],
	['lowest-common-ancestor-of-a-binary-search-tree', 'correct', true, `class Solution:
    def lowestCommonAncestor(self, root, p, q):
        node = root
        while node:
            if p.val < node.val and q.val < node.val: node = node.left
            elif p.val > node.val and q.val > node.val: node = node.right
            else: return node
        return None`],

	['kth-smallest-element-in-a-bst', 'NEAR-MISS treats k as zero-indexed', false, `class Solution:
    def kthSmallest(self, root, k):
        out = []
        def go(n):
            if not n: return
            go(n.left); out.append(n.val); go(n.right)
        go(root); return out[k]`],
	['kth-smallest-element-in-a-bst', 'correct', true, `class Solution:
    def kthSmallest(self, root, k):
        out = []
        def go(n):
            if not n: return
            go(n.left); out.append(n.val); go(n.right)
        go(root); return out[k - 1]`],

	['construct-binary-tree-from-preorder-and-inorder-traversal', 'NEAR-MISS global in-order index used as the left size', false, `class Solution:
    def buildTree(self, preorder, inorder):
        idx = {v: i for i, v in enumerate(inorder)}
        def go(pl, pr, il, ir):
            if pl > pr: return None
            root = TreeNode(preorder[pl])
            m = idx[preorder[pl]]
            root.left = go(pl + 1, pl + m, il, m - 1)
            root.right = go(pl + m + 1, pr, m + 1, ir)
            return root
        return go(0, len(preorder) - 1, 0, len(inorder) - 1)`],
	['construct-binary-tree-from-preorder-and-inorder-traversal', 'correct', true, `class Solution:
    def buildTree(self, preorder, inorder):
        idx = {v: i for i, v in enumerate(inorder)}
        def go(pl, pr, il, ir):
            if pl > pr: return None
            root = TreeNode(preorder[pl])
            m = idx[preorder[pl]]
            left = m - il
            root.left = go(pl + 1, pl + left, il, m - 1)
            root.right = go(pl + left + 1, pr, m + 1, ir)
            return root
        return go(0, len(preorder) - 1, 0, len(inorder) - 1)`],

	// Values are negative and multi-digit, so one character per node cannot round-trip.
	['serialize-and-deserialize-binary-tree', 'NEAR-MISS one character per node', false, `class Codec:
    def serialize(self, root):
        out = []
        def go(n):
            if not n: out.append("#"); return
            out.append(str(n.val)); go(n.left); go(n.right)
        go(root); return "".join(out)
    def deserialize(self, data):
        it = iter(data)
        def go():
            c = next(it, None)
            if c is None or c == "#": return None
            n = TreeNode(int(c)); n.left = go(); n.right = go(); return n
        return go()`],
	['serialize-and-deserialize-binary-tree', 'correct, comma separated', true, `class Codec:
    def serialize(self, root):
        out = []
        def go(n):
            if not n: out.append("#"); return
            out.append(str(n.val)); go(n.left); go(n.right)
        go(root); return ",".join(out)
    def deserialize(self, data):
        it = iter(data.split(","))
        def go():
            c = next(it, None)
            if c is None or c == "#": return None
            n = TreeNode(int(c)); n.left = go(); n.right = go(); return n
        return go()`],

	['maximum-depth-of-binary-tree', 'NEAR-MISS minimum depth', false, `class Solution:
    def maxDepth(self, root):
        if not root: return 0
        return 1 + min(self.maxDepth(root.left), self.maxDepth(root.right))`],
	['maximum-depth-of-binary-tree', 'correct', true, `class Solution:
    def maxDepth(self, root):
        if not root: return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))`],

	// Balance is a property of every node, not just the root.
	['balanced-binary-tree', 'NEAR-MISS checks the height difference at the root only', false, `class Solution:
    def isBalanced(self, root):
        def h(n): return 0 if not n else 1 + max(h(n.left), h(n.right))
        return abs(h(root.left) - h(root.right)) <= 1 if root else True`],
	['balanced-binary-tree', 'correct', true, `class Solution:
    def isBalanced(self, root):
        def h(n):
            if not n: return 0
            l, r = h(n.left), h(n.right)
            if l < 0 or r < 0 or abs(l - r) > 1: return -1
            return 1 + max(l, r)
        return h(root) >= 0`],

	['binary-tree-level-order-traversal', 'NEAR-MISS never groups by level', false, `class Solution:
    def levelOrder(self, root):
        if not root: return []
        out, q = [], [root]
        while q:
            n = q.pop(0)
            out.append(n.val)
            if n.left: q.append(n.left)
            if n.right: q.append(n.right)
        return [out]`],
	['binary-tree-level-order-traversal', 'correct', true, `class Solution:
    def levelOrder(self, root):
        if not root: return []
        out, q = [], [root]
        while q:
            level = []
            for _ in range(len(q)):
                n = q.pop(0)
                level.append(n.val)
                if n.left: q.append(n.left)
                if n.right: q.append(n.right)
            out.append(level)
        return out`],

	// ---- batch 8: Tries ----
	['implement-trie-prefix-tree', 'NEAR-MISS no end-of-word marker', false, `class Trie:
    def __init__(self): self.root = {}
    def insert(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
    def search(self, word):
        n = self.root
        for c in word:
            if c not in n: return False
            n = n[c]
        return True
    def startsWith(self, prefix):
        n = self.root
        for c in prefix:
            if c not in n: return False
            n = n[c]
        return True`],
	['implement-trie-prefix-tree', 'NEAR-MISS startsWith requires a whole word', false, `class Trie:
    def __init__(self): self.root = {}
    def insert(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
        n["#"] = True
    def search(self, word):
        n = self.root
        for c in word:
            if c not in n: return False
            n = n[c]
        return "#" in n
    def startsWith(self, prefix):
        n = self.root
        for c in prefix:
            if c not in n: return False
            n = n[c]
        return "#" in n`],
	['implement-trie-prefix-tree', 'correct', true, `class Trie:
    def __init__(self): self.root = {}
    def insert(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
        n["#"] = True
    def search(self, word):
        n = self.root
        for c in word:
            if c not in n: return False
            n = n[c]
        return "#" in n
    def startsWith(self, prefix):
        n = self.root
        for c in prefix:
            if c not in n: return False
            n = n[c]
        return True`],

	// A wildcard must try every branch, and a pattern that runs out is not a match unless a word
	// ends exactly there.
	['design-add-and-search-words-data-structure', 'NEAR-MISS wildcard takes only the first child', false, `class WordDictionary:
    def __init__(self): self.root = {}
    def addWord(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
        n["#"] = True
    def search(self, word):
        def go(n, i):
            if i == len(word): return "#" in n
            c = word[i]
            if c == ".":
                for k, v in n.items():
                    if k == "#": continue
                    return go(v, i + 1)
                return False
            return go(n[c], i + 1) if c in n else False
        return go(self.root, 0)`],
	['design-add-and-search-words-data-structure', 'NEAR-MISS no end-of-word check at the pattern end', false, `class WordDictionary:
    def __init__(self): self.root = {}
    def addWord(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
        n["#"] = True
    def search(self, word):
        def go(n, i):
            if i == len(word): return True
            c = word[i]
            if c == ".":
                return any(go(v, i + 1) for k, v in n.items() if k != "#")
            return go(n[c], i + 1) if c in n else False
        return go(self.root, 0)`],
	['design-add-and-search-words-data-structure', 'correct', true, `class WordDictionary:
    def __init__(self): self.root = {}
    def addWord(self, word):
        n = self.root
        for c in word: n = n.setdefault(c, {})
        n["#"] = True
    def search(self, word):
        def go(n, i):
            if i == len(word): return "#" in n
            c = word[i]
            if c == ".":
                return any(go(v, i + 1) for k, v in n.items() if k != "#")
            return go(n[c], i + 1) if c in n else False
        return go(self.root, 0)`],

	// The unordered comparison sorts rather than de-duplicating, so a repeated word still fails.
	['word-search-ii', 'NEAR-MISS never un-marks a cell on backtrack', false, `class Solution:
    def findWords(self, board, words):
        rows, cols = len(board), len(board[0])
        out = set()
        def go(r, c, w, i):
            if i == len(w): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != w[i]: return False
            board[r][c] = "#"
            ok = any(go(r+dr, c+dc, w, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            if ok: board[r][c] = w[i]
            return ok
        for w in words:
            for r in range(rows):
                for c in range(cols):
                    if go(r, c, w, 0): out.add(w)
        return list(out)`],
	['word-search-ii', 'NEAR-MISS emits a word once per successful path', false, `class Solution:
    def findWords(self, board, words):
        rows, cols = len(board), len(board[0])
        out = []
        def go(r, c, w, i):
            if i == len(w): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != w[i]: return False
            t = board[r][c]; board[r][c] = "#"
            ok = any(go(r+dr, c+dc, w, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            board[r][c] = t
            return ok
        for w in words:
            for r in range(rows):
                for c in range(cols):
                    if go(r, c, w, 0): out.append(w)
        return out`],
	['word-search-ii', 'correct', true, `class Solution:
    def findWords(self, board, words):
        rows, cols = len(board), len(board[0])
        out = set()
        def go(r, c, w, i):
            if i == len(w): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != w[i]: return False
            t = board[r][c]; board[r][c] = "#"
            ok = any(go(r+dr, c+dc, w, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            board[r][c] = t
            return ok
        for w in words:
            if any(go(r, c, w, 0) for r in range(rows) for c in range(cols)): out.add(w)
        return list(out)`],

	// ---- batch 9: Heap / Priority Queue ----
	// Tweet ids are unique but not increasing over time. The generator handed them out in order,
	// which made id order stand in for post order, so this scored 42/42.
	['design-twitter', 'NEAR-MISS orders the feed by tweet id', false, `class Twitter:
    def __init__(self): self.tweets = {}; self.follows = {}
    def postTweet(self, userId, tweetId): self.tweets.setdefault(userId, []).append(tweetId)
    def getNewsFeed(self, userId):
        feed = list(self.tweets.get(userId, []))
        for u in self.follows.get(userId, set()): feed += self.tweets.get(u, [])
        feed.sort(reverse=True)
        return feed[:10]
    def follow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).add(followeeId)
    def unfollow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).discard(followeeId)`],
	['design-twitter', 'NEAR-MISS omits the user own tweets', false, `class Twitter:
    def __init__(self): self.t = 0; self.tweets = {}; self.follows = {}
    def postTweet(self, userId, tweetId):
        self.t += 1; self.tweets.setdefault(userId, []).append((self.t, tweetId))
    def getNewsFeed(self, userId):
        feed = []
        for u in self.follows.get(userId, set()): feed += self.tweets.get(u, [])
        feed.sort(reverse=True)
        return [tid for _, tid in feed[:10]]
    def follow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).add(followeeId)
    def unfollow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).discard(followeeId)`],
	['design-twitter', 'NEAR-MISS oldest first', false, `class Twitter:
    def __init__(self): self.t = 0; self.tweets = {}; self.follows = {}
    def postTweet(self, userId, tweetId):
        self.t += 1; self.tweets.setdefault(userId, []).append((self.t, tweetId))
    def getNewsFeed(self, userId):
        feed = list(self.tweets.get(userId, []))
        for u in self.follows.get(userId, set()):
            if u != userId: feed += self.tweets.get(u, [])
        feed.sort()
        return [tid for _, tid in feed[:10]]
    def follow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).add(followeeId)
    def unfollow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).discard(followeeId)`],
	['design-twitter', 'correct', true, `class Twitter:
    def __init__(self): self.t = 0; self.tweets = {}; self.follows = {}
    def postTweet(self, userId, tweetId):
        self.t += 1; self.tweets.setdefault(userId, []).append((self.t, tweetId))
    def getNewsFeed(self, userId):
        feed = list(self.tweets.get(userId, []))
        for u in self.follows.get(userId, set()):
            if u != userId: feed += self.tweets.get(u, [])
        feed.sort(reverse=True)
        return [tid for _, tid in feed[:10]]
    def follow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).add(followeeId)
    def unfollow(self, followerId, followeeId): self.follows.setdefault(followerId, set()).discard(followeeId)`],

	// Many distinct tasks fill every idle slot and then overflow the frame, so the frame formula
	// must be clamped to the number of tasks.
	['task-scheduler', 'NEAR-MISS frame formula not clamped to len(tasks)', false, `from collections import Counter
class Solution:
    def leastInterval(self, tasks, n):
        c = Counter(tasks); m = max(c.values()); k = sum(1 for v in c.values() if v == m)
        return (m - 1) * (n + 1) + k`],
	['task-scheduler', 'NEAR-MISS ignores how many tasks tie at the maximum', false, `from collections import Counter
class Solution:
    def leastInterval(self, tasks, n):
        c = Counter(tasks); m = max(c.values())
        return max(len(tasks), (m - 1) * (n + 1) + 1)`],
	['task-scheduler', 'correct', true, `from collections import Counter
class Solution:
    def leastInterval(self, tasks, n):
        c = Counter(tasks); m = max(c.values()); k = sum(1 for v in c.values() if v == m)
        return max(len(tasks), (m - 1) * (n + 1) + k)`],

	// "the kth largest element in sorted order, not the kth distinct element"
	['kth-largest-element-in-an-array', 'NEAR-MISS kth DISTINCT largest', false, `class Solution:
    def findKthLargest(self, nums, k):
        return sorted(set(nums), reverse=True)[k - 1]`],
	['kth-largest-element-in-an-array', 'NEAR-MISS reads the wrong end of the heap', false, `import heapq
class Solution:
    def findKthLargest(self, nums, k):
        h = []
        for n in nums:
            heapq.heappush(h, n)
            if len(h) > k: heapq.heappop(h)
        return h[-1]`],
	['kth-largest-element-in-an-array', 'correct', true, `class Solution:
    def findKthLargest(self, nums, k): return sorted(nums)[-k]`],

	['kth-largest-element-in-a-stream', 'NEAR-MISS kth DISTINCT largest', false, `class KthLargest:
    def __init__(self, k, nums): self.k = k; self.vals = list(nums)
    def add(self, val):
        self.vals.append(val)
        return sorted(set(self.vals), reverse=True)[self.k - 1]`],
	['kth-largest-element-in-a-stream', 'NEAR-MISS heap grows past k', false, `import heapq
class KthLargest:
    def __init__(self, k, nums):
        self.k = k; self.h = list(nums); heapq.heapify(self.h)
    def add(self, val):
        heapq.heappush(self.h, val)
        return self.h[0]`],
	['kth-largest-element-in-a-stream', 'correct', true, `import heapq
class KthLargest:
    def __init__(self, k, nums):
        self.k = k; self.h = list(nums); heapq.heapify(self.h)
        while len(self.h) > k: heapq.heappop(self.h)
    def add(self, val):
        heapq.heappush(self.h, val)
        if len(self.h) > self.k: heapq.heappop(self.h)
        return self.h[0]`],

	// Every stone can be destroyed, and then there is no heap top to read.
	['last-stone-weight', 'NEAR-MISS no empty-heap guard', false, `import heapq
class Solution:
    def lastStoneWeight(self, stones):
        h = [-s for s in stones]; heapq.heapify(h)
        while len(h) > 1:
            a = -heapq.heappop(h); b = -heapq.heappop(h)
            if a != b: heapq.heappush(h, -(a - b))
        return -h[0]`],
	['last-stone-weight', 'correct', true, `import heapq
class Solution:
    def lastStoneWeight(self, stones):
        h = [-s for s in stones]; heapq.heapify(h)
        while len(h) > 1:
            a = -heapq.heappop(h); b = -heapq.heappop(h)
            if a != b: heapq.heappush(h, -(a - b))
        return -h[0] if h else 0`],

	['find-median-from-data-stream', 'NEAR-MISS integer division on an even count', false, `class MedianFinder:
    def __init__(self): self.a = []
    def addNum(self, num):
        import bisect; bisect.insort(self.a, num)
    def findMedian(self):
        n = len(self.a)
        return float(self.a[n//2]) if n % 2 else (self.a[n//2 - 1] + self.a[n//2]) // 2`],
	['find-median-from-data-stream', 'NEAR-MISS two heaps, never rebalanced', false, `import heapq
class MedianFinder:
    def __init__(self): self.lo = []; self.hi = []
    def addNum(self, num):
        if self.lo and num < -self.lo[0]: heapq.heappush(self.lo, -num)
        else: heapq.heappush(self.hi, num)
    def findMedian(self):
        if len(self.lo) > len(self.hi): return float(-self.lo[0])
        if len(self.hi) > len(self.lo): return float(self.hi[0])
        return (-self.lo[0] + self.hi[0]) / 2`],
	['find-median-from-data-stream', 'correct', true, `import heapq
class MedianFinder:
    def __init__(self): self.lo = []; self.hi = []
    def addNum(self, num):
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if len(self.hi) > len(self.lo): heapq.heappush(self.lo, -heapq.heappop(self.hi))
    def findMedian(self):
        if len(self.lo) > len(self.hi): return float(-self.lo[0])
        return (-self.lo[0] + self.hi[0]) / 2`],

	// ---- batch 10: Backtracking ----
	// A false negative: a dead-ended attempt leaves letters blanked, so a later start that would
	// succeed cannot see them. It needs a word that really is on the board, reachable by a path
	// other than the first one tried, and random words over random boards almost never are.
	['word-search', 'NEAR-MISS never restores a cell it marked', false, `class Solution:
    def exist(self, board, word):
        rows, cols = len(board), len(board[0])
        def go(r, c, i):
            if i == len(word): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != word[i]: return False
            board[r][c] = "#"
            ok = any(go(r+dr, c+dc, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            if ok: board[r][c] = word[i]
            return ok
        return any(go(r, c, 0) for r in range(rows) for c in range(cols))`],
	['word-search', 'NEAR-MISS case-insensitive', false, `class Solution:
    def exist(self, board, word):
        rows, cols = len(board), len(board[0])
        w = word.lower()
        def go(r, c, i):
            if i == len(w): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c].lower() != w[i]: return False
            t = board[r][c]; board[r][c] = "#"
            ok = any(go(r+dr, c+dc, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            board[r][c] = t
            return ok
        return any(go(r, c, 0) for r in range(rows) for c in range(cols))`],
	['word-search', 'NEAR-MISS allows diagonal steps', false, `class Solution:
    def exist(self, board, word):
        rows, cols = len(board), len(board[0])
        def go(r, c, i, seen):
            if i == len(word): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or (r,c) in seen or board[r][c] != word[i]: return False
            seen.add((r,c))
            for dr in (-1,0,1):
                for dc in (-1,0,1):
                    if (dr or dc) and go(r+dr, c+dc, i+1, seen): return True
            seen.discard((r,c)); return False
        return any(go(r, c, 0, set()) for r in range(rows) for c in range(cols))`],
	['word-search', 'correct', true, `class Solution:
    def exist(self, board, word):
        rows, cols = len(board), len(board[0])
        def go(r, c, i):
            if i == len(word): return True
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != word[i]: return False
            t = board[r][c]; board[r][c] = "#"
            ok = any(go(r+dr, c+dc, i+1) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
            board[r][c] = t
            return ok
        return any(go(r, c, 0) for r in range(rows) for c in range(cols))`],

	// Both diagonals need their own bookkeeping; one set for both over-prunes to nothing.
	['n-queens', 'NEAR-MISS tracks one diagonal only', false, `class Solution:
    def solveNQueens(self, n):
        out = []; cols = set(); diag = set(); board = [["."]*n for _ in range(n)]
        def go(r):
            if r == n: out.append(["".join(x) for x in board]); return
            for c in range(n):
                if c in cols or (r - c) in diag: continue
                cols.add(c); diag.add(r - c); board[r][c] = "Q"
                go(r + 1)
                cols.discard(c); diag.discard(r - c); board[r][c] = "."
        go(0); return out`],
	['n-queens', 'NEAR-MISS one shared set for both diagonals', false, `class Solution:
    def solveNQueens(self, n):
        out = []; cols = set(); diag = set(); board = [["."]*n for _ in range(n)]
        def go(r):
            if r == n: out.append(["".join(x) for x in board]); return
            for c in range(n):
                if c in cols or (r - c) in diag or (r + c) in diag: continue
                cols.add(c); diag.add(r - c); diag.add(r + c); board[r][c] = "Q"
                go(r + 1)
                cols.discard(c); diag.discard(r - c); diag.discard(r + c); board[r][c] = "."
        go(0); return out`],
	['n-queens', 'correct', true, `class Solution:
    def solveNQueens(self, n):
        out = []; cols = set(); d1 = set(); d2 = set(); board = [["."]*n for _ in range(n)]
        def go(r):
            if r == n: out.append(["".join(x) for x in board]); return
            for c in range(n):
                if c in cols or (r - c) in d1 or (r + c) in d2: continue
                cols.add(c); d1.add(r - c); d2.add(r + c); board[r][c] = "Q"
                go(r + 1)
                cols.discard(c); d1.discard(r - c); d2.discard(r + c); board[r][c] = "."
        go(0); return out`],

	// The duplicate skip belongs at THIS level of the recursion, not the whole array.
	['subsets-ii', 'NEAR-MISS skip test i > 0 instead of i > start', false, `class Solution:
    def subsetsWithDup(self, nums):
        nums.sort(); out = []
        def go(start, cur):
            out.append(cur[:])
            for i in range(start, len(nums)):
                if i > 0 and nums[i] == nums[i-1]: continue
                cur.append(nums[i]); go(i + 1, cur); cur.pop()
        go(0, []); return out`],
	['subsets-ii', 'NEAR-MISS no duplicate skip', false, `class Solution:
    def subsetsWithDup(self, nums):
        nums.sort(); out = []
        def go(start, cur):
            out.append(cur[:])
            for i in range(start, len(nums)):
                cur.append(nums[i]); go(i + 1, cur); cur.pop()
        go(0, []); return out`],
	['subsets-ii', 'correct', true, `class Solution:
    def subsetsWithDup(self, nums):
        nums.sort(); out = []
        def go(start, cur):
            out.append(cur[:])
            for i in range(start, len(nums)):
                if i > start and nums[i] == nums[i-1]: continue
                cur.append(nums[i]); go(i + 1, cur); cur.pop()
        go(0, []); return out`],

	['combination-sum-ii', 'NEAR-MISS skip test i > 0 instead of i > start', false, `class Solution:
    def combinationSum2(self, candidates, target):
        candidates.sort(); out = []
        def go(start, cur, total):
            if total == target: out.append(cur[:]); return
            if total > target: return
            for i in range(start, len(candidates)):
                if i > 0 and candidates[i] == candidates[i-1]: continue
                cur.append(candidates[i]); go(i + 1, cur, total + candidates[i]); cur.pop()
        go(0, [], 0); return out`],
	['combination-sum-ii', 'NEAR-MISS no duplicate skip', false, `class Solution:
    def combinationSum2(self, candidates, target):
        candidates.sort(); out = []
        def go(start, cur, total):
            if total == target: out.append(cur[:]); return
            if total > target: return
            for i in range(start, len(candidates)):
                cur.append(candidates[i]); go(i + 1, cur, total + candidates[i]); cur.pop()
        go(0, [], 0); return out`],
	['combination-sum-ii', 'correct', true, `class Solution:
    def combinationSum2(self, candidates, target):
        candidates.sort(); out = []
        def go(start, cur, total):
            if total == target: out.append(cur[:]); return
            if total > target: return
            for i in range(start, len(candidates)):
                if i > start and candidates[i] == candidates[i-1]: continue
                cur.append(candidates[i]); go(i + 1, cur, total + candidates[i]); cur.pop()
        go(0, [], 0); return out`],

	['combination-sum', 'NEAR-MISS recurses past the candidate, forbidding reuse', false, `class Solution:
    def combinationSum(self, candidates, target):
        out = []
        def go(start, cur, total):
            if total == target: out.append(cur[:]); return
            if total > target: return
            for i in range(start, len(candidates)):
                cur.append(candidates[i]); go(i + 1, cur, total + candidates[i]); cur.pop()
        go(0, [], 0); return out`],
	['combination-sum', 'correct', true, `class Solution:
    def combinationSum(self, candidates, target):
        out = []
        def go(start, cur, total):
            if total == target: out.append(cur[:]); return
            if total > target: return
            for i in range(start, len(candidates)):
                cur.append(candidates[i]); go(i, cur, total + candidates[i]); cur.pop()
        go(0, [], 0); return out`],

	['subsets', 'NEAR-MISS appends the live list instead of a copy', false, `class Solution:
    def subsets(self, nums):
        out = []
        def go(start, cur):
            out.append(cur)
            for i in range(start, len(nums)):
                cur.append(nums[i]); go(i + 1, cur); cur.pop()
        go(0, []); return out`],
	['subsets', 'correct', true, `class Solution:
    def subsets(self, nums):
        out = []
        def go(start, cur):
            out.append(cur[:])
            for i in range(start, len(nums)):
                cur.append(nums[i]); go(i + 1, cur); cur.pop()
        go(0, []); return out`],

	// The inner order of a permutation is the answer, so this pair also guards the comparison rule.
	['permutations', 'NEAR-MISS never unmarks on backtrack', false, `class Solution:
    def permute(self, nums):
        out = []; used = set()
        def go(cur):
            if len(cur) == len(nums): out.append(cur[:]); return
            for n in nums:
                if n in used: continue
                used.add(n); cur.append(n); go(cur); cur.pop()
        go([]); return out`],
	['permutations', 'NEAR-MISS n! copies of the sorted list', false, `import math
class Solution:
    def permute(self, nums):
        return [sorted(nums) for _ in range(math.factorial(len(nums)))]`],
	['permutations', 'correct, enumerated in a different order', true, `class Solution:
    def permute(self, nums):
        out = []
        def go(cur, rest):
            if not rest: out.append(cur); return
            for i in range(len(rest) - 1, -1, -1):
                go(cur + [rest[i]], rest[:i] + rest[i+1:])
        go([], nums); return out`],

	// Every single character is a palindrome, so the all-singletons partition is always an answer.
	['palindrome-partitioning', 'NEAR-MISS requires palindromes of length 2 or more', false, `class Solution:
    def partition(self, s):
        out = []
        def go(start, cur):
            if start == len(s): out.append(cur[:]); return
            for end in range(start + 1, len(s) + 1):
                part = s[start:end]
                if len(part) >= 2 and part == part[::-1]:
                    cur.append(part); go(end, cur); cur.pop()
        go(0, []); return out`],
	['palindrome-partitioning', 'correct', true, `class Solution:
    def partition(self, s):
        out = []
        def go(start, cur):
            if start == len(s): out.append(cur[:]); return
            for end in range(start + 1, len(s) + 1):
                part = s[start:end]
                if part == part[::-1]:
                    cur.append(part); go(end, cur); cur.pop()
        go(0, []); return out`],

	['letter-combinations-of-a-phone-number', 'NEAR-MISS no empty-input guard', false, `class Solution:
    def letterCombinations(self, digits):
        m = {"2":"abc","3":"def","4":"ghi","5":"jkl","6":"mno","7":"pqrs","8":"tuv","9":"wxyz"}
        out = []
        def go(i, cur):
            if i == len(digits): out.append(cur); return
            for ch in m[digits[i]]: go(i + 1, cur + ch)
        go(0, ""); return out`],
	['letter-combinations-of-a-phone-number', 'correct', true, `class Solution:
    def letterCombinations(self, digits):
        if not digits: return []
        m = {"2":"abc","3":"def","4":"ghi","5":"jkl","6":"mno","7":"pqrs","8":"tuv","9":"wxyz"}
        out = []
        def go(i, cur):
            if i == len(digits): out.append(cur); return
            for ch in m[digits[i]]: go(i + 1, cur + ch)
        go(0, ""); return out`],

	// ---- batch 11: Graphs ----
	// A tree needs n-1 edges AND connectivity. n-1 edges containing a cycle leaves a node isolated;
	// there were none, so counting edges alone scored 42/42.
	['graph-valid-tree', 'NEAR-MISS only counts edges', false, `class Solution:
    def validTree(self, n, edges): return len(edges) == n - 1`],
	['graph-valid-tree', 'NEAR-MISS acyclic but never checks connectivity', false, `class Solution:
    def validTree(self, n, edges):
        p = list(range(n))
        def f(x):
            while p[x] != x: p[x] = p[p[x]]; x = p[x]
            return x
        for a, b in edges:
            ra, rb = f(a), f(b)
            if ra == rb: return False
            p[ra] = rb
        return True`],
	['graph-valid-tree', 'correct', true, `class Solution:
    def validTree(self, n, edges):
        if len(edges) != n - 1: return False
        p = list(range(n))
        def f(x):
            while p[x] != x: p[x] = p[p[x]]; x = p[x]
            return x
        for a, b in edges:
            ra, rb = f(a), f(b)
            if ra == rb: return False
            p[ra] = rb
        return True`],

	// No fresh orange means 0 minutes, whether or not anything is rotten.
	['rotting-oranges', 'NEAR-MISS answers -1 when nothing is rotten', false, `from collections import deque
class Solution:
    def orangesRotting(self, grid):
        rows, cols = len(grid), len(grid[0])
        q = deque((r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 2)
        if not q: return -1
        fresh = sum(row.count(1) for row in grid); t = 0
        while q and fresh:
            for _ in range(len(q)):
                r, c = q.popleft()
                for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                    nr, nc = r+dr, c+dc
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                        grid[nr][nc] = 2; fresh -= 1; q.append((nr, nc))
            t += 1
        return t if fresh == 0 else -1`],
	['rotting-oranges', 'NEAR-MISS counts the final round that rots nothing', false, `from collections import deque
class Solution:
    def orangesRotting(self, grid):
        rows, cols = len(grid), len(grid[0])
        q = deque((r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 2)
        fresh = sum(row.count(1) for row in grid); t = 0
        while q:
            for _ in range(len(q)):
                r, c = q.popleft()
                for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                    nr, nc = r+dr, c+dc
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                        grid[nr][nc] = 2; fresh -= 1; q.append((nr, nc))
            t += 1
        return t if fresh == 0 else -1`],
	['rotting-oranges', 'correct', true, `from collections import deque
class Solution:
    def orangesRotting(self, grid):
        rows, cols = len(grid), len(grid[0])
        q = deque((r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 2)
        fresh = sum(row.count(1) for row in grid); t = 0
        while q and fresh:
            for _ in range(len(q)):
                r, c = q.popleft()
                for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                    nr, nc = r+dr, c+dc
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                        grid[nr][nc] = 2; fresh -= 1; q.append((nr, nc))
            t += 1
        return t if fresh == 0 else -1`],

	// 207 has no ai != bi clause: a self-loop is legal and makes the schedule impossible.
	['course-schedule', 'NEAR-MISS drops self-loops', false, `from collections import deque
class Solution:
    def canFinish(self, numCourses, prerequisites):
        adj = {i: [] for i in range(numCourses)}; indeg = [0] * numCourses
        for a, b in prerequisites:
            if a == b: continue
            adj[b].append(a); indeg[a] += 1
        q = deque(i for i in range(numCourses) if indeg[i] == 0); done = 0
        while q:
            u = q.popleft(); done += 1
            for v in adj[u]:
                indeg[v] -= 1
                if indeg[v] == 0: q.append(v)
        return done == numCourses`],
	['course-schedule', 'NEAR-MISS looks only for two-node cycles', false, `class Solution:
    def canFinish(self, numCourses, prerequisites):
        s = {(a, b) for a, b in prerequisites}
        return not any((b, a) in s for a, b in prerequisites)`],
	['course-schedule', 'NEAR-MISS one global seen set as the cycle flag', false, `class Solution:
    def canFinish(self, numCourses, prerequisites):
        adj = {i: [] for i in range(numCourses)}
        for a, b in prerequisites: adj[b].append(a)
        seen = set()
        def dfs(u):
            if u in seen: return False
            seen.add(u)
            return all(dfs(v) for v in adj[u])
        return all(dfs(i) for i in range(numCourses) if i not in seen)`],
	['course-schedule', 'correct', true, `from collections import deque
class Solution:
    def canFinish(self, numCourses, prerequisites):
        adj = {i: [] for i in range(numCourses)}; indeg = [0] * numCourses
        for a, b in prerequisites: adj[b].append(a); indeg[a] += 1
        q = deque(i for i in range(numCourses) if indeg[i] == 0); done = 0
        while q:
            u = q.popleft(); done += 1
            for v in adj[u]:
                indeg[v] -= 1
                if indeg[v] == 0: q.append(v)
        return done == numCourses`],

	['surrounded-regions', 'NEAR-MISS a diagonal touch reaches the border', false, `class Solution:
    def solve(self, board):
        rows, cols = len(board), len(board[0])
        def mark(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != "O": return
            board[r][c] = "T"
            for dr in (-1,0,1):
                for dc in (-1,0,1):
                    if dr or dc: mark(r+dr, c+dc)
        for r in range(rows):
            for c in range(cols):
                if (r in (0, rows-1) or c in (0, cols-1)): mark(r, c)
        for r in range(rows):
            for c in range(cols):
                board[r][c] = "O" if board[r][c] == "T" else "X"`],
	['surrounded-regions', 'correct', true, `class Solution:
    def solve(self, board):
        rows, cols = len(board), len(board[0])
        def mark(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or board[r][c] != "O": return
            board[r][c] = "T"
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): mark(r+dr, c+dc)
        for r in range(rows):
            for c in range(cols):
                if (r in (0, rows-1) or c in (0, cols-1)): mark(r, c)
        for r in range(rows):
            for c in range(cols):
                board[r][c] = "O" if board[r][c] == "T" else "X"`],

	// "If there are multiple answers, return the answer that occurs last in the input."
	['redundant-connection', 'NEAR-MISS returns the first cycle edge in input order', false, `class Solution:
    def findRedundantConnection(self, edges):
        n = len(edges); adj = {i: [] for i in range(1, n + 1)}
        for a, b in edges: adj[a].append(b); adj[b].append(a)
        parent = {}; cycle = set()
        def dfs(u, p):
            parent[u] = p
            for v in adj[u]:
                if v == p: continue
                if v in parent:
                    x = u; cycle.add(v)
                    while x != v: cycle.add(x); x = parent[x]
                    return True
                if dfs(v, u): return True
            return False
        dfs(1, 0)
        for a, b in edges:
            if a in cycle and b in cycle: return [a, b]`],
	['redundant-connection', 'correct union-find', true, `class Solution:
    def findRedundantConnection(self, edges):
        p = list(range(len(edges) + 1))
        def f(x):
            while p[x] != x: p[x] = p[p[x]]; x = p[x]
            return x
        for a, b in edges:
            ra, rb = f(a), f(b)
            if ra == rb: return [a, b]
            p[ra] = rb`],

	['number-of-connected-components-in-an-undirected-graph', 'NEAR-MISS n minus the edge count', false, `class Solution:
    def countComponents(self, n, edges): return n - len(edges)`],
	['number-of-connected-components-in-an-undirected-graph', 'NEAR-MISS union without find', false, `class Solution:
    def countComponents(self, n, edges):
        p = list(range(n))
        for a, b in edges: p[a] = p[b]
        return sum(1 for i in range(n) if p[i] == i)`],
	['number-of-connected-components-in-an-undirected-graph', 'correct', true, `class Solution:
    def countComponents(self, n, edges):
        p = list(range(n))
        def f(x):
            while p[x] != x: p[x] = p[p[x]]; x = p[x]
            return x
        c = n
        for a, b in edges:
            ra, rb = f(a), f(b)
            if ra != rb: p[ra] = rb; c -= 1
        return c`],

	['number-of-islands', 'NEAR-MISS counts diagonal neighbours as connected', false, `class Solution:
    def numIslands(self, grid):
        rows, cols = len(grid), len(grid[0]); n = 0
        def sink(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != "1": return
            grid[r][c] = "0"
            for dr in (-1,0,1):
                for dc in (-1,0,1):
                    if dr or dc: sink(r+dr, c+dc)
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1": n += 1; sink(r, c)
        return n`],
	['number-of-islands', 'correct', true, `class Solution:
    def numIslands(self, grid):
        rows, cols = len(grid), len(grid[0]); n = 0
        def sink(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != "1": return
            grid[r][c] = "0"
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): sink(r+dr, c+dc)
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1": n += 1; sink(r, c)
        return n`],

	['max-area-of-island', 'NEAR-MISS counts islands instead of measuring them', false, `class Solution:
    def maxAreaOfIsland(self, grid):
        rows, cols = len(grid), len(grid[0]); n = 0
        def sink(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != 1: return
            grid[r][c] = 0
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): sink(r+dr, c+dc)
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 1: n += 1; sink(r, c)
        return n`],
	['max-area-of-island', 'correct', true, `class Solution:
    def maxAreaOfIsland(self, grid):
        rows, cols = len(grid), len(grid[0]); best = 0
        def sink(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != 1: return 0
            grid[r][c] = 0
            return 1 + sum(sink(r+dr, c+dc) for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)))
        for r in range(rows):
            for c in range(cols):
                best = max(best, sink(r, c))
        return best`],

	// Water flows to EQUAL or lower ground, so the climb from the ocean must accept equal heights.
	['pacific-atlantic-water-flow', 'NEAR-MISS strict climb from the ocean', false, `class Solution:
    def pacificAtlantic(self, heights):
        rows, cols = len(heights), len(heights[0])
        pac, atl = set(), set()
        def dfs(r, c, seen, prev):
            if (r, c) in seen or r < 0 or c < 0 or r >= rows or c >= cols or heights[r][c] <= prev: return
            seen.add((r, c))
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): dfs(r+dr, c+dc, seen, heights[r][c])
        for c in range(cols):
            dfs(0, c, pac, -1); dfs(rows-1, c, atl, -1)
        for r in range(rows):
            dfs(r, 0, pac, -1); dfs(r, cols-1, atl, -1)
        return [[r, c] for (r, c) in pac & atl]`],
	['pacific-atlantic-water-flow', 'NEAR-MISS every coordinate reversed', false, `class Solution:
    def pacificAtlantic(self, heights):
        rows, cols = len(heights), len(heights[0])
        pac, atl = set(), set()
        def dfs(r, c, seen, prev):
            if (r, c) in seen or r < 0 or c < 0 or r >= rows or c >= cols or heights[r][c] < prev: return
            seen.add((r, c))
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): dfs(r+dr, c+dc, seen, heights[r][c])
        for c in range(cols):
            dfs(0, c, pac, heights[0][c]); dfs(rows-1, c, atl, heights[rows-1][c])
        for r in range(rows):
            dfs(r, 0, pac, heights[r][0]); dfs(r, cols-1, atl, heights[r][cols-1])
        return [[c, r] for (r, c) in pac & atl]`],
	['pacific-atlantic-water-flow', 'correct, in a different order', true, `class Solution:
    def pacificAtlantic(self, heights):
        rows, cols = len(heights), len(heights[0])
        pac, atl = set(), set()
        def dfs(r, c, seen, prev):
            if (r, c) in seen or r < 0 or c < 0 or r >= rows or c >= cols or heights[r][c] < prev: return
            seen.add((r, c))
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)): dfs(r+dr, c+dc, seen, heights[r][c])
        for c in range(cols):
            dfs(0, c, pac, heights[0][c]); dfs(rows-1, c, atl, heights[rows-1][c])
        for r in range(rows):
            dfs(r, 0, pac, heights[r][0]); dfs(r, cols-1, atl, heights[r][cols-1])
        return [[r, c] for (r, c) in sorted(pac & atl, reverse=True)]`],

	// Unreachable rooms keep INF; they are not walls.
	['walls-and-gates', 'NEAR-MISS writes -1 into unreachable rooms', false, `from collections import deque
class Solution:
    def wallsAndGates(self, rooms):
        rows, cols = len(rooms), len(rooms[0]); INF = 2147483647
        q = deque((r, c) for r in range(rows) for c in range(cols) if rooms[r][c] == 0)
        while q:
            r, c = q.popleft()
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < rows and 0 <= nc < cols and rooms[nr][nc] == INF:
                    rooms[nr][nc] = rooms[r][c] + 1; q.append((nr, nc))
        for r in range(rows):
            for c in range(cols):
                if rooms[r][c] == INF: rooms[r][c] = -1`],
	['walls-and-gates', 'correct multi-source BFS', true, `from collections import deque
class Solution:
    def wallsAndGates(self, rooms):
        rows, cols = len(rooms), len(rooms[0]); INF = 2147483647
        q = deque((r, c) for r in range(rows) for c in range(cols) if rooms[r][c] == 0)
        while q:
            r, c = q.popleft()
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < rows and 0 <= nc < cols and rooms[nr][nc] == INF:
                    rooms[nr][nc] = rooms[r][c] + 1; q.append((nr, nc))`],

	// The adapter checks node identity, so handing back the original graph is caught.
	['clone-graph', 'NEAR-MISS returns the input node', false, `class Solution:
    def cloneGraph(self, node): return node`],
	['clone-graph', 'correct', true, `class Solution:
    def cloneGraph(self, node):
        if not node: return None
        m = {}
        def go(n):
            if n in m: return m[n]
            c = Node(n.val); m[n] = c
            c.neighbors = [go(x) for x in n.neighbors]
            return c
        return go(node)`],

	// The length counts words, both ends included, and BFS finds the shortest where DFS may not.
	['word-ladder', 'NEAR-MISS counts transformations, not words', false, `from collections import deque
class Solution:
    def ladderLength(self, beginWord, endWord, wordList):
        words = set(wordList)
        if endWord not in words: return 0
        q = deque([(beginWord, 0)]); seen = {beginWord}
        while q:
            w, d = q.popleft()
            if w == endWord: return d
            for i in range(len(w)):
                for ch in "abcdefghijklmnopqrstuvwxyz":
                    nw = w[:i] + ch + w[i+1:]
                    if nw in words and nw not in seen: seen.add(nw); q.append((nw, d + 1))
        return 0`],
	['word-ladder', 'NEAR-MISS depth-first, takes the first path found', false, `class Solution:
    def ladderLength(self, beginWord, endWord, wordList):
        words = set(wordList)
        if endWord not in words: return 0
        seen = {beginWord}
        def dfs(w, d):
            if w == endWord: return d
            for i in range(len(w)):
                for ch in "abcdefghijklmnopqrstuvwxyz":
                    nw = w[:i] + ch + w[i+1:]
                    if nw in words and nw not in seen:
                        seen.add(nw)
                        r = dfs(nw, d + 1)
                        if r: return r
            return 0
        return dfs(beginWord, 1)`],
	['word-ladder', 'correct BFS', true, `from collections import deque
class Solution:
    def ladderLength(self, beginWord, endWord, wordList):
        words = set(wordList)
        if endWord not in words: return 0
        q = deque([(beginWord, 1)]); seen = {beginWord}
        while q:
            w, d = q.popleft()
            if w == endWord: return d
            for i in range(len(w)):
                for ch in "abcdefghijklmnopqrstuvwxyz":
                    nw = w[:i] + ch + w[i+1:]
                    if nw in words and nw not in seen: seen.add(nw); q.append((nw, d + 1))
        return 0`],

	// ---- batch 12: Advanced Graphs ----
	// A node reached cheaply by a long route and dearly by a short one, where only the short one
	// leaves stops to spare. A per-node visited set settles it on the cheap route and drops the
	// later arrival; this scored 43/43 before the shape was built on purpose.
	['cheapest-flights-within-k-stops', 'NEAR-MISS Dijkstra with a per-node visited set', false, `import heapq
class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        adj = {}
        for u, v, w in flights: adj.setdefault(u, []).append((v, w))
        h = [(0, src, 0)]; seen = set()
        while h:
            d, u, stops = heapq.heappop(h)
            if u == dst: return d
            if u in seen: continue
            seen.add(u)
            if stops > k: continue
            for v, w in adj.get(u, []): heapq.heappush(h, (d + w, v, stops + 1))
        return -1`],
	['cheapest-flights-within-k-stops', 'NEAR-MISS plain Dijkstra ignores the stop limit', false, `import heapq
class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        adj = {}
        for u, v, w in flights: adj.setdefault(u, []).append((v, w))
        dist = {src: 0}; h = [(0, src)]
        while h:
            d, u = heapq.heappop(h)
            if u == dst: return d
            if d > dist.get(u, float("inf")): continue
            for v, w in adj.get(u, []):
                if d + w < dist.get(v, float("inf")):
                    dist[v] = d + w; heapq.heappush(h, (d + w, v))
        return -1`],
	['cheapest-flights-within-k-stops', 'NEAR-MISS Bellman-Ford reading same-round distances', false, `class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        INF = float("inf"); d = [INF] * n; d[src] = 0
        for _ in range(k + 1):
            for u, v, w in flights:
                if d[u] + w < d[v]: d[v] = d[u] + w
        return -1 if d[dst] == INF else d[dst]`],
	['cheapest-flights-within-k-stops', 'correct Bellman-Ford with a snapshot', true, `class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        INF = float("inf"); d = [INF] * n; d[src] = 0
        for _ in range(k + 1):
            nd = d[:]
            for u, v, w in flights:
                if d[u] + w < nd[v]: nd[v] = d[u] + w
            d = nd
        return -1 if d[dst] == INF else d[dst]`],

	// Weights make breadth-first order meaningless.
	['network-delay-time', 'NEAR-MISS BFS fixes each node on first discovery', false, `from collections import deque
class Solution:
    def networkDelayTime(self, times, n, k):
        adj = {}
        for u, v, w in times: adj.setdefault(u, []).append((v, w))
        dist = {k: 0}; q = deque([k])
        while q:
            u = q.popleft()
            for v, w in adj.get(u, []):
                if v not in dist: dist[v] = dist[u] + w; q.append(v)
        return max(dist.values()) if len(dist) == n else -1`],
	['network-delay-time', 'NEAR-MISS sums the delays instead of taking the largest', false, `import heapq
class Solution:
    def networkDelayTime(self, times, n, k):
        adj = {}
        for u, v, w in times: adj.setdefault(u, []).append((v, w))
        dist = {}; h = [(0, k)]
        while h:
            d, u = heapq.heappop(h)
            if u in dist: continue
            dist[u] = d
            for v, w in adj.get(u, []):
                if v not in dist: heapq.heappush(h, (d + w, v))
        return sum(dist.values()) if len(dist) == n else -1`],
	['network-delay-time', 'correct Dijkstra', true, `import heapq
class Solution:
    def networkDelayTime(self, times, n, k):
        adj = {}
        for u, v, w in times: adj.setdefault(u, []).append((v, w))
        dist = {}; h = [(0, k)]
        while h:
            d, u = heapq.heappop(h)
            if u in dist: continue
            dist[u] = d
            for v, w in adj.get(u, []):
                if v not in dist: heapq.heappush(h, (d + w, v))
        return max(dist.values()) if len(dist) == n else -1`],

	// The best route may have to double back; a down-and-right DP never can.
	['swim-in-rising-water', 'NEAR-MISS moves only down and right', false, `class Solution:
    def swimInWater(self, grid):
        n = len(grid); INF = float("inf")
        dp = [[INF]*n for _ in range(n)]; dp[0][0] = grid[0][0]
        for r in range(n):
            for c in range(n):
                if r: dp[r][c] = min(dp[r][c], max(dp[r-1][c], grid[r][c]))
                if c: dp[r][c] = min(dp[r][c], max(dp[r][c-1], grid[r][c]))
        return dp[n-1][n-1]`],
	['swim-in-rising-water', 'NEAR-MISS minimises the sum rather than the maximum', false, `import heapq
class Solution:
    def swimInWater(self, grid):
        n = len(grid); h = [(grid[0][0], 0, 0)]; seen = set()
        while h:
            d, r, c = heapq.heappop(h)
            if (r, c) in seen: continue
            seen.add((r, c))
            if (r, c) == (n-1, n-1): return d
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:
                    heapq.heappush(h, (d + grid[nr][nc], nr, nc))`],
	['swim-in-rising-water', 'correct Dijkstra on the maximum', true, `import heapq
class Solution:
    def swimInWater(self, grid):
        n = len(grid); h = [(grid[0][0], 0, 0)]; seen = set()
        while h:
            d, r, c = heapq.heappop(h)
            if (r, c) in seen: continue
            seen.add((r, c))
            if (r, c) == (n-1, n-1): return d
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:
                    heapq.heappush(h, (max(d, grid[nr][nc]), nr, nc))`],

	// Must use every ticket and return the SMALLEST such itinerary, not merely a valid one.
	['reconstruct-itinerary', 'NEAR-MISS Hierholzer without sorting destinations', false, `class Solution:
    def findItinerary(self, tickets):
        adj = {}
        for a, b in tickets: adj.setdefault(a, []).append(b)
        out = []
        def go(u):
            while adj.get(u): go(adj[u].pop())
            out.append(u)
        go("JFK"); return out[::-1]`],
	['reconstruct-itinerary', 'NEAR-MISS greedy smallest next stop, no backtracking', false, `class Solution:
    def findItinerary(self, tickets):
        adj = {}
        for a, b in tickets: adj.setdefault(a, []).append(b)
        for k in adj: adj[k].sort()
        out = ["JFK"]; u = "JFK"
        while adj.get(u):
            u = adj[u].pop(0); out.append(u)
        return out`],
	['reconstruct-itinerary', 'correct Hierholzer', true, `class Solution:
    def findItinerary(self, tickets):
        adj = {}
        for a, b in sorted(tickets, reverse=True): adj.setdefault(a, []).append(b)
        out = []
        def go(u):
            while adj.get(u): go(adj[u].pop())
            out.append(u)
        go("JFK"); return out[::-1]`],

	['min-cost-to-connect-all-points', 'NEAR-MISS nearest-neighbour chain', false, `class Solution:
    def minCostConnectPoints(self, points):
        n = len(points); seen = {0}; cur = 0; total = 0
        while len(seen) < n:
            best = None
            for j in range(n):
                if j in seen: continue
                d = abs(points[cur][0]-points[j][0]) + abs(points[cur][1]-points[j][1])
                if best is None or d < best[0]: best = (d, j)
            total += best[0]; seen.add(best[1]); cur = best[1]
        return total`],
	['min-cost-to-connect-all-points', 'NEAR-MISS cheapest n-1 edges with no cycle check', false, `class Solution:
    def minCostConnectPoints(self, points):
        n = len(points)
        es = sorted(abs(points[i][0]-points[j][0]) + abs(points[i][1]-points[j][1]) for i in range(n) for j in range(i+1, n))
        return sum(es[:n-1])`],
	['min-cost-to-connect-all-points', 'correct Prim', true, `class Solution:
    def minCostConnectPoints(self, points):
        n = len(points); INF = float("inf"); best = [INF] * n; best[0] = 0; used = [False] * n; total = 0
        for _ in range(n):
            u = min((i for i in range(n) if not used[i]), key=lambda i: best[i])
            used[u] = True; total += best[u]
            for v in range(n):
                if not used[v]:
                    d = abs(points[u][0]-points[v][0]) + abs(points[u][1]-points[v][1])
                    if d < best[v]: best[v] = d
        return total`],

	// ---- batch 13: 1-D Dynamic Programming ----
	// Joining dictionary words to build s meant taking the longest match almost never walked into
	// a dead end, so greedy longest-match on word-break scored 43/43 before its traps were built.
	['house-robber-ii', 'NEAR-MISS linear house robber on the whole circle', false, `class Solution:
    def rob(self, nums):
        a = b = 0
        for x in nums: a, b = b, max(b, a + x)
        return b`],
	['house-robber-ii', 'NEAR-MISS two slices with no length-1 guard', false, `class Solution:
    def rob(self, nums):
        def go(xs):
            a = b = 0
            for x in xs: a, b = b, max(b, a + x)
            return b
        return max(go(nums[1:]), go(nums[:-1]))`],
	['house-robber-ii', 'correct', true, `class Solution:
    def rob(self, nums):
        def go(xs):
            a = b = 0
            for x in xs: a, b = b, max(b, a + x)
            return b
        if len(nums) == 1: return nums[0]
        return max(go(nums[1:]), go(nums[:-1]))`],
	['decode-ways', 'NEAR-MISS treats 0 as a valid single digit', false, `class Solution:
    def numDecodings(self, s):
        a, b = 1, 1
        for i in range(1, len(s)):
            c = b + (a if 10 <= int(s[i-1:i+1]) <= 26 else 0)
            a, b = b, c
        return b`],
	['decode-ways', 'NEAR-MISS two-digit check with no lower bound of 10', false, `class Solution:
    def numDecodings(self, s):
        if s[0] == "0": return 0
        a, b = 1, 1
        for i in range(1, len(s)):
            c = (b if s[i] != "0" else 0) + (a if int(s[i-1:i+1]) <= 26 else 0)
            a, b = b, c
        return b`],
	['decode-ways', 'correct', true, `class Solution:
    def numDecodings(self, s):
        if s[0] == "0": return 0
        a, b = 1, 1
        for i in range(1, len(s)):
            c = (b if s[i] != "0" else 0) + (a if 10 <= int(s[i-1:i+1]) <= 26 else 0)
            a, b = b, c
        return b`],
	['maximum-product-subarray', 'NEAR-MISS tracks only the running maximum', false, `class Solution:
    def maxProduct(self, nums):
        best = cur = nums[0]
        for x in nums[1:]:
            cur = max(x, cur * x); best = max(best, cur)
        return best`],
	['maximum-product-subarray', 'NEAR-MISS best initialised to 0', false, `class Solution:
    def maxProduct(self, nums):
        best = 0; hi = lo = 1
        for x in nums:
            hi, lo = max(x, hi * x, lo * x), min(x, hi * x, lo * x)
            best = max(best, hi)
        return best`],
	['maximum-product-subarray', 'correct', true, `class Solution:
    def maxProduct(self, nums):
        best = hi = lo = nums[0]
        for x in nums[1:]:
            hi, lo = max(x, hi * x, lo * x), min(x, hi * x, lo * x)
            best = max(best, hi)
        return best`],
	['coin-change', 'NEAR-MISS greedy, largest coin first', false, `class Solution:
    def coinChange(self, coins, amount):
        n = 0
        for c in sorted(coins, reverse=True):
            n += amount // c; amount %= c
        return n if amount == 0 else -1`],
	['coin-change', 'NEAR-MISS returns the sentinel unconverted', false, `class Solution:
    def coinChange(self, coins, amount):
        dp = [0] + [amount + 1] * amount
        for a in range(1, amount + 1):
            for c in coins:
                if c <= a: dp[a] = min(dp[a], dp[a - c] + 1)
        return dp[amount]`],
	['coin-change', 'correct', true, `class Solution:
    def coinChange(self, coins, amount):
        dp = [0] + [amount + 1] * amount
        for a in range(1, amount + 1):
            for c in coins:
                if c <= a: dp[a] = min(dp[a], dp[a - c] + 1)
        return dp[amount] if dp[amount] <= amount else -1`],
	['longest-increasing-subsequence', 'NEAR-MISS non-strict, equal values extend', false, `class Solution:
    def lengthOfLIS(self, nums):
        dp = [1] * len(nums)
        for i in range(len(nums)):
            for j in range(i):
                if nums[j] <= nums[i]: dp[i] = max(dp[i], dp[j] + 1)
        return max(dp)`],
	['longest-increasing-subsequence', 'NEAR-MISS returns dp[-1] rather than the maximum', false, `class Solution:
    def lengthOfLIS(self, nums):
        dp = [1] * len(nums)
        for i in range(len(nums)):
            for j in range(i):
                if nums[j] < nums[i]: dp[i] = max(dp[i], dp[j] + 1)
        return dp[-1]`],
	['longest-increasing-subsequence', 'correct patience sort', true, `import bisect
class Solution:
    def lengthOfLIS(self, nums):
        t = []
        for x in nums:
            i = bisect.bisect_left(t, x)
            if i == len(t): t.append(x)
            else: t[i] = x
        return len(t)`],
	['partition-equal-subset-sum', 'NEAR-MISS iterates the dp forwards, reusing an item', false, `class Solution:
    def canPartition(self, nums):
        s = sum(nums)
        if s % 2: return False
        t = s // 2; dp = [True] + [False] * t
        for x in nums:
            for a in range(x, t + 1): dp[a] = dp[a] or dp[a - x]
        return dp[t]`],
	['partition-equal-subset-sum', 'NEAR-MISS no odd-total check', false, `class Solution:
    def canPartition(self, nums):
        t = sum(nums) // 2; dp = [True] + [False] * t
        for x in nums:
            for a in range(t, x - 1, -1): dp[a] = dp[a] or dp[a - x]
        return dp[t]`],
	['partition-equal-subset-sum', 'correct', true, `class Solution:
    def canPartition(self, nums):
        s = sum(nums)
        if s % 2: return False
        t = s // 2; dp = [True] + [False] * t
        for x in nums:
            for a in range(t, x - 1, -1): dp[a] = dp[a] or dp[a - x]
        return dp[t]`],
	['palindromic-substrings', 'NEAR-MISS odd centres only', false, `class Solution:
    def countSubstrings(self, s):
        n = 0
        for c in range(len(s)):
            l = r = c
            while l >= 0 and r < len(s) and s[l] == s[r]: n += 1; l -= 1; r += 1
        return n`],
	['palindromic-substrings', 'NEAR-MISS counts distinct palindromes', false, `class Solution:
    def countSubstrings(self, s):
        return len({s[i:j] for i in range(len(s)) for j in range(i + 1, len(s) + 1) if s[i:j] == s[i:j][::-1]})`],
	['palindromic-substrings', 'correct', true, `class Solution:
    def countSubstrings(self, s):
        n = 0
        for c in range(2 * len(s) - 1):
            l, r = c // 2, c // 2 + c % 2
            while l >= 0 and r < len(s) and s[l] == s[r]: n += 1; l -= 1; r += 1
        return n`],
	['longest-palindromic-substring', 'NEAR-MISS odd centres only', false, `class Solution:
    def longestPalindrome(self, s):
        best = ""
        for c in range(len(s)):
            l = r = c
            while l >= 0 and r < len(s) and s[l] == s[r]: l -= 1; r += 1
            if r - l - 1 > len(best): best = s[l+1:r]
        return best`],
	['longest-palindromic-substring', 'correct, returns the LAST longest', true, `class Solution:
    def longestPalindrome(self, s):
        best = ""
        for c in range(2 * len(s) - 1):
            l, r = c // 2, c // 2 + c % 2
            while l >= 0 and r < len(s) and s[l] == s[r]: l -= 1; r += 1
            if r - l - 1 >= len(best): best = s[l+1:r]
        return best`],
	['house-robber', 'NEAR-MISS even-index sum against odd-index sum', false, `class Solution:
    def rob(self, nums): return max(sum(nums[0::2]), sum(nums[1::2]))`],
	['house-robber', 'correct', true, `class Solution:
    def rob(self, nums):
        a = b = 0
        for x in nums: a, b = b, max(b, a + x)
        return b`],
	['min-cost-climbing-stairs', 'NEAR-MISS must step on the last stair', false, `class Solution:
    def minCostClimbingStairs(self, cost):
        a, b = cost[0], cost[1]
        for c in cost[2:]: a, b = b, c + min(a, b)
        return b`],
	['min-cost-climbing-stairs', 'NEAR-MISS greedy cheaper of the next two', false, `class Solution:
    def minCostClimbingStairs(self, cost):
        i = -1; total = 0; n = len(cost)
        while i + 1 < n:
            if i + 2 >= n: i += 1; total += cost[i] if i < n else 0; break
            if cost[i+1] <= cost[i+2]: i += 1
            else: i += 2
            total += cost[i]
        return total`],
	['min-cost-climbing-stairs', 'correct', true, `class Solution:
    def minCostClimbingStairs(self, cost):
        a = b = 0
        for i in range(2, len(cost) + 1): a, b = b, min(b + cost[i-1], a + cost[i-2])
        return b`],
	['climbing-stairs', 'NEAR-MISS Fibonacci shifted by one', false, `class Solution:
    def climbStairs(self, n):
        a, b = 1, 1
        for _ in range(n - 1): a, b = b, a + b
        return a`],
	['climbing-stairs', 'correct', true, `class Solution:
    def climbStairs(self, n):
        a, b = 1, 1
        for _ in range(n): a, b = b, a + b
        return a`],
	['word-break', 'NEAR-MISS greedy longest match', false, `class Solution:
    def wordBreak(self, s, wordDict):
        i = 0; words = sorted(wordDict, key=len, reverse=True)
        while i < len(s):
            for w in words:
                if s.startswith(w, i): i += len(w); break
            else: return False
        return True`],
	['word-break', 'NEAR-MISS greedy shortest match', false, `class Solution:
    def wordBreak(self, s, wordDict):
        i = 0; words = sorted(wordDict, key=len)
        while i < len(s):
            for w in words:
                if s.startswith(w, i): i += len(w); break
            else: return False
        return True`],
	['word-break', 'correct', true, `class Solution:
    def wordBreak(self, s, wordDict):
        words = set(wordDict); dp = [True] + [False] * len(s)
        for i in range(1, len(s) + 1):
            dp[i] = any(dp[j] and s[j:i] in words for j in range(i))
        return dp[-1]`],

	// ---- batch 14: 2-D Dynamic Programming ----
	// Two lengths the generators never broke: s3 always had exactly len(s1) + len(s2) characters,
	// and the target-sum target never left the reachable range. Both near-misses scored a clean sweep.
	['target-sum', 'NEAR-MISS subset-sum reduction with no parity check', false, `class Solution:
    def findTargetSumWays(self, nums, target):
        s = sum(nums)
        if abs(target) > s: return 0
        t = (s + target) // 2; dp = [1] + [0] * t
        for x in nums:
            for a in range(t, x - 1, -1): dp[a] += dp[a - x]
        return dp[t]`],
	['target-sum', 'NEAR-MISS no range check on the target', false, `class Solution:
    def findTargetSumWays(self, nums, target):
        s = sum(nums)
        if (s + target) % 2: return 0
        t = (s + target) // 2; dp = [1] + [0] * max(t, 0)
        for x in nums:
            for a in range(t, x - 1, -1): dp[a] += dp[a - x]
        return dp[t] if t >= 0 else dp[t]`],
	['target-sum', 'NEAR-MISS tracks reachability, not counts', false, `class Solution:
    def findTargetSumWays(self, nums, target):
        reach = {0}
        for x in nums: reach = {r + x for r in reach} | {r - x for r in reach}
        return 1 if target in reach else 0`],
	['target-sum', 'correct', true, `class Solution:
    def findTargetSumWays(self, nums, target):
        from collections import Counter
        ways = Counter({0: 1})
        for x in nums:
            nxt = Counter()
            for r, c in ways.items(): nxt[r + x] += c; nxt[r - x] += c
            ways = nxt
        return ways[target]`],
	['coin-change-ii', 'NEAR-MISS amount outside, coins inside (counts orderings)', false, `class Solution:
    def change(self, amount, coins):
        dp = [1] + [0] * amount
        for a in range(1, amount + 1):
            for c in coins:
                if c <= a: dp[a] += dp[a - c]
        return dp[amount]`],
	['coin-change-ii', 'NEAR-MISS each coin used at most once', false, `class Solution:
    def change(self, amount, coins):
        dp = [1] + [0] * amount
        for c in coins:
            for a in range(amount, c - 1, -1): dp[a] += dp[a - c]
        return dp[amount]`],
	['coin-change-ii', 'correct', true, `class Solution:
    def change(self, amount, coins):
        dp = [1] + [0] * amount
        for c in coins:
            for a in range(c, amount + 1): dp[a] += dp[a - c]
        return dp[amount]`],
	['interleaving-string', 'NEAR-MISS no length check', false, `class Solution:
    def isInterleave(self, s1, s2, s3):
        from functools import lru_cache
        @lru_cache(None)
        def go(i, j):
            k = i + j
            if k == len(s3): return True
            return (i < len(s1) and k < len(s3) and s1[i] == s3[k] and go(i + 1, j)) or \\
                   (j < len(s2) and k < len(s3) and s2[j] == s3[k] and go(i, j + 1))
        return go(0, 0)`],
	['interleaving-string', 'NEAR-MISS greedy, prefers s1 on a tie', false, `class Solution:
    def isInterleave(self, s1, s2, s3):
        if len(s1) + len(s2) != len(s3): return False
        i = j = 0
        for ch in s3:
            if i < len(s1) and s1[i] == ch: i += 1
            elif j < len(s2) and s2[j] == ch: j += 1
            else: return False
        return True`],
	['interleaving-string', 'correct', true, `class Solution:
    def isInterleave(self, s1, s2, s3):
        if len(s1) + len(s2) != len(s3): return False
        from functools import lru_cache
        @lru_cache(None)
        def go(i, j):
            if i + j == len(s3): return True
            k = i + j
            return (i < len(s1) and s1[i] == s3[k] and go(i + 1, j)) or \\
                   (j < len(s2) and s2[j] == s3[k] and go(i, j + 1))
        return go(0, 0)`],
	['edit-distance', 'NEAR-MISS base row and column left at 0', false, `class Solution:
    def minDistance(self, word1, word2):
        m, n = len(word1), len(word2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] if word1[i-1] == word2[j-1] else 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
        return dp[m][n]`],
	['edit-distance', 'NEAR-MISS no replace operation', false, `class Solution:
    def minDistance(self, word1, word2):
        m, n = len(word1), len(word2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = i
        for j in range(n + 1): dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] if word1[i-1] == word2[j-1] else 1 + min(dp[i-1][j], dp[i][j-1])
        return dp[m][n]`],
	['edit-distance', 'correct', true, `class Solution:
    def minDistance(self, word1, word2):
        m, n = len(word1), len(word2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = i
        for j in range(n + 1): dp[0][j] = j
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] if word1[i-1] == word2[j-1] else 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
        return dp[m][n]`],
	['distinct-subsequences', 'NEAR-MISS on a match takes only the diagonal', false, `class Solution:
    def numDistinct(self, s, t):
        m, n = len(s), len(t)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = 1
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] if s[i-1] == t[j-1] else dp[i-1][j]
        return dp[m][n]`],
	['distinct-subsequences', 'NEAR-MISS seeds only dp[0][0]', false, `class Solution:
    def numDistinct(self, s, t):
        m, n = len(s), len(t)
        dp = [[0] * (n + 1) for _ in range(m + 1)]; dp[0][0] = 1
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j] + (dp[i-1][j-1] if s[i-1] == t[j-1] else 0)
        return dp[m][n]`],
	['distinct-subsequences', 'correct', true, `class Solution:
    def numDistinct(self, s, t):
        m, n = len(s), len(t)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(m + 1): dp[i][0] = 1
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j] + (dp[i-1][j-1] if s[i-1] == t[j-1] else 0)
        return dp[m][n]`],
	['regular-expression-matching', 'NEAR-MISS star means one or more', false, `class Solution:
    def isMatch(self, s, p):
        from functools import lru_cache
        @lru_cache(None)
        def go(i, j):
            if j == len(p): return i == len(s)
            first = i < len(s) and p[j] in (s[i], ".")
            if j + 1 < len(p) and p[j+1] == "*":
                return first and (go(i + 1, j) or go(i + 1, j + 2))
            return first and go(i + 1, j + 1)
        return go(0, 0)`],
	['regular-expression-matching', 'NEAR-MISS prefix match, not the whole string', false, `class Solution:
    def isMatch(self, s, p):
        from functools import lru_cache
        @lru_cache(None)
        def go(i, j):
            if j == len(p): return True
            first = i < len(s) and p[j] in (s[i], ".")
            if j + 1 < len(p) and p[j+1] == "*":
                return go(i, j + 2) or (first and go(i + 1, j))
            return first and go(i + 1, j + 1)
        return go(0, 0)`],
	['regular-expression-matching', 'correct', true, `class Solution:
    def isMatch(self, s, p):
        import re
        return re.fullmatch(p, s) is not None`],
	['burst-balloons', 'NEAR-MISS scores against original neighbours', false, `class Solution:
    def maxCoins(self, nums):
        a = [1] + nums + [1]; n = len(a)
        dp = [[0] * n for _ in range(n)]
        for length in range(2, n):
            for l in range(0, n - length):
                r = l + length
                dp[l][r] = max(dp[l][k] + a[k-1] * a[k] * a[k+1] + dp[k][r] for k in range(l + 1, r))
        return dp[0][n-1]`],
	['burst-balloons', 'correct', true, `class Solution:
    def maxCoins(self, nums):
        a = [1] + nums + [1]; n = len(a)
        dp = [[0] * n for _ in range(n)]
        for length in range(2, n):
            for l in range(0, n - length):
                r = l + length
                dp[l][r] = max(dp[l][k] + a[l] * a[k] * a[r] + dp[k][r] for k in range(l + 1, r))
        return dp[0][n-1]`],
	['longest-increasing-path-in-a-matrix', 'NEAR-MISS non-strict, equal neighbours extend', false, `class Solution:
    def longestIncreasingPath(self, matrix):
        from functools import lru_cache
        rows, cols = len(matrix), len(matrix[0])
        @lru_cache(None)
        def go(r, c, seen=frozenset()):
            best = 1
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < rows and 0 <= nc < cols and (nr,nc) not in seen and matrix[nr][nc] >= matrix[r][c]:
                    best = max(best, 1 + go(nr, nc, seen | {(r, c)}))
            return best
        return max(go(r, c) for r in range(rows) for c in range(cols))`],
	['longest-increasing-path-in-a-matrix', 'NEAR-MISS moves only right and down', false, `class Solution:
    def longestIncreasingPath(self, matrix):
        rows, cols = len(matrix), len(matrix[0]); dp = [[1] * cols for _ in range(rows)]
        for r in range(rows):
            for c in range(cols):
                if r and matrix[r-1][c] < matrix[r][c]: dp[r][c] = max(dp[r][c], dp[r-1][c] + 1)
                if c and matrix[r][c-1] < matrix[r][c]: dp[r][c] = max(dp[r][c], dp[r][c-1] + 1)
        return max(max(row) for row in dp)`],
	['longest-increasing-path-in-a-matrix', 'correct', true, `class Solution:
    def longestIncreasingPath(self, matrix):
        from functools import lru_cache
        rows, cols = len(matrix), len(matrix[0])
        @lru_cache(None)
        def go(r, c):
            best = 1
            for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                nr, nc = r+dr, c+dc
                if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] > matrix[r][c]:
                    best = max(best, 1 + go(nr, nc))
            return best
        return max(go(r, c) for r in range(rows) for c in range(cols))`],
	['best-time-to-buy-and-sell-stock-with-cooldown', 'NEAR-MISS ignores the cooldown', false, `class Solution:
    def maxProfit(self, prices):
        return sum(max(0, prices[i] - prices[i-1]) for i in range(1, len(prices)))`],
	['best-time-to-buy-and-sell-stock-with-cooldown', 'correct', true, `class Solution:
    def maxProfit(self, prices):
        hold, sold, rest = float("-inf"), 0, 0
        for p in prices:
            hold, sold, rest = max(hold, rest - p), hold + p, max(rest, sold)
        return max(sold, rest)`],
	['longest-common-subsequence', 'NEAR-MISS longest common substring', false, `class Solution:
    def longestCommonSubsequence(self, text1, text2):
        best = 0; m, n = len(text1), len(text2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if text1[i-1] == text2[j-1]: dp[i][j] = dp[i-1][j-1] + 1; best = max(best, dp[i][j])
        return best`],
	['longest-common-subsequence', 'correct', true, `class Solution:
    def longestCommonSubsequence(self, text1, text2):
        m, n = len(text1), len(text2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                dp[i][j] = dp[i-1][j-1] + 1 if text1[i-1] == text2[j-1] else max(dp[i-1][j], dp[i][j-1])
        return dp[m][n]`],
	['unique-paths', 'NEAR-MISS first row and column never set to 1', false, `class Solution:
    def uniquePaths(self, m, n):
        dp = [[0] * n for _ in range(m)]; dp[0][0] = 1
        for r in range(1, m):
            for c in range(1, n): dp[r][c] = dp[r-1][c] + dp[r][c-1]
        return dp[m-1][n-1]`],
	['unique-paths', 'correct', true, `class Solution:
    def uniquePaths(self, m, n):
        import math
        return math.comb(m + n - 2, m - 1)`],

	// ---- batch 15: Greedy ----
	// Every near-miss here must terminate on every case. The CI audit runs under Pyodide with no
	// timeout, and the first draft of the jump-game-ii one spun forever on LeetCode's own
	// [2,3,0,1,4], stalling the whole audit run.
	// Random inputs were almost never answerable -- hands that split, targets that form -- and false
	// is what the wrong solutions say too, so each was caught by one or two cases.
	['maximum-subarray', 'NEAR-MISS running sum floored at 0, best starts at 0', false, `class Solution:
    def maxSubArray(self, nums):
        best = cur = 0
        for x in nums:
            cur = max(0, cur + x); best = max(best, cur)
        return best`],
	['maximum-subarray', 'NEAR-MISS largest prefix minus smallest prefix, ignoring order', false, `class Solution:
    def maxSubArray(self, nums):
        p = [0]
        for x in nums: p.append(p[-1] + x)
        return max(p[1:]) - min(p[:-1])`],
	['maximum-subarray', 'correct Kadane', true, `class Solution:
    def maxSubArray(self, nums):
        best = cur = nums[0]
        for x in nums[1:]:
            cur = max(x, cur + x); best = max(best, cur)
        return best`],
	['jump-game', 'NEAR-MISS any zero means stuck', false, `class Solution:
    def canJump(self, nums): return 0 not in nums`],
	['jump-game', 'NEAR-MISS any zero before the last cell means stuck', false, `class Solution:
    def canJump(self, nums): return 0 not in nums[:-1]`],
	['jump-game', 'NEAR-MISS never checks the index is still reachable', false, `class Solution:
    def canJump(self, nums):
        reach = 0
        for i, x in enumerate(nums): reach = max(reach, i + x)
        return reach >= len(nums) - 1`],
	['jump-game', 'correct', true, `class Solution:
    def canJump(self, nums):
        reach = 0
        for i, x in enumerate(nums):
            if i > reach: return False
            reach = max(reach, i + x)
        return True`],
	['jump-game-ii', 'NEAR-MISS loops over every index, counting one jump too many', false, `class Solution:
    def jump(self, nums):
        jumps = end = far = 0
        for i in range(len(nums)):
            far = max(far, i + nums[i])
            if i == end: jumps += 1; end = far
        return jumps`],
	['jump-game-ii', 'NEAR-MISS always jumps as far as possible', false, `class Solution:
    def jump(self, nums):
        i = jumps = 0
        while i < len(nums) - 1:
            if nums[i] == 0: return -1              # the greedy choice landed on a dead end
            i += nums[i]; jumps += 1
        return jumps`],
	['jump-game-ii', 'correct', true, `class Solution:
    def jump(self, nums):
        jumps = end = far = 0
        for i in range(len(nums) - 1):
            far = max(far, i + nums[i])
            if i == end: jumps += 1; end = far
        return jumps`],
	['hand-of-straights', 'NEAR-MISS groups built from distinct values only', false, `class Solution:
    def isNStraightHand(self, hand, groupSize):
        if len(hand) % groupSize: return False
        v = sorted(set(hand))
        return all(v[i + j] == v[i] + j for i in range(0, len(v) - groupSize + 1, groupSize) for j in range(groupSize)) and len(v) % groupSize == 0`],
	['hand-of-straights', 'NEAR-MISS consecutive chunks of the sorted hand', false, `class Solution:
    def isNStraightHand(self, hand, groupSize):
        if len(hand) % groupSize: return False
        h = sorted(hand)
        return all(h[i + j] == h[i] + j for i in range(0, len(h), groupSize) for j in range(groupSize))`],
	['hand-of-straights', 'correct', true, `class Solution:
    def isNStraightHand(self, hand, groupSize):
        from collections import Counter
        if len(hand) % groupSize: return False
        c = Counter(hand)
        for x in sorted(c):
            n = c[x]
            if n:
                for k in range(x, x + groupSize):
                    if c[k] < n: return False
                    c[k] -= n
        return True`],
	['merge-triplets-to-form-target-triplet', 'NEAR-MISS takes every triplet, no filter', false, `class Solution:
    def mergeTriplets(self, triplets, target):
        return [max(t[i] for t in triplets) for i in range(3)] == target`],
	['merge-triplets-to-form-target-triplet', 'NEAR-MISS each coordinate matched somewhere, no filter', false, `class Solution:
    def mergeTriplets(self, triplets, target):
        return all(any(t[i] == target[i] for t in triplets) for i in range(3))`],
	['merge-triplets-to-form-target-triplet', 'correct', true, `class Solution:
    def mergeTriplets(self, triplets, target):
        good = set()
        for t in triplets:
            if all(t[i] <= target[i] for i in range(3)):
                good |= {i for i in range(3) if t[i] == target[i]}
        return len(good) == 3`],
	['partition-labels', 'NEAR-MISS partition end not extended with max', false, `class Solution:
    def partitionLabels(self, s):
        last = {c: i for i, c in enumerate(s)}; out = []; start = end = 0
        for i, c in enumerate(s):
            if i > end: out.append(end - start + 1); start = i
            end = last[c] if i == start else end
        out.append(end - start + 1)
        return out`],
	['partition-labels', 'NEAR-MISS first occurrence instead of last', false, `class Solution:
    def partitionLabels(self, s):
        first = {}
        for i, c in enumerate(s): first.setdefault(c, i)
        out = []; start = end = 0
        for i, c in enumerate(s):
            end = max(end, first[c])
            if i == end: out.append(end - start + 1); start = i + 1
        return out`],
	['partition-labels', 'correct', true, `class Solution:
    def partitionLabels(self, s):
        last = {c: i for i, c in enumerate(s)}; out = []; start = end = 0
        for i, c in enumerate(s):
            end = max(end, last[c])
            if i == end: out.append(end - start + 1); start = i + 1
        return out`],
	['valid-parenthesis-string', 'NEAR-MISS lo not clamped at zero', false, `class Solution:
    def checkValidString(self, s):
        lo = hi = 0
        for c in s:
            lo += 1 if c == "(" else -1
            hi += 1 if c != ")" else -1
            if hi < 0: return False
        return lo == 0`],
	['valid-parenthesis-string', 'NEAR-MISS counts only, order ignored', false, `class Solution:
    def checkValidString(self, s):
        return abs(s.count("(") - s.count(")")) <= s.count("*")`],
	['valid-parenthesis-string', 'NEAR-MISS never rejects when hi goes negative', false, `class Solution:
    def checkValidString(self, s):
        lo = hi = 0
        for c in s:
            lo += 1 if c == "(" else -1
            hi += 1 if c != ")" else -1
            lo = max(lo, 0)
        return lo == 0`],
	['valid-parenthesis-string', 'correct', true, `class Solution:
    def checkValidString(self, s):
        lo = hi = 0
        for c in s:
            lo += 1 if c == "(" else -1
            hi += 1 if c != ")" else -1
            if hi < 0: return False
            lo = max(lo, 0)
        return lo == 0`]
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
