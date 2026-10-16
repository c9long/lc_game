"""TLE cases: inputs at the top of a problem's constraints that a correct but too-slow solution
cannot get through within the judge's budget (TIME_LIMIT_MS in src/lib/pyodide/client.ts: 15 s
for a whole Submit, in Pyodide), while the reference solution finishes in well under a second.

Each tech-tree node has its own module here (scripts/tle/<node-id>.py) registering, per problem:
  @tle(slug, count=1)          a generator of the large input(s), seeded per slug like
                               generators.py, so regenerating gives identical files;
  naive(slug, label, source)   one or more correct-but-slow solutions that MUST time out on them,
                               which scripts/audit-tle.mjs proves in Pyodide.

Every TLE input must satisfy scripts/constraints.py like any other case. Where the constraints are
too small for any correct solution to exceed the budget (Best Time to Buy and Sell Stock caps at
100 prices), the problem gets a max-size worst case instead and no naive entry, and NO_TLE records
why.

The cases are written to static/tle/<slug>.json rather than the suite: they are large, and the
suites are bundled into the Worker, which has a size limit; static assets do not. The solve page
fetches them for Submit only. They are not secret -- the reference solutions are public at
/solutions/ already.
"""
from __future__ import annotations

import importlib
import json
import pkgutil
import random
from pathlib import Path

import constraints

CASES: dict[str, tuple] = {}
NAIVE: dict[str, list[tuple[str, str]]] = {}
# slug -> why no input within the constraints can time out a correct solution.
NO_TLE: dict[str, str] = {}
MAX_DRAWS = 50
_loaded = False


def tle(slug: str, count: int = 1):
    def register(fn):
        CASES[slug] = (fn, count)
        return fn

    return register


def naive(slug: str, label: str, source: str) -> None:
    NAIVE.setdefault(slug, []).append((label, source))


def no_tle(slug: str, why: str) -> None:
    NO_TLE[slug] = why


def load() -> None:
    """Import every node's module (audits want the whole registry)."""
    global _loaded
    if _loaded:
        return
    for mod in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{__name__}.{mod.name}")
    _loaded = True


def _module_for(slug: str) -> str | None:
    """The node module a problem's TLE cases live in: its roadmap node id, '-' as '_'."""
    root = Path(__file__).resolve().parents[2] / "data"
    pattern = next((p["pattern"] for p in json.loads((root / "neetcode150.json").read_text()) if p["slug"] == slug), None)
    node = next((n["id"] for n in json.loads((root / "roadmap.json").read_text())["nodes"] if n["pattern"] == pattern), None)
    return node.replace("-", "_") if node else None


def load_for(slug: str) -> None:
    """Import only the module that owns `slug`, so a broken module for one node cannot break
    generating another node's problems."""
    name = _module_for(slug)
    if name and (Path(__file__).parent / f"{name}.py").exists():
        importlib.import_module(f"{__name__}.{name}")


def build(slug: str, existing: list | None = None) -> list:
    """The TLE inputs for one problem: deterministic, inside the constraints, never a repeat."""
    load_for(slug)
    entry = CASES.get(slug)
    if entry is None:
        return []
    fn, count = entry
    rng = random.Random(f"lc-game-tle:{slug}")
    seen = {json.dumps(a, sort_keys=True) for a in existing or []}
    out, draws = [], 0
    while len(out) < count and draws < MAX_DRAWS:
        draws += 1
        args = fn(rng)
        if args is None:
            continue
        key = json.dumps(args, sort_keys=True)
        if key in seen:
            continue
        constraints.V[slug](*args)  # a TLE generator outside the constraints is a bug: fail loudly
        seen.add(key)
        out.append(args)
    if len(out) < count:
        raise RuntimeError(f"{slug}: TLE generator produced {len(out)} of {count} cases")
    return out
