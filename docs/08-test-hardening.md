# 08. Test hardening: auditing every suite against its reference solution

Opened 2026-09-07 after a suite was found to be systematically excluding the cases that matter.

## The finding

`two-sum-ii-input-array-is-sorted` accepted a solution that cannot pair a value with an equal
value — the `[3,3] target 6` case. It scored **43/43**. Zero of its 43 cases had an answer that was
a pair of equal values.

## The root cause, which was general

Generators kept a single expected answer meaningful by REJECTING inputs with more than one valid
answer:

```python
pairs = sum(1 for a in ... if nums[a] + nums[b] == target)
return None if pairs != 1 else [nums, target]
```

For two-sum, "has a second valid pair" and "has duplicates" are very nearly the same condition. So
the filter meant to protect the expectation was quietly deleting the hardest inputs from the suite.
The same rejection existed in `two-sum`, `top-k-frequent-elements`, `k-closest-points-to-origin`,
`gas-station`, `course-schedule-ii` and `alien-dictionary`.

**A suite that only contains unambiguous inputs only tests unambiguous behaviour.**

## The fix: validate the answer, do not match it

Problems with several correct answers are now judged by a **validator** in `driver.py`
(`VALIDATORS`, selected per problem in `tests-curation.json`) which checks whether the answer given
is correct, rather than whether it equals the oracle's. `expected` stays in the file as the
oracle's answer, shown when a case fails.

That removes the reason to filter, so the generators now deliberately SEEK duplicates and ties.
`two-sum` and `two-sum-ii` construct an equal-valued answer pair outright in ~35% of draws, because
randomness alone produced it almost never.

## The trap on the other side

Loosening a filter can produce inputs the problem promises will never occur, and the oracle is not
obliged to survive them. `top-k-frequent-elements` guarantees the answer is unique, and NeetCode's
reference returns only when `len(res) == k` exactly — a tie at the k-th boundary overshoots and the
function falls off the end returning `None`. Allowing ties there made 21 of 43 cases garbage.

So the rule is not "always allow ambiguity". It is:

- **Ambiguity the problem permits** → allow it, and judge with a validator.
- **Ambiguity the problem forbids** → keep rejecting it; the input is invalid.

Telling the two apart requires reading the problem's constraints and the reference solution, which
is what the audit below is for.

## The audit method, per problem

1. Read the vendored reference at `static/solutions/python/<code>.py` and note what it guards
   against — duplicate skipping, empty checks, `while l < r` boundaries, overflow clamps.
2. Read the LeetCode constraints for guarantees the generator must respect, and for the ones it
   must not silently assume.
3. Check the generated cases actually contain those situations. Count them; do not eyeball.
4. Strengthen the generator, or add a validator when several answers are correct.
5. Write a **near-miss** wrong solution — one that is correct except for that edge case — and
   confirm the suite now fails it. A suite that cannot fail a plausible wrong answer is not tested.
6. Confirm an independent correct solution still passes 100%, so the change did not start
   rejecting valid answers.

Steps 5 and 6 are the ones that count. Steps 1 to 4 are how you know what to write for step 5.

Every pair lives in `scripts/audit-suites.mjs` and runs in CI, so a suite that weakens later is
caught rather than rediscovered.

### Researching each problem

Duplicate handling is one trap among many, and guessing which one a problem hides does not scale.
From batch 2 onward each problem is looked up — its known edge cases, and the wrong solutions people
actually write — before the suite is measured. That is what found the digit trap below; no amount of
staring at the generator would have suggested it, because the generator's alphabet had no digits in
it to think about.

### What batch 2 found

| problem | the gap | after |
|---|---|---|
| `valid-palindrome` | **0** cases contained a digit, so filtering with `isalpha()` — which silently drops digits, the `"0P"` case — passed all 43 | 22 |
| `valid-palindrome` | **1** case contained an uppercase letter, so never calling `.lower()` passed 42 of 43 | 30 |
| `3sum` | **1** case had three or more zeros, and 26 of 43 had an empty answer, so returning `[]` scored 26/43 | 4 zeros-cases; 33 non-empty |
| `container-with-most-water` | **2** monotonic cases, where moving the wrong pointer is most visible | 17 |
| `trapping-rain-water` | few basins with the global maximum at an end, the shape that makes unclamped prefix maxima go negative | 23 with a non-zero answer |

The `trapping-rain-water` near-miss now scores **2/42**: subtracting without clamping at zero is wrong
almost everywhere once real basins exist, and was invisible before.

