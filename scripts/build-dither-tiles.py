#!/usr/bin/env python3
"""Generate the PIXEL-CLAY dither tiles in assets/dither/.

Why tiles and not a gradient
----------------------------
PIXEL-CLAY absolute rule 3 bans blur and rule 4 bans static opacity: anything
that would have been `opacity: .5` or a `blur()` scrim has to be a DITHER
instead -- a hard-edged checkerboard that reads as translucency at a glance and
has no anti-aliased pixel anywhere in it.

The web bundle draws that with `repeating-conic-gradient` / stacked 45deg
`linear-gradient`s (`_ds/css/primitives.css` .px-scrim). React Native has
neither, so Simon's decision D4 picked "small tile image, repeated"
(docs/PIXEL-CLAY-MIGRATION.md §3). This builds those tiles.

Why three densities per tile, and why @2x/@3x
--------------------------------------------
`resizeMode="repeat"` tiles the image at its natural SIZE IN DP, so on a 3x
phone a 1x asset is upscaled 3x -- and RN upscales bilinearly, which puts a soft
grey ramp on every checker edge. That is precisely the anti-aliasing the rule
exists to forbid, and it would be invisible in review and obvious on a phone.

Shipping @2x/@3x makes the mapping exactly 1:1 on every density, so the checker
stays hard-edged. Cell size is `--u` = 2dp (the same unit the CSS checker uses),
so: 1x = 2px cells / 4x4 tile, 2x = 4px cells / 8x8, 3x = 6px cells / 12x12.

Colour is baked in because the palette is a build-time constant (decision D2:
no runtime palette swapping). `--scrim` is c00 in the midnight palette.

Usage
-----
    python scripts/build-dither-tiles.py
"""
from __future__ import annotations

import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "assets", "dither")

# midnight --scrim = c00. Baked in; see the docstring.
SCRIM = (0x0A, 0x0E, 0x18)

# coverage -> which cells of the 2x2 checker block are painted.
# 25%: one cell. 50%: the classic checker. 75%: three cells (a dense scrim).
PATTERNS = {
    25: [(0, 0)],
    50: [(0, 0), (1, 1)],
    75: [(0, 0), (1, 1), (1, 0)],
}

CELL_DP = 2  # `--u`
BLOCK = 2  # a 2x2 checker block, so the tile is 4dp square


def png(width: int, height: int, rgba: bytes) -> bytes:
    """Minimal RGBA PNG. stdlib only -- no Pillow dependency for 9 tiny files."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(
        b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def tile(coverage: int, scale: int) -> bytes:
    cell = CELL_DP * scale
    size = BLOCK * cell
    on = set(PATTERNS[coverage])
    px = bytearray()
    for y in range(size):
        for x in range(size):
            painted = (x // cell, y // cell) in on
            px += bytes((*SCRIM, 255)) if painted else b"\x00\x00\x00\x00"
    return png(size, size, bytes(px))


def main() -> int:
    os.makedirs(DEST, exist_ok=True)
    made = []
    for coverage in sorted(PATTERNS):
        for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
            name = f"dither-{coverage}{suffix}.png"
            data = tile(coverage, scale)
            with open(os.path.join(DEST, name), "wb") as f:
                f.write(data)
            made.append((name, BLOCK * CELL_DP * scale, len(data)))
    for name, size, n in made:
        print(f"  {name:20} {size:2}x{size:<2}px  {n:5} bytes")
    print(f"DITHER TILES PASS  ({len(made)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
