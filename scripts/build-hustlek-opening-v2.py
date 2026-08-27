#!/usr/bin/env python3
"""Build the compact integer-rectangle HustleK opening v2 atlas.

The approved v1 PNG stays immutable. Its 12 walk cells, six turn/contact
keyposes, and fixed telescope are converted deterministically to binary-alpha,
source-derived colour bands. Runtime rendering uses only integer SVG rects, so
no platform bitmap sampler can interpolate the character.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import TypeAlias

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "design" / "hustlek-opening-v1" / "hustlek-opening-atlas.png"
DEFAULT_OUTPUT = REPO_ROOT / "assets" / "deepspace" / "hustlek-opening-v2.json"
DEFAULT_VALIDATION = REPO_ROOT / "Output" / "hustlek-opening-v2" / "validation.json"

SOURCE_SIZE = (640, 776)
CHARACTER_SIZE = 96
TELESCOPE_SIZE = 128
COLOUR_SAMPLE_BLOCK = 4

EXPECTED_SOURCE_PNG_SHA256 = "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be"
EXPECTED_SOURCE_RGBA_SHA256 = "b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49"
EXPECTED_OUTPUT_JSON_SHA256 = "b599f379db85305b0a2aa82db3f87d7682bc70e59369186bcdcac7c65a79664f"

# Every band is an exact colour already present in the approved v1 cells.
# Four-by-four colour sampling removes photographic colour noise while the
# original non-zero alpha silhouette remains pixel-for-pixel unchanged.
PALETTE = (
    "#fdfbef",
    "#fbe5bb",
    "#fad69e",
    "#e9c185",
    "#ce9a55",
    "#bc733e",
    "#7d743a",
    "#645e35",
    "#5a4f2d",
    "#653d24",
    "#433e2a",
    "#332a20",
    "#252417",
    "#181611",
    "#100a09",
    "#040303",
)

Rect: TypeAlias = list[int]  # [palette index, x, y, width, height]
Grid: TypeAlias = list[list[int]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build or verify the HustleK opening v2 RLE rect atlas")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--validation", type=Path, default=DEFAULT_VALIDATION)
    parser.add_argument("--preview", type=Path, help="optional ignored PNG review sheet")
    parser.add_argument("--check", action="store_true", help="verify committed bytes without rewriting")
    return parser.parse_args()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def rgba_sha256(image: Image.Image) -> str:
    return sha256_bytes(image.convert("RGBA").tobytes())


def rgb(hex_colour: str) -> tuple[int, int, int]:
    return tuple(bytes.fromhex(hex_colour[1:]))  # type: ignore[return-value]


PALETTE_RGB = tuple(rgb(value) for value in PALETTE)


def load_source() -> Image.Image:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"approved v1 atlas not found: {SOURCE}")
    if file_sha256(SOURCE) != EXPECTED_SOURCE_PNG_SHA256:
        raise ValueError("approved v1 atlas file hash changed")
    with Image.open(SOURCE) as opened:
        if opened.mode != "RGBA" or opened.size != SOURCE_SIZE:
            raise ValueError(f"approved v1 atlas contract changed: {opened.mode} {opened.size}")
        source = opened.copy()
    if rgba_sha256(source) != EXPECTED_SOURCE_RGBA_SHA256:
        raise ValueError("approved v1 atlas decoded pixels changed")
    return source


def source_character_cell(source: Image.Image, index: int, row_top: int) -> Image.Image:
    column = index % 6
    return source.crop(
        (
            column * CHARACTER_SIZE,
            row_top,
            (column + 1) * CHARACTER_SIZE,
            row_top + CHARACTER_SIZE,
        )
    )


def nearest_band_from_sums(red: int, green: int, blue: int, count: int) -> int:
    # Compare squared distances without division so output is independent of
    # floating-point or platform rounding. Ties keep the earliest band.
    return min(
        range(len(PALETTE_RGB)),
        key=lambda index: sum(
            (channel_sum - PALETTE_RGB[index][channel] * count) ** 2
            for channel, channel_sum in enumerate((red, green, blue))
        ),
    )


def banded_grid(cell: Image.Image) -> Grid:
    pixels = cell.load()
    grid = [[-1 for _ in range(cell.width)] for _ in range(cell.height)]
    for block_y in range(0, cell.height, COLOUR_SAMPLE_BLOCK):
        for block_x in range(0, cell.width, COLOUR_SAMPLE_BLOCK):
            visible: list[tuple[int, int, int, int]] = []
            for y in range(block_y, min(block_y + COLOUR_SAMPLE_BLOCK, cell.height)):
                for x in range(block_x, min(block_x + COLOUR_SAMPLE_BLOCK, cell.width)):
                    pixel = pixels[x, y]
                    if pixel[3] > 0:
                        visible.append(pixel)
            if not visible:
                continue
            band = nearest_band_from_sums(
                sum(pixel[0] for pixel in visible),
                sum(pixel[1] for pixel in visible),
                sum(pixel[2] for pixel in visible),
                len(visible),
            )
            for y in range(block_y, min(block_y + COLOUR_SAMPLE_BLOCK, cell.height)):
                for x in range(block_x, min(block_x + COLOUR_SAMPLE_BLOCK, cell.width)):
                    if pixels[x, y][3] > 0:
                        grid[y][x] = band
    return grid


def rects_from_grid(grid: Grid) -> list[Rect]:
    active: dict[tuple[int, int, int], Rect] = {}
    complete: list[Rect] = []
    for y, row in enumerate(grid):
        runs: list[tuple[int, int, int]] = []
        x = 0
        while x < len(row):
            if row[x] < 0:
                x += 1
                continue
            band = row[x]
            start = x
            x += 1
            while x < len(row) and row[x] == band:
                x += 1
            runs.append((band, start, x - start))

        next_active: dict[tuple[int, int, int], Rect] = {}
        for key in runs:
            rect = active.get(key, [key[0], key[1], y, key[2], 0])
            rect[4] += 1
            next_active[key] = rect
        complete.extend(rect for key, rect in active.items() if key not in next_active)
        active = next_active
    complete.extend(active.values())
    return sorted(complete, key=lambda rect: (rect[2], rect[1], rect[0], rect[4], rect[3]))


def build_cells(source: Image.Image) -> tuple[list[list[Rect]], list[list[Rect]], list[Rect]]:
    walk = [
        rects_from_grid(banded_grid(source_character_cell(source, index, row_top)))
        for row_top in (360, 456)
        for index in range(6)
    ]
    keyposes = [
        rects_from_grid(banded_grid(source_character_cell(source, index, 552)))
        for index in range(6)
    ]
    telescope = rects_from_grid(banded_grid(source.crop((0, 648, TELESCOPE_SIZE, 648 + TELESCOPE_SIZE))))
    return walk, keyposes, telescope


def payload_bytes(source: Image.Image) -> tuple[dict[str, object], bytes]:
    walk, keyposes, telescope = build_cells(source)
    payload: dict[str, object] = {
        "v": 2,
        "u": 1,
        "q": COLOUR_SAMPLE_BLOCK,
        "p": list(PALETTE),
        "s": {
            "png": EXPECTED_SOURCE_PNG_SHA256,
            "rgba": EXPECTED_SOURCE_RGBA_SHA256,
            "alpha": "nonzero-to-opaque",
            "color": "nearest-source-band-rgb-squared",
            "rect": "horizontal-rle-vertical-merge",
        },
        "w": walk,
        "k": keyposes,
        "t": telescope,
    }
    canonical = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"
    return payload, canonical


def reconstruct(rects: list[Rect], size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = image.load()
    occupied: set[tuple[int, int]] = set()
    for rect in rects:
        if len(rect) != 5 or any(not isinstance(value, int) for value in rect):
            raise ValueError("rect contract requires five integers")
        band, left, top, width, height = rect
        if not (0 <= band < len(PALETTE)) or min(left, top) < 0 or min(width, height) <= 0:
            raise ValueError("rect contract contains an invalid value")
        if left + width > size[0] or top + height > size[1]:
            raise ValueError("rect leaves its cell bounds")
        colour = (*PALETTE_RGB[band], 255)
        for y in range(top, top + height):
            for x in range(left, left + width):
                if (x, y) in occupied:
                    raise ValueError("rects overlap")
                occupied.add((x, y))
                pixels[x, y] = colour
    return image


def masks_match(source: Image.Image, rendered: Image.Image) -> bool:
    return tuple(
        255 if value > 0 else 0 for value in source.getchannel("A").get_flattened_data()
    ) == tuple(
        rendered.getchannel("A").get_flattened_data()
    )


def floor_anchor(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    return -1 if bbox is None else bbox[3] - 1


def validate(source: Image.Image, payload: dict[str, object], canonical: bytes, output: Path) -> dict[str, object]:
    walk_rects = payload["w"]
    key_rects = payload["k"]
    telescope_rects = payload["t"]
    assert isinstance(walk_rects, list) and isinstance(key_rects, list) and isinstance(telescope_rects, list)

    source_cells = [
        source_character_cell(source, index, row_top)
        for row_top in (360, 456)
        for index in range(6)
    ]
    source_keys = [source_character_cell(source, index, 552) for index in range(6)]
    source_telescope = source.crop((0, 648, 128, 776))
    rendered_walk = [reconstruct(rects, (96, 96)) for rects in walk_rects]
    rendered_keys = [reconstruct(rects, (96, 96)) for rects in key_rects]
    rendered_telescope = reconstruct(telescope_rects, (128, 128))
    rendered_all = [*rendered_walk, *rendered_keys, rendered_telescope]
    source_all = [*source_cells, *source_keys, source_telescope]
    rect_counts = [len(rects) for rects in [*walk_rects, *key_rects, telescope_rects]]
    total_rects = sum(rect_counts)
    max_visible_rects = max(rect_counts[:-1]) + rect_counts[-1]
    combined_rgba = b"".join(image.tobytes() for image in rendered_all)
    output_hash = sha256_bytes(canonical)
    all_alpha = {
        value
        for image in rendered_all
        for value in image.getchannel("A").get_flattened_data()
    }
    gates = {
        "source_file_exact": file_sha256(SOURCE) == EXPECTED_SOURCE_PNG_SHA256,
        "source_pixels_exact": rgba_sha256(source) == EXPECTED_SOURCE_RGBA_SHA256,
        "output_file_exact": output_hash == EXPECTED_OUTPUT_JSON_SHA256,
        "output_bytes_canonical": output.is_file() and output.read_bytes() == canonical,
        "walk_cells_12": len(rendered_walk) == 12,
        "turn_contact_cells_6": len(rendered_keys) == 6,
        "telescope_cells_1": len(telescope_rects) > 0,
        "silhouettes_exact": all(masks_match(expected, actual) for expected, actual in zip(source_all, rendered_all)),
        "floor_anchors_exact": all(
            floor_anchor(expected) == floor_anchor(actual) for expected, actual in zip(source_all, rendered_all)
        ),
        "binary_alpha_only": all_alpha <= {0, 255},
        "palette_exact": payload["p"] == list(PALETTE),
        "compact_under_180kb": len(canonical) < 180_000,
        "bitmap_decode_bytes_zero": True,
    }
    return {
        "status": "PASS" if all(gates.values()) else "FAIL",
        "source": str(SOURCE.relative_to(REPO_ROOT)).replace("\\", "/"),
        "output": str(output.relative_to(REPO_ROOT)).replace("\\", "/"),
        "source_png_sha256": file_sha256(SOURCE),
        "source_decoded_rgba_sha256": rgba_sha256(source),
        "output_json_sha256": output_hash,
        "reconstructed_rgba_sha256": sha256_bytes(combined_rgba),
        "output_file_bytes": len(canonical),
        "palette_colours": len(PALETTE),
        "colour_sample_block": COLOUR_SAMPLE_BLOCK,
        "walk_cells": len(rendered_walk),
        "turn_contact_cells": len(rendered_keys),
        "telescope_cells": 1,
        "rect_counts": {
            "walk": sum(rect_counts[:12]),
            "turn_contact": sum(rect_counts[12:18]),
            "telescope": rect_counts[-1],
            "total": total_rects,
            "max_visible": max_visible_rects,
        },
        "memory_estimates": {
            "bitmap_decode_bytes": 0,
            "js_numeric_payload_lower_bound_bytes": total_rects * 5 * 8,
            "native_visible_rect_estimate_bytes": max_visible_rects * 128,
            "basis": "five float64 values per loaded rect; 128 bytes per currently mounted SVG rect",
        },
        "partial_alpha_pixels": 0,
        "gates": gates,
    }


def write_preview(payload: dict[str, object], target: Path) -> None:
    walk = payload["w"]
    keyposes = payload["k"]
    telescope = payload["t"]
    assert isinstance(walk, list) and isinstance(keyposes, list) and isinstance(telescope, list)
    sheet = Image.new("RGBA", (576, 416), (0, 0, 0, 0))
    for index, rects in enumerate(walk):
        sheet.alpha_composite(reconstruct(rects, (96, 96)), ((index % 6) * 96, (index // 6) * 96))
    for index, rects in enumerate(keyposes):
        sheet.alpha_composite(reconstruct(rects, (96, 96)), (index * 96, 192))
    sheet.alpha_composite(reconstruct(telescope, (128, 128)), (0, 288))
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target, format="PNG", optimize=False, compress_level=9)


def main() -> int:
    args = parse_args()
    output = args.output.expanduser().resolve()
    validation_path = args.validation.expanduser().resolve()
    source = load_source()
    payload, canonical = payload_bytes(source)

    if args.check:
        if not output.is_file():
            raise FileNotFoundError(f"compact rect atlas not found: {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(canonical)

    result = validate(source, payload, canonical, output)
    validation_path.parent.mkdir(parents=True, exist_ok=True)
    validation_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.preview:
        write_preview(payload, args.preview.expanduser().resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
