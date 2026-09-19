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

### A comparison rule that accepted anything (2026-09-19)

Found while reading the curation file rather than by auditing a batch, and worth its own note
because it is a different failure from a thin generator: the **comparison rule itself** was wrong,
so two suites accepted answers that are not merely imprecise but meaningless.

`unordered-nested` sorts the inner lists as well as the outer one. That is right when an inner
list is a *set* of things — the groups in `group-anagrams`, the triplets in `3sum`, the multisets
in `combination-sum`. It is wrong when the inner order carries meaning:

| problem | what an inner list is | what the rule did |
|---|---|---|
| `permutations` | the answer itself — a permutation | normalised every permutation of `[1,2,3]` to `[1,2,3]`, so returning **n! copies of the sorted list scored 23/23** |
| `pacific-atlantic-water-flow` | a `[row, col]` coordinate | made `[1,2]` and `[2,1]` equal, so returning **every coordinate reversed scored 42/42** |

Both are now `unordered`: the outer list stays order-insensitive, the inner does not. A correct
solution that enumerates in a different order still passes; the two wrong ones now score 5/23 and
3/42.

`k-closest-points-to-origin` has the same `[x, y]` inner shape and was also marked
`unordered-nested`, but it is judged by a validator, which takes precedence over the comparison
rule, so it was never affected.

### What batch 8 found

The thinnest batch so far: all six trie near-misses already failed, because the generator was
built around the right idea — searching strict prefixes of inserted words is what separates
`search` from `startsWith`, and it did that deliberately. What it got wrong was the opposite
problem, generating inputs the constraints forbid:

| problem | the gap | after |
|---|---|---|
| `design-add-and-search-words-data-structure` | "there will be at most 2 dots in word for search queries", and the generator dotted every character independently, so all-dot patterns of any length were common. A solution leaning on that guarantee would have been failed for being right | every pattern now carries at most 2 dots; a hand-written extra using `"..."` became `"ab."`, which tests the same thing (a pattern longer than every stored word) within the rules |

Worth recording because it is the mirror of the usual finding. A generator can be too permissive
as well as too narrow, and both produce a suite that disagrees with LeetCode.

### What batch 9 found

One suite where the generator had quietly made two different orderings the same thing:

| problem | the gap | after |
|---|---|---|
| `design-twitter` | tweet ids are unique but **not** increasing over time, and the feed is ordered by when a tweet was posted. The generator handed ids out as 1, 2, 3, ..., so id order and post order always agreed and sorting the feed by tweet id scored **42/42** | ids are drawn from a shuffled pool, still unique. Now 33/42 |

Everything else in this batch already failed its near-misses: the kth-*distinct* misreading on
both 215 and 703, the unclamped `task-scheduler` frame formula, the missing empty-heap guard on
`last-stone-weight`, and integer division in `find-median-from-data-stream`. `k-closest-points-to-
origin` was audited back in batch 1.

### What batch 10 found

| problem | the gap | after |
|---|---|---|
| `word-search` | a random word over a random board is almost never present — **17** of 43 answered true — so the search that never restores a cell it marked scored **43/43**. That bug is a false *negative*: a dead-ended attempt blanks letters a later, successful start needs. It can only show when the word really is on the board | words are read off self-avoiding walks, half of them reversed so the row-major scan tries the wrong end first. Now 39/43 |
| `word-search` | the board is upper **and** lower case; the generator used `abc` | mixed-case boards, and words with one letter's case flipped. Case-insensitive now 38/43 |
| `n-queens` | `n` was drawn from 1..7, so 8 and 9 were impossible, and 2 and 3 — the only sizes with **no** solutions — were left to chance | every `n` from 1 to 9 present; 2, 3, 5, 7 and 9 pinned as extras |
| `subsets-ii` | 2 empty arrays, which `1 <= nums.length` forbids | none |

#### A generator fix that broke a different near-miss

Making `word-search` words findable raised the true-answer rate from 17 to 39 of 43. That fixed the
restore bug and **silently broke** the diagonal one, which went from failing to scoring **43/43**:
a search that steps diagonally is caught only by a *false* answer that a diagonal path would make
true, and there were hardly any false answers left.

