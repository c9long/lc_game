#!/usr/bin/env python3
"""Executes every drill the app can serve and checks that its answer is what Python really prints.

Covers the hand-written drills in data/drills/curation.json and every generated instance in
data/drills/variants.json. Cloze drills are checked by substituting the answer for ___ and comparing
the printed hint; output drills by comparing the printed result. Exit code 1 if any drill fails."""
import doctest
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("drillgen", "scripts/generate-drill-variants.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

parser = doctest.DocTestParser()


def check(d: dict, label: str) -> str | None:
    """None when the drill prints what it claims, else the doctest report."""
    text = "\n".join(x for x in (d.get("context") or "", d["code"]) if x)
    want = d["answer"] if d["kind"] == "output" else (d.get("hint") or "")
    if d["kind"] == "cloze":
        text = text.replace("___", d["answer"])
    globs: dict = {"__name__": "__drill__"}
    if d["module"] in gen.IMPORTABLE:
        exec(f"import {d['module']}\nfrom {d['module']} import *", globs)
    doc = text + ("\n" + want if want else "") + "\n"
    test = parser.get_doctest(doc, globs, label, None, 0)
    sink: list[str] = []
    result = doctest.DocTestRunner(verbose=False).run(test, out=sink.append, clear_globs=True)
    return "".join(sink) if result.failed else None


def stale_explain(drill: dict, variant: dict) -> list[str]:
    """Literals this variant moves that the written explanation still quotes. An explanation that
    names a number the drill no longer shows is worse than no explanation."""
    explain = drill.get("explain") or ""
    if not explain:
        return []
    before = (drill.get("context") or "") + "\n" + drill["code"]
    after = (variant.get("context", drill.get("context") or "")) + "\n" + variant.get("code", drill["code"])
    moved = []
    for ex in gen.examples(before.replace("___", drill["answer"])):
        for node in gen.collect(ex.source)[0]:
            if node.value not in _values(after, drill["answer"]) and gen.mentions(explain, node.value):
                moved.append(repr(node.value))
    return moved


def _values(text: str, answer: str) -> set:
    out = set()
    for ex in gen.examples(text.replace("___", answer)):
        for node in gen.collect(ex.source)[0]:
            out.add(node.value)
    return out


def main() -> int:
    cur = json.load(open("data/drills/curation.json"))
    mined = json.load(open("data/drills/python.json"))["drills"]
    bank = {d["id"]: d for d in cur["extra"] + mined}

    failed = 0
    hand = [d for d in cur["extra"] if d["lang"] == "python"]
    for d in hand:
        report = check(d, d["id"])
        if report:
            failed += 1
            print(f"FAIL {d['id']}\n{report}")
    print(f"{len(hand) - failed}/{len(hand)} hand-written drills verified")

    variants = json.load(open("data/drills/variants.json"))["variants"]
    total = bad = 0
    for drill_id, vs in variants.items():
        drill = bank.get(drill_id)
        if drill is None:
            bad += 1
            print(f"FAIL {drill_id}: variants for a drill that is not in the bank")
            continue
        for i, v in enumerate(vs, start=1):
            total += 1
            report = check({**drill, **v}, f"{drill_id}#{i}")
            if report:
                bad += 1
                print(f"FAIL {drill_id}#{i}\n{report}")
                continue
            stale = stale_explain(drill, v)
            if stale:
                bad += 1
                print(f"FAIL {drill_id}#{i}: the explanation still quotes {', '.join(stale)}")
    print(f"{total - bad}/{total} generated instances verified")
    return 1 if failed or bad else 0


if __name__ == "__main__":
    sys.exit(main())
