#!/usr/bin/env python3
"""Generate the in-browser judge's test suites.

LeetCode's judge is unreachable from any server (docs/07-pyodide-judge.md), so the app runs code
in the browser under Pyodide and needs its own expected outputs. Rather than hand-author them:

  inputs     LeetCode's own `exampleTestcases`, fetched from the PUBLIC GraphQL API (still open)
  shape      LeetCode's `metaData`, a machine-readable schema of the problem's entry point
  expected   produced by running the vendored NeetCode reference solution as an ORACLE

The oracle and the browser share src/lib/pyodide/driver.py, so an expectation generated here is
exactly what the browser will compute for the same code.

Usage:
  python3 scripts/generate-tests.py                 # all 150, cached metadata
  python3 scripts/generate-tests.py --slug two-sum  # one problem
  python3 scripts/generate-tests.py --refresh       # re-fetch metadata from LeetCode

Reference solutions are MIT (neetcode-gh/leetcode); see static/solutions/LICENSE.
"""
from __future__ import annotations

import argparse
import ast
import contextlib
import io
import json
import re
import signal
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "lib" / "pyodide"))

import driver  # noqa: E402  (needs the path above)

sys.path.insert(0, str(ROOT / "scripts"))
import generators  # noqa: E402

GRAPHQL = "https://leetcode.com/graphql"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
META_CACHE = ROOT / "data" / "problems-meta.json"
CURATION = ROOT / "data" / "tests-curation.json"
OUT_DIR = ROOT / "data" / "tests"
SOLUTIONS = ROOT / "static" / "solutions" / "python"
TIMEOUT_S = 15

QUERY = """query q($slug: String!) {
  question(titleSlug: $slug) { questionId titleSlug metaData exampleTestcases }
}"""


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout("reference solution exceeded the time limit")