The audit caught it on the next run, which is the whole argument for keeping every pair in CI
rather than checking each fix once. The generator now has an explicit branch per bug —
orthogonal walks, diagonal walks, case flips — instead of one knob trading them against each
other. The alphabet mattered as much as the shapes: over three letters the board is dense enough
that a diagonal word usually has an orthogonal path too.

The earlier `permutations` fix is exercised here as well: its audit pairs include n! copies of
the sorted list, which the old comparison rule accepted.

### What batch 11 found

| problem | the gap | after |
|---|---|---|
| `graph-valid-tree` | a tree needs `n-1` edges **and** connectivity. The input separating them is `n-1` edges that contain a cycle, which leaves a node isolated; there were **none**, so `return len(edges) == n - 1` scored **42/42** | 5 built outright: a tree over `n-1` nodes plus one extra edge. Now 37/42 |
| `course-schedule` | 207, unlike 210, has no `ai != bi` clause, so a self-loop is legal and makes the schedule impossible — **0** cases had one. Random sparse graphs also closed mostly two-node cycles, so looking only for `[a,b]` beside `[b,a]` scored **40/42** | 9 self-loops in otherwise acyclic graphs; longer rings built on purpose. Now 33/42 and 30/42 |
| `rotting-oranges` | with no fresh orange the answer is 0 even if nothing is rotten. **2** of 43 grids had no fresh orange and both had a rotten one, so bailing out with -1 on "nothing rotten" scored **43/43** | 15 with no fresh orange, 6 with neither. Now 37/43 |
| `cheapest-flights-within-k-stops` | k stops is k+1 flights, and the cheapest route may break that. Plain Dijkstra and a Bellman-Ford reading same-round distances both failed mostly on LeetCode's own example | a cheap chain and a dear direct flight, with `k` chosen to cut the chain |
| `surrounded-regions` | regions connect only orthogonally; treating a corner touch as safe scored **39/42** | diagonal chains laid in from a border cell. Now 33/42 |

### What batch 12 found

| problem | the gap | after |
|---|---|---|
| `cheapest-flights-within-k-stops` | Dijkstra with a **per-node visited set** scored **43/43**. It settles a node on the first, cheapest arrival and drops a later, dearer one that still has stops to spare, and nothing in the suite needed that later arrival | the shape is built outright: a node reached cheaply by a long route and dearly by a short one, where only the short one reaches the destination within `k`. Now 33/43 |
| `swim-in-rising-water` | a DP that only moves down and right is wrong whenever the best route doubles back, and random permutations almost never force that: it failed only LeetCode's own example | for n = 5 the smallest values run along a zigzag with a leftward row, or its transpose with an upward column. Now 26/42 |
| `network-delay-time` | weights make breadth-first order meaningless, but a BFS fixing each node on first discovery failed a single case in 43 | a dear direct edge beaten by a cheap detour. Now 36/43 |

`reconstruct-itinerary` and `min-cost-to-connect-all-points` already failed their near-misses — an
unsorted Hierholzer, a greedy walk, a nearest-neighbour chain, and the cheapest `n-1` edges taken
without a cycle check. `alien-dictionary` was audited in batch 1.

### What batch 13 found

The most solidly built batch so far: 31 of 32 near-misses already failed, most by a wide margin,
including the circular `house-robber-ii` run as a line, `decode-ways` treating `0` as a digit,
`maximum-product-subarray` tracking only the maximum, greedy `coin-change`, and the forward
0/1-knapsack loop that reuses an item in `partition-equal-subset-sum`.

