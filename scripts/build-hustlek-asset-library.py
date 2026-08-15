#!/usr/bin/env python3
"""Compile PIXEL-CLAY SVG assets into deterministic HustleK pixel atlases.

This compiler preserves each canonical SVG identity, creates one native 128px
HustleK master, derives 16/32/48/64 tiers with Pillow NEAREST, and permits only
coordinate-whitelisted pixel copies after reduction.  Published batches are
content-addressed and catalog activation happens only after all in-memory and
encoded-crop validation passes.

The compiler never invokes ImageGen or Pixy.  Approved raster masters may act
as style/control anchors; lower tiers never use sibling images as inputs.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import io
import json
import math
import platform
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree

from PIL import (
    Image,
    ImageDraw,
    ImageFilter,
    ImageFont,
    PngImagePlugin,
    __version__ as PILLOW_VERSION,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ZIP = Path(r"C:\Users\202502\Downloads\PIXEL-CLAY Design System.zip")
OUTPUT_ROOT = REPO_ROOT / "design" / "hustlek-assets-v1"
CATALOG_PATH = OUTPUT_ROOT / "catalog.json"
CHEF_ANCHOR = (
    REPO_ROOT
    / "design"
    / "hustlek-assets-pilot"
    / "avatar-chef-nearest-v1"
    / "128.png"
)
TELESCOPE_ANCHOR = (
    REPO_ROOT / "design" / "hustlek-assets-pilot" / "telescope" / "128.png"
)

SOURCE_ARCHIVE_SHA256 = "2a5a6a14d81ca22dafd87b9b5f0547312cfac7682b95d74ae263c132b299238e"
CHEF_ANCHOR_RGBA_SHA256 = "9956c4c6f6b7e6d0ce0accd77452a3c655e8a0ac92485d26f0cf91fe7d22a96d"
TELESCOPE_ANCHOR_RGBA_SHA256 = "899e278515a0938e2f50c813a5ed3da22cd19ff419a81b03b34d75027bb69ff6"

COMPILER_VERSION = "hustlek-library-compiler/v1"
MASTER_SIZE = 128
TIER_SIZES = (16, 32, 48, 64)
ATLAS_COLUMNS = 4
CELL_SIZE = 128
CANONICAL_COUNTS = {"icons": 533, "avatars": 270, "total": 803, "aliases": 51}

DEFAULT_BATCH_ID = "pilot-000"
DEFAULT_ASSETS = (
    "avatars/presets/plain",
    "avatars/food/chef",
    "avatars/fantasy/wizard",
    "avatars/animals/cat",
    "icons/camera",
    "icons/calendar",
    "icons/error",
    "icons/tree",
)

# Static corrections are exceptions, not a second renderer.  Colors are always
# copied from the plain NEAREST baseline so every tier remains a master-palette
# subset.  The chef operations are the previously approved two-button repair.
STATIC_CORRECTIONS: dict[tuple[str, int], tuple[dict[str, Any], ...]] = {
    ("avatars/food/chef", 16): (
        {
            "op": "copy-recolor",
            "target": (7, 13),
            "source": (6, 7),
            "region": "garment",
            "reason": "restore-left-primary-garment-cue",
        },
        {
            "op": "copy-recolor",
            "target": (9, 13),
            "source": (6, 7),
            "region": "garment",
            "reason": "restore-right-primary-garment-cue",
        },
    ),
}

TIER_PACKING = {
    64: (8, 24),
    48: (72, 24),
    32: (72, 72),
    16: (104, 72),
}

RGBA = tuple[int, int, int, int]
RGB = tuple[int, int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a HustleK atlas batch.")
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_SOURCE_ZIP)
    parser.add_argument("--batch-id", default=DEFAULT_BATCH_ID)
    parser.add_argument(
        "--asset",
        action="append",
        dest="assets",
        help="Canonical asset id, e.g. icons/camera or avatars/food/chef",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--preview", type=Path)
    return parser.parse_args()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text_lf(path: Path) -> str:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return sha256_bytes(text.encode("utf-8"))


def decoded_rgba_sha256(image: Image.Image) -> str:
    return sha256_bytes(image.convert("RGBA").tobytes())


def canonical_json_bytes(value: Any, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return text.encode("utf-8")


def png_bytes(image: Image.Image, metadata: dict[str, str]) -> bytes:
    png_info = PngImagePlugin.PngInfo()
    for key, value in metadata.items():
        png_info.add_text(key, value)
    output = io.BytesIO()
    image.save(
        output,
        format="PNG",
        pnginfo=png_info,
        optimize=False,
        compress_level=9,
    )
    return output.getvalue()


def open_png_bytes(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGBA")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def hex_rgb(value: str) -> RGB:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def luma(rgb: RGB | RGBA) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def mix(left: RGB, right: RGB, amount: float) -> RGB:
    return tuple(
        max(0, min(255, round(left[index] * (1 - amount) + right[index] * amount)))
        for index in range(3)
    )  # type: ignore[return-value]


def warm_color(rgb: RGB, ivory: RGB, ink: RGB) -> RGB:
    if luma(rgb) < 72:
        return ink
    red, green, blue = rgb
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    saturation = min(1.0, saturation * 0.92 + 0.02)
    value = min(1.0, value * 0.98)
    warmed = tuple(round(channel * 255) for channel in colorsys.hsv_to_rgb(hue, saturation, value))
    return mix(warmed, ivory, 0.06)


def validate_binary_rgba(image: Image.Image, label: str) -> list[str]:
    errors: list[str] = []
    if image.mode != "RGBA":
        errors.append(f"{label}: mode must be RGBA, got {image.mode}")
    alpha_values = set(image.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        errors.append(f"{label}: alpha must be binary, got {sorted(alpha_values)}")
    hidden = sum(
        rgba[3] == 0 and rgba[:3] != (0, 0, 0)
        for rgba in image.get_flattened_data()
    )
    if hidden:
        errors.append(f"{label}: hidden RGB under {hidden} transparent pixels")
    if image.getchannel("A").getbbox() is None:
        errors.append(f"{label}: empty foreground")
    return errors


def foreground_count(image: Image.Image) -> int:
    return sum(value > 0 for value in image.getchannel("A").get_flattened_data())


def opaque_palette(image: Image.Image) -> set[RGBA]:
    return {rgba for rgba in image.get_flattened_data() if rgba[3] > 0}


def eight_components(image: Image.Image) -> list[int]:
    alpha = image.getchannel("A")
    remaining = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y)) > 0
    }
    components: list[int] = []
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        count = 1
        while stack:
            x, y = stack.pop()
            for delta_y in (-1, 0, 1):
                for delta_x in (-1, 0, 1):
                    neighbor = (x + delta_x, y + delta_y)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
                        count += 1
        components.append(count)
    return sorted(components, reverse=True)


def transparent_holes(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    transparent = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y)) == 0
    }
    holes = 0
    while transparent:
        seed = transparent.pop()
        stack = [seed]
        touches_edge = seed[0] in {0, image.width - 1} or seed[1] in {0, image.height - 1}
        while stack:
            x, y = stack.pop()
            for delta_y, delta_x in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                neighbor = (x + delta_x, y + delta_y)
                if neighbor in transparent:
                    transparent.remove(neighbor)
                    stack.append(neighbor)
                    touches_edge |= neighbor[0] in {0, image.width - 1} or neighbor[1] in {0, image.height - 1}
        holes += not touches_edge
    return holes


def alpha_iou(left: Image.Image, right: Image.Image) -> float:
    if left.size != right.size:
        raise ValueError(f"IoU inputs differ: {left.size} vs {right.size}")
    intersection = 0
    union = 0
    for left_value, right_value in zip(
        left.getchannel("A").get_flattened_data(),
        right.getchannel("A").get_flattened_data(),
        strict=True,
    ):
        left_on = left_value > 0
        right_on = right_value > 0
        intersection += left_on and right_on
        union += left_on or right_on
    return intersection / union if union else 1.0


def parse_svg(data: bytes, *, current_color: RGB = (255, 255, 255)) -> Image.Image:
    root = ElementTree.fromstring(data)
    view_box = [int(float(value)) for value in root.attrib["viewBox"].split()]
    image = Image.new("RGBA", (view_box[2], view_box[3]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for element in root.iter():
        if element.tag.split("}")[-1] != "rect":
            continue
        fill = element.attrib.get("fill", "currentColor")
        if fill == "none":
            continue
        color = current_color if fill == "currentColor" else hex_rgb(fill)
        x = int(float(element.attrib.get("x", 0)))
        y = int(float(element.attrib.get("y", 0)))
        width = int(float(element.attrib.get("width", 1)))
        height = int(float(element.attrib.get("height", 1)))
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=(*color, 255))
    return image


def refined_upscale(source: Image.Image) -> tuple[Image.Image, Image.Image]:
    if MASTER_SIZE % source.width:
        raise ValueError(f"Source width must divide 128, got {source.size}")
    scale = MASTER_SIZE // source.width
    labels = source.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.NEAREST)
    alpha = labels.getchannel("A")
    if scale < 2:
        return labels, alpha

    source_alpha = source.getchannel("A")
    output_alpha = alpha.copy()
    cut = 1 if scale <= 4 else 2
    for source_y in range(source.height):
        for source_x in range(source.width):
            if source_alpha.getpixel((source_x, source_y)) == 0:
                continue

            def empty_at(x: int, y: int) -> bool:
                return not (0 <= x < source.width and 0 <= y < source.height) or source_alpha.getpixel((x, y)) == 0

            corners = (
                (empty_at(source_x - 1, source_y), empty_at(source_x, source_y - 1), 0, 0, 1, 1),
                (empty_at(source_x + 1, source_y), empty_at(source_x, source_y - 1), scale - 1, 0, -1, 1),
                (empty_at(source_x - 1, source_y), empty_at(source_x, source_y + 1), 0, scale - 1, 1, -1),
                (empty_at(source_x + 1, source_y), empty_at(source_x, source_y + 1), scale - 1, scale - 1, -1, -1),
            )
            for horizontal_empty, vertical_empty, corner_x, corner_y, step_x, step_y in corners:
                if not (horizontal_empty and vertical_empty):
                    continue
                for offset_y in range(cut):
                    for offset_x in range(cut - offset_y):
                        target_x = source_x * scale + corner_x + offset_x * step_x
                        target_y = source_y * scale + corner_y + offset_y * step_y
                        output_alpha.putpixel((target_x, target_y), 0)

    labels.putalpha(output_alpha)
    return labels, output_alpha


def anchor_palette(chef: Image.Image, telescope: Image.Image) -> dict[str, RGB]:
    chef_colors = Counter(rgba[:3] for rgba in chef.get_flattened_data() if rgba[3])
    telescope_colors = Counter(rgba[:3] for rgba in telescope.get_flattened_data() if rgba[3])

    def most_common(colors: Counter[RGB], predicate: Any) -> RGB:
        candidates = [(count, color) for color, count in colors.items() if predicate(color)]
        if not candidates:
            raise ValueError("Style anchor is missing a required color role")
        return max(candidates)[1]

    return {
        "ink": most_common(chef_colors, lambda color: luma(color) < 45),
        "ivory": most_common(chef_colors, lambda color: luma(color) > 230 and max(color) - min(color) < 28),
        "skin": most_common(chef_colors, lambda color: color[0] > color[1] > color[2] and color[0] > 235 and 15 < color[0] - color[1] < 55),
        "brass": most_common(telescope_colors, lambda color: color[0] > 180 and color[0] > color[1] > color[2] and color[1] - color[2] > 25),
        "blue": most_common(telescope_colors, lambda color: color[2] > color[0] and color[2] > color[1]),
        "brown": most_common(telescope_colors, lambda color: color[0] > color[1] * 1.3 and color[1] > color[2] and luma(color) < 135),
    }


def directional_tone(
    labels: Image.Image,
    alpha: Image.Image,
    eroded: Image.Image,
    base_rgb: RGB,
    x: int,
    y: int,
    ink: RGB,
    ivory: RGB,
    outline_radius: int,
) -> RGB:
    if eroded.getpixel((x, y)) == 0:
        return ink

    label = labels.getpixel((x, y))[:3]
    step = max(2, outline_radius - 1)

    def differs(test_x: int, test_y: int) -> bool:
        if not (0 <= test_x < labels.width and 0 <= test_y < labels.height):
            return True
        candidate = labels.getpixel((test_x, test_y))
        return candidate[3] == 0 or candidate[:3] != label

    near_upper_left = differs(x - step, y) or differs(x, y - step)
    near_lower_right = differs(x + step, y) or differs(x, y + step)
    if near_upper_left and (x + y) / (labels.width + labels.height) < 0.72:
        return mix(base_rgb, ivory, 0.28)
    if near_lower_right:
        return mix(base_rgb, ink, 0.30)
    return base_rgb


def build_avatar_master(
    source: Image.Image,
    palette_roles: dict[str, set[RGB]],
    style: dict[str, RGB],
) -> Image.Image:
    labels, alpha = refined_upscale(source)
    eroded = alpha.filter(ImageFilter.MinFilter(9))
    output = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    pixels = output.load()
    for y in range(MASTER_SIZE):
        for x in range(MASTER_SIZE):
            if alpha.getpixel((x, y)) == 0:
                continue
            original = labels.getpixel((x, y))[:3]
            if original in palette_roles["skin"]:
                base = mix(warm_color(original, style["ivory"], style["ink"]), style["skin"], 0.18)
            elif original in palette_roles["hair"]:
                base = warm_color(original, style["ivory"], style["ink"])
            elif original in palette_roles["fur"]:
                base = warm_color(original, style["ivory"], style["ink"])
            elif original in palette_roles["cloth"]:
                base = warm_color(original, style["ivory"], style["ink"])
            else:
                base = warm_color(original, style["ivory"], style["ink"])
            color = directional_tone(labels, alpha, eroded, base, x, y, style["ink"], style["ivory"], 4)
            pixels[x, y] = (*color, 255)
    return output


def icon_base_color(profile: str, x: int, y: int, style: dict[str, RGB]) -> RGB:
    x_ratio = x / MASTER_SIZE
    y_ratio = y / MASTER_SIZE
    if profile == "icon-ui-v1":
        return (187, 70, 67)
    if profile == "icon-rectilinear-v1":
        return style["brass"] if y_ratio < 0.30 else style["ivory"]
    if profile == "icon-organic-v1":
        if y_ratio > 0.70 and 0.38 < x_ratio < 0.62:
            return style["brown"]
        return (91, 119, 59)
    return style["ivory"] if y_ratio < 0.66 else style["brass"]


def build_icon_master(source: Image.Image, profile: str, style: dict[str, RGB]) -> Image.Image:
    labels, alpha = refined_upscale(source)
    labels = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (*style["ivory"], 0))
    labels.putalpha(alpha)
    output = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    pixels = output.load()
    outline_radius = 2 if profile == "icon-ui-v1" else 5
    eroded = alpha.filter(ImageFilter.MinFilter(outline_radius * 2 + 1))

    for y in range(MASTER_SIZE):
        for x in range(MASTER_SIZE):
            if alpha.getpixel((x, y)) == 0:
                continue
            base = icon_base_color(profile, x, y, style)
            color = directional_tone(
                labels,
                alpha,
                eroded,
                base,
                x,
                y,
                style["ink"],
                style["ivory"],
                outline_radius,
            )
            if profile == "icon-object-v1" and eroded.getpixel((x, y)) > 0:
                # A central inner aperture is the strongest mechanical cue.
                if 0.27 < x / MASTER_SIZE < 0.73 and 0.27 < y / MASTER_SIZE < 0.73:
                    for delta_x, delta_y in ((-6, 0), (6, 0), (0, -6), (0, 6)):
                        test_x = max(0, min(MASTER_SIZE - 1, x + delta_x))
                        test_y = max(0, min(MASTER_SIZE - 1, y + delta_y))
                        if alpha.getpixel((test_x, test_y)) == 0:
                            color = style["blue"]
                            break
            pixels[x, y] = (*color, 255)
    return output


def choose_profile(asset_id: str, icon_entry: dict[str, Any] | None) -> str:
    if asset_id.startswith("avatars/animals/"):
        return "avatar-animal-v1"
    if asset_id.startswith("avatars/fantasy/"):
        return "avatar-fantasy-v1"
    if asset_id.startswith("avatars/"):
        return "avatar-human-v1"
    if icon_entry is None:
        raise ValueError(f"Missing icon manifest entry: {asset_id}")
    if icon_entry["category"] in {"status", "navigation", "security", "media"}:
        return "icon-ui-v1"
    if icon_entry["category"] in {"weather", "farm", "rest", "growth"}:
        return "icon-organic-v1"
    operations = {str(command[0]).lstrip("-") for command in icon_entry["def"]}
    if operations <= {"R", "H", "V", "B"}:
        return "icon-rectilinear-v1"
    return "icon-object-v1"


def apply_corrections(asset_id: str, baseline: Image.Image, size: int) -> tuple[Image.Image, list[dict[str, Any]]]:
    corrected = baseline.copy()
    pixels = corrected.load()
    baseline_pixels = baseline.load()
    operations = [dict(operation) for operation in STATIC_CORRECTIONS.get((asset_id, size), ())]
    used_targets: set[tuple[int, int]] = set()
    for operation in operations:
        target = tuple(operation["target"])
        source = tuple(operation["source"])
        if target in used_targets:
            raise ValueError(f"Duplicate correction target: {asset_id} {size}px {target}")
        used_targets.add(target)
        if not all(0 <= value < size for value in (*target, *source)):
            raise ValueError(f"Correction outside canvas: {asset_id} {size}px {operation}")
        source_rgba = baseline_pixels[source]
        target_rgba = baseline_pixels[target]
        if source_rgba[3] == 0:
            raise ValueError(f"Transparent correction source: {asset_id} {operation}")
        if operation["op"] == "copy-recolor" and target_rgba[3] == 0:
            raise ValueError(f"copy-recolor target is transparent: {asset_id} {operation}")
        if operation["op"] == "copy-add" and target_rgba[3] != 0:
            raise ValueError(f"copy-add target is opaque: {asset_id} {operation}")
        if operation["op"] not in {"copy-recolor", "copy-add"}:
            raise ValueError(f"Unsupported correction op: {operation}")
        pixels[target] = source_rgba
    return corrected, operations


def correction_metrics(baseline: Image.Image, final: Image.Image, operations: list[dict[str, Any]]) -> dict[str, Any]:
    width = baseline.width
    changed = {
        (index % width, index // width)
        for index, (left, right) in enumerate(
            zip(baseline.get_flattened_data(), final.get_flattened_data(), strict=True)
        )
        if left != right
    }
    planned = {tuple(operation["target"]) for operation in operations}
    additions = sum(
        baseline.getpixel(point)[3] == 0 and final.getpixel(point)[3] > 0
        for point in changed
    )
    removals = sum(
        baseline.getpixel(point)[3] > 0 and final.getpixel(point)[3] == 0
        for point in changed
    )
    return {
        "changed_pixels": len(changed),
        "changed_ratio": len(changed) / max(1, foreground_count(baseline)),
        "alpha_added": additions,
        "alpha_removed": removals,
        "rgba_recolored": len(changed) - additions - removals,
        "changed_targets": [list(point) for point in sorted(changed)],
        "unplanned_targets": [list(point) for point in sorted(changed - planned)],
        "no_effect_targets": [list(point) for point in sorted(planned - changed)],
        "alpha_iou": alpha_iou(baseline, final),
    }


def source_comparison(master: Image.Image, source: Image.Image, kind: str) -> dict[str, Any]:
    compare_size = 32 if kind == "avatar" else 16
    master_projection = master.resize((compare_size, compare_size), Image.Resampling.NEAREST)
    source_projection = source.resize((compare_size, compare_size), Image.Resampling.NEAREST)
    return {
        "comparison_size": compare_size,
        "alpha_iou": alpha_iou(master_projection, source_projection),
        "source_components": eight_components(source_projection),
        "master_components": eight_components(master_projection),
        "source_holes": transparent_holes(source_projection),
        "master_holes": transparent_holes(master_projection),
    }


def atlas_positions(count: int) -> tuple[int, int]:
    rows = math.ceil(count / ATLAS_COLUMNS)
    return ATLAS_COLUMNS * CELL_SIZE, rows * CELL_SIZE


def build_atlases(asset_results: list[dict[str, Any]]) -> tuple[Image.Image, Image.Image]:
    width, height = atlas_positions(len(asset_results))
    masters = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    tiers = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for index, result in enumerate(asset_results):
        cell_x = (index % ATLAS_COLUMNS) * CELL_SIZE
        cell_y = (index // ATLAS_COLUMNS) * CELL_SIZE
        masters.alpha_composite(result["master"], (cell_x, cell_y))
        result["master_crop"] = {"x": cell_x, "y": cell_y, "w": 128, "h": 128}
        result["tier_crops"] = {}
        for size in TIER_SIZES:
            offset_x, offset_y = TIER_PACKING[size]
            tiers.alpha_composite(result["tiers"][size], (cell_x + offset_x, cell_y + offset_y))
            result["tier_crops"][size] = {
                "x": cell_x + offset_x,
                "y": cell_y + offset_y,
                "w": size,
                "h": size,
            }
    return masters, tiers


def crop_from(image: Image.Image, crop: dict[str, int]) -> Image.Image:
    return image.crop((crop["x"], crop["y"], crop["x"] + crop["w"], crop["y"] + crop["h"]))


def checkerboard(width: int, height: int, tile: int = 8) -> Image.Image:
    image = Image.new("RGBA", (width, height), (20, 25, 34, 255))
    draw = ImageDraw.Draw(image)
    colors = ((31, 38, 50, 255), (40, 48, 62, 255))
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            draw.rectangle(
                (x, y, min(width - 1, x + tile - 1), min(height - 1, y + tile - 1)),
                fill=colors[((x // tile) + (y // tile)) % 2],
            )
    return image


def build_preview(asset_results: list[dict[str, Any]]) -> Image.Image:
    column_width = 150
    row_height = 150
    header = 44
    rows = ((128, "master"), (16, "tier"), (32, "tier"), (48, "tier"), (64, "tier"))
    sheet = Image.new(
        "RGBA",
        (column_width * len(asset_results), header + row_height * len(rows)),
        (15, 19, 27, 255),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for column, result in enumerate(asset_results):
        x0 = column * column_width
        draw.text((x0 + 6, 8), result["asset_id"].split("/")[-1], fill=(240, 238, 232, 255), font=font)
        draw.text((x0 + 6, 23), result["profile"], fill=(151, 166, 186, 255), font=font)
        for row, (size, source_type) in enumerate(rows):
            image = result["master"] if source_type == "master" else result["tiers"][size]
            scale = max(1, 128 // image.width)
            zoomed = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
            panel = checkerboard(136, 136)
            panel.alpha_composite(zoomed, ((136 - zoomed.width) // 2, (136 - zoomed.height) // 2))
            y0 = header + row * row_height
            sheet.alpha_composite(panel, (x0 + 7, y0 + 10))
            draw.text((x0 + 10, y0 + 2), f"{size}px", fill=(205, 213, 225, 255), font=font)
    return sheet


def load_palette_roles(manifest: dict[str, Any]) -> dict[str, set[RGB]]:
    palettes = manifest["parts"]["palettes"]
    return {
        role: {hex_rgb(color) for color in palettes[role]}
        for role in ("skin", "hair", "cloth", "fur")
    }


def asset_records(manifest: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    icons = {f"icons/{entry['name']}": entry for entry in manifest["icons"]}
    avatars: dict[str, dict[str, Any]] = {}
    for group in manifest["avatarGroups"]:
        for entry in group["items"]:
            avatars[f"avatars/{group['id']}/{entry['id']}"] = entry
    for entry in manifest["animals"]:
        avatars[f"avatars/animals/{entry['id']}"] = entry
    for entry in manifest["presets"]:
        avatars[f"avatars/presets/{entry['id']}"] = entry
    return icons, avatars


def build_asset(
    archive: zipfile.ZipFile,
    asset_id: str,
    icon_entry: dict[str, Any] | None,
    avatar_entry: dict[str, Any] | None,
    palette_roles: dict[str, set[RGB]],
    style: dict[str, RGB],
    chef_anchor: Image.Image,
) -> dict[str, Any]:
    source_path = f"export/{asset_id}.svg"
    source_bytes = archive.read(source_path)
    kind = "icon" if asset_id.startswith("icons/") else "avatar"
    profile = choose_profile(asset_id, icon_entry)
    source = parse_svg(source_bytes)
    reference_64_path = None
    reference_64_bytes = None
    if kind == "icon":
        candidate = f"export/icons-64/{asset_id.split('/')[-1]}.svg"
        if candidate in archive.namelist():
            reference_64_path = candidate
            reference_64_bytes = archive.read(candidate)
    render_source = parse_svg(reference_64_bytes) if reference_64_bytes else source

    if asset_id == "avatars/food/chef":
        master = chef_anchor.copy()
        master_method = "approved-raster-control-anchor"
    elif kind == "avatar":
        master = build_avatar_master(source, palette_roles, style)
        master_method = "svg-role-aware-hustlek-rasterization"
    else:
        master = build_icon_master(render_source, profile, style)
        master_method = "svg-topology-aware-hustlek-rasterization"

    tiers: dict[int, Image.Image] = {}
    baselines: dict[int, Image.Image] = {}
    tier_reports: dict[int, dict[str, Any]] = {}
    errors = validate_binary_rgba(master, f"{asset_id} master")
    for size in TIER_SIZES:
        baseline = master.resize((size, size), Image.Resampling.NEAREST)
        final, operations = apply_corrections(asset_id, baseline, size)
        correction = correction_metrics(baseline, final, operations)
        baselines[size] = baseline
        tiers[size] = final
        errors.extend(validate_binary_rgba(final, f"{asset_id} {size}px"))
        if correction["unplanned_targets"] or correction["no_effect_targets"]:
            errors.append(f"{asset_id} {size}px correction contract mismatch")
        if correction["changed_ratio"] > {16: 0.08, 32: 0.03, 48: 0.02, 64: 0.015}[size]:
            errors.append(f"{asset_id} {size}px correction ratio too high")
        if not opaque_palette(final) <= opaque_palette(master):
            errors.append(f"{asset_id} {size}px introduced a non-master color")
        tier_reports[size] = {
            "baseline_decoded_rgba_sha256": decoded_rgba_sha256(baseline),
            "final_decoded_rgba_sha256": decoded_rgba_sha256(final),
            "foreground_pixels": foreground_count(final),
            "opaque_colors": len(opaque_palette(final)),
            "bbox": final.getchannel("A").getbbox(),
            "components_8_neighbor": eight_components(final),
            "transparent_holes": transparent_holes(final),
            "corrections": operations,
            "correction_metrics": correction,
        }

    comparison = source_comparison(master, source, kind)
    comparison_floor = 0.70 if asset_id == "avatars/food/chef" else 0.88 if kind == "icon" else 0.90
    if comparison["alpha_iou"] < comparison_floor:
        errors.append(
            f"{asset_id} source projection alpha IoU {comparison['alpha_iou']:.6f} < {comparison_floor:.6f}"
        )

    label = (
        icon_entry.get("ko") if icon_entry else avatar_entry.get("ko") if avatar_entry else asset_id
    )
    category = icon_entry.get("category") if icon_entry else asset_id.split("/")[1]
    return {
        "asset_id": asset_id,
        "kind": kind,
        "profile": profile,
        "label_ko": label,
        "category": category,
        "source": source,
        "source_bytes": source_bytes,
        "source_path": source_path,
        "reference_64_path": reference_64_path,
        "reference_64_bytes": reference_64_bytes,
        "master": master,
        "master_method": master_method,
        "tiers": tiers,
        "baselines": baselines,
        "tier_reports": tier_reports,
        "source_comparison": comparison,
        "errors": errors,
    }


def public_asset_manifest(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "asset_id": result["asset_id"],
        "kind": result["kind"],
        "profile": result["profile"],
        "label_ko": result["label_ko"],
        "category": result["category"],
        "source": {
            "path": result["source_path"],
            "svg_sha256": sha256_bytes(result["source_bytes"]),
            "reference_64_path": result["reference_64_path"],
            "reference_64_sha256": (
                sha256_bytes(result["reference_64_bytes"])
                if result["reference_64_bytes"]
                else None
            ),
        },
        "master": {
            "method": result["master_method"],
            "atlas_crop": result["master_crop"],
            "decoded_rgba_sha256": decoded_rgba_sha256(result["master"]),
            "foreground_pixels": foreground_count(result["master"]),
            "opaque_colors": len(opaque_palette(result["master"])),
            "bbox": result["master"].getchannel("A").getbbox(),
            "components_8_neighbor": eight_components(result["master"]),
            "transparent_holes": transparent_holes(result["master"]),
        },
        "source_comparison": result["source_comparison"],
        "tiers": {
            str(size): {
                **result["tier_reports"][size],
                "atlas_crop": result["tier_crops"][size],
            }
            for size in TIER_SIZES
        },
        "errors": result["errors"],
    }


def build_catalog(
    existing: dict[str, Any] | None,
    batch_entry: dict[str, Any],
) -> dict[str, Any]:
    batches = [] if existing is None else list(existing.get("batches", []))
    retained = [entry for entry in batches if entry["batch_id"] != batch_entry["batch_id"]]
    retained.append(batch_entry)
    retained.sort(key=lambda entry: entry["batch_id"])
    ready_assets = sorted(
        {
            asset_id
            for entry in retained
            if entry["state"] in {"ready_for_review", "approved"}
            for asset_id in entry["asset_ids"]
        }
    )
    approved_assets = sorted(
        {
            asset_id
            for entry in retained
            if entry["state"] == "approved"
            for asset_id in entry["asset_ids"]
        }
    )
    return {
        "schema": "hustlek-asset-catalog/v1",
        "source_archive_sha256": SOURCE_ARCHIVE_SHA256,
        "inventory": CANONICAL_COUNTS,
        "policy": {
            "master_size": 128,
            "production_sizes": list(TIER_SIZES),
            "resampling": "Pillow Image.Resampling.NEAREST",
            "aliases_reuse_canonical": True,
            "imagegen_used_for_derived_tiers": False,
            "pixy_used": False,
            "batch_max_assets": 32,
        },
        "coverage": {
            "ready_or_approved": len(ready_assets),
            "approved": len(approved_assets),
            "remaining": CANONICAL_COUNTS["total"] - len(ready_assets),
            "ready_asset_ids": ready_assets,
            "approved_asset_ids": approved_assets,
        },
        "batches": retained,
    }


def verify_encoded_atlases(
    master_bytes: bytes,
    tier_bytes: bytes,
    asset_results: list[dict[str, Any]],
    contract_hash: str,
) -> list[str]:
    errors: list[str] = []
    masters = Image.open(io.BytesIO(master_bytes))
    tiers = Image.open(io.BytesIO(tier_bytes))
    if masters.info.get("contract_sha256") != contract_hash:
        errors.append("encoded master atlas contract metadata mismatch")
    if tiers.info.get("contract_sha256") != contract_hash:
        errors.append("encoded tier atlas contract metadata mismatch")
    masters_rgba = masters.convert("RGBA")
    tiers_rgba = tiers.convert("RGBA")
    errors.extend(validate_binary_rgba(masters_rgba, "encoded master atlas"))
    errors.extend(validate_binary_rgba(tiers_rgba, "encoded tier atlas"))
    for result in asset_results:
        master_crop = crop_from(masters_rgba, result["master_crop"])
        if decoded_rgba_sha256(master_crop) != decoded_rgba_sha256(result["master"]):
            errors.append(f"{result['asset_id']} encoded master crop hash mismatch")
        for size in TIER_SIZES:
            tier_crop = crop_from(tiers_rgba, result["tier_crops"][size])
            if decoded_rgba_sha256(tier_crop) != decoded_rgba_sha256(result["tiers"][size]):
                errors.append(f"{result['asset_id']} encoded {size}px crop hash mismatch")
    return errors


def publish_file(path: Path, data: bytes) -> None:
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Refusing to overwrite immutable content-addressed file: {path}")
        return
    atomic_write(path, data)


def main() -> None:
    args = parse_args()
    source_zip = args.source_zip.resolve()
    selected_assets = tuple(args.assets or DEFAULT_ASSETS)
    if len(selected_assets) > 32:
        raise ValueError("A batch may contain at most 32 canonical assets")
    if len(selected_assets) != len(set(selected_assets)):
        raise ValueError("A batch may not contain duplicate asset ids")
    if sha256_file(source_zip) != SOURCE_ARCHIVE_SHA256:
        raise ValueError("PIXEL-CLAY source archive hash changed")

    chef_anchor = Image.open(CHEF_ANCHOR).convert("RGBA")
    telescope_anchor = Image.open(TELESCOPE_ANCHOR).convert("RGBA")
    if decoded_rgba_sha256(chef_anchor) != CHEF_ANCHOR_RGBA_SHA256:
        raise ValueError("Approved chef style anchor changed")
    if decoded_rgba_sha256(telescope_anchor) != TELESCOPE_ANCHOR_RGBA_SHA256:
        raise ValueError("Approved telescope style anchor changed")
    style = anchor_palette(chef_anchor, telescope_anchor)

    with zipfile.ZipFile(source_zip) as archive:
        source_manifest_bytes = archive.read("export/manifest.json")
        source_manifest = json.loads(source_manifest_bytes.decode("utf-8-sig"))
        icons, avatars = asset_records(source_manifest)
        palette_roles = load_palette_roles(source_manifest)
        unknown = [asset_id for asset_id in selected_assets if asset_id not in icons and asset_id not in avatars]
        if unknown:
            raise ValueError(f"Unknown canonical asset ids: {unknown}")
        asset_results = [
            build_asset(
                archive,
                asset_id,
                icons.get(asset_id),
                avatars.get(asset_id),
                palette_roles,
                style,
                chef_anchor,
            )
            for asset_id in selected_assets
        ]

    repeat_hashes = []
    with zipfile.ZipFile(source_zip) as archive:
        for asset_id in selected_assets:
            repeated = build_asset(
                archive,
                asset_id,
                icons.get(asset_id),
                avatars.get(asset_id),
                palette_roles,
                style,
                chef_anchor,
            )
            repeat_hashes.append(
                (
                    decoded_rgba_sha256(repeated["master"]),
                    tuple(decoded_rgba_sha256(repeated["tiers"][size]) for size in TIER_SIZES),
                )
            )
    deterministic = all(
        repeat_hashes[index]
        == (
            decoded_rgba_sha256(result["master"]),
            tuple(decoded_rgba_sha256(result["tiers"][size]) for size in TIER_SIZES),
        )
        for index, result in enumerate(asset_results)
    )

    master_atlas, tier_atlas = build_atlases(asset_results)
    script_hash = sha256_text_lf(Path(__file__))
    contract = {
        "compiler": COMPILER_VERSION,
        "builder_sha256_lf": script_hash,
        "source_archive_sha256": SOURCE_ARCHIVE_SHA256,
        "source_manifest_sha256": sha256_bytes(source_manifest_bytes),
        "style_anchors": {
            "chef_decoded_rgba_sha256": CHEF_ANCHOR_RGBA_SHA256,
            "telescope_decoded_rgba_sha256": TELESCOPE_ANCHOR_RGBA_SHA256,
        },
        "batch_id": args.batch_id,
        "asset_ids": list(selected_assets),
        "master_size": MASTER_SIZE,
        "tier_sizes": list(TIER_SIZES),
        "master_layout": {"columns": ATLAS_COLUMNS, "cell": CELL_SIZE},
        "tier_packing": {str(size): list(position) for size, position in TIER_PACKING.items()},
        "corrections": {
            f"{asset_id}@{size}": list(operations)
            for (asset_id, size), operations in STATIC_CORRECTIONS.items()
            if asset_id in selected_assets
        },
        "imagegen_used_for_master": {
            "avatars/food/chef": True,
            "other_assets": False,
        },
        "imagegen_used_for_derived_tiers": False,
        "pixy_used": False,
    }
    contract_hash = sha256_bytes(canonical_json_bytes(contract))
    metadata = {
        "contract_sha256": contract_hash,
        "batch_id": args.batch_id,
        "builder_sha256_lf": script_hash,
        "derived_with_imagegen": "false",
        "pixy_used": "false",
    }
    master_atlas_bytes = png_bytes(master_atlas, metadata)
    tier_atlas_bytes = png_bytes(tier_atlas, metadata)

    errors = [message for result in asset_results for message in result["errors"]]
    if not deterministic:
        errors.append("two-pass in-memory asset generation is not deterministic")
    errors.extend(
        verify_encoded_atlases(master_atlas_bytes, tier_atlas_bytes, asset_results, contract_hash)
    )

    manifest_assets = [public_asset_manifest(result) for result in asset_results]
    manifest = {
        "schema": "hustlek-asset-batch/v1",
        "state": "ready_for_review",
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
        "batch_id": args.batch_id,
        "contract": contract,
        "contract_sha256": contract_hash,
        "source_archive": {
            "filename": source_zip.name,
            "sha256": SOURCE_ARCHIVE_SHA256,
        },
        "style": {
            "palette": {key: list(value) for key, value in style.items()},
            "chef_anchor_path": CHEF_ANCHOR.relative_to(REPO_ROOT).as_posix(),
            "telescope_anchor_path": TELESCOPE_ANCHOR.relative_to(REPO_ROOT).as_posix(),
        },
        "validation": {
            "two_pass_deterministic": deterministic,
            "encoded_atlas_reopened": True,
            "encoded_crop_hashes_match": not any("crop hash mismatch" in error for error in errors),
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "assets": manifest_assets,
    }
    manifest_bytes = canonical_json_bytes(manifest, pretty=True)

    version = contract_hash[:12]
    batch_dir = OUTPUT_ROOT / "batches" / args.batch_id / version
    master_path = batch_dir / "master-atlas.png"
    tier_path = batch_dir / "tier-atlas.png"
    manifest_path = batch_dir / "manifest.json"
    batch_entry = {
        "batch_id": args.batch_id,
        "state": "ready_for_review",
        "version": version,
        "contract_sha256": contract_hash,
        "membership_sha256": sha256_bytes(canonical_json_bytes(list(selected_assets))),
        "asset_ids": list(selected_assets),
        "manifest_path": manifest_path.relative_to(REPO_ROOT).as_posix(),
        "manifest_sha256": sha256_bytes(manifest_bytes),
        "master_atlas_path": master_path.relative_to(REPO_ROOT).as_posix(),
        "master_atlas_sha256": sha256_bytes(master_atlas_bytes),
        "tier_atlas_path": tier_path.relative_to(REPO_ROOT).as_posix(),
        "tier_atlas_sha256": sha256_bytes(tier_atlas_bytes),
    }
    existing_catalog = (
        json.loads(CATALOG_PATH.read_text(encoding="utf-8")) if CATALOG_PATH.exists() else None
    )
    catalog = build_catalog(existing_catalog, batch_entry)
    catalog_bytes = canonical_json_bytes(catalog, pretty=True)

    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        build_preview(asset_results).convert("RGB").save(args.preview)

    print(f"result={manifest['result']}")
    print(f"batch_id={args.batch_id}")
    print(f"contract_sha256={contract_hash}")
    print(f"version={version}")
    print(f"assets={len(asset_results)}")
    for result in asset_results:
        changed = sum(
            result["tier_reports"][size]["correction_metrics"]["changed_pixels"]
            for size in TIER_SIZES
        )
        print(
            f"{result['asset_id']} profile={result['profile']} "
            f"source_iou={result['source_comparison']['alpha_iou']:.6f} "
            f"corrections={changed} errors={len(result['errors'])}"
        )
    if errors:
        for error in errors:
            print(f"error={error}", file=sys.stderr)
        raise SystemExit(1)
    if args.dry_run:
        print("publish=false")
        return

    publish_file(master_path, master_atlas_bytes)
    publish_file(tier_path, tier_atlas_bytes)
    publish_file(manifest_path, manifest_bytes)
    atomic_write(CATALOG_PATH, catalog_bytes)
    print(f"master_atlas={master_path}")
    print(f"tier_atlas={tier_path}")
    print(f"manifest={manifest_path}")
    print(f"catalog={CATALOG_PATH}")


if __name__ == "__main__":
    main()
