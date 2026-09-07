# 07. In-browser judge (Pyodide)

Supersedes the **Execution** row of [06-merged-design.md](06-merged-design.md). Decided 2026-09-06 after LeetCode's judge became unreachable from any server.

## Why we are moving

Phase 0 finally resolved, and it resolved **no**.

| Endpoint | From a server (Worker, VPS, or this box) |
|---|---|
| `leetcode.com/graphql` (public queries) | **200 OK** |
| `problems/<slug>/interpret_solution/`, `submit/`, `submissions/detail/<id>/check/` | **403 Cloudflare "Just a moment"** |

Verified with bare `curl` on 2026-09-06, **with no cookie at all** — so this is decided at Cloudflare's edge, before authentication is even considered. A valid `LEETCODE_SESSION` does not change it. It is not our regression either: [`src/lib/server/leetcode/client.ts`](../src/lib/server/leetcode/client.ts) has one commit behind it (the initial one), so the judge code is byte-identical to the version that worked when deployed. LeetCode raised the protection level on the judge path; nothing we deploy can lower it.

Beating a managed challenge from a server is the one thing Cloudflare exists to prevent, so server-side judge access is not "blocked until it lifts" — it is **permanently unreliable**, which for a daily-habit app is worse than a clean no. We stop depending on it.

Ruled out along the way: a **local relay** (an always-on process to babysit — deleted in the reset) and a **browser bridge** (a Tampermonkey userscript; works, needs no daemon, but is a moving part to install per browser and does not run on a phone). **Judge0**, NeetCode's own approach, needs Docker plus the `isolate` sandbox with cgroup/`--privileged` access — unavailable without sudo on the target machine.

## What we keep

Only *execution* is lost. Everything else still comes from the public GraphQL API, unauthenticated:

`question` content · `codeSnippets` · **`metaData`** · `exampleTestcases` · `topicTags` · `recentAcSubmissionList` · solution articles · free editorials · daily challenge.

The LeetCode cookie stays useful for Premium editorials and your own submission history, but is **no longer required to practice**.

## The insight: the harness is schema-driven

LeetCode publishes a machine-readable schema for every problem's entry point in `metaData`. The harness never parses a Python signature — it reads the schema. All 150 fall into three modes:

| Mode | `metaData` shape | Count | Codec work |
|---|---|---|---|
| **plain** | `{name, params:[{name,type}], return:{type}}` with scalar/array types | **117** | type-driven JSON codec |
| **structure** | same, but a param or return type is `TreeNode` / `ListNode` | **22** | LeetCode's standard array serialization, written once |
| **design** | `{classname, constructor:{params}, methods:[{name,params,return}]}` | **11** | operation-sequence driver, written once |

So it is **three drivers, not 150 bespoke scripts**. Examples:

```jsonc
// two-sum          {"name":"twoSum","params":[{"name":"nums","type":"integer[]"},…],"return":{"type":"integer[]"}}
// invert-binary-tree {"name":"invertTree","params":[{"name":"root","type":"TreeNode"}],"return":{"type":"TreeNode"}}
// lru-cache        {"classname":"LRUCache","constructor":{"params":[…]},"methods":[{"name":"get",…},{"name":"put",…}]}
```

`exampleTestcases` is newline-delimited JSON, one line per parameter, repeated per case — decodable directly against `params`.

## Build-time pipeline (`scripts/generate-tests.py`)

Runs on your machine under CPython 3, never in production. The **oracle** is the vendored NeetCode reference solution at `static/solutions/python/<code>.py` (MIT, all 150 present), so we never hand-author an expected output.

1. Fetch `metaData` + `exampleTestcases` per slug from public GraphQL; cache to `data/problems-meta.json`.
2. Pick the mode from `metaData`; decode example inputs into Python values by declared type.
3. Execute the reference solution on each input under the same driver the browser will use → **expected output**.
4. Optionally append generated inputs from an opt-in per-problem generator spec (see *Test strength*).
5. Emit `data/tests/<slug>.json`:
   ```jsonc
   { "mode": "plain", "entry": "twoSum",
     "params": [{"name":"nums","type":"integer[]"},{"name":"target","type":"integer"}],
     "compare": "exact",
     "cases": [ {"args": [[2,7,11,15], 9], "expected": [0,1]} ] }
   ```
6. **Sanity gate:** where the problem statement supplies an expected output for an example, the oracle must reproduce it. A mismatch fails that slug rather than baking in a wrong expectation.

Reference solutions are **never shipped to the browser for judging** — only inputs and expected outputs. (The solutions drawer serves them deliberately, and viewing is free.)

## Runtime (browser)