| problem | the gap | after |
|---|---|---|
| `word-break` | the generator built `s` by joining dictionary words, so taking the longest match almost never walked into a dead end, and greedy longest-match scored **43/43** | two traps built outright: words `x`, `xy`, `yz` with `s = xyz`, where the longest first match strands `z` (LeetCode's `"aab"` shape), and a word that is a proper prefix of `s` where `s` is itself a word, which defeats greedy *shortest* match. Now 37/43 and 38/43 |

### What batch 14 found

Two generators never broke a length the problem depends on:

| problem | the gap | after |
|---|---|---|
| `interleaving-string` | `s3` always had exactly `len(s1) + len(s2)` characters, so a solution that never checks the lengths scored **43/43** | a genuine interleaving with its last character or two dropped: every character still matches, the walk just runs out first. Now 39/43. Greedy-prefers-`s1` is built outright too (`"a"`, `"ab"`, `"aba"`), 32/43 |
| `target-sum` | the target ranges over -1000..1000 whatever the numbers sum to, but was drawn from `[-sum, sum]`, so a solution indexing `(sum + target) // 2` with no range check scored **42/42** | targets beyond the reachable range by an even amount, mostly negative — in Python a negative index into the table reads the other end instead of raising. Now 34/42 |
| `regular-expression-matching` | `*` is zero **or** more, and zero is the case people miss (`"a*b"` matches `"b"`); reading it as one-or-more failed 2 cases | strings built from the pattern with each `x*` expanded to 0, 1 or 2 copies, 0 likeliest. Now 35/43 |
| `longest-common-subsequence`, `distinct-subsequences`, `regular-expression-matching` | all three drew empty strings, which their constraints forbid; an empty `t` in `distinct-subsequences` answers 1, a case the problem never poses | none |

### What batch 15 found

Every near-miss already failed, but several on one or two cases, for a reason worth naming: **a
random input was almost never answerable**, and "no" is what the wrong solutions say too.

| problem | the gap | after |
|---|---|---|
| `hand-of-straights` | a random hand almost never splits into straights. Treating the hand as distinct values, or cutting the sorted hand into consecutive chunks, needs a splittable hand *with repeated cards*; they failed 2 and 1 cases in 42 | hands built from overlapping runs, some knocked off by one card. 24 now answer true; the two bugs fail 9 and 6 |
| `merge-triplets-to-form-target-triplet` | a random target is rarely formable, so skipping the "no coordinate above the target" filter failed a single case | good triplets that cover the target plus a poison triplet that matches one coordinate and overshoots another. Now 24/43 |
| `maximum-subarray` | the subarray is non-empty, so an all-negative array answers with its largest element — the only thing catching a sum floored at 0. There were **2** | now 26/43 |

#### A near-miss that would have hung CI

The first draft of the `jump-game-ii` near-miss — always jump as far as possible — **never
terminates** on LeetCode's own example `[2,3,0,1,4]`: it lands on the `0` and adds zero forever.
The CI audit runs under Pyodide with no timeout, so that one case stalled the whole audit run;
it was caught only because the run took four times as long as usual, and stopped before it was
committed.

The native runner used to write these pairs had hidden it. It wrapped each candidate in a single
alarm, and a hang surfaced as one ordinary failed case, which for a near-miss looks like success.
It now times every case separately and reports a hang as its own verdict. The near-miss is
rewritten to give up on a dead end instead of spinning — still wrong, now finite. **Every
near-miss in the audit must terminate on every case.**

### What batch 16 found

The interval problems disagree with each other about two things, and a shared generator helper
had quietly assumed the most permissive answer to both:

- **Touching intervals.** `[1,2]` and `[2,3]` overlap in `merge-intervals` and `insert-interval`,
  which merge them, and do *not* overlap in `non-overlapping-intervals`, `meeting-rooms` and
  `meeting-rooms-ii`, where a meeting ending at `t` and one starting at `t` do not conflict.
- **Point intervals.** `start == end` is legal in 56, 57 and 1851 and forbidden in 435, 252 and 253
  (`start < end`).

| problem | the gap | after |
|---|---|---|
| `meeting-rooms-ii` | the shared `intervals()` helper drew lengths from 0..10, so point meetings like `[9,9]` appeared where the constraints forbid them. A meeting that starts and ends at once is resolved differently by different correct solutions, and one of them scored **40/42** | `intervals(strict=True)` for the three problems that require `start < end`; 253 also stops drawing the empty list its `1 <= length` forbids |
| `non-overlapping-intervals` | starts may be negative (`-5*10^4 <= start`) and none were, so a running end seeded at 0 instead of -infinity scored **43/43** | negative and straddling ranges |

The helper change is draw-for-draw identical when `strict` is off, so the three problems that
allow point intervals regenerated byte for byte.

## Status

135 of 150 audited. `pnpm run audit` re-runs every near-miss, and CI fails if one starts passing. Batches follow the tech tree, so the nodes in play are hardened first.

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
### Batch 8: Tries (3/3 audited)
- [x] `implement-trie-prefix-tree` — Medium
- [x] `design-add-and-search-words-data-structure` — Medium
- [x] `word-search-ii` — Hard
### Batch 9: Heap / Priority Queue (7/7 audited)
- [x] `kth-largest-element-in-a-stream` — Easy
- [x] `last-stone-weight` — Easy
- [x] `k-closest-points-to-origin` — Medium
- [x] `kth-largest-element-in-an-array` — Medium
- [x] `task-scheduler` — Medium
- [x] `design-twitter` — Medium
- [x] `find-median-from-data-stream` — Hard
### Batch 10: Backtracking (9/9 audited)
- [x] `subsets` — Medium
- [x] `combination-sum` — Medium
- [x] `permutations` — Medium
- [x] `subsets-ii` — Medium
- [x] `combination-sum-ii` — Medium
- [x] `word-search` — Medium
- [x] `palindrome-partitioning` — Medium
- [x] `letter-combinations-of-a-phone-number` — Medium
- [x] `n-queens` — Hard
### Batch 11: Graphs (13/13 audited)
- [x] `number-of-islands` — Medium
- [x] `clone-graph` — Medium
- [x] `max-area-of-island` — Medium
- [x] `pacific-atlantic-water-flow` — Medium
- [x] `surrounded-regions` — Medium
- [x] `rotting-oranges` — Medium
- [x] `walls-and-gates` — Medium
- [x] `course-schedule` — Medium
- [x] `course-schedule-ii` — Medium
- [x] `redundant-connection` — Medium
- [x] `number-of-connected-components-in-an-undirected-graph` — Medium
- [x] `graph-valid-tree` — Medium
- [x] `word-ladder` — Hard
### Batch 12: Advanced Graphs (6/6 audited)
- [x] `reconstruct-itinerary` — Hard
- [x] `min-cost-to-connect-all-points` — Medium
- [x] `network-delay-time` — Medium
- [x] `swim-in-rising-water` — Hard
- [x] `alien-dictionary` — Hard
- [x] `cheapest-flights-within-k-stops` — Medium
### Batch 13: 1-D Dynamic Programming (12/12 audited)
- [x] `climbing-stairs` — Easy
- [x] `min-cost-climbing-stairs` — Easy
- [x] `house-robber` — Medium
- [x] `house-robber-ii` — Medium
- [x] `longest-palindromic-substring` — Medium
- [x] `palindromic-substrings` — Medium
- [x] `decode-ways` — Medium
- [x] `coin-change` — Medium
- [x] `maximum-product-subarray` — Medium
- [x] `word-break` — Medium
- [x] `longest-increasing-subsequence` — Medium
- [x] `partition-equal-subset-sum` — Medium
### Batch 14: 2-D Dynamic Programming (11/11 audited)
- [x] `unique-paths` — Medium
- [x] `longest-common-subsequence` — Medium
- [x] `best-time-to-buy-and-sell-stock-with-cooldown` — Medium
- [x] `coin-change-ii` — Medium
- [x] `target-sum` — Medium
- [x] `interleaving-string` — Medium
- [x] `longest-increasing-path-in-a-matrix` — Hard
- [x] `distinct-subsequences` — Hard
- [x] `edit-distance` — Medium
- [x] `burst-balloons` — Hard
- [x] `regular-expression-matching` — Hard
### Batch 15: Greedy (8/8 audited)
- [x] `maximum-subarray` — Medium
- [x] `jump-game` — Medium
- [x] `jump-game-ii` — Medium
- [x] `gas-station` — Medium
- [x] `hand-of-straights` — Medium
- [x] `merge-triplets-to-form-target-triplet` — Medium
- [x] `partition-labels` — Medium
- [x] `valid-parenthesis-string` — Medium
### Batch 16: Intervals (6/6 audited)
- [x] `insert-interval` — Medium
- [x] `merge-intervals` — Medium
- [x] `non-overlapping-intervals` — Medium
- [x] `meeting-rooms` — Easy
- [x] `meeting-rooms-ii` — Medium
- [x] `minimum-interval-to-include-each-query` — Hard
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
