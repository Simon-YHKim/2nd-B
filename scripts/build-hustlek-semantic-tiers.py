#!/usr/bin/env python3
"""Build deterministic HustleK telescope tiers with surgical NEAREST repair.

The compiler deliberately favors identity preservation:

* one locked 128px master supplies geometry, detail, and color;
* Pillow NEAREST creates every smaller target grid directly from that master;
* a coordinate whitelist repairs only pixels proven broken after reduction;
* untouched tiers remain byte-identical to their plain NEAREST baselines;
* validation audits every changed pixel and caps the correction budget.

The experiment writes one atlas, one visual comparison, and one JSON validation
report.  Existing independently generated tier PNGs are read only and are never
overwritten.  No generative-image service or Pixy component is used.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import platform
from collections import Counter, deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin, __version__ as PILLOW_VERSION


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MASTER = (
    REPO_ROOT / "design" / "hustlek-assets-pilot" / "telescope" / "128.png"
)
DEFAULT_OUTPUT = (
    REPO_ROOT / "design" / "hustlek-assets-pilot" / "telescope-derived-v2"
)

MASTER_SIZE = 128
EXPECTED_MASTER_ASSET_ID = "icons/telescope"
EXPECTED_MASTER_RGBA_SHA256 = "899e278515a0938e2f50c813a5ed3da22cd19ff419a81b03b34d75027bb69ff6"
TIER_SIZES = (16, 32, 48, 64, 95, 128)
ATLAS_CELL = 128

LENS_BLUE_PIXEL_MINIMUMS = {16: 1, 32: 3, 48: 8, 64: 14, 95: 30, 128: 30}
BASELINE_ALPHA_IOU_FLOORS = {16: 0.94, 32: 0.98, 48: 0.985, 64: 0.99, 95: 0.995}
CORRECTION_RATIO_LIMITS = {16: 0.08, 32: 0.03, 48: 0.02, 64: 0.015, 95: 0.01}
ADJACENT_TIER_IOU_FLOORS = {
    (16, 32): 0.60,
    (32, 48): 0.78,
    (48, 64): 0.82,
    (64, 95): 0.85,
}

NEAREST_CORRECTION_PLAN: dict[int, dict[str, object]] = {
    16: {
        "copy_pixels": (
            ((6, 10), (5, 11), "bridge left tripod leg"),
            ((10, 12), (10, 13), "bridge right tripod leg"),
        ),
        "intent": "repair two dropped tripod connections",
    },
    32: {"copy_pixels": (), "intent": "NEAREST already passes; preserve exactly"},
    48: {"copy_pixels": (), "intent": "NEAREST already passes; preserve exactly"},
    64: {"copy_pixels": (), "intent": "NEAREST already passes; preserve exactly"},
    95: {"copy_pixels": (), "intent": "reference tier; preserve exactly"},
}

# Coordinates were measured once from the approved 128px master.  They form the
# semantic identity contract.  Lower tiers may merge details but cannot move or
# replace these parts.
TELESCOPE_SPEC = {
    "lens_outer_box": (21, 8, 44, 35),
    "lens_inner_box": (25, 13, 34, 28),
    "tube_axis": ((29, 21), (99, 50)),
    "tube_bands": (0.43, 0.68),
    "mount": (63, 66),
    "focus_knobs": ((87, 48), (98, 52)),
    "legs": (
        ((63, 66), (51, 79), (37, 119)),
        ((63, 66), (62, 88), (62, 110)),
        ((63, 66), (75, 80), (88, 119)),
    ),
    "feet": ((37, 119), (62, 110), (88, 119)),
    "brace": ((51, 79), (62, 84), (75, 80)),
    "pan_handle_bridge": ((70, 61), (83, 66)),
}


RGBA = tuple[int, int, int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the 128-master HustleK semantic tier experiment."
    )
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
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


def validate_master(
    master: Image.Image,
    path: Path,
    metadata: dict[str, object],
) -> None:
    if master.mode != "RGBA":
        raise ValueError(f"Master must be RGBA, got {master.mode}: {path}")
    if master.size != (MASTER_SIZE, MASTER_SIZE):
        raise ValueError(
            f"Master must be {MASTER_SIZE}x{MASTER_SIZE}, got {master.size}: {path}"
        )
    alpha_values = set(master.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        raise ValueError(f"Master alpha must be binary, got {sorted(alpha_values)}")
    for rgba in master.get_flattened_data():
        if rgba[3] == 0 and rgba[:3] != (0, 0, 0):
            raise ValueError("Master has non-zero hidden RGB under transparent pixels")
    if metadata.get("asset_id") != EXPECTED_MASTER_ASSET_ID:
        raise ValueError(
            f"This compiler is locked to {EXPECTED_MASTER_ASSET_ID}, got "
            f"{metadata.get('asset_id', 'missing')}"
        )
    actual_hash = decoded_rgba_sha256(master)
    if actual_hash != EXPECTED_MASTER_RGBA_SHA256:
        raise ValueError(
            "Telescope master pixels changed. Review the new 128px identity and update "
            f"EXPECTED_MASTER_RGBA_SHA256 deliberately. Got {actual_hash}"
        )


def eight_connected_components(image: Image.Image) -> list[set[tuple[int, int]]]:
    size = image.width
    foreground = {
        (x, y)
        for y in range(size)
        for x in range(size)
        if image.getpixel((x, y))[3]
    }
    components: list[set[tuple[int, int]]] = []
    while foreground:
        seed = min(foreground, key=lambda point: (point[1], point[0]))
        foreground.remove(seed)
        queue: deque[tuple[int, int]] = deque([seed])
        component = {seed}
        while queue:
            point_x, point_y = queue.popleft()
            for delta_y in (-1, 0, 1):
                for delta_x in (-1, 0, 1):
                    neighbor = point_x + delta_x, point_y + delta_y
                    if neighbor in foreground:
                        foreground.remove(neighbor)
                        component.add(neighbor)
                        queue.append(neighbor)
        components.append(component)
    return sorted(components, key=lambda component: (-len(component), min(component)))


def scale_point(point: tuple[int, int], size: int) -> tuple[int, int]:
    x, y = point
    return (
        min(size - 1, max(0, ((2 * x + 1) * size) // (2 * MASTER_SIZE))),
        min(size - 1, max(0, ((2 * y + 1) * size) // (2 * MASTER_SIZE))),
    )


def scale_box(box: tuple[int, int, int, int], size: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = box
    scaled_left = max(0, (left * size) // MASTER_SIZE)
    scaled_top = max(0, (top * size) // MASTER_SIZE)
    scaled_right = min(size - 1, max(scaled_left, ((right * size) - 1) // MASTER_SIZE))
    scaled_bottom = min(size - 1, max(scaled_top, ((bottom * size) - 1) // MASTER_SIZE))
    return scaled_left, scaled_top, scaled_right, scaled_bottom


def build_nearest_baseline(master: Image.Image, size: int) -> Image.Image:
    if size == MASTER_SIZE:
        return master.copy()
    return master.resize((size, size), Image.Resampling.NEAREST)


def apply_surgical_corrections(baseline: Image.Image, size: int) -> Image.Image:
    """Apply only explicitly declared target-grid repairs to a NEAREST baseline."""
    if baseline.size != (size, size):
        raise ValueError(f"Baseline size {baseline.size} does not match {size}px plan")
    result = baseline.copy()
    plan = NEAREST_CORRECTION_PLAN.get(size, {"copy_pixels": ()})
    for target, source, _reason in plan["copy_pixels"]:
        if baseline.getpixel(source)[3] == 0:
            raise ValueError(f"{size}px correction source {source} is transparent")
        if baseline.getpixel(target)[3] != 0:
            raise ValueError(f"{size}px correction target {target} is already occupied")
        result.putpixel(target, baseline.getpixel(source))
    return result


def correction_audit(
    baseline: Image.Image,
    corrected: Image.Image,
    size: int,
) -> dict[str, object]:
    declared = {
        tuple(target)
        for target, _source, _reason in NEAREST_CORRECTION_PLAN.get(
            size, {"copy_pixels": ()}
        )["copy_pixels"]
    }
    actual: set[tuple[int, int]] = set()
    added = removed = recolored = 0
    for y in range(size):
        for x in range(size):
            before = baseline.getpixel((x, y))
            after = corrected.getpixel((x, y))
            if before == after:
                continue
            actual.add((x, y))
            if not before[3] and after[3]:
                added += 1
            elif before[3] and not after[3]:
                removed += 1
            else:
                recolored += 1

    foreground = sum(bool(value) for value in baseline.getchannel("A").get_flattened_data())
    if actual:
        xs = [x for x, _ in actual]
        ys = [y for _, y in actual]
        changed_bbox: list[int] | None = [min(xs), min(ys), max(xs) + 1, max(ys) + 1]
    else:
        changed_bbox = None
    return {
        "declared_targets": [list(point) for point in sorted(declared)],
        "actual_changed_pixels": [list(point) for point in sorted(actual)],
        "changed_pixel_count": len(actual),
        "changed_bbox": changed_bbox,
        "alpha_added": added,
        "alpha_removed": removed,
        "rgba_recolored": recolored,
        "correction_ratio_vs_baseline_foreground": len(actual) / foreground if foreground else 0.0,
        "unplanned_changes": [list(point) for point in sorted(actual - declared)],
        "declared_but_no_effect": [list(point) for point in sorted(declared - actual)],
    }


def tight_normalized_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("1", (128, 128), 0)
    cropped = alpha.crop(bbox)
    return cropped.resize((128, 128), Image.Resampling.NEAREST).point(
        lambda value: 255 if value else 0,
        mode="1",
    )


def alpha_iou(first: Image.Image, second: Image.Image) -> float:
    first_mask = tight_normalized_alpha(first)
    second_mask = tight_normalized_alpha(second)
    first_values = list(first_mask.get_flattened_data())
    second_values = list(second_mask.get_flattened_data())
    intersection = sum(bool(a) and bool(b) for a, b in zip(first_values, second_values))
    union = sum(bool(a) or bool(b) for a, b in zip(first_values, second_values))
    return intersection / union if union else 1.0


def alpha_xor_union(first: Image.Image, second: Image.Image) -> float:
    first_values = list(first.getchannel("A").get_flattened_data())
    second_values = list(second.getchannel("A").get_flattened_data())
    xor = sum(bool(a) != bool(b) for a, b in zip(first_values, second_values))
    union = sum(bool(a) or bool(b) for a, b in zip(first_values, second_values))
    return xor / union if union else 0.0


def canvas_alpha_iou(first: Image.Image, second: Image.Image) -> float:
    first_values = list(first.getchannel("A").get_flattened_data())
    second_values = list(second.getchannel("A").get_flattened_data())
    intersection = sum(bool(a) and bool(b) for a, b in zip(first_values, second_values))
    union = sum(bool(a) or bool(b) for a, b in zip(first_values, second_values))
    return intersection / union if union else 1.0


def coarse_material(rgba: RGBA) -> str:
    red, green, blue, alpha = rgba
    if not alpha:
        return "transparent"
    hue, saturation, value = colorsys.rgb_to_hsv(
        red / 255.0, green / 255.0, blue / 255.0
    )
    hue *= 360.0
    if 175.0 <= hue <= 240.0 and saturation >= 0.28:
        return "lens"
    if value < 0.31:
        return "ink"
    if 18.0 <= hue <= 52.0 and saturation >= 0.48:
        return "brass"
    if 15.0 <= hue <= 58.0 and red >= green >= blue:
        return "ivory"
    return "steel"


def rgba_diff_union(first: Image.Image, second: Image.Image) -> float:
    first_values = list(first.get_flattened_data())
    second_values = list(second.get_flattened_data())
    union = sum(bool(a[3] or b[3]) for a, b in zip(first_values, second_values))
    changed = sum(
        a != b and bool(a[3] or b[3]) for a, b in zip(first_values, second_values)
    )
    return changed / union if union else 0.0


def color_count(image: Image.Image) -> int:
    return len({rgba for rgba in image.get_flattened_data() if rgba[3]})


def foreground_count(image: Image.Image) -> int:
    return sum(bool(value) for value in image.getchannel("A").get_flattened_data())


def blue_pixel_count(image: Image.Image) -> int:
    count = 0
    for red, green, blue, alpha in image.get_flattened_data():
        if not alpha:
            continue
        hue, saturation, _ = colorsys.rgb_to_hsv(
            red / 255.0, green / 255.0, blue / 255.0
        )
        if 175.0 <= hue * 360.0 <= 240.0 and saturation >= 0.28:
            count += 1
    return count


def lens_blue_pixel_count(image: Image.Image, size: int) -> int:
    left, top, right, bottom = scale_box(TELESCOPE_SPEC["lens_outer_box"], size)
    count = 0
    for y in range(max(0, top - 1), min(size, bottom + 2)):
        for x in range(max(0, left - 1), min(size, right + 2)):
            if coarse_material(image.getpixel((x, y))) == "lens":
                count += 1
    return count


def lens_material_counts(image: Image.Image, size: int) -> dict[str, int]:
    left, top, right, bottom = scale_box(TELESCOPE_SPEC["lens_outer_box"], size)
    counts: Counter[str] = Counter()
    for y in range(max(0, top - 1), min(size, bottom + 2)):
        for x in range(max(0, left - 1), min(size, right + 2)):
            material = coarse_material(image.getpixel((x, y)))
            if material != "transparent":
                counts[material] += 1
    return dict(sorted(counts.items()))


def foreground_centroid(image: Image.Image) -> tuple[float, float]:
    points = [
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if image.getpixel((x, y))[3]
    ]
    if not points:
        return 0.0, 0.0
    return (
        sum(x for x, _ in points) / len(points),
        sum(y for _, y in points) / len(points),
    )


def normalized_centroid_delta(first: Image.Image, second: Image.Image) -> float:
    first_x, first_y = foreground_centroid(first)
    second_x, second_y = foreground_centroid(second)
    return max(abs(first_x - second_x), abs(first_y - second_y)) / first.width


def landmark_presence(image: Image.Image, size: int) -> dict[str, bool]:
    landmarks: dict[str, tuple[int, int]] = {
        "lens": (29, 21),
        "mount": (63, 66),
        "left_foot": (37, 119),
        "center_foot": (62, 110),
        "right_foot": (88, 119),
    }
    if size >= 32:
        landmarks["eyepiece"] = (99, 50)
    alpha = image.getchannel("A")
    presence: dict[str, bool] = {}
    for name, source_point in landmarks.items():
        target_x, target_y = scale_point(source_point, size)
        radius = 1 if size <= 48 else 2
        presence[name] = any(
            alpha.getpixel((x, y))
            for y in range(max(0, target_y - radius), min(size, target_y + radius + 1))
            for x in range(max(0, target_x - radius), min(size, target_x + radius + 1))
        )
    return presence


def validate_tier(image: Image.Image, size: int) -> list[str]:
    errors: list[str] = []
    if image.mode != "RGBA":
        errors.append(f"mode={image.mode}, expected RGBA")
    if image.size != (size, size):
        errors.append(f"size={image.size}, expected {(size, size)}")
    alpha_values = set(image.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        errors.append(f"non-binary alpha={sorted(alpha_values)}")
    if any(rgba[:3] != (0, 0, 0) for rgba in image.get_flattened_data() if rgba[3] == 0):
        errors.append("non-zero hidden RGB")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        errors.append("empty foreground")
    else:
        margin = max(1, size // 34)
        left, top, right, bottom = bbox
        if min(left, top, size - right, size - bottom) < margin:
            errors.append(f"margin below {margin}px: bbox={bbox}")
    component_count = len(eight_connected_components(image))
    if component_count != 1:
        errors.append(f"foreground components={component_count}, expected 1")
    blue_pixels = lens_blue_pixel_count(image, size)
    if blue_pixels < LENS_BLUE_PIXEL_MINIMUMS[size]:
        errors.append(
            f"blue lens pixels={blue_pixels}, minimum={LENS_BLUE_PIXEL_MINIMUMS[size]}"
        )
    lens_materials = lens_material_counts(image, size)
    missing_lens_materials = [
        role for role in ("ink", "brass", "lens") if lens_materials.get(role, 0) == 0
    ]
    if missing_lens_materials:
        errors.append(f"missing lens materials={missing_lens_materials}")
    missing_landmarks = [
        name for name, present in landmark_presence(image, size).items() if not present
    ]
    if missing_landmarks:
        errors.append(f"missing landmarks={missing_landmarks}")
    return errors


def checkerboard(width: int, height: int, cell: int = 10) -> Image.Image:
    image = Image.new("RGB", (width, height), (17, 34, 55))
    draw = ImageDraw.Draw(image)
    alternate = (25, 47, 72)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle(
                    (x, y, min(width - 1, x + cell - 1), min(height - 1, y + cell - 1)),
                    fill=alternate,
                )
    return image


def fit_integer_zoom(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    width, height = box
    factor = max(1, min(width // image.width, height // image.height))
    return image.resize(
        (image.width * factor, image.height * factor), Image.Resampling.NEAREST
    )


def correction_diff_visual(corrected: Image.Image, baseline: Image.Image) -> Image.Image:
    size = corrected.width
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = result.load()
    for y in range(size):
        for x in range(size):
            after = corrected.getpixel((x, y))
            before = baseline.getpixel((x, y))
            if after == before and after[3]:
                pixels[x, y] = (118, 140, 157, 255)
            elif after[3] and not before[3]:
                pixels[x, y] = (52, 211, 208, 255)
            elif before[3] and not after[3]:
                pixels[x, y] = (239, 166, 70, 255)
            elif after != before and after[3] and before[3]:
                pixels[x, y] = (227, 93, 184, 255)
    return result


def paste_centered(
    canvas: Image.Image,
    asset: Image.Image,
    box: tuple[int, int, int, int],
) -> None:
    left, top, right, bottom = box
    x = left + (right - left - asset.width) // 2
    y = top + (bottom - top - asset.height) // 2
    if asset.mode == "RGBA":
        canvas.paste(asset, (x, y), asset)
    else:
        canvas.paste(asset, (x, y))


def build_contact_sheet(
    tiers: dict[int, Image.Image],
    baselines: dict[int, Image.Image],
    metrics: dict[int, dict[str, object]],
) -> Image.Image:
    width, height = 1920, 1245
    canvas = Image.new("RGB", (width, height), (7, 18, 34))
    draw = ImageDraw.Draw(canvas)
    font_title = ImageFont.load_default(size=34)
    font_body = ImageFont.load_default(size=18)
    font_small = ImageFont.load_default(size=15)
    white = (242, 238, 226)
    muted = (150, 174, 195)
    cyan = (79, 220, 223)

    draw.text((44, 30), "HustleK Telescope - NEAREST + Surgical Repair v4", fill=white, font=font_title)
    draw.text(
        (44, 75),
        "Locked 128px identity master; only declared broken target pixels are repaired",
        fill=muted,
        font=font_body,
    )
    draw.text(
        (44, 102),
        "Diff: cyan added, amber removed, magenta recolored, grey unchanged foreground",
        fill=muted,
        font=font_small,
    )

    column_left = 170
    column_width = 286
    row_specs = (
        ("Fine-tuned NEAREST asset 1x", 155, 150),
        ("Fine-tuned NEAREST - integer zoom", 335, 245),
        ("Plain NEAREST - identical zoom", 615, 245),
        ("Surgical correction diff", 895, 245),
    )

    for label, top, row_height in row_specs:
        draw.text((44, top + 8), label, fill=cyan, font=font_body)
        draw.line((44, top + 38, width - 30, top + 38), fill=(29, 55, 79), width=1)

    for index, size in enumerate(TIER_SIZES):
        left = column_left + index * column_width
        center = left + column_width // 2
        draw.text((center, 132), f"{size}x{size}", fill=white, font=font_body, anchor="mm")

        native_box = (left + 12, 195, left + column_width - 12, 302)
        native_bg = checkerboard(native_box[2] - native_box[0], native_box[3] - native_box[1], 8)
        canvas.paste(native_bg, (native_box[0], native_box[1]))
        paste_centered(canvas, tiers[size], native_box)

        zoom_box = (left + 12, 385, left + column_width - 12, 565)
        zoom_bg = checkerboard(zoom_box[2] - zoom_box[0], zoom_box[3] - zoom_box[1], 10)
        canvas.paste(zoom_bg, (zoom_box[0], zoom_box[1]))
        zoomed = fit_integer_zoom(tiers[size], (zoom_box[2] - zoom_box[0] - 8, zoom_box[3] - zoom_box[1] - 8))
        paste_centered(canvas, zoomed, zoom_box)

        baseline_box = (left + 12, 665, left + column_width - 12, 845)
        baseline_bg = checkerboard(
            baseline_box[2] - baseline_box[0], baseline_box[3] - baseline_box[1], 8
        )
        canvas.paste(baseline_bg, (baseline_box[0], baseline_box[1]))
        baseline_zoom = fit_integer_zoom(
            baselines[size],
            (baseline_box[2] - baseline_box[0] - 8, baseline_box[3] - baseline_box[1] - 8),
        )
        paste_centered(canvas, baseline_zoom, baseline_box)

        diff_box = (left + 12, 945, left + column_width - 12, 1125)
        diff_bg = checkerboard(diff_box[2] - diff_box[0], diff_box[3] - diff_box[1], 8)
        canvas.paste(diff_bg, (diff_box[0], diff_box[1]))
        diff = correction_diff_visual(tiers[size], baselines[size])
        diff_zoom = fit_integer_zoom(
            diff, (diff_box[2] - diff_box[0] - 8, diff_box[3] - diff_box[1] - 8)
        )
        paste_centered(canvas, diff_zoom, diff_box)

        metric = metrics[size]
        if size == 128:
            summary = f"master | {metric['palette_count']} colors"
        elif metric["correction"]["changed_pixel_count"] == 0:
            summary = f"exact NEAREST | 0px repair | {metric['palette_count']}c"
        else:
            summary = (
                f"repair {metric['correction']['changed_pixel_count']}px | "
                f"preserve {metric['same_canvas_shape_iou']:.1%} | "
                f"{metric['palette_count']}c"
            )
        draw.text((center, 1162), summary, fill=muted, font=font_small, anchor="mm")

    draw.text(
        (44, 1210),
        "Production target: 16-64px. 95px and the locked 128px master remain comparison references.",
        fill=muted,
        font=font_small,
    )
    return canvas


def save_png(image: Image.Image, path: Path, metadata: dict[str, str]) -> None:
    png_info = PngImagePlugin.PngInfo()
    for key in sorted(metadata):
        png_info.add_text(key, metadata[key])
    image.save(path, format="PNG", optimize=False, compress_level=9, pnginfo=png_info)


def build_validation(
    master: Image.Image,
    master_path: Path,
    master_metadata: dict[str, object],
    tiers: dict[int, Image.Image],
    baselines: dict[int, Image.Image],
) -> dict[str, object]:
    metrics: dict[int, dict[str, object]] = {}
    hard_errors: list[str] = []
    master_palette = {rgba for rgba in master.get_flattened_data() if rgba[3]}

    for index, size in enumerate(TIER_SIZES):
        image = tiers[size]
        baseline = baselines[size]
        errors = validate_tier(image, size)
        audit = correction_audit(baseline, image, size)
        image_palette = {rgba for rgba in image.get_flattened_data() if rgba[3]}
        palette_subset = image_palette <= master_palette
        if not palette_subset:
            errors.append("output contains colors outside the locked master palette")
        if audit["unplanned_changes"]:
            errors.append(f"unplanned pixel changes={audit['unplanned_changes']}")
        if audit["declared_but_no_effect"]:
            errors.append(
                f"declared corrections had no effect={audit['declared_but_no_effect']}"
            )

        bbox = image.getchannel("A").getbbox()
        baseline_bbox = baseline.getchannel("A").getbbox()
        metric: dict[str, object] = {
            "size": [size, size],
            "atlas_crop": [index * ATLAS_CELL, 0, index * ATLAS_CELL + size, size],
            "bbox": list(bbox) if bbox else None,
            "baseline_bbox": list(baseline_bbox) if baseline_bbox else None,
            "foreground_pixels": foreground_count(image),
            "baseline_foreground_pixels": foreground_count(baseline),
            "palette_count": color_count(image),
            "palette_is_master_subset": palette_subset,
            "blue_lens_pixels": blue_pixel_count(image),
            "blue_lens_pixels_in_roi": lens_blue_pixel_count(image, size),
            "baseline_blue_lens_pixels_in_roi": lens_blue_pixel_count(baseline, size),
            "lens_material_pixels": lens_material_counts(image, size),
            "landmarks": landmark_presence(image, size),
            "foreground_components_8_connected": len(eight_connected_components(image)),
            "baseline_components_8_connected": len(eight_connected_components(baseline)),
            "baseline_decoded_rgba_sha256": decoded_rgba_sha256(baseline),
            "decoded_rgba_sha256": decoded_rgba_sha256(image),
            "correction": audit,
        }
        if size == MASTER_SIZE:
            if decoded_rgba_sha256(image) != decoded_rgba_sha256(master):
                errors.append("128px passthrough differs from locked master")
            metric.update(
                {
                    "master_shape_iou": 1.0,
                    "nearest_alpha_diff": 0.0,
                    "same_canvas_shape_iou": 1.0,
                    "normalized_centroid_delta": 0.0,
                    "nearest_rgba_diff": 0.0,
                    "generation_method": "locked-master-passthrough",
                }
            )
        else:
            shape_iou = alpha_iou(image, master)
            nearest_alpha_diff = alpha_xor_union(image, baseline)
            same_canvas_iou = canvas_alpha_iou(image, baseline)
            centroid_delta = normalized_centroid_delta(image, baseline)
            nearest_rgba_diff = rgba_diff_union(image, baseline)
            correction_ratio = float(audit["correction_ratio_vs_baseline_foreground"])
            metric.update(
                {
                    "master_shape_iou": shape_iou,
                    "nearest_alpha_diff": nearest_alpha_diff,
                    "same_canvas_shape_iou": same_canvas_iou,
                    "same_canvas_shape_iou_floor": BASELINE_ALPHA_IOU_FLOORS[size],
                    "normalized_centroid_delta": centroid_delta,
                    "nearest_rgba_diff": nearest_rgba_diff,
                    "correction_ratio_limit": CORRECTION_RATIO_LIMITS[size],
                    "generation_method": (
                        "nearest+surgical-copy-pixels"
                        if audit["changed_pixel_count"]
                        else "nearest-pass-through"
                    ),
                }
            )
            if same_canvas_iou < BASELINE_ALPHA_IOU_FLOORS[size]:
                errors.append(
                    f"NEAREST preservation IoU={same_canvas_iou:.4f}, "
                    f"minimum={BASELINE_ALPHA_IOU_FLOORS[size]:.4f}"
                )
            if correction_ratio > CORRECTION_RATIO_LIMITS[size]:
                errors.append(
                    f"correction ratio={correction_ratio:.4f}, "
                    f"limit={CORRECTION_RATIO_LIMITS[size]:.4f}"
                )
            if lens_blue_pixel_count(image, size) < lens_blue_pixel_count(baseline, size):
                errors.append("lens blue pixels decreased from NEAREST baseline")
            if bbox and baseline_bbox:
                bbox_delta = max(abs(first - second) for first, second in zip(bbox, baseline_bbox))
                metric["bbox_edge_delta_from_baseline"] = bbox_delta
                if bbox_delta > 1:
                    errors.append(f"bbox edge delta={bbox_delta}px, limit=1px")

        metric["hard_errors"] = errors
        hard_errors.extend(f"{size}px: {error}" for error in errors)
        metrics[size] = metric

    first_pass = {size: decoded_rgba_sha256(image) for size, image in tiers.items()}
    second_pass = {
        size: decoded_rgba_sha256(
            apply_surgical_corrections(build_nearest_baseline(master, size), size)
        )
        for size in TIER_SIZES
    }
    reproducible = first_pass == second_pass
    if not reproducible:
        hard_errors.append("two-pass decoded RGBA hashes differ")

    palette_ladder = [color_count(tiers[size]) for size in TIER_SIZES]
    lens_blue_ladder = [lens_blue_pixel_count(tiers[size], size) for size in TIER_SIZES]
    if any(current >= following for current, following in zip(lens_blue_ladder, lens_blue_ladder[1:])):
        hard_errors.append(f"lens blue detail ladder does not increase: {lens_blue_ladder}")

    adjacent_tier_iou: dict[str, dict[str, object]] = {}
    for pair, floor in ADJACENT_TIER_IOU_FLOORS.items():
        first_size, second_size = pair
        similarity = alpha_iou(tiers[first_size], tiers[second_size])
        adjacent_tier_iou[f"{first_size}->{second_size}"] = {
            "tight_shape_iou": similarity,
            "floor": floor,
            "pass": similarity >= floor,
        }
        if similarity < floor:
            hard_errors.append(
                f"{first_size}->{second_size} tier IoU {similarity:.4f} < {floor:.4f}"
            )

    config_payload = {
        "tiers": TIER_SIZES,
        "telescope_spec": TELESCOPE_SPEC,
        "nearest_correction_plan": NEAREST_CORRECTION_PLAN,
        "baseline_alpha_iou_floors": BASELINE_ALPHA_IOU_FLOORS,
        "correction_ratio_limits": CORRECTION_RATIO_LIMITS,
    }
    script_path = Path(__file__).resolve()
    experiment_pass = not hard_errors
    return {
        "schema_version": 3,
        "status": "PASS" if experiment_pass else "REVISE",
        "scope": "single-asset NEAREST surgical-correction experiment",
        "production_tiers": [16, 32, 48, 64],
        "reference_tiers": [95, 128],
        "design_mode": "telescope-nearest-surgical-v4",
        "compiler_inputs": {
            "identity_geometry_palette": "locked 128px master via Pillow NEAREST",
            "corrections": "NEAREST_CORRECTION_PLAN whitelist",
            "master_raster_projection": True,
            "sibling_tier_inputs": False,
        },
        "imagegen_used_this_run": False,
        "pixy_used_this_run": False,
        "master": {
            "path": str(master_path.resolve()),
            "file_sha256": sha256_file(master_path),
            "decoded_rgba_sha256": decoded_rgba_sha256(master),
            "provenance": {
                "design_mode": master_metadata.get("design_mode", "unknown"),
                "asset_id": master_metadata.get("asset_id", "unknown"),
                "logical_size": master_metadata.get("logical_size", "unknown"),
                "raw_generation_id": master_metadata.get("raw_generation_id", "unknown"),
                "sibling_tier_inputs": master_metadata.get("sibling_tier_inputs", "unknown"),
                "identity_reference": master_metadata.get("identity_reference", "unknown"),
                "style_reference": master_metadata.get("style_reference", "unknown"),
                "postprocess": master_metadata.get("postprocess", "unknown"),
                "pixy_used": master_metadata.get("pixy_used", "unknown"),
            },
        },
        "provenance": {
            "script": str(script_path),
            "script_sha256": sha256_text_lf(script_path),
            "script_hash_normalization": "UTF-8 with LF line endings",
            "config_sha256": sha256_bytes(
                json.dumps(config_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ),
            "correction_manifest_sha256": sha256_bytes(
                json.dumps(
                    NEAREST_CORRECTION_PLAN,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ),
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "reproducibility": {
            "two_pass_decoded_rgba_match": reproducible,
            "nearest_baselines": {
                str(size): decoded_rgba_sha256(baselines[size]) for size in TIER_SIZES
            },
            "first_pass": {str(key): value for key, value in first_pass.items()},
            "second_pass": {str(key): value for key, value in second_pass.items()},
        },
        "hard_errors": hard_errors,
        "validation_basis": (
            "declared-pixel-only edits, high NEAREST preservation, connected structure, "
            "master palette, lens retention, tier consistency, and deterministic rerender"
        ),
        "palette_detail_ladder": palette_ladder,
        "lens_blue_detail_ladder": lens_blue_ladder,
        "adjacent_tier_consistency": adjacent_tier_iou,
        "tiers": {str(key): value for key, value in metrics.items()},
    }


def main() -> None:
    args = parse_args()
    master_path = args.master.resolve()
    output_dir = args.output.resolve()
    if not master_path.is_file():
        raise FileNotFoundError(f"Master not found: {master_path}")

    with Image.open(master_path) as source:
        master_metadata = dict(source.info)
        master = source.convert("RGBA")
    validate_master(master, master_path, master_metadata)

    baselines = {
        size: build_nearest_baseline(master, size)
        for size in TIER_SIZES
    }
    tiers = {
        size: apply_surgical_corrections(baselines[size], size)
        for size in TIER_SIZES
    }
    validation = build_validation(
        master, master_path, master_metadata, tiers, baselines
    )
    metrics = {int(key): value for key, value in validation["tiers"].items()}

    output_dir.mkdir(parents=True, exist_ok=True)
    atlas_path = output_dir / "telescope-derived-v2-atlas.png"
    comparison_path = output_dir / "telescope-derived-v2-comparison.png"
    validation_path = output_dir / "validation.json"

    atlas = Image.new(
        "RGBA", (ATLAS_CELL * len(TIER_SIZES), ATLAS_CELL), (0, 0, 0, 0)
    )
    for index, size in enumerate(TIER_SIZES):
        atlas.alpha_composite(tiers[size], (index * ATLAS_CELL, 0))

    common_metadata = {
        "design_mode": "telescope-nearest-surgical-v4",
        "master_raster_projection": "true",
        "geometry_source": "locked 128px master via Pillow NEAREST",
        "correction_source": "NEAREST_CORRECTION_PLAN whitelist",
        "palette_source": "locked 128px master; no quantization",
        "master_decoded_rgba_sha256": decoded_rgba_sha256(master),
        "master_design_mode": str(master_metadata.get("design_mode", "unknown")),
        "pixy_used_this_run": "false",
        "imagegen_used_this_run": "false",
        "status": str(validation["status"]),
    }
    save_png(atlas, atlas_path, common_metadata)
    comparison = build_contact_sheet(tiers, baselines, metrics)
    save_png(comparison, comparison_path, common_metadata)
    validation_path.write_text(
        json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"status={validation['status']}")
    print(f"atlas={atlas_path}")
    print(f"comparison={comparison_path}")
    print(f"validation={validation_path}")
    for size in TIER_SIZES:
        metric = metrics[size]
        print(
            f"{size:>3}px colors={metric['palette_count']:>2} "
            f"lens_blue={metric['blue_lens_pixels_in_roi']:>3} "
            f"repair={metric['correction']['changed_pixel_count']:>2}px "
            f"nearest_iou={metric['same_canvas_shape_iou']:.4f}"
        )


if __name__ == "__main__":
    main()
