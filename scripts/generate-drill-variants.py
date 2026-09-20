#!/usr/bin/env python3
"""Generates alternate instances of each drill, so a review is not a memory test for one answer.

A drill like `s = "leetcode"` / `s[0]` -> `'l'` teaches string indexing the first time and recall of
the letter l every time after. This rewrites the LITERALS of a drill, re-executes it, and records
what it really prints, so each review asks the same question about different data.

Only literals move. Identifiers, operators, the ___ blank and the api being drilled never change,
and a long list of gates below drops any variant that would change what the drill is about.

Run:  python3 scripts/generate-drill-variants.py [--report]
Out:  data/drills/variants.json
"""
import ast
import doctest
import io
import json
import re
import resource
import signal
import sys
from contextlib import redirect_stdout

MAX_VARIANTS = 4
MAX_ANSWER_CHARS = 60
MAX_INT_DIGITS = 6
TIMEOUT_S = 3

CURATION = "data/drills/curation.json"
MINED = "data/drills/python.json"
OUT = "data/drills/variants.json"


class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout()


# ---------------------------------------------------------------- word pool

WORDS = """
a b c d e f g h i j k l m n o p q r s t u v w x y z
an as at be by do go he if in is it me my no of on or so to up us we
add ant arc bad bag bat bed bee bin bit box bug bus cap car cat cog cow cup
cut dam day dew dig dog dot dry ear eel egg elf elk elm end eye fan fig fin
fir fix fly fog fox fun gap gas gem gum gut ham hat hen hip hog hub hut ice
ink ivy jam jar jaw jet jig job jug keg key kid kit lab lap leg lid lip log
map mat mix mud mug nap net nib nut oak oar oat oil owl pad pan paw peg pen
pie pig pin pit pod pot pub pug pun rag ram rat rib rig rim rod rug rye sap
saw sky sod sow soy spa sun tab tag tan tap tar tin tip ton top tow toy tub
tug urn van vat vet vow wag war wax web wig win wok yak yam yew zip
acid arch atom aunt bake bark barn bead beam bean bear beet bell belt bend
bird blot boat bolt bone book boot bowl bulb bush cake calf cane card cart
cave chef chin clam clay coal coat comb cone coral crab crib crow cube curb
dart dawn deck deer desk dial dime dish dock door dove drum duck dune dusk
farm fawn fern film fish flag flax foam fork fowl frog gate gear gift glue
goat gold gull hail hare harp hawk heap herb hill hive hood hoop horn hose
jade kelp kite knot lamb lamp lane lark lawn leaf lens lime lion loaf lock
loom mall mane maple mask mast mesh mint mole moth nail nest node nook nose
note oboe onyx opal oven owls palm park peak pear pine pipe plum polo pond
pony pool post pump quay raft rail rain reef reel ring road rock roof rope
sage sail salt sand seal seed sled slot snow soap sock sofa soil stem step
stir surf tail tank tent tide tile tomb tone tool tram tray tree tuba tulip
vane vase vest vine wand wasp wave weed well wolf wood worm yard yarn zinc
amber angle apple bacon badge beach beads beans berry birch blade block bloom
board brace brick bridge broom brush cabin cable camel candy canoe canvas
carrot castle cattle cedar cement cherry chess chime cider cliff cloud clover
coast cocoa comet coral cotton crane crate cream crown crust curve daisy dairy
delta diary dolphin donkey dragon drawer eagle earth elbow ember ferry fiber
field flame flask flute forest fossil fringe garden garlic ginger glacier
glove grain grape grass gravel hammer hangar harbor hazel heart hedge helmet
hollow honey ibex igloo index ivory jacket jelly jewel journal juniper kettle
kitten ladder lantern laptop laurel ledger lemon lentil lilac linen lizard
lobster locker lotus lumber magnet mango maple marble market meadow melon
mentor metal meteor mirror monkey morning mosaic muffin museum mustard napkin
nectar needle nickel noodle notebook nugget nutmeg oasis ocean office olive
orange orchid ostrich otter oyster paddle palace pantry paper parcel parsley
pastel pebble pelican pencil pepper petal phrase piano picnic pigeon pillar
pillow pirate planet plaza pocket pollen poplar portal potato pottery prairie
prism puddle pumpkin puzzle quartz quiver rabbit racket radish rafter ranger
ribbon ripple river robin rocket roster rubber saddle salmon sample sandal
satchel saucer scarf school seagull season sequin shadow shelf shovel shrimp
signal silver sketch slipper socket spiral spoon sprout squash stable stairs
statue stream studio sugar summit sunset survey sweater syrup tablet talon
tanker teapot temple tender thimble thistle thread thunder ticket timber tinsel
toffee tomato torch tower trail trench tripod trophy trumpet tunnel turnip
turtle umbrella valley vanilla velvet vessel violet volcano waffle wagon walnut
walrus wander wheat willow window winter wisdom wizard wonder wreath yogurt
bell boot book cell deed doom door feed feel foot hall heel hood hoop keel keen
knee leek loop moon noon peel pool reed reel roof room root seed seek seem seen
soon tall teen tool wall week wood wool eggs oozy
berry bloom brass cliff floor glass grass green happy hello jelly level queen
sheep sheet shell sleep spoon steel sweet teeth tooth tweet wheel llama otter
arrow bottle butter cheese coffee cotton dinner hammer hidden hollow kitten
ladder letter little mammal mirror mitten mutton otters paddle pepper pillow
ribbon ripple rubber saddle sudden summer tennis tunnel yellow effort
balloon cabbage channel current gallery jogging mission passage pattern pudding
rabbits running village willows blossom cottage giggles mittens pebbles
balloons doorbell footpath railroad seashell bookcase cassette eggshell
mattress mushroom occasion possible sunshine tomorrow bookshop coolness
""".split()