def fetch_meta(slug: str) -> dict | None:
    body = json.dumps({"query": QUERY, "variables": {"slug": slug}}).encode()
    req = urllib.request.Request(
        GRAPHQL, data=body, headers={"content-type": "application/json", "user-agent": UA}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = json.loads(r.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        print(f"  ! fetch failed for {slug}: {e}", file=sys.stderr)
        return None
    return (payload.get("data") or {}).get("question")


def load_meta(slugs: list[str], refresh: bool) -> dict:
    cache = {}
    if META_CACHE.exists() and not refresh:
        cache = json.loads(META_CACHE.read_text())
    missing = [s for s in slugs if s not in cache]
    if missing:
        print(f"fetching metadata for {len(missing)} problems from LeetCode...")
        for i, slug in enumerate(missing, 1):
            q = fetch_meta(slug)
            if q:
                cache[slug] = {"metaData": q["metaData"], "exampleTestcases": q["exampleTestcases"]}
            print(f"  [{i}/{len(missing)}] {slug}{'' if q else '  (failed)'}")
        META_CACHE.parent.mkdir(parents=True, exist_ok=True)
        META_CACHE.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n")
    return cache


def usable_source(text: str) -> str:
    """Return the largest parseable prefix of a vendored reference solution.

    Several files in the NeetCode repo append an alternative implementation after the primary one
    ("# BFS Version From Video", a second `class Solution`), and a few of those appendices have
    broken indentation that makes the whole file unparseable. The primary solution comes first, so
    truncating at top-level boundaries from the end recovers it. Applied to the ORACLE only —
    Chris's own code is never trimmed.
    """
    try:
        ast.parse(text)
        return text
    except SyntaxError:
        pass
    lines = text.split("\n")
    # Boundaries at any indentation: graph-valid-tree appends its alternative *inside* the first
    # class, so there is no column-zero cut point to truncate at.
    starts = [i for i, ln in enumerate(lines) if re.match(r"^\s*(class |def |#)", ln)]
    for cut in reversed(starts):
        candidate = "\n".join(lines[:cut])
        if "def " not in candidate:
            continue
        try:
            ast.parse(candidate)
            return candidate
        except SyntaxError:
            continue
    raise driver.Unsupported("reference solution does not parse")


def build_spec(slug: str, meta: dict, curation: dict) -> dict:
    """Turn LeetCode's metaData into the spec the driver understands."""
    md = json.loads(meta["metaData"])
    compare = curation.get("compare", {}).get(slug, "exact")

    if "classname" in md:
        return {
            "slug": slug,
            "mode": "design",
            "classname": md["classname"],
            "constructor": md.get("constructor", {}).get("params", []),
            "methods": md.get("methods", []),
            "params": [{"name": "ops", "type": "string[]"}, {"name": "args", "type": "integer[][]"}],
            "compare": compare,
        }

    params = md.get("params", [])
    returns = md.get("return", {})
    types = [p.get("type", "") for p in params] + [returns.get("type", "")]
    structural = {"TreeNode", "ListNode", "Node"}
    mode = "structure" if any(t.replace("[]", "") in structural for t in types) else "plain"
    spec = {
        "slug": slug,
        "mode": mode,
        "entry": md["name"],
        "params": params,
        "returns": returns,
        "compare": compare,
    }
    # A named adapter takes over the call entirely, for the few problems whose real input shape is
    # not what metaData describes.
    adapter = curation.get("adapt", {}).get(slug)
    if adapter:
        spec["adapt"] = adapter
    # A validator replaces comparison entirely: the answer is checked for correctness rather than
    # matched against the oracle's, so inputs with several right answers are usable.
    validator = curation.get("validate", {}).get(slug)
    if validator:
        spec["validate"] = validator
    return spec


def parse_cases(spec: dict, raw: str) -> list:
    """exampleTestcases is newline-delimited JSON: one line per parameter, repeated per case."""
    lines = [ln for ln in (raw or "").split("\n") if ln.strip() != ""]
    per_case = 2 if spec["mode"] == "design" else len(spec["params"])
    if per_case == 0 or len(lines) % per_case != 0:
        raise driver.Unsupported(
            f"{len(lines)} example lines do not divide into cases of {per_case}"
        )
    cases = []
    for i in range(0, len(lines), per_case):
        cases.append([json.loads(ln) for ln in lines[i : i + per_case]])
    return cases


def generate(slug: str, code: str, meta: dict, curation: dict) -> tuple[str, str]:
    """Returns (status, detail). Writes data/tests/<slug>.json on success."""
    spec = build_spec(slug, meta, curation)
    if slug in curation.get("skip", {}):
        return "skipped", curation["skip"][slug]

    solution_file = SOLUTIONS / f"{code}.py"
    if not solution_file.exists():
        return "no-oracle", "no vendored python reference solution"

    inputs = parse_cases(spec, meta["exampleTestcases"])
    if not inputs:
        return "no-cases", "no example testcases published"

    # Example cases stay first and define exampleCount, so Run remains the quick check while
    # Submit gets everything. Hand-written cases come next (they target a specific weakness), then
    # generated ones.
    example_count = len(inputs)
    extra = curation.get("extra", {}).get(slug, [])
    inputs = inputs + [list(args) for args in extra]
    generated = generators.build(slug)
    if generated:
        inputs = inputs + generated

    source = usable_source(solution_file.read_text())
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(TIMEOUT_S)
    try:
        # A couple of reference solutions print while they work; that is not part of the answer.
        with contextlib.redirect_stdout(io.StringIO()):
            outputs = driver.produce(source, spec, inputs)
    finally:
        signal.alarm(0)

    # An expectation must survive a round trip through JSON or the browser cannot store it.
    payload = dict(spec)
    payload["cases"] = [{"args": a, "expected": o} for a, o in zip(inputs, outputs)]
    payload["source"] = "examples" if len(inputs) == example_count else "examples+generated"
    # Example-derived cases come first and are the only ones Run shows; the rest are Submit-only.
    payload["exampleCount"] = example_count
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    json.loads(text)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{slug}.json").write_text(text)
    return "ok", f"{spec['mode']}, {len(inputs)} case(s)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="generate a single problem")
    ap.add_argument("--refresh", action="store_true", help="re-fetch metadata from LeetCode")
    ap.add_argument("--modes", default="plain", help="comma-separated modes to emit, or 'all'")
    args = ap.parse_args()

    problems = json.loads((ROOT / "data" / "neetcode150.json").read_text())
    if args.slug:
        problems = [p for p in problems if p["slug"] == args.slug]
        if not problems:
            print(f"no such slug: {args.slug}", file=sys.stderr)
            return 1

    curation = json.loads(CURATION.read_text()) if CURATION.exists() else {}
    wanted = None if args.modes == "all" else set(args.modes.split(","))
    meta = load_meta([p["slug"] for p in problems], args.refresh)

    tally: dict[str, list[str]] = {}
    for p in problems:
        slug = p["slug"]
        if slug not in meta:
            tally.setdefault("no-metadata", []).append(slug)
            continue
        try:
            spec_mode = build_spec(slug, meta[slug], curation)["mode"]
            if wanted is not None and spec_mode not in wanted:
                tally.setdefault(f"deferred:{spec_mode}", []).append(slug)
                continue
            status, detail = generate(slug, p["code"], meta[slug], curation)
        except Timeout:
            status, detail = "timeout", f"oracle exceeded {TIMEOUT_S}s"
        except driver.Unsupported as e:
            status, detail = "unsupported", str(e)
        except Exception as e:  # an oracle crash is a real finding, not a script bug to hide
            status, detail = "oracle-error", f"{type(e).__name__}: {e}"
        tally.setdefault(status, []).append(slug)
        if status != "ok":
            # Drop any suite left by an earlier run, or a problem that later gets skipped keeps
            # serving the expectations that caused it to be skipped.
            (OUT_DIR / f"{slug}.json").unlink(missing_ok=True)
            print(f"  {status:14} {slug}: {detail}")

    print("\n--- summary ---")
    for status in sorted(tally):
        print(f"{status:22} {len(tally[status]):3}")
    failed = sum(len(v) for k, v in tally.items() if k.startswith(("oracle-error", "unsupported", "timeout", "no-cases", "no-metadata")))
    print(f"\nwrote {len(tally.get('ok', []))} suites to data/tests/")
    return 1 if failed and args.slug else 0


if __name__ == "__main__":
    raise SystemExit(main())
