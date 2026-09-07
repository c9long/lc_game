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

## Status

7 of 150 audited. Batches follow the tech tree, so the nodes in play are hardened first.

### Batch 1: Arrays & Hashing (2/9 audited)
- [ ] `contains-duplicate` — Easy
- [ ] `valid-anagram` — Easy
- [x] `two-sum` — Easy
- [ ] `group-anagrams` — Medium
- [x] `top-k-frequent-elements` — Medium
- [ ] `product-of-array-except-self` — Medium
- [ ] `valid-sudoku` — Medium
- [ ] `encode-and-decode-strings` — Medium
- [ ] `longest-consecutive-sequence` — Medium
### Batch 2: Two Pointers (1/5 audited)
- [ ] `valid-palindrome` — Easy
- [x] `two-sum-ii-input-array-is-sorted` — Medium
- [ ] `3sum` — Medium
- [ ] `container-with-most-water` — Medium
- [ ] `trapping-rain-water` — Hard
### Batch 3: Sliding Window (0/6 audited)
- [ ] `best-time-to-buy-and-sell-stock` — Easy
- [ ] `longest-substring-without-repeating-characters` — Medium
- [ ] `longest-repeating-character-replacement` — Medium
- [ ] `permutation-in-string` — Medium
- [ ] `minimum-window-substring` — Hard
- [ ] `sliding-window-maximum` — Hard
### Batch 4: Stack (0/7 audited)
- [ ] `valid-parentheses` — Easy
- [ ] `min-stack` — Medium
- [ ] `evaluate-reverse-polish-notation` — Medium
- [ ] `generate-parentheses` — Medium
- [ ] `daily-temperatures` — Medium
- [ ] `car-fleet` — Medium
- [ ] `largest-rectangle-in-histogram` — Hard
### Batch 5: Binary Search (0/7 audited)
- [ ] `binary-search` — Easy
- [ ] `search-a-2d-matrix` — Medium
- [ ] `koko-eating-bananas` — Medium
- [ ] `find-minimum-in-rotated-sorted-array` — Medium
- [ ] `search-in-rotated-sorted-array` — Medium
- [ ] `time-based-key-value-store` — Medium
- [ ] `median-of-two-sorted-arrays` — Hard
### Batch 6: Linked List (0/11 audited)
- [ ] `reverse-linked-list` — Easy
- [ ] `merge-two-sorted-lists` — Easy
- [ ] `reorder-list` — Medium
- [ ] `remove-nth-node-from-end-of-list` — Medium
- [ ] `copy-list-with-random-pointer` — Medium
- [ ] `add-two-numbers` — Medium
- [ ] `linked-list-cycle` — Easy
- [ ] `find-the-duplicate-number` — Medium
- [ ] `lru-cache` — Medium
- [ ] `merge-k-sorted-lists` — Hard
- [ ] `reverse-nodes-in-k-group` — Hard
### Batch 7: Trees (0/15 audited)
- [ ] `invert-binary-tree` — Easy
- [ ] `maximum-depth-of-binary-tree` — Easy
- [ ] `diameter-of-binary-tree` — Easy
- [ ] `balanced-binary-tree` — Easy
- [ ] `same-tree` — Easy
- [ ] `subtree-of-another-tree` — Easy
- [ ] `lowest-common-ancestor-of-a-binary-search-tree` — Medium
- [ ] `binary-tree-level-order-traversal` — Medium
- [ ] `binary-tree-right-side-view` — Medium
- [ ] `count-good-nodes-in-binary-tree` — Medium
- [ ] `validate-binary-search-tree` — Medium
- [ ] `kth-smallest-element-in-a-bst` — Medium
- [ ] `construct-binary-tree-from-preorder-and-inorder-traversal` — Medium
- [ ] `binary-tree-maximum-path-sum` — Hard
- [ ] `serialize-and-deserialize-binary-tree` — Hard
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