BY_LEN: dict[int, list[str]] = {}
for w in WORDS:
    BY_LEN.setdefault(len(w), []).append(w)


def shape(s: str) -> tuple:
    """Canonical repetition pattern: 'aab' and 'xxy' share a shape, 'abc' does not."""
    seen: dict[str, int] = {}
    out = []
    for ch in s:
        if ch not in seen:
            seen[ch] = len(seen)
        out.append(seen[ch])
    return tuple(out)


def case_of(s: str) -> tuple:
    return tuple(ch.isupper() for ch in s)


def restyle(word: str, like: str) -> str:
    return "".join(ch.upper() if up else ch for ch, up in zip(word, case_of(like)))


def word_candidates(orig: str) -> list[str]:
    """Replacements for a string literal: a real word of the same length and case pattern that
    repeats as many characters as the original. The repeats are what `{c for c in 'aab'}` and
    `len(set(word))` are about, so a replacement with all-distinct letters would quietly delete the
    lesson; an exact repetition shape is preferred, and the same count is enough to keep it."""
    low = orig.lower()
    want_shape = shape(low)
    distinct = len(set(low))
    pool = [w for w in BY_LEN.get(len(orig), []) if w != low and len(set(w)) == distinct]
    exact = [w for w in pool if shape(w) == want_shape]
    out = [restyle(w, orig) for w in exact + [w for w in pool if w not in exact]]
    if out:
        return out
    # No word repeats the way this one does. Build one from the alphabet instead.
    made = []
    letters = "abcdefghijklmnopqrstuvwxyz"
    for start in range(len(letters) - max(want_shape) - 1):
        cand = "".join(letters[start + i] for i in want_shape)
        if cand != low:
            made.append(restyle(cand, orig))
    return made


# ---------------------------------------------------------------- doctest plumbing

PARSER = doctest.DocTestParser()


def examples(text: str) -> list[doctest.Example]:
    return PARSER.get_examples(text + "\n") if text else []


def render(src: str, want: str | None) -> list[str]:
    lines = src.rstrip("\n").split("\n")
    out = [">>> " + lines[0]] + ["... " + l for l in lines[1:]]
    if want:
        out += want.rstrip("\n").split("\n")
    return out


# Mined drills were executed with their documentation page's module already imported, which is why
# they can write `heappush(h, x)` with no import line. Reproduce that or they raise NameError.
IMPORTABLE = {"heapq", "bisect", "collections", "itertools", "functools", "math", "operator", "string"}


