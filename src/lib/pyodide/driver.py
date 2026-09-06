"""Shared execution driver for LeetCode-shaped problems.

This file is executed in two places and MUST behave identically in both, which is why it is one
file rather than two implementations:

  build time   scripts/generate-tests.py runs the vendored NeetCode reference solution through
               produce() to generate the expected outputs stored in data/tests/<slug>.json
  runtime      the Pyodide web worker runs Chris's code through judge() and compares against them

If the two ever diverged, every expected output in the repo would be subtly wrong, so nothing
problem-specific belongs here: the shape of a problem comes from LeetCode's `metaData`, which is
passed in as `spec`.

Timeouts are deliberately the caller's job (signal.alarm at build time, worker termination in the
browser) because signal does not exist in Pyodide.
"""
from __future__ import annotations

import copy
import json
from collections import deque

# Reference solutions are written for LeetCode's editor, which supplies these names implicitly.
PREAMBLE = """
import bisect, collections, functools, heapq, itertools, math, operator, random, re, string, sys
from bisect import bisect_left, bisect_right, insort
from collections import Counter, OrderedDict, defaultdict, deque
from functools import cache, lru_cache, reduce
from heapq import heapify, heappop, heappush, heappushpop, heapreplace, nlargest, nsmallest
from math import inf
from typing import Any, Dict, List, Optional, Set, Tuple

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
"""

SCALARS = {"integer", "double", "float", "string", "boolean", "character", "long", "void"}


class Unsupported(Exception):
    """Raised for a problem shape this driver cannot encode yet, so callers can skip it cleanly."""


# ---------- structure codecs (LeetCode's standard array serialisation) ----------

def to_linked(vals, ns):
    if not vals:
        return None
    node = head = ns["ListNode"](vals[0])
    for v in vals[1:]:
        node.next = ns["ListNode"](v)
        node = node.next
    return head


def from_linked(head):
    out = []
    seen = set()
    while head is not None:
        if id(head) in seen:  # a cycle would otherwise hang the worker
            break
        seen.add(id(head))
        out.append(head.val)
        head = head.next
    return out


def to_tree(vals, ns):
    """Level-order with explicit nulls, exactly as LeetCode serialises trees."""
    if not vals:
        return None
    node_cls = ns["TreeNode"]
    root = node_cls(vals[0])
    q = deque([root])
    i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals):
            v = vals[i]
            i += 1
            if v is not None:
                node.left = node_cls(v)
                q.append(node.left)
        if i < len(vals):
            v = vals[i]
            i += 1
            if v is not None:
                node.right = node_cls(v)
                q.append(node.right)
    return root


def from_tree(root):
    if root is None:
        return []
    out, q = [], deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(node.left)
        q.append(node.right)
    while out and out[-1] is None:  # LeetCode trims trailing nulls
        out.pop()
    return out


def decode(type_name: str, value, ns):
    """JSON value -> Python value the solution expects."""
    t = type_name.strip()
    if t == "ListNode":
        return to_linked(value, ns)
    if t == "TreeNode":
        return to_tree(value, ns)
    if t.endswith("[]") or t.startswith("list<") or t in SCALARS:
        return value  # JSON already matches: scalars, arrays and nested arrays
    raise Unsupported(f"cannot decode parameter type {type_name!r}")


def encode(type_name: str, value):
    """Python value -> JSON-safe value for storage and comparison."""
    t = (type_name or "").strip()
    if t == "ListNode":
        return from_linked(value)
    if t == "TreeNode":
        return from_tree(value)
    if isinstance(value, tuple):
        return list(value)
    return value


# ---------- execution ----------

def namespace(source: str) -> dict:
    ns: dict = {}
    exec(compile(PREAMBLE, "<preamble>", "exec"), ns)
    exec(compile(source, "<solution>", "exec"), ns)
    return ns


def _normalize(name: str) -> str:
    return name.replace("_", "").lower()


