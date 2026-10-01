#!/usr/bin/env python3
"""Fetches the Constraints section of every NeetCode 150 problem from neetcode.io.

Writes data/neetcode-constraints.json: {slug: {"ncLink": ..., "constraints": [line, ...]}}.
neetcode.io renders each problem page on the server, so the statement's Markdown is in the HTML.
Its constraints often differ from LeetCode's -- usually smaller limits, sometimes a looser minimum --
and it is the only source for the seven Premium problems. scripts/constraints.py holds every case
to both. Two pages (Number of 1 Bits, Reverse Bits) list no constraints; they get an empty list.

Usage: python3 scripts/fetch-neetcode-constraints.py
"""
import concurrent.futures as cf
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = {"User-Agent": "Mozilla/5.0"}


def get(url: str) -> str:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode()


def nc_links() -> dict[str, str]:
    html = get("https://neetcode.io/practice")
    main = re.search(r'src="(main\.[0-9a-f]+\.js)"', html)[1]
    js = get(f"https://neetcode.io/{main}")
    out = {}
    for m in re.finditer(r'\{problem:"(?:[^"\\]|\\.)*",pattern:"[^"]*",link:"([^"]*)"(.*?)\}', js):
        if "neetcode150:!0" in m[2]:
            out[m[1].strip("/")] = re.search(r'ncLink:"([^"]*)"', m[2])[1].strip("/")
    return out


def constraints(link: str) -> list[str]:
    html = get(f"https://neetcode.io/problems/{link}/question")
    m = re.search(r"Constraints:\*\*\\n(.*?)\\n\\n", html)
    if not m:
        return []
    text = re.sub(r"\\u([0-9A-Fa-f]{4})", lambda u: chr(int(u[1], 16)), m[1])
    return [line.strip().lstrip("* ").strip() for line in text.split("\\n") if line.strip()]


def main() -> None:
    links = nc_links()
    assert len(links) == 150, f"neetcode.io lists {len(links)} NeetCode 150 problems"
    with cf.ThreadPoolExecutor(10) as ex:
        found = dict(zip(links, ex.map(constraints, links.values())))
    out = {slug: {"ncLink": links[slug], "constraints": found[slug]} for slug in sorted(links)}
    (ROOT / "data" / "neetcode-constraints.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print("no constraints listed:", [s for s, v in out.items() if not v["constraints"]])


if __name__ == "__main__":
    main()