def run(sources: list[str], module: str = "") -> list[str]:
    """Executes the examples in one namespace and returns what each printed."""
    ns: dict = {"__name__": "__drill__"}
    if module in IMPORTABLE:
        exec(f"import {module}\nfrom {module} import *", ns)
    wants = []
    old_stdin = sys.stdin
    sys.stdin = io.StringIO("")
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(TIMEOUT_S)
    try:
        for src in sources:
            buf = io.StringIO()
            with redirect_stdout(buf):
                exec(compile(src, "<drill>", "single"), ns)
            wants.append(buf.getvalue())
    finally:
        signal.alarm(0)
        sys.stdin = old_stdin
    return wants


# ---------------------------------------------------------------- literals

def offsets(src: str) -> list[int]:
    out, n = [0], 0
    for line in src.split("\n"):
        n += len(line) + 1
        out.append(n)
    return out


def span(src: str, node: ast.AST) -> tuple[int, int]:
    off = offsets(src)
    return off[node.lineno - 1] + node.col_offset, off[node.end_lineno - 1] + node.end_col_offset


def int_of(node: ast.AST):
    """Resolves `-7`, which the parser sees as a minus applied to 7."""
    if isinstance(node, ast.Constant) and isinstance(node.value, int) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        v = int_of(node.operand)
        return None if v is None else -v
    return None


def collect(src: str) -> tuple[list[ast.Constant], list[str]]:
    """Every literal in the source, plus reasons the whole family must be left alone."""
    tree = ast.parse(src)
    frozen: set[int] = set()
    problems: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            # The literal pieces of an f-string are its format, not its data.
            for sub in ast.walk(node):
                frozen.add(id(sub))
        elif isinstance(node, ast.Subscript):
            for sub in ast.walk(node.slice):
                frozen.add(id(sub))
        elif isinstance(node, (ast.FunctionDef, ast.Lambda)):
            # A function's body is its definition. Shifting the literals inside `fib` turns it into a
            # recurrence that is not Fibonacci while still running fine. Defaults in the signature are
            # data, though, so `def f(x, n=2)` still varies.
            for sub in ast.walk(node.body if isinstance(node, ast.Lambda) else node):
                if sub is not node:
                    frozen.add(id(sub))
            for d in node.args.defaults + [d for d in node.args.kw_defaults if d]:
                for sub in ast.walk(d):
                    frozen.discard(id(sub))
        elif isinstance(node, ast.While):
            # A loop's bound, its step and its counter are structure: `steps += 1` counts, and
            # `steps += 3` does not. The value the loop starts from is outside the loop and still moves.
            for sub in ast.walk(node):
                frozen.add(id(sub))
        elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            # Exponents turn a recall drill into arithmetic the moment they move.
            for sub in list(ast.walk(node.left)) + list(ast.walk(node.right)):
                frozen.add(id(sub))
        elif isinstance(node, ast.BinOp) and isinstance(node.op, (ast.FloorDiv, ast.Mod, ast.Div)):
            a, b = int_of(node.left), int_of(node.right)
            if a is None or b is None:
                problems.append("division on a value we cannot check")
        elif isinstance(node, ast.Call):
            fn = node.func
            name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
            if name == "divmod" and any(int_of(a) is None for a in node.args):
                problems.append("division on a value we cannot check")
            if name == "insert" and node.args:
                # Where something is inserted is the lesson; past the end it is just an append.
                for sub in ast.walk(node.args[0]):
                    frozen.add(id(sub))
            if name == "int" and len(node.args) > 1:
                for sub in ast.walk(node.args[1]):
                    frozen.add(id(sub))
            for kw in node.keywords:
                if kw.arg == "base":
                    for sub in ast.walk(kw.value):
                        frozen.add(id(sub))
    every = [n for n in ast.walk(tree) if isinstance(n, ast.Constant)]
    consts = [n for n in every if id(n) not in frozen and not isinstance(n.value, bool) and n.value is not None]
    fixed = [n.value for n in every if id(n) in frozen and isinstance(n.value, str)]
    return consts, problems, fixed


def divisions(src: str) -> list[tuple[int, int, str]]:
    """Every division the drill performs, `divmod` included. Whether it comes out exact, and which
    way the remainder leans, is usually the whole point (`-7 // 2` is -4, not -3)."""
    out = []
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.FloorDiv, ast.Mod, ast.Div)):
            a, b = int_of(node.left), int_of(node.right)
            if a is not None and b is not None:
                out.append((a, b, type(node.op).__name__))
        elif isinstance(node, ast.Call):
            fn = node.func
            name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
            if name == "divmod" and len(node.args) == 2:
                a, b = int_of(node.args[0]), int_of(node.args[1])
                if a is not None and b is not None:
                    out.append((a, b, "DivMod"))
    return out