### Batch 1 revisited

Batch 1 was audited before the research step existed — its edge cases came from reasoning about the
problems rather than looking them up. Re-running it with research found gaps the reasoning missed,
which is the argument for the step:

| problem | the gap research found | after |
|---|---|---|
| `group-anagrams` | the empty string is LeetCode's own example 2 (`[""]` -> `[[""]]`), and the generator produced none: word lengths started at 1. The single case present came from the published example, not from generation | 13 |
| `contains-duplicate` | **0** single-element arrays, though the constraints allow `n == 1` | 7 |
| `longest-consecutive-sequence` | **0** single-element arrays, and none near the ends of the stated value range | 4 |
| `valid-anagram` | **0** single-character strings, the shortest the constraints allow | 2 |
| `product-of-array-except-self` | the documented off-by-one — multiplying into the accumulator *before* storing, so an element is included in its own product — had no near-miss pinning it | now fails 14/42 |

The lesson worth keeping: reasoning about a problem finds the edge cases you already know about. The
`valid-palindrome` digit trap and the `group-anagrams` empty string were both invisible that way,
because the generator contained no digits and no empty strings to prompt the thought.

### What batch 1 found

Measuring before changing anything is the point of step 3; each of these was a count, not a hunch.

| problem | the gap | after |
|---|---|---|
| `valid-sudoku` | **1** case in 42 had a conflict only inside a 3x3 box, so a rows-and-columns-only checker scored 41/42 | 13 |
| `encode-and-decode-strings` | **0** cases contained a string of length >= 10, so a length prefix reading a single digit passed everything | 25 |
| `product-of-array-except-self` | 29 of 42 cases had three or more zeros; only **2** had none and **2** exactly one, which are the regimes that differ | 16 / 12 |
| `longest-consecutive-sequence` | no empty arrays, and duplicates never sat inside a run | 32 with duplicates, 3 empty |
| `valid-anagram` | **5** cases had the same letters in different counts, the case that defeats comparing `set()` | 12 |
| `contains-duplicate` | duplicates were usually adjacent, which a neighbours-only check survives | 25 non-adjacent |

### What batch 3 found

The alphabet was the whole story, again, and in the same shape as `valid-palindrome`'s missing
digits. Two suites drew from lowercase letters only, so the characters that make the problem a
problem were absent from every case:

| problem | the gap | after |
|---|---|---|
| `longest-substring-without-repeating-characters` | LeetCode's alphabet is "English letters, digits, symbols and spaces"; the generator drew from `ab`/`abc`/`abcdef`. A solution calling `.lower()` scored **43/43**, and so did one stripping punctuation. A 26-slot lowercase table scored 43/43 too | 12 mixed-case, 14 with a space, 7 with a digit, 7 with a symbol |
| `minimum-window-substring` | `s` and `t` are upper **and** lower case; **1** case in 43 had any uppercase, so a case-insensitive solution scored 43/43 | 22 |
| `sliding-window-maximum` | **1** all-negative case in 42, the only shape that catches a running maximum seeded at 0 | 21 |
| `permutation-in-string` | a two-letter alphabet made "same letters, different counts" — the input that defeats a set — rarer than it should be | 27 cases over 3+ letters |
| `best-time-to-buy-and-sell-stock` | no all-equal runs; `prices[i]` can be 0, so a minimum seeded at 0 is a real bug | 8 all-equal, 22 containing a zero |

The case-insensitive near-miss on `longest-substring-without-repeating-characters` now scores
**33/43**, and the 26-slot table **21/43**.

#### The opposite failure, found the same day

`minimum-window-substring` was also **over-rejecting**. LeetCode states "the testcases will be
generated such that the answer is unique", and the generator ignored that: 4 of 43 cases had two
different shortest windows. A correct solution keeping the *last* shortest window rather than the
first scored **40/43** — failed for being correct. The generator now redraws when a tie appears.

This is the `top-k-frequent-elements` lesson from the other side. Rejecting inputs is what caused
the original two-sum disaster, so it is worth saying why it is right here: for two-sum, "has a
second valid pair" and "has duplicates" are nearly the same condition, so the filter deleted the
hard cases. For `minimum-window-substring` a tie is a coincidence of which letters landed where,
uncorrelated with any of the traps — `t` with repeats, an answer at either end, `t` longer than
`s`. Counts for those were unchanged by the filter.

#### Checked and deliberately not flagged

Two plausible-looking "bugs" are not bugs, and the audit pins them as CORRECT so a later change
cannot start rejecting them:

- `longest-repeating-character-replacement` with a **non-shrinking window** that returns
  `len(s) - l`, never tracking a running maximum and never decreasing the stale `maxf`.
- `sliding-window-maximum` popping the deque on `<=` rather than `<`.

Both were verified exhaustively against brute force over small alphabets.

### What batch 4 found

Two suites were caught by a **published example and by nothing else**, which is the same as not
being tested. Remove the example and each near-miss scores a clean sweep:

| problem | the gap | after |
|---|---|---|
| `car-fleet` | a car arriving at the same time as the fleet ahead joins it, so a tie must merge. **1** of 43 cases had an exact arrival-time tie, and it was LeetCode's own example 1. Treating a tie as a new fleet scored **42/43** | 21, built by fixing a whole-number arrival time and placing cars at `target - T * speed` |
| `min-stack` | re-pushing the current minimum and popping once is the documented bug. Values drawn from a 41-wide range never repeated, so a min-stack recording only strict improvements scored **42/43**, failing one hand-written extra | 35 |
| `evaluate-reverse-polish-notation` | division truncates toward **zero**, so `-7 / 2` is `-3` where Python's `//` gives `-4`. Only a division with a negative quotient and a non-zero remainder tells them apart, and there were none | 24 |
| `valid-parentheses` | random bracket strings are almost never balanced: **6** of 45 answered true, and **3** cases were empty, which the constraint `1 <= s.length` forbids | 13 true, 0 empty |
| `daily-temperatures` | an equal later temperature is not warmer; over the full 30..100 range ties were uncommon | 26 |
| `generate-parentheses` | 8 generated cases over `n` in 1..7. `n = 8` — 1430 strings, the only size big enough to catch a solution that is right for small `n` by luck — never appeared | 16 cases, `n = 8` weighted |
| `largest-rectangle-in-histogram` | no deliberate plateaus, the shape that defeats a prev/next-smaller pass that is strict on both sides | 15 with adjacent equal heights |

#### A generator that was quietly emitting invalid inputs

Rewriting the RPN generator to seek floor-versus-truncate divisions exposed something worse in the
old one. It sometimes overwrote an operator token with an operand, leaving **2 of 43 expressions
malformed** — the stack did not reduce to a single value. That broke the problem's "the input
represents a valid arithmetic expression" guarantee, and it was invisible because the vendored
reference returns `stack[0]` rather than `stack[-1]`: a leftover stack does not raise, it quietly
answers the first token. A correct solution reading `stack[-1]` was failed by those two cases.

The audit pins a `stack[-1]` solution as CORRECT, so a malformed expression cannot creep back
unnoticed.

#### Corrected while researching

Two things assumed going in turned out to be wrong, both checked by running the code:

- `koko-eating-bananas` with `hi = max(piles)` is **correct**, not a too-small bound: at that
  speed every pile takes one hour, and `piles.length <= h` is guaranteed. The real bugs are bounds
  smaller than that.
- Comparing against `nums[0]` is a genuine bug in `find-minimum-in-rotated-sorted-array` but is
  **benign** in `search-in-rotated-sorted-array`. The same-looking hint is wrong for one of them.

### What batch 5 found

Mostly thin margins rather than open holes: several near-misses already failed, but on one or two
cases, which is one regeneration away from failing on none.

| problem | the gap | after |
|---|---|---|
| `search-in-rotated-sorted-array` | on a two-element window `mid == lo`, so `nums[l] < nums[m]` takes the wrong branch. **1** case in 43 was length 2, and the bug scored **42/43** on the strength of it | the shape is now built outright: a rotated pair whose target is the smaller element |
| `median-of-two-sorted-arrays` | `j = half - i` only goes negative when the array being searched is the longer one. Both sides drawn from 0..8 made that rare, so never swapping to the shorter array scored **41/42**. Total length 1, the smallest legal input, was absent | 12 heavily skewed pairs, 4 of total length 1 |
| `find-minimum-in-rotated-sorted-array` | "rotated between 1 and n times" includes the identity, so a sorted array is legal — it is LeetCode's example 3, and the only shape that catches pivoting on `nums[0]` | 22 unrotated, 20 of length <= 2 |
| `koko-eating-bananas` | `h == piles.length` is the tightest legal budget, where the answer is exactly `max(piles)`; **3** cases had it and **1** answered 1 | 10 and 10 |
| `search-a-2d-matrix` | 1x1 is legal and absent; square matrices are where flattening with the row count is silently right | 3 one-by-one |
| `binary-search` | **2** single-element arrays, the input a `while l < r` loop with `r = mid - 1` never examines | 6 |

