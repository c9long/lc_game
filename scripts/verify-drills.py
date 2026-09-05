#!/usr/bin/env python3
"""Executes hand-written Python drills from data/drills/curation.json and checks their answers.
Cloze drills are checked by substituting the answer for ___ and comparing the printed hint;
output drills by comparing the printed result. Exit code 1 if any drill fails."""
import doctest
import json
import sys

cur = json.load(open("data/drills/curation.json"))
parser = doctest.DocTestParser()
failed = 0
for d in cur["extra"]:
    if d["lang"] != "python":
        continue
    text = "\n".join(x for x in (d["context"], d["code"]) if x)
    want = d["answer"] if d["kind"] == "output" else (d.get("hint") or "")
    if d["kind"] == "cloze":
        text = text.replace("___", d["answer"])
    doc = text + ("\n" + want if want else "") + "\n"
    test = parser.get_doctest(doc, {"__name__": "__drill__"}, d["id"], None, 0)
    sink = []
    result = doctest.DocTestRunner(verbose=False).run(test, out=sink.append, clear_globs=True)
    if result.failed:
        failed += 1
        print(f"FAIL {d['id']}\n" + "".join(sink))
print(f"{len(cur['extra']) - failed}/{len(cur['extra'])} hand-written drills verified")
sys.exit(1 if failed else 0)