def literal_text(original: str, value) -> str:
    """repr, but keeping the quote character the drill was written with."""
    if isinstance(value, str) and original.startswith('"'):
        body = value.replace("\\", "\\\\").replace('"', '\\"')
        return '"' + body + '"'
    return repr(value)


def substitute(src: str, mapping: dict) -> str:
    consts, _, _ = collect(src)
    edits = []
    for node in consts:
        key = (type(node.value).__name__, node.value)
        if key in mapping:
            a, b = span(src, node)
            edits.append((a, b, literal_text(src[a:b], mapping[key])))
    for a, b, text in sorted(edits, reverse=True):
        src = src[:a] + text + src[b:]
    return src


# ---------------------------------------------------------------- one family

ADDRESS = re.compile(r"0x[0-9a-f]{6,}")


def sized(text: str):
    """The length of a printed collection or string, or None for anything else."""
    try:
        v = ast.literal_eval(text)
    except BaseException:
        return None
    return len(v) if isinstance(v, (list, tuple, set, dict, str)) else None


def iterables(sources: list[str]) -> int:
    """How many things the code iterates over: collection literals, string literals and ranges."""
    n = 0
    for src in sources:
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, (ast.List, ast.Tuple, ast.Set, ast.Dict)):
                n += 1
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                n += 1
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
                n += 1
    return n


def same_size(before: str, after: str, strict: bool = False) -> bool:
    """`set('aab') & set('abc')` prints two letters; a variant that prints none is a different, and
    much worse, drill. Collections may grow or shrink by one — `range(3)` to `range(4)` is fine —
    but not collapse."""
    a, b = sized(before), sized(after)
    if a is None or b is None:
        return True
    if strict:
        return a == b
    return b != 0 and abs(a - b) <= 1 if a else b == 0
LONG_INT = re.compile(r"\d{" + str(MAX_INT_DIGITS + 1) + r",}")
PLAIN = re.compile(r"^[A-Za-z]+$")


class Skip(Exception):
    pass


def mentions(prose: str, value) -> bool:
    """Does the written explanation quote this literal? Only in code form: a plain substring test
    says every explanation mentions the string 'a'."""
    if isinstance(value, str):
        v = re.escape(value)
        return re.search(f"'{v}'|\"{v}\"|`{v}`", prose) is not None
    return re.search(r"(?<![\w.])" + re.escape(str(value)) + r"(?![\w.])", prose) is not None


def plan_mappings(consts: list, fixed: list, explain: str) -> list[dict]:
    """One correlated transform per variant: the same shift for every int, the same replacement for
    every occurrence of a string. Substituting literals independently is what breaks drills whose
    literals are related — `for n in [1, 2, 3]` with `if n == 2` stops finding anything."""
    ints = sorted({c.value for c in consts if isinstance(c.value, int)})
    strs = sorted({c.value for c in consts if isinstance(c.value, str)})
    if any(isinstance(c.value, float) for c in consts):
        # Floats stay put: round(2.5) is about the half, not the number.
        pass
    for s in strs:
        if not PLAIN.match(s):
            raise Skip("a string literal is not a plain word")
    # Frozen strings count here: `Counter('mississippi')['s']` freezes the subscript but not the word,
    # and a word without an s turns the drill into a lookup that finds nothing.
    for a in strs:
        for b in strs + [f for f in fixed if f != a]:
            if a != b and (a.lower() in b.lower() or b.lower() in a.lower()):
                raise Skip("string literals overlap, and the overlap is the lesson")
    movable_ints = [v for v in ints if v != 0]
    if explain:
        for v in movable_ints + strs:
            if mentions(explain, v):
                raise Skip("the explanation quotes a literal we would change")
    if not movable_ints and not strs:
        raise Skip("nothing to vary")

    choices = {s: word_candidates(s) for s in strs}
    for s, c in choices.items():
        if not c:
            raise Skip(f"no replacement for {s!r}")

    out = []
    for attempt in range(1, 13):
        mapping: dict = {}
        ok = True
        for v in movable_ints:
            n = v + attempt
            if n == 0 or (v > 0) != (n > 0):
                ok = False
            mapping[("int", v)] = n
        used = set()
        for s in strs:
            cands = [c for c in choices[s] if c not in used and c not in strs]
            if not cands:
                ok = False
                break
            pick = cands[(attempt - 1) % len(cands)]
            used.add(pick)
            mapping[("str", s)] = pick
        if ok and mapping:
            def mapped(x: str) -> str:
                return mapping.get(("str", x), x)

            everything = strs + [f for f in fixed if f not in strs]
            # `'abc'.find('z')` answers -1 because the needle is missing. A replacement needle that
            # happens to appear in the replacement haystack turns that into an ordinary hit.
            if all(
                (mapped(a) in mapped(b)) == (a in b)
                for a in everything
                for b in everything
                if a != b
            ):
                out.append(mapping)
    return out


