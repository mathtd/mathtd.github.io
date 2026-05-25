#!/usr/bin/env python3
"""Download OpenMoji color SVGs for every codepoint in vocab.json.

Usage:
    python3 scripts/fetch_images.py

Reads each item's `codepoint` from vocab.json and saves the matching OpenMoji
color SVG to assets/openmoji/<CODEPOINT>.svg. Idempotent — files already present
are skipped, so re-run any time you add a word.

Filenames use the UPPERCASE hex codepoint, matching OpenMoji and keeping the site
safe on case-sensitive hosts (GitHub Pages).

Artwork: OpenMoji (https://openmoji.org) — license CC BY-SA 4.0.
"""
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, "vocab.json")
OUT = os.path.join(ROOT, "assets", "openmoji")

# OpenMoji color SVGs; {cp} is the uppercase hex codepoint. Second URL is a fallback.
SOURCES = (
    "https://openmoji.org/data/color/svg/{cp}.svg",
    "https://raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/svg/{cp}.svg",
)


def fetch(cp):
    for src in SOURCES:
        try:
            req = urllib.request.Request(src.format(cp=cp), headers={"User-Agent": "nino-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            if b"<svg" in data[:2000]:        # sanity-check it's really an SVG, not an error page
                return data
        except urllib.error.URLError:
            continue
    return None


def main():
    with open(VOCAB, encoding="utf-8") as f:
        items = json.load(f)["items"]
    codepoints = sorted({it["codepoint"].upper() for it in items})
    os.makedirs(OUT, exist_ok=True)

    downloaded = skipped = failed = 0
    missing = []
    for cp in codepoints:
        dest = os.path.join(OUT, cp + ".svg")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            skipped += 1
            continue
        data = fetch(cp)
        if data:
            with open(dest, "wb") as f:
                f.write(data)
            downloaded += 1
            print(f"  downloaded {cp}.svg")
        else:
            failed += 1
            missing.append(cp)
            print(f"  FAILED {cp} — no SVG found (check the codepoint exists in OpenMoji)", file=sys.stderr)

    print(f"\ndone: {downloaded} downloaded, {skipped} already present, {failed} failed -> {OUT}")
    if missing:
        print("missing codepoints: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
