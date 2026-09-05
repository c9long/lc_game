#!/usr/bin/env python3
"""Mine syntax drills from CPython's library documentation.

Reads Doc/library/<module>.rst files (downloaded from python/cpython, branch 3.12), finds the
doctest examples, EXECUTES every example with the local interpreter and keeps only those whose
output reproduces exactly, then turns them into two recall drill kinds:

  cloze   the API name in a call is blanked out; the answer is the name
  output  the example's printed result is hidden; the answer is that output

Usage:
  python3 scripts/mine-python-docs.py [--src DIR] [--out data/drills/python.json]
With no --src the files are downloaded into .cache/cpython-doc/ (git-ignored).

Documentation code examples are released by the PSF under the Zero-Clause BSD licence.
"""
from __future__ import annotations

import argparse
import doctest
import hashlib
import io
import json
import re
import signal
import sys
import textwrap
import urllib.request
from pathlib import Path

REF = "3.12"
RAW = f"https://raw.githubusercontent.com/python/cpython/{REF}/Doc/library/"
DOC_URL = f"https://docs.python.org/{REF}/library/"

# module page -> importable module (None for builtins pages) and an API allowlist (None = every directive)
MODULES: dict[str, tuple[str | None, set[str] | None]] = {
    "heapq": ("heapq", None),
    "bisect": ("bisect", None),
    "collections": ("collections", {"deque", "Counter", "defaultdict", "OrderedDict", "namedtuple",
                                     "appendleft", "popleft", "rotate", "extendleft", "most_common",
                                     "elements", "subtract", "total", "move_to_end", "popitem", "maxlen",
                                     "_replace", "_asdict", "_make", "_fields", "update"}),
    "itertools": ("itertools", {"accumulate", "chain", "combinations", "combinations_with_replacement",
                                 "count", "cycle", "dropwhile", "groupby", "islice", "pairwise", "permutations",
                                 "product", "repeat", "starmap", "takewhile", "zip_longest", "batched",
                                 "compress", "filterfalse", "tee", "from_iterable"}),
    "functools": ("functools", {"lru_cache", "cache", "reduce", "partial", "cmp_to_key", "cached_property",
                                 "total_ordering", "wraps"}),
    "math": ("math", {"gcd", "lcm", "isqrt", "comb", "perm", "factorial", "floor", "ceil", "sqrt", "log2",
                       "log", "inf", "prod", "hypot", "dist", "copysign", "fsum", "trunc", "pow"}),
    "operator": ("operator", {"itemgetter", "attrgetter", "methodcaller", "add", "mul", "neg", "xor"}),
    "string": ("string", {"ascii_lowercase", "ascii_uppercase", "digits", "ascii_letters", "punctuation",
                           "Template", "capwords"}),
    "stdtypes": (None, {"split", "rsplit", "join", "strip", "lstrip", "rstrip", "lower", "upper", "swapcase",
                        "isdigit", "isalpha", "isalnum", "isupper", "islower", "isspace", "startswith", "endswith",
                        "find", "rfind", "index", "rindex", "replace", "count", "zfill",
                        "partition", "rpartition", "splitlines",
                        "removeprefix", "removesuffix",
                        "append", "extend", "insert", "pop", "remove", "sort", "reverse",
                        "copy", "clear", "get", "items", "keys", "values", "setdefault", "update", "popitem",
                        "fromkeys", "add", "discard", "union", "intersection", "difference",
                        "symmetric_difference", "issubset", "issuperset", "isdisjoint", "bit_length",
                        "bit_count", "is_integer"}),
    "functions": (None, {"abs", "all", "any", "bin", "chr", "divmod", "enumerate", "filter", "int",
                         "isinstance", "iter", "len", "list", "map", "max", "min", "next", "ord", "pow",
                         "range", "reversed", "round", "set", "sorted", "str", "sum", "tuple", "zip",
                         "dict", "float", "frozenset", "bool"}),
}
DIRECTIVE = re.compile(r"^\.\. (?:function|method|class|data|attribute|classmethod|staticmethod|decorator)::\s*([\w.]+)")
PROMPT = re.compile(r"^(\s*)>>> ")
LITERAL_START = re.compile(r"::\s*$")
BYTES = re.compile(r"(?<![\w])b['\"]|bytearray|memoryview|\\x[0-9a-fA-F]")
IDENT = re.compile(r"[A-Za-z_]\w*")
MAX_OUTPUT_LINES = 3
MAX_OUTPUT_CHARS = 140
MAX_CONTEXT_LINES = 8