def variants_for(drill: dict, cloze_names: set[str], report) -> list[dict]:
    kind = drill["kind"]
    ctx = drill.get("context") or ""
    code = drill["code"]
    answer = drill["answer"]
    hint = drill.get("hint") or ""
    disp_text = (ctx + "\n" + code) if ctx else code
    exec_text = disp_text.replace("___", answer) if kind == "cloze" else disp_text

    disp_ex = examples(disp_text)
    exec_ex = examples(exec_text)
    n_ctx = len(examples(ctx))
    if not disp_ex or len(disp_ex) != len(exec_ex) or n_ctx >= len(disp_ex):
        raise Skip("the drill does not split into examples cleanly")

    consts, problems, fixed = [], [], []
    for e in exec_ex:
        c, p, f = collect(e.source)
        consts += c
        problems += p
        fixed += f
    if problems:
        raise Skip(problems[0])

    def build(mapping: dict) -> tuple[str, str, str]:
        disp = [substitute(e.source, mapping) for e in disp_ex]
        ex = [substitute(e.source, mapping) for e in exec_ex]
        for before, after in zip(exec_ex, ex):
            if divisions(before.source) and [(a % b == 0, (a % b) < 0) for a, b, _ in divisions(after)] != [
                (a % b == 0, (a % b) < 0) for a, b, _ in divisions(before.source)
            ]:
                raise Skip("the division stops behaving the way the drill shows")
        wants = run(ex, drill["module"])
        lines: list[str] = []
        for i in range(n_ctx):
            lines += render(disp[i], wants[i])
        new_ctx = "\n".join(lines)
        lines = []
        for i in range(n_ctx, len(disp)):
            lines += render(disp[i], None if i == len(disp) - 1 else wants[i])
        return new_ctx, "\n".join(lines), wants[-1].rstrip("\n")

    # Rebuilding with nothing changed has to reproduce the drill exactly. If it does not, this
    # generator does not understand the drill well enough to rewrite it.
    same_ctx, same_code, same_out = build({})
    if same_ctx != ctx or same_code != code or same_out != (answer if kind == "output" else hint):
        raise Skip("cannot reproduce the drill unchanged")

    # `zip(range(3), [four, words])` prints three pairs BECAUSE zip stops at the shortest. Where two
    # iterables meet, a variant that makes them the same length deletes the point of the drill, so the
    # answer has to keep its exact length rather than merely staying in the same range.
    strict = iterables([e.source for e in exec_ex]) >= 2
    ambiguity = sorted(cloze_names - {answer}) if kind == "cloze" else []
    out: list[dict] = []
    seen_answers = {answer}
    seen_hints = {hint}
    seen_text = {ctx + "\n" + code}
    for mapping in plan_mappings(consts, fixed, drill.get("explain") or ""):
        if len(out) >= MAX_VARIANTS:
            break
        try:
            new_ctx, new_code, printed = build(mapping)
        except (Skip, Timeout):
            continue
        except BaseException as e:
            report(drill["id"], f"variant failed: {type(e).__name__}")
            continue
        if kind == "output":
            if not printed or "\n" in printed:
                continue
            if len(printed) > MAX_ANSWER_CHARS or LONG_INT.search(printed) or ADDRESS.search(printed):
                continue
            if "Traceback" in printed or printed in seen_answers:
                continue
            if not same_size(answer, printed, strict):
                continue
        else:
            if not printed and hint:
                continue
            if printed and ("\n" in printed or len(printed) > MAX_ANSWER_CHARS or ADDRESS.search(printed)):
                continue
            if not same_size(hint, printed, strict) or printed in seen_hints:
                continue
            # A blank whose answer is no longer the only name that fits is worse than no variant.
            if any(_fits(disp_ex, mapping, name, printed, drill["module"]) for name in ambiguity):
                continue
        if new_ctx + "\n" + new_code in seen_text:
            continue
        seen_text.add(new_ctx + "\n" + new_code)
        v: dict = {}
        if new_ctx != ctx:
            v["context"] = new_ctx
        if new_code != code:
            v["code"] = new_code
        if kind == "output":
            v["answer"] = printed
            seen_answers.add(printed)
        elif printed != hint:
            v["hint"] = printed
            seen_hints.add(printed)
        if not v:
            continue
        out.append(v)
    return out


