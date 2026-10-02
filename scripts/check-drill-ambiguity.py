#!/usr/bin/env python3
"""Finds cloze drills that more than one answer satisfies.

A cloze drill is graded against its answer (plus any listed alternatives), so a different token
that makes the snippet print the same thing is a correct answer marked wrong -- `heapreplace` in
`heapq.___(h, 0); h[0]` printed 0 exactly like `heappush`. For every cloze drill the app can serve,
hand-written or mined, and every generated instance of it, this substitutes a broad pool of
candidates for ___ (module functions, builtins, methods of the built-in types, keyword arguments,
operators, keywords and small literals), executes each, and reports every candidate that prints what
the drill shows. A drill with no shown output is ambiguous by construction.

Exit code 1 if any drill is ambiguous. Usage: python3 scripts/check-drill-ambiguity.py [--json]
"""
import builtins
import collections
import contextlib
import io
import importlib
import importlib.util
import json
import keyword
import multiprocessing
import re
import resource
import signal
import sys
import warnings

spec = importlib.util.spec_from_file_location("verify", "scripts/verify-drills.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
IMPORTABLE = verify.gen.IMPORTABLE

# Never executed: they block, exit, read stdin, or reach outside the process.
UNSAFE = {
    "exit", "quit", "input", "breakpoint", "help", "open", "exec", "eval", "compile", "__import__",
    "copyright", "credits", "license", "memoryview", "globals", "locals", "vars", "aiter", "anext",
    "__build_class__", "__loader__", "__spec__", "__debug__",
}

TYPES = [str, bytes, list, dict, set, frozenset, tuple, int, float, complex, range,
         collections.Counter, collections.deque, collections.OrderedDict, collections.defaultdict]

PARAMS = """key reverse default start stop step sep end maxsplit maxlen initial strict fillvalue
repeat r n base ndigits encoding errors fillchar width tabsize keepends chars prefix suffix count lo
hi func iterable flush file object x i j k typed missing rename defaults module""".split()

OPERATORS = """+ - * / // % ** == != < > <= >= in not\\ in is is\\ not and or & | ^ << >> @ ~ not""".split()

LITERALS = [str(i) for i in range(-3, 11)] + [
    "''", "' '", "'a'", "None", "True", "False", "[]", "{}", "()", "set()", "0.5", "1.0", "-1.0", "2.0",
]


def pools() -> dict[str, list[str]]:
    """Candidates by the position of the blank, so a literal is not tried as a method name."""
    names = set()
    for m in IMPORTABLE:
        names |= {n for n in dir(importlib.import_module(m)) if not n.startswith("_")}
    names |= {n for n in dir(builtins) if not n.startswith("_")}
    for t in TYPES:
        names |= {n for n in dir(t) if not n.startswith("_")}
    names |= set(PARAMS) | set(IMPORTABLE)
    names |= {k for k in keyword.kwlist}
    names -= UNSAFE
    ops = [o.replace("\\ ", " ") for o in OPERATORS]
    words = sorted(names)
    return {
        "attr": words,                              # x.___
        "kwarg": sorted(set(PARAMS) | {"key", "reverse"}),  # f(a, ___=v)
        "operator": ops + sorted(keyword.kwlist),   # a ___ b
        "any": words + ops + LITERALS,
    }


def position(d: dict) -> str:
    text = (d.get("context") or "") + "\n" + d["code"]
    i = text.index("___")
    before, after = text[:i], text[i + 3:]
    if before.endswith("."):
        return "attr"
    if re.match(r"\s*=[^=]", after) and re.search(r"[(,]\s*$", before):
        return "kwarg"
    if before.endswith(" ") and after.startswith(" ") and re.search(r"[\w)\]}'\"]\s$", before):
        return "operator"
    return "any"


class Timeout(Exception):
    pass


def _alarm(*_):
    raise Timeout()


PARSER = verify.doctest.DocTestParser()


def shows_same(d: dict, answer: str) -> bool:
    """Whether the drill, with `answer` in the blank, prints what the drill shows.

    Only the output the page displays counts. Setup lines run silently, because the page never shows
    what they would echo: `heapq.heapreplace(h, 0)` echoes 1 at a real prompt, but on the page only
    `h[0]` -> 0 is visible, so heapreplace is as good an answer as heappush there."""
    with contextlib.redirect_stdout(io.StringIO()):
        return _shows_same(d, answer)


def _shows_same(d: dict, answer: str) -> bool:
    doctest = verify.doctest
    globs: dict = {"__name__": "__drill__"}
    if d["module"] in IMPORTABLE:
        exec(f"import {d['module']}\nfrom {d['module']} import *", globs)
    for ex in PARSER.get_examples((d.get("context") or "").replace("___", answer)):
        exec(compile(ex.source, "<context>", "exec"), globs)
    want = d.get("hint") or ""
    code = d["code"].replace("___", answer)
    examples = PARSER.get_examples(code)
    if not examples:
        return False
    # Every line of the shown code runs silently except the last, whose output is what is displayed.
    for ex in examples[:-1]:
        exec(compile(ex.source, "<code>", "exec"), globs)
    last = examples[-1]
    test = doctest.DocTest([doctest.Example(last.source, want + "\n" if want else "")], globs, "drill", None, 0, None)
    sink: list[str] = []
    return doctest.DocTestRunner(verbose=False).run(test, out=sink.append, clear_globs=False).failed == 0


def accepted(d: dict) -> set[str]:
    return {d["answer"], *(d.get("alternatives") or [])}


def _limit():
    # A candidate such as list(itertools.count()) loops in C where no signal can stop it; cap memory
    # so it dies with MemoryError instead of taking the machine down.
    resource.setrlimit(resource.RLIMIT_AS, (2 << 30, 2 << 30))
    warnings.filterwarnings("ignore")


def probe(item):
    """(label, drill id, [other candidates that also pass]) for one drill instance."""
    label, d, by_pos = item
    candidates = by_pos[position(d)]
    signal.signal(signal.SIGALRM, _alarm)
    others = []
    if not (d.get("hint") or "").strip():
        return label, d["id"], ["<no output shown: anything that runs fits>"]
    ok = accepted(d)
    for c in candidates:
        if c in ok:
            continue
        signal.setitimer(signal.ITIMER_REAL, 0.3)
        try:
            # Accepted answers are matched after normalization in the app; compare the same way here.
            if shows_same(d, c):
                others.append(c)
        except BaseException:
            pass
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
    print(f"done {label}", file=sys.stderr, flush=True)
    return label, d["id"], others


def instances():
    cur = json.load(open("data/drills/curation.json"))
    excluded = set(cur.get("exclude", []))
    mined = [d for d in json.load(open("data/drills/python.json"))["drills"] if d["id"] not in excluded]
    variants = json.load(open("data/drills/variants.json"))["variants"]
    for d in cur["extra"] + mined:
        if d["kind"] != "cloze" or d["lang"] != "python":
            continue
        yield d["id"], d
        for i, v in enumerate(variants.get(d["id"], []), start=1):
            yield f"{d['id']}#{i}", {**d, **v}


def main() -> int:
    by_pos = pools()
    items = [(label, d, by_pos) for label, d in instances()]
    print(f"{len(items)} cloze drill instances", file=sys.stderr, flush=True)
    with multiprocessing.Pool(initializer=_limit, maxtasksperchild=4) as p:
        results = p.map(probe, items, chunksize=1)
    bad = [(label, did, others) for label, did, others in results if others]
    if "--json" in sys.argv:
        print(json.dumps({label: others for label, _, others in bad}, indent=1))
    else:
        for label, _, others in bad:
            print(f"AMBIGUOUS {label}: also {', '.join(others[:12])}{' …' if len(others) > 12 else ''}")
        print(f"\n{len(items) - len(bad)}/{len(items)} cloze drill instances have exactly one answer")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
