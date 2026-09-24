#!/usr/bin/env python3
"""Verify the generated test suites in data/tests/.

Generation and judging share src/lib/pyodide/driver.py, so a suite that the reference solution
itself fails means the stored expectations are wrong — not that the solution is. Three checks:

  self-consistency  the vendored reference solution passes its own suite under judge()
  well-formedness   every suite has a mode, an entry point and at least one case
  strength          flags suites weak enough to pass by accident (one case, or a constant answer)

Run after scripts/generate-tests.py. Exits non-zero if any suite fails the first two.
"""
from __future__ import annotations

import contextlib
import io
import json
import signal
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src" / "lib" / "pyodide"))

import driver  # noqa: E402

TESTS = ROOT / "data" / "tests"
SOLUTIONS = ROOT / "static" / "solutions" / "python"
TIMEOUT_S = 20


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout("reference solution exceeded the time limit")


def code_for(slug: str) -> str | None:
    problems = json.loads((ROOT / "data" / "neetcode150.json").read_text())
    for p in problems:
        if p["slug"] == slug:
            return p["code"]
    return None


def main() -> int:
    problems = {p["slug"]: p["code"] for p in json.loads((ROOT / "data" / "neetcode150.json").read_text())}
    files = sorted(TESTS.glob("*.json"))
    if not files:
        print("no suites in data/tests/ — run scripts/generate-tests.py first", file=sys.stderr)
        return 1

    failures, weak = [], []
    for path in files:
        slug = path.stem
        suite = json.loads(path.read_text())

        if not suite.get("cases") or not suite.get("mode") or not (suite.get("entry") or suite.get("classname")):
            failures.append((slug, "malformed suite"))
            continue

        source_file = SOLUTIONS / f"{problems.get(slug, '')}.py"
        if not source_file.exists():
            failures.append((slug, "no reference solution to verify against"))
            continue

        signal.signal(signal.SIGALRM, _alarm)
        signal.alarm(TIMEOUT_S)
        try:
            raw = source_file.read_text()
            source = driver.usable_source(raw)
            with contextlib.redirect_stdout(io.StringIO()):
                results = driver.judge(source, suite, suite["cases"])
                # Custom testcases take the other path through the driver: the reference is the
                # oracle, fetched raw by the browser. Judging the reference against itself on its own
                # examples has to come back clean for every problem shape.
                examples = [c["args"] for c in suite["cases"][: suite.get("exampleCount") or len(suite["cases"])]]
                custom = driver.custom(source, raw, suite, examples)["cases"]
        except Timeout:
            failures.append((slug, f"reference solution exceeded {TIMEOUT_S}s"))
            continue
        except Exception as e:
            failures.append((slug, f"{type(e).__name__}: {e}"))
            continue
        finally:
            signal.alarm(0)

        bad = [r for r in results if not r.get("ok")]
        if bad:
            detail = bad[0].get("error") or f"expected {bad[0].get('expected')!r}, got {bad[0].get('actual')!r}"
            failures.append((slug, f"{len(bad)}/{len(results)} cases fail: {detail}"))
            continue

        bad = [r for r in custom if r.get("ok") is not True]
        if bad:
            b = bad[0]
            detail = b.get("refError") or b.get("error") or f"expected {b.get('expected')!r}, got {b.get('actual')!r}"
            failures.append((slug, f"custom testcase path fails on {len(bad)}/{len(custom)} examples: {detail}"))
            continue

        expectations = [json.dumps(c["expected"], sort_keys=True) for c in suite["cases"]]
        if len(suite["cases"]) < 2:
            weak.append((slug, "only one case"))
        elif len(set(expectations)) == 1:
            weak.append((slug, f"every case expects {expectations[0]} — a constant would pass"))

    for slug, why in failures:
        print(f"  FAIL  {slug}: {why}")
    for slug, why in weak:
        print(f"  weak  {slug}: {why}")

    print(f"\n{len(files) - len(failures)}/{len(files)} suites verified, {len(weak)} weak")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