def _fits(disp_ex, mapping: dict, name: str, printed: str, module: str) -> bool:
    """True when another name in the blank produces the same output, making the drill ambiguous."""
    try:
        sources = [substitute(e.source, mapping).replace("___", name) for e in disp_ex]
        return run(sources, module)[-1].rstrip("\n") == printed
    except BaseException:
        return False


# ---------------------------------------------------------------- main

def curated() -> list[dict]:
    """The bank exactly as src/lib/game/drillbank.ts assembles it."""
    cur = json.load(open(CURATION))
    mined = json.load(open(MINED))["drills"]
    excluded = set(cur["exclude"])
    out = [d for d in cur["extra"] if d["lang"] == "python"]
    per_module: dict[str, int] = {}
    for d in mined:
        if d["id"] in excluded:
            continue
        n = per_module.get(d["module"], 0)
        if n >= cur["maxPerModule"]:
            continue
        per_module[d["module"]] = n + 1
        out.append(d)
    return out


def main() -> int:
    # A shifted literal can ask Python for a great deal of memory (`'ab' * 100000`). The clock alarm
    # does not interrupt a single large allocation, so cap the address space and let it raise.
    resource.setrlimit(resource.RLIMIT_AS, (1 << 30, 1 << 30))
    verbose = "--report" in sys.argv
    bank = curated()
    names: dict[str, set[str]] = {}
    for d in bank:
        if d["kind"] == "cloze":
            names.setdefault(d["module"], set()).add(d["answer"])

    def report(drill_id: str, why: str):
        if verbose:
            print(f"  {drill_id}: {why}", file=sys.stderr)

    variants: dict[str, list[dict]] = {}
    skipped: dict[str, int] = {}
    for d in bank:
        try:
            vs = variants_for(d, names.get(d["module"], set()), report)
        except Skip as e:
            skipped[str(e)] = skipped.get(str(e), 0) + 1
            report(d["id"], f"skipped: {e}")
            continue
        except BaseException as e:
            skipped[type(e).__name__] = skipped.get(type(e).__name__, 0) + 1
            report(d["id"], f"skipped: {type(e).__name__}: {e}")
            continue
        if vs:
            variants[d["id"]] = vs
        else:
            skipped["no variant survived the gates"] = skipped.get("no variant survived the gates", 0) + 1
            report(d["id"], "skipped: no variant survived the gates")

    total = sum(len(v) for v in variants.values())
    doc = {
        "_comment": [
            "Generated by scripts/generate-drill-variants.py — do not edit by hand.",
            "Alternate instances of a drill: the same question asked about different literals, so a",
            "review cannot be answered from memory of the last answer. Only the fields that differ are",
            "stored; everything else comes from the drill itself, and the drill id is unchanged, so",
            "spaced-repetition progress belongs to the family rather than to any one instance.",
            "Answers here were produced by executing the rewritten code, never written by hand.",
            "Variants of mined drills are derived from CPython documentation examples (PSF licence),",
            "as data/drills/python.json records.",
        ],
        "variants": variants,
    }
    with open(OUT, "w") as f:
        json.dump(doc, f, indent="\t", ensure_ascii=False)
        f.write("\n")
    print(f"{len(variants)}/{len(bank)} drills vary, {total} variants written to {OUT}")
    for why, n in sorted(skipped.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d}  {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
