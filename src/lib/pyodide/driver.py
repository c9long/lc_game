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

# `Node` is deliberately NOT in the preamble. LeetCode uses the name for two incompatible shapes —
# Node(val, neighbors) for clone-graph and Node(val, next, random) for copy-list-with-random-pointer
# — so a single global definition would give one of them the wrong positional arguments. The
# adapter that needs one installs it, and never overrides a Node the solution defines itself.


class _GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


class _RandomNode:
    def __init__(self, val=0, next=None, random=None):
        self.val = val
        self.next = next
        self.random = random

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


STRUCTURES = {"ListNode", "TreeNode"}


def decode(type_name: str, value, ns):
    """JSON value -> Python value the solution expects."""
    t = type_name.strip()
    if t == "ListNode":
        return to_linked(value, ns)
    if t == "TreeNode":
        return to_tree(value, ns)
    # An array of structures, e.g. merge-k-sorted-lists takes ListNode[]: each element is itself a
    # serialised list, so the element type has to be decoded rather than passed through.
    if t.endswith("[]") and t[:-2] in STRUCTURES:
        return [decode(t[:-2], v, ns) for v in value]
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
    if t.endswith("[]") and t[:-2] in STRUCTURES:
        return [encode(t[:-2], v) for v in value]
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


# ---------- adapters ----------
#
# A few problems cannot be driven from metaData alone: LeetCode's own harness builds the input
# structure in a way the published schema does not describe. Each is a NAMED adapter selected from
# data/tests-curation.json, deliberately a short list rather than a script per problem.


def adapt_linked_list_cycle(ns, spec, raw_args):
    """hasCycle(head): metaData declares a second `pos` parameter, but it is not an argument — it
    is the index the tail links back to."""
    vals, pos = raw_args[0], raw_args[1]
    head = to_linked(vals, ns)
    if head is not None and pos is not None and pos >= 0:
        target = head
        for _ in range(pos):
            target = target.next
        tail = head
        while tail.next is not None:
            tail = tail.next
        tail.next = target
    solution = solution_object(ns, spec)
    return bool(bound_entry(solution, spec["entry"])(head))


def adapt_lca_bst(ns, spec, raw_args):
    """lowestCommonAncestor(root, p, q): p and q arrive as values but the signature takes nodes.
    The answer is reported by value, which is what LeetCode displays."""
    root = to_tree(raw_args[0], ns)

    def find(node, val):
        if node is None:
            return None
        if node.val == val:
            return node
        return find(node.left, val) or find(node.right, val)

    p, q = find(root, raw_args[1]), find(root, raw_args[2])
    solution = solution_object(ns, spec)
    result = bound_entry(solution, spec["entry"])(root, p, q)
    return None if result is None else result.val


def adapt_copy_random_list(ns, spec, raw_args):
    """copyRandomList(head): input and output are [[value, randomIndex|null], ...], so the random
    pointers are resolved by index on the way in and re-indexed on the way out."""
    pairs = raw_args[0]
    ns.setdefault("Node", _RandomNode)
    nodes = [_RandomNode(pair[0]) for pair in pairs]
    for i, node in enumerate(nodes):
        node.next = nodes[i + 1] if i + 1 < len(nodes) else None
        idx = pairs[i][1]
        node.random = nodes[idx] if idx is not None else None

    original_ids = {id(n) for n in nodes}
    solution = solution_object(ns, spec)
    out = bound_entry(solution, spec["entry"])(nodes[0] if nodes else None)

    order, seen = [], set()
    cur = out
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        order.append(cur)
        cur = cur.next
    # A correct deep copy serialises identically to its input, so comparing serialisations alone
    # would accept `return head`. Aliasing has to be checked directly.
    if any(id(n) in original_ids for n in order):
        raise ValueError("returned list shares nodes with the original; it is not a deep copy")

    index = {id(n): i for i, n in enumerate(order)}
    return [[n.val, None if n.random is None else index.get(id(n.random))] for n in order]


def adapt_clone_graph(ns, spec, raw_args):
    """cloneGraph(node): the input is an adjacency list where entry i belongs to node i+1. Neighbour
    values are sorted on the way out, since the problem does not fix their order."""
    adjacency = raw_args[0]
    ns.setdefault("Node", _GraphNode)
    nodes = [_GraphNode(i + 1) for i in range(len(adjacency))]
    for i, neighbours in enumerate(adjacency):
        nodes[i].neighbors = [nodes[j - 1] for j in neighbours]

    original_ids = {id(n) for n in nodes}
    solution = solution_object(ns, spec)
    out = bound_entry(solution, spec["entry"])(nodes[0] if nodes else None)
    if out is None:
        return []

    seen, order, stack = set(), [], [out]
    while stack:
        node = stack.pop()
        if id(node) in seen:
            continue
        seen.add(id(node))
        order.append(node)
        stack.extend(node.neighbors)

    # As with the random-pointer list, a correct clone serialises identically to its input, so
    # `return node` has to be rejected on identity rather than on the serialisation.
    if any(id(n) in original_ids for n in order):
        raise ValueError("returned graph shares nodes with the original; it is not a deep copy")

    order.sort(key=lambda n: n.val)
    return [sorted(nb.val for nb in n.neighbors) for n in order]


def adapt_codec_strings(ns, spec, raw_args):
    """encode-and-decode-strings: metaData exposes a dummy entry point. The real test is that
    decode(encode(strs)) == strs, with encode forced to produce a single string so that returning
    the list untouched cannot pass."""
    strs = raw_args[0]
    solution = solution_object(ns, spec)
    encoded = bound_entry(solution, "encode")(list(strs))
    if not isinstance(encoded, str):
        raise ValueError("encode must return a single string")
    return bound_entry(solution, "decode")(encoded)


def adapt_codec_tree(ns, spec, raw_args):
    """serialize-and-deserialize-binary-tree: a Codec round trip. serialize must produce a string,
    otherwise handing the tree straight back would pass."""
    root = to_tree(raw_args[0], ns)
    cls = ns.get("Codec") or ns.get("Solution")
    if cls is None:
        raise Unsupported("no Codec or Solution class")
    codec = cls()
    data = codec.serialize(root)
    if not isinstance(data, str):
        raise ValueError("serialize must return a string")
    return from_tree(codec.deserialize(data))


ADAPTERS = {
    'linked-list-cycle': adapt_linked_list_cycle,
    'lca-bst': adapt_lca_bst,
    'copy-random-list': adapt_copy_random_list,
    'clone-graph': adapt_clone_graph,
    'codec-strings': adapt_codec_strings,
    'codec-tree': adapt_codec_tree,
}


def run_case(ns, spec, raw_args):
    # Decoding passes arrays through by reference, and plenty of solutions sort or fill their
    # argument in place. Without this copy the caller's inputs are rewritten by the very run that
    # is meant to observe them, which silently corrupts stored test inputs and lets a later case
    # start from a previous case's leftovers.
    raw_args = copy.deepcopy(raw_args)
    adapter = spec.get("adapt")
    if adapter:
        fn = ADAPTERS.get(adapter)
        if fn is None:
            raise Unsupported(f"unknown adapter {adapter!r}")
        return fn(ns, spec, raw_args)
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