- **Pyodide in a Web Worker**, never on the main thread, so the UI never freezes and a runaway loop can be killed by terminating the worker.
- A preamble injects `from typing import List, Optional`, the `ListNode`/`TreeNode` definitions, and the driver for the problem's mode, then the user's code.
- **Run** executes the example cases only and shows actual vs expected per case. **Submit** executes the full case list; all pass → `Accepted`.
- **A 15s budget for the whole Run or Submit**, not per case. Pyodide can only interrupt itself through a `SharedArrayBuffer`, which would mean serving COOP/COEP headers, so the only reliable limit is the main thread terminating the worker — and that kills the batch, not one case. Overrun → `Time Limit Exceeded`, and the worker is discarded and reborn on the next press.
- First load pulls the Pyodide runtime: **12.9 MB** on disk (`pyodide.asm.wasm` 9.6 MB, `python_stdlib.zip` 2.5 MB), served compressed and cached thereafter. Measured cold start once fetched is ~1.5s. Every stdlib module the drills cover — `heapq`, `bisect`, `collections`, `itertools`, `functools`, `math` — is fully supported; algorithmic Python has no C-extension exposure.

### Comparison rules

Default is exact equality. A per-problem `compare` field covers the handful that need more: `unordered` (e.g. group-anagrams, 3sum), `unordered-nested`, and `any-valid` where several answers are correct. Set by hand for the few that need it, stored in the test JSON.

## Trust model

Execution is client-side, so **the verdict is asserted by the client**. This is a single-user app — the only person who can be cheated is you. The server still records the submitted code and the per-case results alongside the existing idempotent award, so if a server-side runner ever exists the history can be re-verified rather than re-earned.

## Test strength — the honest limit

Example cases give 2–3 per problem, materially weaker than LeetCode's hidden tests. A wrong solution can pass early on.

The oracle removes the need to *author* expected outputs, so strength grows purely by adding **inputs**. Generated inputs are **opt-in per problem**, not automatic, because random inputs can violate preconditions the problem guarantees ("the array is sorted", "exactly one solution exists"). Feeding those to the oracle produces confidently wrong expectations — worse than a weak suite. A generator spec is a few lines per problem (shape, ranges, invariants) and is added incrementally, ordered to follow the tech tree.

## What changes in the app

| | |
|---|---|
| **Retired** | `interpret` / `submit` / `check` in `client.ts`; `/api/check/[id]` |
| **Rewritten** | `/api/solve/[slug]/run` and `/submit` — the browser executes; submit becomes a verdict recorder that applies awards |
| **New** | `src/lib/pyodide/` worker + drivers, `scripts/generate-tests.py`, `data/tests/` |
| **Unchanged** | tech tree, city, weekly budget, morale, daily plan, drills, solutions drawer, passkey auth, D1 schema, `/api/sync` |

Awards, SRS scheduling and the ledger key off an accepted verdict exactly as before, so no game rule changes.

## Phases

| | Scope | Unlocks | Status |
|---|---|---|---|
| **A** | Pyodide worker, type codec, plain driver, tests for the plain problems | Arrays & Hashing onward — most of the tree | **done: 115 suites** |
| **B** | `TreeNode` / `ListNode` codecs, plus named adapters | +23 problems | **done: 138 suites, all verified** |
| **C** | Design-mode driver and round-trip adapters | +12 problems — all 150 covered | **done: 150 suites** |
| **D** | Generators and hand-written cases for stronger suites | Ongoing, ordered to follow the tree | **started: 37 of 150** |

Coverage: **150 of 150** generated and verified. Suite *strength* is the remaining work — see phase D below.

### Phase A as built

115 of the 117 plain problems have verified suites. The two exceptions are in `data/tests-curation.json`: `clone-graph` (LeetCode publishes `manual` metaData that misdescribes the signature as `integer[][] -> boolean`) and `encode-and-decode-strings` (its entry point is a dummy and it needs an encode/decode round trip). Both need a purpose-built codec rather than a guess.

Three general faults surfaced while generating, all fixed in the pipeline rather than per problem:

- Several vendored references append an alternative implementation whose indentation does not parse, so the generator keeps the largest parseable prefix (`usable_source`). The primary solution always comes first.
- A few are written LintCode-style — a bare module-level function, or `walls_and_gates` where LeetCode specifies `wallsAndGates` — so the driver wraps a bare function and resolves names ignoring case and underscores.
- **Decoding passed arrays through by reference**, so any solution that sorts or fills its argument in place rewrote the very inputs being recorded; `walls-and-gates` stored its own answer as the input. `run_case` now deep-copies. This also stops one case leaking state into the next.

`scripts/verify-tests.py` re-runs every suite through `judge()` with the reference solution and is the gate: 115/115 pass. It also flags **4 weak suites** (`jump-game-ii`, `last-stone-weight`, `longest-repeating-character-replacement`, `valid-parenthesis-string`) where every example expects the same value, so a constant would pass them. These are the first candidates for phase D.

Confirmed under real Pyodide (Python 3.14.2, WASM) rather than only CPython: correct code passes, wrong answers/syntax errors/runtime errors fail, a no-op on `rotate-image` fails, and `group-anagrams` in a different but valid order passes — so the comparison rules do not reject correct code.