def solution_object(ns, spec):
    """The Solution instance to call.

    A few vendored reference solutions are written LintCode-style — a bare module-level function
    with no enclosing class — so those are wrapped rather than skipped.
    """
    cls = ns.get("Solution")
    if cls is None:
        target = _normalize(spec["entry"])
        fn = next(
            (v for k, v in ns.items() if callable(v) and _normalize(k) == target and not k.startswith("_")),
            None,
        )
        if fn is None:
            raise Unsupported("no Solution class and no matching module-level function")
        cls = type("Solution", (), {spec["entry"]: fn})
    return cls()


def bound_entry(obj, entry: str):
    """Resolve the entry point, tolerating snake_case where LeetCode specifies camelCase."""
    if hasattr(obj, entry):
        return getattr(obj, entry)
    target = _normalize(entry)
    for name in dir(obj):
        if not name.startswith("_") and _normalize(name) == target:
            return getattr(obj, name)
    raise Unsupported(f"no method {entry!r} on Solution")


def call_plain(ns, spec, raw_args):
    args = [decode(p["type"], v, ns) for p, v in zip(spec["params"], raw_args)]
    solution = solution_object(ns, spec)
    result = bound_entry(solution, spec["entry"])(*args)
    ret = (spec.get("returns") or {}).get("type", "")
    if ret == "void":
        # An in-place problem: the answer is the mutated first argument.
        return encode(spec["params"][0]["type"], args[0])
    return encode(ret, result)


def call_design(ns, spec, raw_args):
    """Input is ["ClassName","method",...] plus a parallel list of argument lists."""
    ops, arg_lists = raw_args[0], raw_args[1]
    cls = ns[spec["classname"]]
    methods = {m["name"]: m for m in spec["methods"]}
    out = [None]
    obj = cls(*arg_lists[0])
    for op, call_args in zip(ops[1:], arg_lists[1:]):
        meta = methods.get(op)
        if meta is None:
            raise Unsupported(f"unknown method {op!r}")
        result = getattr(obj, op)(*call_args)
        ret = (meta.get("return") or {}).get("type", "")
        out.append(None if ret == "void" else encode(ret, result))
    return out


def run_case(ns, spec, raw_args):
    # Decoding passes arrays through by reference, and plenty of solutions sort or fill their
    # argument in place. Without this copy the caller's inputs are rewritten by the very run that
    # is meant to observe them, which silently corrupts stored test inputs and lets a later case
    # start from a previous case's leftovers.
    raw_args = copy.deepcopy(raw_args)
    if spec["mode"] == "design":
        return call_design(ns, spec, raw_args)
    return call_plain(ns, spec, raw_args)


def produce(source: str, spec: dict, inputs: list) -> list:
    """Run `source` over every input and return the encoded outputs. Used to build expectations."""
    ns = namespace(source)
    return [run_case(ns, spec, args) for args in inputs]


# ---------- comparison ----------

def _norm(v, rule):
    if rule == "unordered":
        return sorted(v, key=lambda x: json.dumps(x, sort_keys=True))
    if rule == "unordered-nested":
        inner = [sorted(x, key=lambda y: json.dumps(y, sort_keys=True)) for x in v]
        return sorted(inner, key=lambda x: json.dumps(x, sort_keys=True))
    return v


def compare(expected, actual, rule: str = "exact") -> bool:
    if rule == "exact":
        return expected == actual
    try:
        return _norm(expected, rule) == _norm(actual, rule)
    except (TypeError, AttributeError):
        return expected == actual


def judge(source: str, spec: dict, cases: list) -> list:
    """Run `source` against stored cases. Returns one result dict per case, never raising."""
    rule = spec.get("compare", "exact")
    try:
        ns = namespace(source)
    except Exception as e:  # a syntax or import error is a whole-submission failure
        return [{"ok": False, "error": f"{type(e).__name__}: {e}", "fatal": True}]

    results = []
    for case in cases:
        entry = {"args": case["args"], "expected": case["expected"]}
        try:
            actual = run_case(ns, spec, case["args"])
            entry["actual"] = actual
            entry["ok"] = compare(case["expected"], actual, rule)
        except Exception as e:
            entry["ok"] = False
            entry["error"] = f"{type(e).__name__}: {e}"
        results.append(entry)
    return results
