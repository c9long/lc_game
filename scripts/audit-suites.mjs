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
        return best`]
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