**Not yet exercised:** the worker running in an actual browser. Pyodide, the driver and the endpoints are verified from Node and curl, but loading `/pyodide/worker.js` as a module worker needs a real browser session.

### Phase B as built

The `TreeNode` / `ListNode` codecs were already in the driver, so 19 of the 24 structure problems generated on the first run. What the remainder taught:

- `merge-k-sorted-lists` takes **`ListNode[]`** — an array whose *elements* are serialised lists. The codec passed arrays through untouched, so the solution received lists of ints. `decode`/`encode` now recurse into arrays of structures.
- Four problems cannot be driven from `metaData` at all, because LeetCode's harness builds the input in a way the published schema does not describe. These use a **named adapter** (`ADAPTERS` in `driver.py`, selected per problem in `tests-curation.json`): `linked-list-cycle` (the declared `pos` parameter is not an argument — it is the index the tail links back to), `lowest-common-ancestor-of-a-binary-search-tree` (`p` and `q` arrive as values but the signature takes nodes) and `copy-list-with-random-pointer` (random pointers resolved by index in and re-indexed out). The list is deliberately short; it is not allowed to grow into a script per problem.

`copy-list-with-random-pointer` exposed a hole worth remembering: **a correct deep copy serialises identically to its input**, so comparing serialisations alone accepts `return head`. Aliasing is now checked directly — if any returned node is the same object as an input node, the case fails.

Confirmed under Pyodide that the suites *discriminate*, not merely accept: identity on `reverse-linked-list`, a no-op on `invert-binary-tree`, a constant `False` on `linked-list-cycle`, always-return-root on the LCA, and `return head` on the deep copy are all rejected, while correct solutions pass.

Still skipped, all needing a round-trip harness that belongs with phase C's design driver: `clone-graph`, `encode-and-decode-strings`, `serialize-and-deserialize-binary-tree`.

### Phase C as built

The design driver needed no changes: all 9 operation-sequence problems generated correctly first time, each matching LeetCode's documented output exactly. Three adapters finished the set — `clone-graph`, `encode-and-decode-strings`, `serialize-and-deserialize-binary-tree`. All three are **identity round trips**, so comparing serialisations alone would accept a solution that does nothing; the adapters check node identity for the graph clone and require `encode`/`serialize` to actually return a string.

`Node` was removed from the shared preamble. LeetCode reuses the name for two incompatible shapes — `Node(val, neighbors)` for clone-graph, `Node(val, next, random)` for copy-list — so one global definition hands one of them the wrong positional arguments. The adapter that needs a `Node` installs it, and never overrides one the solution defines.

### Phase D as started

| | Before | After |
|---|---|---|
| Total cases across all suites | 341 | **1489** |
| Cases per problem (median / mean) | 2 / 2.5 | 3 / **9.9** |
| Suites where Submit tests more than Run | **0 / 150** | 37 / 150 |
| Suites flagged weak by `verify-tests.py` | 12 | **0** |

Two mechanisms, both supplying only *inputs* — expected outputs still come from the oracle, so no answer is ever written by hand:

- `scripts/generators.py`: a small Python generator per problem, seeded per slug so regeneration is byte-identical and a diff means a real change. A generator returns `None` to reject a draw, because most problems carry preconditions the schema cannot express ("sorted", "exactly one solution", "unique values"). `two-sum` redraws when a second valid pair exists; `top-k-frequent-elements` keeps frequencies distinct so the answer is not ambiguous.
- `extra` in `tests-curation.json`: hand-written inputs aimed at a specific weakness. Mostly design problems, whose single published example exercises almost nothing — LeetCode's `LRUCache` example never forces an eviction that is later read back, and its `Trie` example never searches a strict prefix.

**How the generators are validated, and why `verify-tests.py` is not enough.** That script re-runs the same reference solution that produced the expectations, so a generator that violates a precondition enshrines garbage and still "verifies". The failure mode that matters is *rejecting correct code*. So generators are checked against **independent implementations** — brute force, deliberately written differently from NeetCode's — which must pass 100%: an unsorted array fed to a binary search, or a two-sum with two answers, fails immediately. 19 such solutions pass every generated case, and the cheats the thin suites used to accept now fail: the naive comma-join encoder (26/42), a never-evicting `LRUCache` (0/3), `search == startsWith` (0/2), constant answers for `jump-game-ii` (17/42) and `last-stone-weight` (14/42), and a `TimeMap` that ignores timestamps (1/2).

**113 of 150 problems still have example cases only** — roughly two apiece, weak enough to accept a wrong solution. Generators are added in tree order, so the nodes being worked on are the best covered.

## Risks

- **Weak suites until D.** Mitigated by ordering D to follow the tree, so the problems you are actually on are the best covered.
- **Oracle bugs become wrong expectations.** The example-output sanity gate in step 6 catches most; a disagreement between your correct code and the oracle is a bug report against the test file, not against you.
- **Python only.** Go and C# have no in-browser story. They need Judge0 on a machine where you have root — at which point the modes, drivers and test data here carry over unchanged, since the test format is language-neutral.