class Timeout(Exception):
    pass


def _alarm(_signum, _frame):
    raise Timeout()


def fetch(src: Path) -> None:
    src.mkdir(parents=True, exist_ok=True)
    for page in MODULES:
        target = src / f"{page}.rst"
        if target.exists():
            continue
        with urllib.request.urlopen(RAW + f"{page}.rst", timeout=60) as r:
            target.write_bytes(r.read())
        print(f"downloaded {page}.rst", file=sys.stderr)


def api_names(text: str, allow: set[str] | None) -> dict[str, str]:
    """name -> anchor (e.g. 'heappush' -> 'heapq.heappush', 'split' -> 'str.split')."""
    names: dict[str, str] = {}
    for line in text.splitlines():
        m = DIRECTIVE.match(line)
        if not m:
            continue
        full = m.group(1)
        short = full.rsplit(".", 1)[-1]
        if allow is not None and short not in allow:
            continue
        names.setdefault(short, full)
    return names


def segments(text: str) -> list[tuple[str, int, str]]:
    """File-order segments: ('doctest', line, block) for >>> blocks and ('code', line, block) for
    literal / testcode / testsetup blocks that define helpers the examples rely on."""
    lines = text.splitlines()
    segs: list[tuple[str, int, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = PROMPT.match(line)
        if m:
            indent = len(m.group(1))
            start = i
            buf: list[str] = []
            while i < len(lines) and lines[i].strip():
                buf.append(lines[i][indent:] if lines[i][:indent].strip() == "" else lines[i].lstrip())
                i += 1
            segs.append(("doctest", start + 1, "\n".join(buf)))
            continue
        if LITERAL_START.search(line):
            base = len(line) - len(line.lstrip())
            j = i + 1
            while j < len(lines) and (not lines[j].strip() or lines[j].lstrip().startswith(":")):
                j += 1
            block: list[str] = []
            while j < len(lines):
                l = lines[j]
                if not l.strip():
                    block.append("")
                    j += 1
                    continue
                if len(l) - len(l.lstrip()) <= base:
                    break
                block.append(l)
                j += 1
            code = textwrap.dedent("\n".join(block)).strip("\n")
            if code and ">>>" not in code:
                segs.append(("code", i + 1, code))
                i = j
                continue
        i += 1
    return segs


def run_code(code: str, globs: dict) -> set[str]:
    """Best-effort exec of a setup block; returns the names it defined."""
    before = set(globs)
    old_argv = sys.argv
    sys.argv = ["drill"]
    old_stdin, old_stdout = sys.stdin, sys.stdout
    sys.stdin, sys.stdout = io.StringIO(""), io.StringIO()
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(3)
    try:
        exec(compile(code, "<setup>", "exec"), globs)
    except BaseException:
        pass
    finally:
        signal.alarm(0)
        sys.argv = old_argv
        sys.stdin, sys.stdout = old_stdin, old_stdout
    return {n for n in set(globs) - before if not n.startswith("__")}


def run_example(ex: doctest.Example, globs: dict, runner: doctest.DocTestRunner) -> bool:
    test = doctest.DocTest([ex], globs, "drill", None, 0, None)
    sink: list[str] = []
    old_stdin = sys.stdin
    sys.stdin = io.StringIO("")
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(3)
    try:
        result = runner.run(test, out=sink.append, clear_globs=False)
    except Timeout:
        return False
    except BaseException:
        return False
    finally:
        signal.alarm(0)
        sys.stdin = old_stdin
    return result.failed == 0


def drill_id(*parts: str) -> str:
    return hashlib.sha1("\x1f".join(parts).encode()).hexdigest()[:12]


def mine(page: str, text: str) -> list[dict]:
    module, allow = MODULES[page]
    names = api_names(text, allow)
    name_re = re.compile(r"(?<![\w.])(" + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r")\s*\(") if names else None
    method_re = re.compile(r"\.(" + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r")\s*\(") if names else None

    globs: dict = {"__name__": "__drill__"}
    if module:
        exec(f"import {module}\nfrom {module} import *", globs)
    runner = doctest.DocTestRunner(verbose=False, optionflags=doctest.ELLIPSIS | doctest.NORMALIZE_WHITESPACE | doctest.IGNORE_EXCEPTION_DETAIL)
    parser = doctest.DocTestParser()
    drills: list[dict] = []
    seen: set[str] = set()

    helpers: set[str] = set()
    allow_re = re.compile(r"\b(" + "|".join(sorted(map(re.escape, allow), key=len, reverse=True)) + r")\b") if allow else None
    for segkind, start, block in segments(text):
        if segkind == "code":
            helpers |= run_code(block, globs)
            continue
        try:
            examples = parser.get_examples(block)
        except ValueError:
            continue
        context: list[str] = []
        for ex in examples:
            ok = run_example(ex, globs, runner)
            src = ex.source.rstrip("\n")
            uses_helper = bool(set(IDENT.findall(src)) & helpers)
            irrelevant = bool(BYTES.search(src) or BYTES.search(ex.want)) or (allow_re is not None and not allow_re.search(src))
            if uses_helper or irrelevant:
                ok = False
            display = "\n".join((">>> " if j == 0 else "... ") + l for j, l in enumerate(src.splitlines()))
            want = ex.want.rstrip("\n")
            skip = ex.options.get(doctest.SKIP, False)
            if ok and not skip and not src.lstrip().startswith(("import ", "from ")):
                base = {"lang": "python", "module": module or page, "sourceLine": start}
                ctx = "\n".join(context[-MAX_CONTEXT_LINES:])
                # output drill
                if (want and "..." not in want and "Traceback" not in want and "<BLANKLINE>" not in want
                        and not want.lstrip().startswith("<")
                        and len(want.splitlines()) <= MAX_OUTPUT_LINES and len(want) <= MAX_OUTPUT_CHARS
                        and not re.search(r"0x[0-9a-f]{6,}", want)):
                    did = drill_id("python", "output", ctx, display, want)
                    if did not in seen:
                        seen.add(did)
                        drills.append({**base, "id": did, "kind": "output",
                                       "context": ctx, "code": display, "answer": want,
                                       "api": None, "url": DOC_URL + f"{page}.html"})
                # cloze drill: blank one API name in the call
                m = (name_re.search(src) if name_re else None) or (method_re.search(src) if method_re else None)
                if m:
                    name = m.group(1)
                    blanked = src[: m.start(1)] + "___" + src[m.end(1):]
                    bdisplay = "\n".join((">>> " if j == 0 else "... ") + l for j, l in enumerate(blanked.splitlines()))
                    did = drill_id("python", "cloze", ctx, bdisplay, name)
                    if did not in seen:
                        seen.add(did)
                        drills.append({**base, "id": did, "kind": "cloze",
                                       "context": ctx, "code": bdisplay, "hint": want or None, "answer": name,
                                       "api": names.get(name), "url": DOC_URL + f"{page}.html#{names.get(name, '')}"})
            context.append(display)
            if want:
                context.extend(want.splitlines())
    return drills


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=".cache/cpython-doc")
    ap.add_argument("--out", default="data/drills/python.json")
    args = ap.parse_args()
    src = Path(args.src)
    fetch(src)
    all_drills: list[dict] = []
    for page in MODULES:
        text = (src / f"{page}.rst").read_text(encoding="utf-8")
        found = mine(page, text)
        kinds = {k: sum(1 for d in found if d["kind"] == k) for k in ("cloze", "output")}
        print(f"{page:12s} {len(found):4d} drills  {kinds}", file=sys.stderr)
        all_drills.extend(found)
    out = {
        "lang": "python",
        "source": {"repo": "python/cpython", "ref": REF, "path": "Doc/library",
                   "license": "Zero-Clause BSD (documentation code examples), see https://docs.python.org/3/license.html"},
        "verified": f"executed with {sys.version.split()[0]}",
        "drills": all_drills,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(all_drills)} drills -> {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