#### A crash in the judge itself

Adding a median near-miss that returns `float("-inf")` did not fail — it took down the whole audit
run. `json.dumps` writes `Infinity`, `-Infinity` and `NaN` happily, and `JSON.parse` accepts none
of them, so the result never made it back across the boundary.

The same boundary is in `src/lib/pyodide/worker.js`, which is the **browser judge**. Any solution
returning an infinite sentinel — and binary-search and median problems invite exactly that — would
have produced an opaque worker error instead of a failed case. `driver.py` now maps non-finite
floats to their names in `json_safe`, so both the worker and the audit report them as ordinary
wrong answers. Expected values are loaded from JSON and can never be non-finite, so the comparison
stays correctly unequal.

This is the second time a change made for the suites turned up a defect in the judge, after the RPN
malformed-expression finding in batch 4.

### What batch 6 found

The judge was calling two textbook wrong answers correct.

| problem | the gap | after |
|---|---|---|
| `reverse-linked-list` | `prev = head` instead of `None` leaves the tail pointing at itself. Scored **43/43** | now **4/43** |
| `reorder-list` | forgetting `slow.next = None` before reversing leaves the list circular. Scored **42/42**, and there were no single-node cases at all | now **5/42**; 7 single-node cases |
| `find-the-duplicate-number` | the constraint is "appears **two or more** times", and the generator always placed exactly two copies — the assumption the sum formula makes. It scored **42/43**, failing only LeetCode's example 3 | 16 cases repeat the duplicate more than twice |
| `copy-list-with-random-pointer` | values are not unique, and an all-identical list is what collapses a map keyed by value. **2** of 43 had one | 8 |
| `lru-cache` | three separate recency bugs, none caught by one sequence. Keys 1..6 against capacity 1..4 left the deciding order to chance, so the put-refresh bug scored **42/43** | a constructed sequence: fill, touch the LRU, force one eviction, read everything back. Now 36/43 |
| `linked-list-cycle` | node values span the whole range, so `-1` is not a safe visited marker; few cases contained one | 21 |

#### Why two wrong answers looked right

`from_linked` broke out of a cycle to keep the worker from hanging, and returned what it had walked
so far. For both bugs above, that prefix is **exactly the correct answer** — the corruption is in
the final `next` pointer, past every value. A real judge would hang or reject; this one accepted.

It now appends a `<cycle>` marker instead, which keeps the walk finite, makes the result unequal to
any valid list, and says why in the failure detail.

That is the third judge defect surfaced by this audit, after the RPN malformed expressions in
batch 4 and non-finite floats in batch 5. The pattern is consistent: a guard added so the harness
could not crash was also swallowing the evidence.

### What batch 7 found

`validate-binary-search-tree` is the clearest example so far of a suite that looked thorough and
tested nothing. Its generator produced either a genuine BST or an arbitrary random tree, which is
almost always wildly invalid. Both classic bugs scored **42/42**.

What was missing is the tree that is only *subtly* wrong:

- **the ancestor bound** — every parent/child pair correctly ordered, but a node on the wrong side
  of a grandparent. LeetCode's own `[2,null,3,1]`. A check comparing a node only with its direct
  children cannot see it. Now **33/42**.
- **the duplicate** — the BST property is strict, so equal values are invalid, and an in-order
  scan written with `<=` accepts them. Now **30/42**.

| problem | the gap | after |
|---|---|---|
| `validate-binary-search-tree` | valid or random, never nearly-valid; both bugs scored 42/42 | 33/42 and 30/42 |
| `subtree-of-another-tree` | a randomly drawn subRoot is essentially never a subtree, so **1** case in 42 answered true and `return False` scored **41/42** | subRoot is lifted out of root, or lifted and then stripped of its descendants — the shape that fools a match stopping when subRoot runs out. Now 23/42 |
| `diameter-of-binary-tree` | the diameter of a random tree almost always runs through the root: **2** cases in 42 did not, so measuring only at the root scored 40/42 | a bushy subtree hung off a one-sided root. Now 32/42 |
| `binary-tree-maximum-path-sum` | the path is non-empty, so an all-negative tree answers with its largest single node — the only thing that catches a best-so-far seeded at 0. **2** cases were all-negative | now 20/42 |
| `count-good-nodes-in-binary-tree` | same shape: values may be negative, and **3** cases in 43 were entirely so | now 16/43 |
| `same-tree` | `[1,2]` and `[1,null,2]` have identical value sequences and mirrored shapes, which is what defeats comparing preorder without null markers | one node's children are swapped on purpose |

