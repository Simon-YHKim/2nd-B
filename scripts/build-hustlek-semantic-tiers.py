#!/usr/bin/env python3
"""Build a deterministic HustleK telescope tier experiment from one 128px master.

This is deliberately not a generic image resize.  The reducer combines:

* exact integer area projection for the source silhouette;
* categorical material voting instead of RGB averaging;
* a tier-specific palette sampled from the master itself;
* a small semantic geometry contract for identity-critical telescope parts;
* optical corrections rendered directly on each target pixel grid.

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
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

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
DERIVED_SIZES = TIER_SIZES[:-1]
ATLAS_CELL = 128

ROLE_TONE_BUDGETS: dict[int, dict[str, int]] = {
    16: {"ink": 1, "ivory": 2, "brass": 1, "lens": 1, "steel": 1},
    32: {"ink": 1, "ivory": 3, "brass": 3, "lens": 2, "steel": 2},
    48: {"ink": 2, "ivory": 3, "brass": 3, "lens": 3, "steel": 2},
    64: {"ink": 2, "ivory": 4, "brass": 4, "lens": 3, "steel": 3},
    95: {"ink": 3, "ivory": 5, "brass": 5, "lens": 4, "steel": 4},
}

ALPHA_THRESHOLDS = {16: 0.19, 32: 0.28, 48: 0.35, 64: 0.40, 95: 0.46}
MASTER_IOU_FLOORS = {16: 0.55, 32: 0.65, 48: 0.75, 64: 0.82, 95: 0.90}
SAME_CANVAS_IOU_FLOORS = {16: 0.55, 32: 0.78, 48: 0.84, 64: 0.89, 95: 0.93}
CENTROID_DELTA_LIMITS = {16: 0.04, 32: 0.035, 48: 0.025, 64: 0.02, 95: 0.015}
NEAREST_ALPHA_DIFF_FLOORS = {16: 0.12, 32: 0.09, 48: 0.07, 64: 0.05, 95: 0.025}
INTERNAL_BOUNDARY_EDIT_FLOORS = {16: 0.20, 32: 0.15, 48: 0.10, 64: 0.07, 95: 0.04}
PALETTE_LIMITS = {16: 12, 32: 20, 48: 32, 64: 48, 95: 72, 128: 95}

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
RGB = tuple[int, int, int]


@dataclass(frozen=True)
class ProjectedPixel:
    solid: bool
    role: str
    luminance: float


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


def luma(rgb: RGB) -> float:
    red, green, blue = rgb
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def classify_role(x: int, y: int, rgba: RGBA) -> str:
    red, green, blue, alpha = rgba
    if alpha == 0:
        return "transparent"

    hue, saturation, value = colorsys.rgb_to_hsv(
        red / 255.0, green / 255.0, blue / 255.0
    )
    hue *= 360.0

    lens_left, lens_top, lens_right, lens_bottom = TELESCOPE_SPEC["lens_outer_box"]
    in_lens = lens_left <= x < lens_right and lens_top <= y < lens_bottom
    if in_lens and 175.0 <= hue <= 240.0 and saturation >= 0.28:
        return "lens"
    if value < 0.31:
        return "ink"
    if 18.0 <= hue <= 52.0 and saturation >= 0.48:
        return "brass"
    if 15.0 <= hue <= 58.0 and red >= green >= blue:
        return "ivory"
    return "steel"


def feature_importance(x: int, y: int, role: str) -> float:
    if role == "lens":
        return 1.85
    if y >= 58:
        return 1.45
    if 44 <= x <= 103 and 35 <= y <= 68:
        return 1.28
    return 1.10


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


def weighted_quantile_color(colors: Counter[RGB], quantile: float) -> RGB:
    ordered = sorted(colors.items(), key=lambda item: (luma(item[0]), item[0]))
    total = sum(count for _, count in ordered)
    threshold = quantile * max(0, total - 1)
    cumulative = 0
    for color, count in ordered:
        cumulative += count
        if cumulative - 1 >= threshold:
            return color
    return ordered[-1][0]


def build_tier_palette(master: Image.Image, size: int) -> dict[str, tuple[RGB, ...]]:
    role_colors: dict[str, Counter[RGB]] = {
        role: Counter() for role in ("ink", "ivory", "brass", "lens", "steel")
    }
    pixels = master.load()
    for y in range(MASTER_SIZE):
        for x in range(MASTER_SIZE):
            rgba = pixels[x, y]
            role = classify_role(x, y, rgba)
            if role != "transparent":
                role_colors[role][rgba[:3]] += 1

    palette: dict[str, tuple[RGB, ...]] = {}
    for role, tone_count in ROLE_TONE_BUDGETS[size].items():
        colors = role_colors[role]
        if not colors:
            colors = role_colors["ink"]
        if tone_count == 1:
            quantiles = (0.5,)
        else:
            quantiles = tuple(index / (tone_count - 1) for index in range(tone_count))
        selected = tuple(dict.fromkeys(weighted_quantile_color(colors, q) for q in quantiles))
        palette[role] = selected
    return palette


def axis_overlaps(source_size: int, target_size: int) -> list[list[tuple[int, int]]]:
    result: list[list[tuple[int, int]]] = []
    for target_index in range(target_size):
        target_left = target_index * source_size
        target_right = (target_index + 1) * source_size
        start = target_left // target_size
        stop = min(source_size, (target_right + target_size - 1) // target_size)
        overlaps: list[tuple[int, int]] = []
        for source_index in range(start, stop):
            source_left = source_index * target_size
            source_right = (source_index + 1) * target_size
            overlap = max(
                0,
                min(source_right, target_right) - max(source_left, target_left),
            )
            if overlap:
                overlaps.append((source_index, overlap))
        if sum(overlap for _, overlap in overlaps) != source_size:
            raise AssertionError(
                f"Exact-area projection gap at target index {target_index}: {overlaps}"
            )
        result.append(overlaps)
    return result


def closest_tone(palette: tuple[RGB, ...], target_luma: float) -> RGB:
    return min(palette, key=lambda color: (abs(luma(color) - target_luma), color))


def project_pixel(
    source: Image.Image,
    x_overlaps: list[tuple[int, int]],
    y_overlaps: list[tuple[int, int]],
    threshold: float,
) -> ProjectedPixel:
    pixels = source.load()
    role_scores: Counter[str] = Counter()
    role_luma_sums: Counter[str] = Counter()
    foreground_weight = 0
    importance_weight = 0.0
    total_weight = MASTER_SIZE * MASTER_SIZE

    for source_y, overlap_y in y_overlaps:
        for source_x, overlap_x in x_overlaps:
            rgba = pixels[source_x, source_y]
            if rgba[3] == 0:
                continue
            weight = overlap_x * overlap_y
            role = classify_role(source_x, source_y, rgba)
            importance = feature_importance(source_x, source_y, role)
            foreground_weight += weight
            importance_weight += weight * importance
            role_scores[role] += weight
            role_luma_sums[role] += int(round(luma(rgba[:3]) * weight))

    if foreground_weight == 0 or importance_weight / total_weight < threshold:
        return ProjectedPixel(False, "transparent", 0.0)

    role_priority = {"lens": 1.55, "brass": 1.06, "ivory": 1.0, "steel": 0.96, "ink": 0.92}
    role = max(
        role_scores,
        key=lambda item: (role_scores[item] * role_priority[item], item),
    )
    average_luma = role_luma_sums[role] / role_scores[role]
    return ProjectedPixel(True, role, average_luma)


def four_neighbors(x: int, y: int, size: int) -> Iterable[tuple[int, int]]:
    if x > 0:
        yield x - 1, y
    if x + 1 < size:
        yield x + 1, y
    if y > 0:
        yield x, y - 1
    if y + 1 < size:
        yield x, y + 1


def remove_tiny_components(image: Image.Image, size: int) -> Image.Image:
    alpha = image.getchannel("A")
    foreground = {
        (x, y)
        for y in range(size)
        for x in range(size)
        if alpha.getpixel((x, y)) == 255
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

    minimum = 1 if size <= 32 else 2
    cleaned = image.copy()
    pixels = cleaned.load()
    for component in components:
        if len(component) <= minimum:
            for x, y in component:
                pixels[x, y] = (0, 0, 0, 0)
    return cleaned


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


def restore_declared_topology(
    image: Image.Image,
    palette: dict[str, tuple[RGB, ...]],
) -> Image.Image:
    """Restore only the source-declared pan-handle connection when it is lost."""
    result = image.copy()
    if len(eight_connected_components(result)) <= 1:
        return result
    bridge = [
        scale_point(point, image.width)
        for point in TELESCOPE_SPEC["pan_handle_bridge"]
    ]
    ImageDraw.Draw(result).line(bridge, fill=darkest(palette), width=1)
    return result


def darkest(palette: dict[str, tuple[RGB, ...]], role: str = "ink") -> RGBA:
    return (*palette[role][0], 255)


def brightest(palette: dict[str, tuple[RGB, ...]], role: str) -> RGBA:
    return (*palette[role][-1], 255)


def middle(palette: dict[str, tuple[RGB, ...]], role: str) -> RGBA:
    colors = palette[role]
    return (*colors[len(colors) // 2], 255)


def rebuild_outline(image: Image.Image, palette: dict[str, tuple[RGB, ...]]) -> Image.Image:
    size = image.width
    source = image.copy()
    source_alpha = source.getchannel("A")
    result = image.copy()
    result_pixels = result.load()
    ink = darkest(palette)
    for y in range(size):
        for x in range(size):
            if source_alpha.getpixel((x, y)) == 0:
                continue
            boundary = any(
                source_alpha.getpixel(neighbor) == 0
                for neighbor in four_neighbors(x, y, size)
            )
            if boundary:
                result_pixels[x, y] = ink
    return result


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


def line_width(size: int, source_width: int) -> int:
    return max(1, (source_width * size + MASTER_SIZE // 2) // MASTER_SIZE)


def render_16_tier(palette: dict[str, tuple[RGB, ...]]) -> Image.Image:
    """Render the master part graph directly on the 16px logical grid."""
    result = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(result)
    ink = darkest(palette)
    ivory = brightest(palette, "ivory")
    brass = brightest(palette, "brass")
    blue = brightest(palette, "lens")

    # Three legs branch from the same apex and end at separate feet.
    apex = (7, 8)
    draw.line((apex, (4, 14)), fill=ink, width=1)
    draw.line((apex, (7, 13)), fill=ink, width=1)
    draw.line((apex, (10, 14)), fill=ink, width=1)
    draw.point((5, 11), fill=brass)
    draw.point((9, 11), fill=brass)
    draw.point((4, 14), fill=brass)
    draw.point((7, 13), fill=brass)
    draw.point((10, 14), fill=brass)

    # The tube uses the measured 23-degree optical axis and one retained band.
    draw.polygon(((2, 1), (4, 1), (13, 5), (13, 7), (11, 7), (3, 4)), fill=ink)
    draw.polygon(((4, 2), (12, 5), (11, 6), (4, 3)), fill=ivory)
    draw.line(((5, 4), (9, 6)), fill=ivory, width=1)
    draw.point((7, 4), fill=brass)
    draw.point((12, 6), fill=brass)

    # One blue pixel inside a dark/gold objective is the 16px lens identity cue.
    draw.point((3, 1), fill=brass)
    draw.point((2, 2), fill=brass)
    draw.point((3, 2), fill=blue)
    draw.point((3, 3), fill=brass)
    draw.line(((8, 6), apex), fill=ink, width=1)
    draw.point((8, 7), fill=brass)
    return result


def apply_overlay_inside_foreground(result: Image.Image, overlay: Image.Image) -> None:
    """Apply semantic color corrections without changing the projected silhouette."""
    result_pixels = result.load()
    overlay_pixels = overlay.load()
    for y in range(result.height):
        for x in range(result.width):
            correction = overlay_pixels[x, y]
            if correction[3] and result_pixels[x, y][3]:
                result_pixels[x, y] = correction


def render_semantic_corrections(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
) -> Image.Image:
    if size == 16:
        return render_16_tier(palette)

    result = image.copy()
    overlay = Image.new("RGBA", result.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    ink = darkest(palette)
    ivory = middle(palette, "ivory")
    ivory_light = brightest(palette, "ivory")
    brass = middle(palette, "brass")
    brass_light = brightest(palette, "brass")
    blue = middle(palette, "lens")
    blue_light = brightest(palette, "lens")

    # At 95px the projection already carries the complete part graph.  Geometry
    # corrections are only needed where the lower grids merge thin structures.
    if size <= 64:
        outer_width = line_width(size, 4)
        core_width = max(1, outer_width - 2)
        for leg in TELESCOPE_SPEC["legs"]:
            points = [scale_point(point, size) for point in leg]
            draw.line(points, fill=ink, width=outer_width, joint="curve")
            draw.line(
                points,
                fill=ivory if size >= 48 else brass,
                width=core_width,
            )

    if 48 <= size <= 64:
        brace = [scale_point(point, size) for point in TELESCOPE_SPEC["brace"]]
        draw.line(brace, fill=ink, width=max(1, line_width(size, 3)))
        draw.line(brace, fill=brass, width=1)

    if size <= 64:
        foot_half = max(1, line_width(size, 3))
        for foot in TELESCOPE_SPEC["feet"]:
            foot_x, foot_y = scale_point(foot, size)
            draw.line(
                (
                    max(0, foot_x - foot_half),
                    foot_y,
                    min(size - 1, foot_x + foot_half),
                    foot_y,
                ),
                fill=ink,
                width=max(1, line_width(size, 3)),
            )
            draw.point((foot_x, foot_y), fill=brass_light)

    # The fixed alt-az mount is never replaced with another mount type.
    mount_x, mount_y = scale_point(TELESCOPE_SPEC["mount"], size)
    mount_radius = max(1, line_width(size, 7))
    if size <= 64:
        draw.ellipse(
            (
                mount_x - mount_radius,
                mount_y - mount_radius,
                mount_x + mount_radius,
                mount_y + mount_radius,
            ),
            fill=ink,
        )
    inner_radius = max(0, mount_radius - max(1, line_width(size, 2)))
    if size <= 64 and inner_radius:
        draw.ellipse(
            (
                mount_x - inner_radius,
                mount_y - inner_radius,
                mount_x + inner_radius,
                mount_y + inner_radius,
            ),
            fill=brass,
        )
        draw.point((mount_x, mount_y), fill=brass_light)

    # Lens rim and blue optical cue are reconstructed on the target grid.
    outer_box = scale_box(TELESCOPE_SPEC["lens_outer_box"], size)
    inner_box = scale_box(TELESCOPE_SPEC["lens_inner_box"], size)
    # Recolor only master-projected lens pixels; never invent a new outer ellipse.
    draw.rectangle(outer_box, fill=brass_light)
    draw.ellipse(inner_box, fill=blue)
    if size >= 32:
        highlight_x = inner_box[0]
        highlight_y = max(inner_box[1], (inner_box[1] + inner_box[3]) // 2 - 1)
        draw.point((highlight_x, highlight_y), fill=blue_light)

    # Tube bands are anchored to fixed positions along the canonical optical axis.
    axis_start, axis_end = TELESCOPE_SPEC["tube_axis"]
    axis_dx = axis_end[0] - axis_start[0]
    axis_dy = axis_end[1] - axis_start[1]
    if size == 64:
        band_positions = (0.32, 0.55, 0.76)
    elif size >= 48:
        band_positions = TELESCOPE_SPEC["tube_bands"]
    else:
        band_positions = (0.56,)
    for position in band_positions:
        center = (
            int(round(axis_start[0] + axis_dx * position)),
            int(round(axis_start[1] + axis_dy * position)),
        )
        half = 6 if position < 0.5 else 5
        perpendicular = (
            (center[0] + 2, center[1] - half),
            (center[0] - 2, center[1] + half),
        )
        points = [scale_point(point, size) for point in perpendicular]
        draw.line(points, fill=ink, width=max(1, line_width(size, 4)))
        draw.line(points, fill=brass, width=max(1, line_width(size, 2)))

    if 48 <= size <= 64:
        for index, knob in enumerate(TELESCOPE_SPEC["focus_knobs"]):
            knob_x, knob_y = scale_point(knob, size)
            radius = max(1, line_width(size, 3 if index == 0 else 2))
            draw.ellipse(
                (knob_x - radius, knob_y - radius, knob_x + radius, knob_y + radius),
                fill=ink,
            )
            draw.point((knob_x, knob_y), fill=brass_light)

    # Restore a readable warm tube face after outlining at 32px.
    if size == 32:
        start = scale_point((35, 22), size)
        end = scale_point((81, 44), size)
        draw.line(
            (start, end),
            fill=ivory_light,
            width=max(1, line_width(size, 5)),
        )
        # Draw the single low-tier band again so it remains visible over the face.
        center = scale_point((67, 38), size)
        draw.point(center, fill=brass)
        # A one-pixel underside plane is the 32px structural shading boundary.
        shadow_start = scale_point((45, 31), size)
        shadow_end = scale_point((78, 46), size)
        draw.line(shadow_start + shadow_end, fill=(*palette["ivory"][0], 255), width=1)
        eyepiece = scale_point((99, 50), size)
        draw.point(eyepiece, fill=brass_light)

    apply_overlay_inside_foreground(result, overlay)

    # Binary alpha and zero hidden RGB are an invariant of the asset contract.
    pixels = result.load()
    for y in range(size):
        for x in range(size):
            red, green, blue_value, alpha = pixels[x, y]
            pixels[x, y] = (
                (red, green, blue_value, 255) if alpha else (0, 0, 0, 0)
            )
    return result


def reduce_master(master: Image.Image, size: int) -> Image.Image:
    if size == MASTER_SIZE:
        return master.copy()

    palette = build_tier_palette(master, size)
    x_axis = axis_overlaps(MASTER_SIZE, size)
    y_axis = axis_overlaps(MASTER_SIZE, size)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = result.load()
    threshold = ALPHA_THRESHOLDS[size]

    for target_y, y_overlaps in enumerate(y_axis):
        for target_x, x_overlaps in enumerate(x_axis):
            projected = project_pixel(master, x_overlaps, y_overlaps, threshold)
            if not projected.solid:
                continue
            color = closest_tone(palette[projected.role], projected.luminance)
            pixels[target_x, target_y] = (*color, 255)

    result = remove_tiny_components(result, size)
    result = rebuild_outline(result, palette)
    result = render_semantic_corrections(result, size, palette)
    result = restore_declared_topology(result, palette)
    return result


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


def internal_material_boundaries(image: Image.Image) -> set[tuple[int, int, str]]:
    pixels = image.load()
    boundaries: set[tuple[int, int, str]] = set()
    for y in range(image.height):
        for x in range(image.width):
            role = coarse_material(pixels[x, y])
            if role == "transparent":
                continue
            if x + 1 < image.width:
                neighbor = coarse_material(pixels[x + 1, y])
                if neighbor != "transparent" and neighbor != role:
                    boundaries.add((x, y, "horizontal"))
            if y + 1 < image.height:
                neighbor = coarse_material(pixels[x, y + 1])
                if neighbor != "transparent" and neighbor != role:
                    boundaries.add((x, y, "vertical"))
    return boundaries


def internal_boundary_edit_ratio(first: Image.Image, second: Image.Image) -> float:
    first_boundaries = internal_material_boundaries(first)
    second_boundaries = internal_material_boundaries(second)
    union = first_boundaries | second_boundaries
    return len(first_boundaries ^ second_boundaries) / len(union) if union else 0.0


def rgba_diff_union(first: Image.Image, second: Image.Image) -> float:
    first_values = list(first.get_flattened_data())
    second_values = list(second.get_flattened_data())
    union = sum(a[3] or b[3] for a, b in zip(first_values, second_values))
    changed = sum(a != b and (a[3] or b[3]) for a, b in zip(first_values, second_values))
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
    if color_count(image) > PALETTE_LIMITS[size]:
        errors.append(
            f"palette={color_count(image)}, limit={PALETTE_LIMITS[size]}"
        )
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
    if lens_blue_pixel_count(image, size) < 1:
        errors.append("blue lens cue missing from lens ROI")
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


def alpha_diff_visual(derived: Image.Image, nearest: Image.Image) -> Image.Image:
    size = derived.width
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    derived_alpha = derived.getchannel("A")
    nearest_alpha = nearest.getchannel("A")
    pixels = result.load()
    for y in range(size):
        for x in range(size):
            in_derived = bool(derived_alpha.getpixel((x, y)))
            in_nearest = bool(nearest_alpha.getpixel((x, y)))
            if in_derived and in_nearest:
                pixels[x, y] = (118, 140, 157, 255)
            elif in_derived:
                pixels[x, y] = (52, 211, 208, 255)
            elif in_nearest:
                pixels[x, y] = (239, 166, 70, 255)
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

    draw.text((44, 30), "HustleK Telescope - 128 Master Semantic Tiers v2", fill=white, font=font_title)
    draw.text(
        (44, 75),
        "One canonical identity, exact-area material projection, target-grid optical corrections",
        fill=muted,
        font=font_body,
    )
    draw.text(
        (44, 102),
        "Cyan diff = semantic tier adds/rebuilds pixel; amber = plain NEAREST-only pixel",
        fill=muted,
        font=font_small,
    )

    column_left = 170
    column_width = 286
    row_specs = (
        ("Derived native 1x", 155, 150),
        ("Derived integer zoom", 335, 245),
        ("Plain NEAREST - identical zoom", 615, 245),
        ("Alpha structure diff", 895, 245),
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
        diff = alpha_diff_visual(tiers[size], baselines[size])
        diff_zoom = fit_integer_zoom(
            diff, (diff_box[2] - diff_box[0] - 8, diff_box[3] - diff_box[1] - 8)
        )
        paste_centered(canvas, diff_zoom, diff_box)

        metric = metrics[size]
        if size == 128:
            summary = f"master | {metric['palette_count']} colors"
        else:
            summary = (
                f"IoU {metric['master_shape_iou']:.3f} | "
                f"alpha edit {metric['nearest_alpha_diff']:.3f} | "
                f"{metric['palette_count']} colors"
            )
        draw.text((center, 1162), summary, fill=muted, font=font_small, anchor="mm")

    draw.text(
        (44, 1210),
        "Experimental proof: all derived tiers are rebuilt from the 128 master; existing independent PNGs remain untouched.",
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
    identity_warnings: list[str] = []
    difference_warnings: list[str] = []

    for index, size in enumerate(TIER_SIZES):
        image = tiers[size]
        errors = validate_tier(image, size)
        hard_errors.extend(f"{size}px: {error}" for error in errors)
        bbox = image.getchannel("A").getbbox()
        metric: dict[str, object] = {
            "size": [size, size],
            "atlas_crop": [index * ATLAS_CELL, 0, index * ATLAS_CELL + size, size],
            "bbox": list(bbox) if bbox else None,
            "foreground_pixels": foreground_count(image),
            "palette_count": color_count(image),
            "blue_lens_pixels": blue_pixel_count(image),
            "blue_lens_pixels_in_roi": lens_blue_pixel_count(image, size),
            "landmarks": landmark_presence(image, size),
            "foreground_components_8_connected": len(eight_connected_components(image)),
            "decoded_rgba_sha256": decoded_rgba_sha256(image),
            "hard_errors": errors,
        }
        if size == MASTER_SIZE:
            metric.update(
                {
                    "master_shape_iou": 1.0,
                    "nearest_alpha_diff": 0.0,
                    "nearest_rgba_diff": 0.0,
                }
            )
        else:
            shape_iou = alpha_iou(image, master)
            nearest_alpha_diff = alpha_xor_union(image, baselines[size])
            same_canvas_iou = canvas_alpha_iou(image, baselines[size])
            centroid_delta = normalized_centroid_delta(image, baselines[size])
            boundary_edit = internal_boundary_edit_ratio(image, baselines[size])
            nearest_rgba_diff = rgba_diff_union(image, baselines[size])
            metric.update(
                {
                    "master_shape_iou": shape_iou,
                    "master_shape_iou_floor": MASTER_IOU_FLOORS[size],
                    "nearest_alpha_diff": nearest_alpha_diff,
                    "nearest_alpha_diff_floor": NEAREST_ALPHA_DIFF_FLOORS[size],
                    "same_canvas_shape_iou": same_canvas_iou,
                    "same_canvas_shape_iou_floor": SAME_CANVAS_IOU_FLOORS[size],
                    "normalized_centroid_delta": centroid_delta,
                    "normalized_centroid_delta_limit": CENTROID_DELTA_LIMITS[size],
                    "internal_material_boundary_edit": boundary_edit,
                    "internal_material_boundary_edit_floor": INTERNAL_BOUNDARY_EDIT_FLOORS[size],
                    "nearest_rgba_diff": nearest_rgba_diff,
                }
            )
            if shape_iou < MASTER_IOU_FLOORS[size]:
                identity_warnings.append(
                    f"{size}px master shape IoU {shape_iou:.4f} < {MASTER_IOU_FLOORS[size]:.4f}"
                )
            if same_canvas_iou < SAME_CANVAS_IOU_FLOORS[size]:
                identity_warnings.append(
                    f"{size}px same-canvas shape IoU {same_canvas_iou:.4f} < "
                    f"{SAME_CANVAS_IOU_FLOORS[size]:.4f}"
                )
            if centroid_delta > CENTROID_DELTA_LIMITS[size]:
                identity_warnings.append(
                    f"{size}px centroid delta {centroid_delta:.4f} > "
                    f"{CENTROID_DELTA_LIMITS[size]:.4f}"
                )
            if nearest_alpha_diff < NEAREST_ALPHA_DIFF_FLOORS[size]:
                difference_warnings.append(
                    f"{size}px alpha edit {nearest_alpha_diff:.4f} < {NEAREST_ALPHA_DIFF_FLOORS[size]:.4f}"
                )
            if boundary_edit < INTERNAL_BOUNDARY_EDIT_FLOORS[size]:
                difference_warnings.append(
                    f"{size}px internal boundary edit {boundary_edit:.4f} < "
                    f"{INTERNAL_BOUNDARY_EDIT_FLOORS[size]:.4f}"
                )
        metrics[size] = metric

    first_pass = {size: decoded_rgba_sha256(image) for size, image in tiers.items()}
    second_pass = {
        size: decoded_rgba_sha256(reduce_master(master, size)) for size in TIER_SIZES
    }
    reproducible = first_pass == second_pass
    if not reproducible:
        hard_errors.append("two-pass decoded RGBA hashes differ")

    palette_ladder = [color_count(tiers[size]) for size in TIER_SIZES]
    if any(current > following for current, following in zip(palette_ladder, palette_ladder[1:])):
        hard_errors.append(f"palette detail ladder decreases: {palette_ladder}")

    config_payload = {
        "tiers": TIER_SIZES,
        "tone_budgets": ROLE_TONE_BUDGETS,
        "alpha_thresholds": ALPHA_THRESHOLDS,
        "telescope_spec": TELESCOPE_SPEC,
    }
    script_path = Path(__file__).resolve()
    experiment_pass = not hard_errors and not identity_warnings and not difference_warnings
    return {
        "schema_version": 1,
        "status": "PASS" if experiment_pass else "REVISE",
        "scope": "single-asset semantic reducer experiment",
        "design_mode": "128-master-semantic-compiler",
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
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "reproducibility": {
            "two_pass_decoded_rgba_match": reproducible,
            "first_pass": {str(key): value for key, value in first_pass.items()},
            "second_pass": {str(key): value for key, value in second_pass.items()},
        },
        "hard_errors": hard_errors,
        "identity_warnings": identity_warnings,
        "nearest_difference_warnings": difference_warnings,
        "palette_detail_ladder": palette_ladder,
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

    tiers = {size: reduce_master(master, size) for size in TIER_SIZES}
    baselines = {
        size: master.resize((size, size), Image.Resampling.NEAREST)
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
        "design_mode": "128-master-semantic-compiler",
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
            f"iou={metric['master_shape_iou']:.4f} "
            f"alpha_edit={metric['nearest_alpha_diff']:.4f}"
        )


if __name__ == "__main__":
    main()
