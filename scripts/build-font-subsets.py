#!/usr/bin/env python3
"""Rebuild the vendored Galmuri subsets in assets/fonts/.

Why this file exists
--------------------
`assets/fonts/Galmuri11-subset.{ttf,woff2}` landed in #282 (2026-06-08) as raw
binaries with no recipe, so the next person who needed a matching face had to
reverse-engineer the character set out of the shipped file. This script IS that
recipe, recovered and written down (2026-08-20, PIXEL-CLAY stage 2).

The character set was recovered by reading the shipped subset's cmap:
    ASCII        U+0020-007E   95 glyphs
    compat jamo  U+3130-318F   94 glyphs
    Hangul       U+AC00-D7A3   11172 glyphs  (ALL of them, on purpose)
                               ------------
                               11361 glyphs

Full Hangul is deliberate and must stay: this app stores free-form Korean the
user typed. A 2350-syllable KS X 1001 subset would render most prose fine and
then silently fall back to the system font on an unusual name or syllable.

...and then WIDENED (2026-08-20), because that recovered set was too narrow
-------------------------------------------------------------------------
The 2026-06 subset was cut when Galmuri was only a pixel TITLE face. PIXEL-CLAY
stage 2 makes it the BODY face for every migrated screen, so the holes started
to matter. Measured against what the app actually ships (all 225 files under
locales/, values only), 43 distinct codepoints fell outside it:

    ·  708 uses   the repo's canonical separator -- DESIGN.md bans em dashes,
                  so '·' is everywhere in product copy
    …  376        ellipsis
    á ã ó í ç é ê ú õ ñ ¿ à â É Ú Á Ó À Í Ã Ç ¡     ~5000 uses combined,
                  because locales/ ships es/ and pt/ alongside en/ko/id
    – ‘ ’ ›       punctuation
    → ← ↓ ↔ ↗     arrows
    ▲ ▼ × − ₩ 「 」 λ

Every one of those would have left the declared family mid-string and been
resolved by the platform's per-glyph fallback -- system sans, different width
and weight, inside otherwise-bitmap text. So the ranges below cover them, plus
the neighbouring blocks (cheap: ~1200 glyphs against 11172 Hangul).

Still dropped on purpose: CJK ideographs (6477), kana (187), Cyrillic, Thai,
Devanagari, Arabic and emoji. Those appear only in source comments and
language-name lists, never in a locale value -- verified by scanning locale
values separately from source text. Emoji never come from a text font anyway.

Known gaps, accepted: U+2060 WORD JOINER has no glyph in any Galmuri face (it
is an invisible control, so nothing renders differently). Galmuri14 lacks
› − λ, and Galmuri11-Bold lacks ↗ ↔ − λ; each is 1-15 uses and falls back
per-glyph.

Not part of `npm run verify`: it needs Python + fonttools, which are not repo
dependencies, and the outputs are committed binaries that change only when the
`galmuri` npm package is bumped.

Usage
-----
    pip install "fonttools[woff]" brotli
    npm ci --legacy-peer-deps          # puts the sources in node_modules/galmuri
    python scripts/build-font-subsets.py [--check]

`--check` rebuilds into a temp dir and reports the size delta against what is
committed instead of overwriting (fontTools version drift makes the bytes
non-reproducible; ~1% is normal).
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "node_modules", "galmuri", "dist")
DEST = os.path.join(ROOT, "assets", "fonts")

# The recipe. Do not narrow the Hangul range -- see the docstring.
UNICODE_RANGES = [
    ("U+0020-007E", "ASCII"),
    ("U+00A0-00FF", "Latin-1 Supplement -- '·' and the es/pt accents"),
    ("U+0100-017F", "Latin Extended-A -- insurance for further Latin locales"),
    ("U+0370-03FF", "Greek -- 'lambda' appears in one locale value"),
    ("U+2000-206F", "General Punctuation -- ellipsis, en dash, curly quotes"),
    ("U+20A0-20BF", "Currency -- the won sign"),
    ("U+2190-21FF", "Arrows"),
    ("U+2200-22FF", "Math operators -- minus sign"),
    ("U+2460-24FF", "Enclosed alphanumerics -- circled digits"),
    ("U+2500-259F", "Box drawing + block elements"),
    ("U+25A0-25FF", "Geometric shapes -- the triangles, and PIXEL-CLAY's blocks"),
    ("U+2600-26FF", "Misc symbols -- star, warning"),
    ("U+2700-27BF", "Dingbats -- check, ballot X"),
    ("U+3000-303F", "CJK symbols and punctuation -- corner brackets"),
    ("U+3130-318F", "Hangul compatibility jamo"),
    ("U+AC00-D7A3", "Hangul syllables -- ALL 11172, on purpose"),
    ("U+FF00-FFEF", "Halfwidth and fullwidth forms"),
]
UNICODES = ",".join(r for r, _ in UNICODE_RANGES)

# Galmuri does not have a glyph for every codepoint in every range above, so the
# count is what SURVIVES subsetting, not what was asked for. Pinned so a font
# package bump that silently drops coverage shows up as a failure here.
EXPECTED_GLYPHS = 12558

# (output stem, upstream file). The stem doubles as the RN family key prefix:
# src/theme/typography.ts registers `Galmuri14: require(".../Galmuri14-subset.ttf")`.
FACES = [
    ("Galmuri11", "Galmuri11.ttf"),
    ("Galmuri11Bold", "Galmuri11-Bold.ttf"),
    ("Galmuri14", "Galmuri14.ttf"),
    ("Galmuri9", "Galmuri9.ttf"),
    ("GalmuriMono11", "GalmuriMono11.ttf"),
]


def build(src: str, out: str, flavor: str | None = None) -> int:
    args = [
        src,
        f"--unicodes={UNICODES}",
        f"--output-file={out}",
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
        "--drop-tables+=DSIG",
    ]
    if flavor:
        args.append(f"--flavor={flavor}")
    subset.main(args)
    return os.path.getsize(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report deltas, do not overwrite")
    args = ap.parse_args()

    if not os.path.isdir(SRC):
        print(f"FAIL  {SRC} missing -- run `npm ci --legacy-peer-deps` first", file=sys.stderr)
        return 1

    target = tempfile.mkdtemp(prefix="galmuri-") if args.check else DEST
    os.makedirs(target, exist_ok=True)
    bad = 0

    for stem, upstream in FACES:
        src = os.path.join(SRC, upstream)
        if not os.path.isfile(src):
            print(f"FAIL  {upstream} not in the galmuri package", file=sys.stderr)
            bad += 1
            continue
        for ext, flavor in (("ttf", None), ("woff2", "woff2")):
            out = os.path.join(target, f"{stem}-subset.{ext}")
            size = build(src, out, flavor)
            note = ""
            if args.check:
                committed = os.path.join(DEST, f"{stem}-subset.{ext}")
                if os.path.isfile(committed):
                    was = os.path.getsize(committed)
                    note = f"  (committed {was/1000:.1f}K, delta {(size-was)/max(was,1)*100:+.1f}%)"
                else:
                    note = "  (NOT COMMITTED)"
                    bad += 1
            print(f"  {stem}-subset.{ext:<5} {size/1000:9.1f}K{note}")
        n = len(TTFont(os.path.join(target, f"{stem}-subset.ttf"), lazy=True).getBestCmap())
        # Each face covers the ranges slightly differently upstream, so allow a
        # small shortfall but catch a collapse (e.g. Hangul silently dropped).
        if n < EXPECTED_GLYPHS - 600:
            print(f"FAIL  {stem} has {n} codepoints, expected about {EXPECTED_GLYPHS}", file=sys.stderr)
            bad += 1

    if args.check:
        shutil.rmtree(target, ignore_errors=True)
    print("FONT SUBSET " + ("FAIL" if bad else "PASS"))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