## Status

64 of 150 audited. `pnpm run audit` re-runs every near-miss, and CI fails if one starts passing. Batches follow the tech tree, so the nodes in play are hardened first.

### Batch 1: Arrays & Hashing (9/9 audited)
- [x] `contains-duplicate` — Easy
- [x] `valid-anagram` — Easy
- [x] `two-sum` — Easy
- [x] `group-anagrams` — Medium
- [x] `top-k-frequent-elements` — Medium
- [x] `product-of-array-except-self` — Medium
- [x] `valid-sudoku` — Medium
- [x] `encode-and-decode-strings` — Medium
- [x] `longest-consecutive-sequence` — Medium
### Batch 2: Two Pointers (5/5 audited)
- [x] `valid-palindrome` — Easy
- [x] `two-sum-ii-input-array-is-sorted` — Medium
- [x] `3sum` — Medium
- [x] `container-with-most-water` — Medium
- [x] `trapping-rain-water` — Hard
### Batch 3: Sliding Window (6/6 audited)
- [x] `best-time-to-buy-and-sell-stock` — Easy
- [x] `longest-substring-without-repeating-characters` — Medium
- [x] `longest-repeating-character-replacement` — Medium
- [x] `permutation-in-string` — Medium
- [x] `minimum-window-substring` — Hard
- [x] `sliding-window-maximum` — Hard
### Batch 4: Stack (7/7 audited)
- [x] `valid-parentheses` — Easy
- [x] `min-stack` — Medium
- [x] `evaluate-reverse-polish-notation` — Medium
- [x] `generate-parentheses` — Medium
- [x] `daily-temperatures` — Medium
- [x] `car-fleet` — Medium
- [x] `largest-rectangle-in-histogram` — Hard
### Batch 5: Binary Search (7/7 audited)
- [x] `binary-search` — Easy
- [x] `search-a-2d-matrix` — Medium
- [x] `koko-eating-bananas` — Medium
- [x] `find-minimum-in-rotated-sorted-array` — Medium
- [x] `search-in-rotated-sorted-array` — Medium
- [x] `time-based-key-value-store` — Medium
- [x] `median-of-two-sorted-arrays` — Hard
### Batch 6: Linked List (11/11 audited)
- [x] `reverse-linked-list` — Easy
- [x] `merge-two-sorted-lists` — Easy
- [x] `reorder-list` — Medium
- [x] `remove-nth-node-from-end-of-list` — Medium
- [x] `copy-list-with-random-pointer` — Medium
- [x] `add-two-numbers` — Medium
- [x] `linked-list-cycle` — Easy
- [x] `find-the-duplicate-number` — Medium
- [x] `lru-cache` — Medium
- [x] `merge-k-sorted-lists` — Hard
- [x] `reverse-nodes-in-k-group` — Hard
### Batch 7: Trees (15/15 audited)
- [x] `invert-binary-tree` — Easy
- [x] `maximum-depth-of-binary-tree` — Easy
- [x] `diameter-of-binary-tree` — Easy
- [x] `balanced-binary-tree` — Easy
- [x] `same-tree` — Easy
- [x] `subtree-of-another-tree` — Easy
- [x] `lowest-common-ancestor-of-a-binary-search-tree` — Medium
- [x] `binary-tree-level-order-traversal` — Medium
- [x] `binary-tree-right-side-view` — Medium
- [x] `count-good-nodes-in-binary-tree` — Medium
- [x] `validate-binary-search-tree` — Medium
- [x] `kth-smallest-element-in-a-bst` — Medium
- [x] `construct-binary-tree-from-preorder-and-inorder-traversal` — Medium
- [x] `binary-tree-maximum-path-sum` — Hard
- [x] `serialize-and-deserialize-binary-tree` — Hard
### Batch 8: Tries (0/3 audited)
- [ ] `implement-trie-prefix-tree` — Medium
- [ ] `design-add-and-search-words-data-structure` — Medium
- [ ] `word-search-ii` — Hard
### Batch 9: Heap / Priority Queue (1/7 audited)
- [ ] `kth-largest-element-in-a-stream` — Easy
- [ ] `last-stone-weight` — Easy
- [x] `k-closest-points-to-origin` — Medium
- [ ] `kth-largest-element-in-an-array` — Medium
- [ ] `task-scheduler` — Medium
- [ ] `design-twitter` — Medium
- [ ] `find-median-from-data-stream` — Hard
### Batch 10: Backtracking (0/9 audited)
- [ ] `subsets` — Medium
- [ ] `combination-sum` — Medium
- [ ] `permutations` — Medium
- [ ] `subsets-ii` — Medium
- [ ] `combination-sum-ii` — Medium
- [ ] `word-search` — Medium
- [ ] `palindrome-partitioning` — Medium
- [ ] `letter-combinations-of-a-phone-number` — Medium
- [ ] `n-queens` — Hard
### Batch 11: Graphs (1/13 audited)
- [ ] `number-of-islands` — Medium
- [ ] `clone-graph` — Medium
- [ ] `max-area-of-island` — Medium
- [ ] `pacific-atlantic-water-flow` — Medium
- [ ] `surrounded-regions` — Medium
- [ ] `rotting-oranges` — Medium
- [ ] `walls-and-gates` — Medium
- [ ] `course-schedule` — Medium
- [x] `course-schedule-ii` — Medium
- [ ] `redundant-connection` — Medium
- [ ] `number-of-connected-components-in-an-undirected-graph` — Medium
- [ ] `graph-valid-tree` — Medium
- [ ] `word-ladder` — Hard
### Batch 12: Advanced Graphs (1/6 audited)
- [ ] `reconstruct-itinerary` — Hard
- [ ] `min-cost-to-connect-all-points` — Medium
- [ ] `network-delay-time` — Medium
- [ ] `swim-in-rising-water` — Hard
- [x] `alien-dictionary` — Hard
- [ ] `cheapest-flights-within-k-stops` — Medium
### Batch 13: 1-D Dynamic Programming (0/12 audited)
- [ ] `climbing-stairs` — Easy
- [ ] `min-cost-climbing-stairs` — Easy
- [ ] `house-robber` — Medium
- [ ] `house-robber-ii` — Medium
- [ ] `longest-palindromic-substring` — Medium
- [ ] `palindromic-substrings` — Medium
- [ ] `decode-ways` — Medium
- [ ] `coin-change` — Medium
- [ ] `maximum-product-subarray` — Medium
- [ ] `word-break` — Medium
- [ ] `longest-increasing-subsequence` — Medium
- [ ] `partition-equal-subset-sum` — Medium
### Batch 14: 2-D Dynamic Programming (0/11 audited)
- [ ] `unique-paths` — Medium
- [ ] `longest-common-subsequence` — Medium
- [ ] `best-time-to-buy-and-sell-stock-with-cooldown` — Medium
- [ ] `coin-change-ii` — Medium
- [ ] `target-sum` — Medium
- [ ] `interleaving-string` — Medium
- [ ] `longest-increasing-path-in-a-matrix` — Hard
- [ ] `distinct-subsequences` — Hard
- [ ] `edit-distance` — Medium
- [ ] `burst-balloons` — Hard
- [ ] `regular-expression-matching` — Hard
### Batch 15: Greedy (1/8 audited)
- [ ] `maximum-subarray` — Medium
- [ ] `jump-game` — Medium
- [ ] `jump-game-ii` — Medium
- [x] `gas-station` — Medium
- [ ] `hand-of-straights` — Medium
- [ ] `merge-triplets-to-form-target-triplet` — Medium
- [ ] `partition-labels` — Medium
- [ ] `valid-parenthesis-string` — Medium
### Batch 16: Intervals (0/6 audited)
- [ ] `insert-interval` — Medium
- [ ] `merge-intervals` — Medium
- [ ] `non-overlapping-intervals` — Medium
- [ ] `meeting-rooms` — Easy
- [ ] `meeting-rooms-ii` — Medium
- [ ] `minimum-interval-to-include-each-query` — Hard
### Batch 17: Math & Geometry (0/8 audited)
- [ ] `rotate-image` — Medium
- [ ] `spiral-matrix` — Medium
- [ ] `set-matrix-zeroes` — Medium
- [ ] `happy-number` — Easy
- [ ] `plus-one` — Easy
- [ ] `powx-n` — Medium
- [ ] `multiply-strings` — Medium
- [ ] `detect-squares` — Medium
### Batch 18: Bit Manipulation (0/7 audited)
- [ ] `single-number` — Easy
- [ ] `number-of-1-bits` — Easy
- [ ] `counting-bits` — Easy
- [ ] `reverse-bits` — Easy
- [ ] `missing-number` — Easy
- [ ] `sum-of-two-integers` — Medium
- [ ] `reverse-integer` — Medium
