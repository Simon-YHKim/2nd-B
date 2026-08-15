#!/usr/bin/env python3
"""Build deterministic HustleK telescope tiers on their native pixel grids.

This is deliberately not a generic image resize.  The compiler combines:

* one semantic telescope part graph shared by every tier;
* explicit per-tier geometry and feature plans;
* a tier-specific palette sampled from the locked 128px identity master;
* direct rasterization of connected pixel primitives on each target grid;
* a plain NEAREST baseline used only after compilation for visual comparison.

The experiment writes one atlas, one visual comparison, and one JSON validation
report.  Existing independently generated tier PNGs are read only and are never
overwritten.  No generative-image service or Pixy component is used.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
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
DERIVED_SIZES = TIER_SIZES[:-1]
ATLAS_CELL = 128

ROLE_TONE_BUDGETS: dict[int, dict[str, int]] = {
    16: {"ink": 1, "ivory": 2, "brass": 1, "lens": 1, "steel": 1},
    32: {"ink": 1, "ivory": 3, "brass": 3, "lens": 2, "steel": 2},
    48: {"ink": 2, "ivory": 3, "brass": 3, "lens": 3, "steel": 2},
    64: {"ink": 2, "ivory": 4, "brass": 4, "lens": 3, "steel": 3},
    95: {"ink": 3, "ivory": 5, "brass": 5, "lens": 4, "steel": 4},
}

MASTER_IOU_FLOORS = {16: 0.55, 32: 0.65, 48: 0.75, 64: 0.82, 95: 0.90}
SAME_CANVAS_IOU_FLOORS = {16: 0.55, 32: 0.78, 48: 0.84, 64: 0.89, 95: 0.93}
CENTROID_DELTA_LIMITS = {16: 0.04, 32: 0.035, 48: 0.025, 64: 0.02, 95: 0.015}
NEAREST_ALPHA_DIFF_FLOORS = {16: 0.12, 32: 0.09, 48: 0.07, 64: 0.05, 95: 0.025}
INTERNAL_BOUNDARY_EDIT_FLOORS = {16: 0.20, 32: 0.15, 48: 0.10, 64: 0.07, 95: 0.04}
PALETTE_LIMITS = {16: 12, 32: 20, 48: 32, 64: 48, 95: 72, 128: 95}
PALETTE_MINIMUMS = {16: 4, 32: 8, 48: 9, 64: 11, 95: 12, 128: 1}
LENS_BLUE_PIXEL_MINIMUMS = {16: 1, 32: 3, 48: 8, 64: 14, 95: 30, 128: 30}

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


def darkest(palette: dict[str, tuple[RGB, ...]], role: str = "ink") -> RGBA:
    return (*palette[role][0], 255)


def brightest(palette: dict[str, tuple[RGB, ...]], role: str) -> RGBA:
    return (*palette[role][-1], 255)


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


AXIS_UNIT = (12.0 / 13.0, 5.0 / 13.0)
NORMAL_UNIT = (-5.0 / 13.0, 12.0 / 13.0)

TIER_RENDER_PLAN: dict[int, dict[str, object]] = {
    16: {
        "tube_radii": (1.7, 1.25),
        "lens_layers": (),
        "leg_widths": (1, 0),
        "bands": (0.50,),
        "brace": False,
        "focus": False,
    },
    32: {
        "tube_radii": (2.75, 2.15),
        "lens_layers": (
            (2.60, 3.80),
            (2.05, 3.15),
            (1.45, 2.45),
            (1.00, 1.85),
        ),
        "leg_widths": (2, 1),
        "bands": (0.49,),
        "brace": False,
        "focus": True,
    },
    48: {
        "tube_radii": (4.0, 3.15),
        "lens_layers": (
            (3.55, 5.20),
            (2.75, 4.30),
            (2.00, 3.40),
            (1.45, 2.65),
        ),
        "leg_widths": (2, 1),
        "bands": (0.43, 0.68),
        "brace": True,
        "focus": True,
    },
    64: {
        "tube_radii": (5.25, 4.0),
        "lens_layers": (
            (4.45, 7.00),
            (3.55, 5.90),
            (2.70, 4.75),
            (2.00, 3.65),
        ),
        "leg_widths": (3, 1),
        "bands": (0.43, 0.68),
        "brace": True,
        "focus": True,
    },
    95: {
        "tube_radii": (7.7, 5.9),
        "lens_layers": (
            (6.25, 10.65),
            (5.05, 9.15),
            (3.85, 7.55),
            (2.60, 5.75),
        ),
        "leg_widths": (5, 3),
        "bands": (0.43, 0.68),
        "brace": True,
        "focus": True,
    },
}


def palette_tone(
    palette: dict[str, tuple[RGB, ...]], role: str, fraction: float
) -> RGBA:
    colors = palette[role]
    index = min(len(colors) - 1, max(0, int(round(fraction * (len(colors) - 1)))))
    return (*colors[index], 255)


def source_to_target_float(point: tuple[float, float], size: int) -> tuple[float, float]:
    return (
        (point[0] + 0.5) * size / MASTER_SIZE - 0.5,
        (point[1] + 0.5) * size / MASTER_SIZE - 0.5,
    )


def round_point(point: tuple[float, float]) -> tuple[int, int]:
    return int(math.floor(point[0] + 0.5)), int(math.floor(point[1] + 0.5))


def offset_point(
    point: tuple[float, float],
    direction: tuple[float, float],
    distance: float,
) -> tuple[float, float]:
    return point[0] + direction[0] * distance, point[1] + direction[1] * distance


def tapered_polygon(
    start: tuple[float, float],
    end: tuple[float, float],
    start_radius: float,
    end_radius: float,
) -> list[tuple[int, int]]:
    return [
        round_point(offset_point(start, NORMAL_UNIT, -start_radius)),
        round_point(offset_point(end, NORMAL_UNIT, -end_radius)),
        round_point(offset_point(end, NORMAL_UNIT, end_radius)),
        round_point(offset_point(start, NORMAL_UNIT, start_radius)),
    ]


def draw_tapered_tube(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
    start_source: tuple[float, float],
    end_source: tuple[float, float],
    start_radius: float,
    end_radius: float,
) -> None:
    draw = ImageDraw.Draw(image)
    start = source_to_target_float(start_source, size)
    end = source_to_target_float(end_source, size)
    ink = darkest(palette)
    ivory_tones = palette["ivory"]
    shadow = (*ivory_tones[0], 255)
    base = (*ivory_tones[min(len(ivory_tones) - 1, max(1, len(ivory_tones) // 2))], 255)
    upper_light = (*ivory_tones[-2 if len(ivory_tones) >= 4 else -1], 255)
    light = (*ivory_tones[-1], 255)
    border = 1.0 if size <= 64 else 1.4

    draw.polygon(tapered_polygon(start, end, start_radius, end_radius), fill=ink)
    inner_start = offset_point(start, AXIS_UNIT, max(0.75, border))
    inner_end = offset_point(end, AXIS_UNIT, -max(0.75, border))
    inner_start_radius = max(0.55, start_radius - border)
    inner_end_radius = max(0.55, end_radius - border)
    draw.polygon(
        tapered_polygon(
            inner_start,
            inner_end,
            inner_start_radius,
            inner_end_radius,
        ),
        fill=shadow,
    )

    middle = [
        round_point(offset_point(inner_start, NORMAL_UNIT, -inner_start_radius * 0.28)),
        round_point(offset_point(inner_end, NORMAL_UNIT, -inner_end_radius * 0.28)),
        round_point(offset_point(inner_end, NORMAL_UNIT, inner_end_radius * 0.46)),
        round_point(offset_point(inner_start, NORMAL_UNIT, inner_start_radius * 0.46)),
    ]
    draw.polygon(middle, fill=base)
    upper = [
        round_point(offset_point(inner_start, NORMAL_UNIT, -inner_start_radius)),
        round_point(offset_point(inner_end, NORMAL_UNIT, -inner_end_radius)),
        round_point(offset_point(inner_end, NORMAL_UNIT, -inner_end_radius * 0.28)),
        round_point(offset_point(inner_start, NORMAL_UNIT, -inner_start_radius * 0.28)),
    ]
    draw.polygon(upper, fill=upper_light)
    if size >= 48:
        highlight_start = offset_point(
            inner_start, NORMAL_UNIT, -max(0.5, inner_start_radius * 0.55)
        )
        highlight_end = offset_point(
            inner_end, NORMAL_UNIT, -max(0.5, inner_end_radius * 0.55)
        )
        draw.line((round_point(highlight_start), round_point(highlight_end)), fill=light, width=1)


def fill_oriented_ellipse(
    image: Image.Image,
    center: tuple[float, float],
    axis_radius: float,
    normal_radius: float,
    color: RGBA,
) -> None:
    if axis_radius <= 0 or normal_radius <= 0:
        return
    extent = int(math.ceil(max(axis_radius, normal_radius))) + 2
    center_x, center_y = center
    pixels = image.load()
    for y in range(max(0, int(math.floor(center_y)) - extent), min(image.height, int(math.ceil(center_y)) + extent + 1)):
        for x in range(max(0, int(math.floor(center_x)) - extent), min(image.width, int(math.ceil(center_x)) + extent + 1)):
            delta_x = x - center_x
            delta_y = y - center_y
            along = delta_x * AXIS_UNIT[0] + delta_y * AXIS_UNIT[1]
            normal = delta_x * NORMAL_UNIT[0] + delta_y * NORMAL_UNIT[1]
            normalized = (along / axis_radius) ** 2 + (normal / normal_radius) ** 2
            if normalized <= 1.0:
                pixels[x, y] = color


def draw_lens(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
    layers: tuple[tuple[float, float], ...],
) -> None:
    center = source_to_target_float((29.0, 21.0), size)
    ink = darkest(palette)
    brass_dark = (*palette["brass"][0], 255)
    brass = palette_tone(palette, "brass", 0.58)
    brass_light = brightest(palette, "brass")
    glass_dark = palette_tone(palette, "lens", 0.12)
    glass = palette_tone(palette, "lens", 0.56)
    glass_light = brightest(palette, "lens")

    if size == 16:
        # A bespoke 4x5 glyph is the smallest grid that can preserve the
        # objective's four semantic layers without pretending to be a resize.
        draw = ImageDraw.Draw(image)
        outer_ink = (
            (3, 1),
            (4, 1),
            (2, 2),
            (4, 2),
            (1, 3),
            (4, 3),
            (1, 4),
            (4, 4),
            (2, 5),
            (3, 5),
        )
        brass_pixels = ((3, 2), (2, 3), (2, 4), (3, 4))
        inner_ink = ((3, 3),)
        draw.point(outer_ink, fill=ink)
        draw.point(brass_pixels, fill=brass)
        draw.point(inner_ink, fill=ink)
        draw.point((3, 4), fill=glass)
        draw.point((3, 2), fill=brass_light)
        return

    if len(layers) != 4:
        raise ValueError(f"{size}px lens must declare four nested layer radii")
    outer_radii, brass_radii, inner_radii, glass_radii = layers
    for radii, color in (
        (outer_radii, ink),
        (brass_radii, brass),
        (inner_radii, ink),
        (glass_radii, glass),
    ):
        fill_oriented_ellipse(image, center, radii[0], radii[1], color)

    draw = ImageDraw.Draw(image)
    outer_axis, outer_normal = outer_radii
    glass_axis, glass_normal = glass_radii
    brass_highlight = offset_point(
        offset_point(center, AXIS_UNIT, -outer_axis * 0.34),
        NORMAL_UNIT,
        -outer_normal * 0.70,
    )
    draw.point(round_point(brass_highlight), fill=brass_light)
    if size >= 48:
        brass_shadow = offset_point(
            offset_point(center, AXIS_UNIT, outer_axis * 0.20),
            NORMAL_UNIT,
            outer_normal * 0.72,
        )
        draw.point(round_point(brass_shadow), fill=brass_dark)

    glass_shadow = offset_point(center, NORMAL_UNIT, glass_normal * 0.48)
    draw.point(round_point(glass_shadow), fill=glass_dark)
    highlight = offset_point(
        offset_point(center, AXIS_UNIT, -glass_axis * 0.22),
        NORMAL_UNIT,
        -glass_normal * 0.42,
    )
    draw.point(round_point(highlight), fill=glass_light)
    if size >= 64:
        second_highlight = offset_point(highlight, NORMAL_UNIT, -1.0)
        draw.point(round_point(second_highlight), fill=glass_light)


def draw_band(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
    position: float,
    tube_radius: float,
) -> None:
    start = source_to_target_float((33.0, 22.5), size)
    end = source_to_target_float((80.0, 43.0), size)
    center = (
        start[0] + (end[0] - start[0]) * position,
        start[1] + (end[1] - start[1]) * position,
    )
    half_thickness = 0.7 if size <= 48 else 1.0 if size == 64 else 1.45
    half_span = tube_radius + (0.35 if size >= 48 else 0.0)
    corners = [
        offset_point(offset_point(center, AXIS_UNIT, -half_thickness), NORMAL_UNIT, -half_span),
        offset_point(offset_point(center, AXIS_UNIT, half_thickness), NORMAL_UNIT, -half_span),
        offset_point(offset_point(center, AXIS_UNIT, half_thickness), NORMAL_UNIT, half_span),
        offset_point(offset_point(center, AXIS_UNIT, -half_thickness), NORMAL_UNIT, half_span),
    ]
    draw = ImageDraw.Draw(image)
    draw.polygon([round_point(point) for point in corners], fill=darkest(palette))
    if size >= 32:
        inner_half = max(0.25, half_thickness - 0.55)
        inner_span = max(0.5, half_span - 0.8)
        inner = [
            offset_point(offset_point(center, AXIS_UNIT, -inner_half), NORMAL_UNIT, -inner_span),
            offset_point(offset_point(center, AXIS_UNIT, inner_half), NORMAL_UNIT, -inner_span),
            offset_point(offset_point(center, AXIS_UNIT, inner_half), NORMAL_UNIT, inner_span),
            offset_point(offset_point(center, AXIS_UNIT, -inner_half), NORMAL_UNIT, inner_span),
        ]
        draw.polygon(
            [round_point(point) for point in inner],
            fill=palette_tone(palette, "brass", 0.58),
        )


def draw_disc(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    radius: int,
    color: RGBA,
) -> None:
    if radius <= 0:
        draw.point(center, fill=color)
        return
    draw.ellipse(
        (
            center[0] - radius,
            center[1] - radius,
            center[0] + radius,
            center[1] + radius,
        ),
        fill=color,
    )


def draw_tripod(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
    plan: dict[str, object],
) -> None:
    draw = ImageDraw.Draw(image)
    ink = darkest(palette)
    leg_core = palette_tone(palette, "ivory", 0.38)
    brass = palette_tone(palette, "brass", 0.62)
    brass_light = brightest(palette, "brass")
    outer_width, core_width = plan["leg_widths"]
    apex = scale_point((63, 66), size)

    for leg in TELESCOPE_SPEC["legs"]:
        points = [scale_point(point, size) for point in leg]
        draw.line(points, fill=ink, width=int(outer_width), joint="curve")
        if int(core_width) > 0:
            draw.line(points, fill=leg_core, width=int(core_width), joint="curve")

    if bool(plan["brace"]):
        brace = [scale_point(point, size) for point in TELESCOPE_SPEC["brace"]]
        draw.line(brace, fill=ink, width=max(1, int(outer_width) - 1))
        draw.line(brace, fill=brass, width=1)

    foot_width = 1 if size <= 32 else 2 if size <= 64 else 3
    for foot in TELESCOPE_SPEC["feet"]:
        foot_x, foot_y = scale_point(foot, size)
        draw.line((foot_x - foot_width, foot_y, foot_x + foot_width, foot_y), fill=ink, width=1)
        draw.point((foot_x, foot_y), fill=brass_light)

    neck_top = scale_point((65, 49), size)
    neck_width = 1 if size == 16 else 2 if size == 32 else 3 if size <= 64 else 5
    draw.line((neck_top, apex), fill=ink, width=neck_width)
    if size >= 32:
        draw.line((neck_top, apex), fill=brass, width=max(1, neck_width - 2))

    mount_radius = 0 if size == 16 else 2 if size == 32 else 3 if size == 48 else 4 if size == 64 else 6
    draw_disc(draw, apex, mount_radius, ink)
    if size >= 32:
        draw_disc(draw, apex, max(0, mount_radius - 1), brass)
        draw.point(apex, fill=brass_light)

    if size >= 64:
        handle_start = scale_point((69, 61), size)
        handle_end = scale_point((86, 70), size)
        draw.line((handle_start, handle_end), fill=ink, width=max(1, int(outer_width) - 1))
        draw.line((handle_start, handle_end), fill=brass, width=1)


def draw_focus_assembly(
    image: Image.Image,
    size: int,
    palette: dict[str, tuple[RGB, ...]],
    enabled: bool,
) -> None:
    draw = ImageDraw.Draw(image)
    ink = darkest(palette)
    brass = palette_tone(palette, "brass", 0.48)
    steel = palette_tone(palette, "steel", 0.52)

    if size == 16:
        draw.point(scale_point((84, 48), size), fill=brass)
        return

    housing_start = source_to_target_float((78.0, 43.0), size)
    housing_end = source_to_target_float((95.0, 50.5), size)
    outer_start = max(1.1, 5.0 * size / MASTER_SIZE)
    outer_end = max(0.9, 3.3 * size / MASTER_SIZE)
    draw.polygon(
        tapered_polygon(housing_start, housing_end, outer_start, outer_end),
        fill=ink,
    )
    inner_start = max(0.55, outer_start - 1.0)
    inner_end = max(0.45, outer_end - 0.8)
    draw.polygon(
        tapered_polygon(housing_start, housing_end, inner_start, inner_end),
        fill=brass,
    )

    eyepiece_start = source_to_target_float((94.0, 50.0), size)
    eyepiece_end = source_to_target_float((105.0, 54.0), size)
    eyepiece_radius = max(0.75, 2.8 * size / MASTER_SIZE)
    draw.polygon(
        tapered_polygon(
            eyepiece_start,
            eyepiece_end,
            eyepiece_radius,
            max(0.55, eyepiece_radius * 0.72),
        ),
        fill=ink,
    )
    draw.line((round_point(eyepiece_start), round_point(eyepiece_end)), fill=steel, width=1)

    if not enabled:
        return
    knob_radius = 1 if size <= 48 else 2 if size == 64 else 3
    for knob in ((86, 54), (92, 47)):
        center = scale_point(knob, size)
        draw_disc(draw, center, knob_radius, ink)
        draw.point(center, fill=brass)


def render_telescope_tier(
    size: int,
    palette: dict[str, tuple[RGB, ...]],
) -> Image.Image:
    """Rasterize one target grid from the telescope semantic part graph."""
    plan = TIER_RENDER_PLAN[size]
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    draw_tripod(result, size, palette, plan)
    tube_start_radius, tube_end_radius = plan["tube_radii"]
    draw_tapered_tube(
        result,
        size,
        palette,
        (31.5, 21.5),
        (82.0, 44.0),
        float(tube_start_radius),
        float(tube_end_radius),
    )
    for position in plan["bands"]:
        interpolated_radius = float(tube_start_radius) + (
            float(tube_end_radius) - float(tube_start_radius)
        ) * float(position)
        draw_band(result, size, palette, float(position), interpolated_radius)
    draw_focus_assembly(result, size, palette, bool(plan["focus"]))
    draw_lens(result, size, palette, plan["lens_layers"])

    pixels = result.load()
    for y in range(size):
        for x in range(size):
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (red, green, blue, 255) if alpha else (0, 0, 0, 0)
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
    if color_count(image) > PALETTE_LIMITS[size]:
        errors.append(
            f"palette={color_count(image)}, limit={PALETTE_LIMITS[size]}"
        )
    if color_count(image) < PALETTE_MINIMUMS[size]:
        errors.append(
            f"palette={color_count(image)}, minimum={PALETTE_MINIMUMS[size]}"
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

    draw.text((44, 30), "HustleK Telescope - Native-grid Reraster Tiers v3", fill=white, font=font_title)
    draw.text(
        (44, 75),
        "One semantic part graph, independently rasterized on every target pixel grid",
        fill=muted,
        font=font_body,
    )
    draw.text(
        (44, 102),
        "Cyan = native-grid renderer only; amber = plain resize only; both shown at identical zoom",
        fill=muted,
        font=font_small,
    )

    column_left = 170
    column_width = 286
    row_specs = (
        ("Native-grid asset 1x", 155, 150),
        ("Native-grid integer zoom", 335, 245),
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
                f"lens {metric['blue_lens_pixels']}px | "
                f"redraw {metric['nearest_alpha_diff']:.0%} | "
                f"{metric['palette_count']}c"
            )
        draw.text((center, 1162), summary, fill=muted, font=font_small, anchor="mm")

    draw.text(
        (44, 1210),
        "Derived geometry uses semantic primitives only; the locked 128px raster supplies palette tokens and identity provenance.",
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
    tier_palettes: dict[int, dict[str, tuple[RGB, ...]]],
    baselines: dict[int, Image.Image],
) -> dict[str, object]:
    metrics: dict[int, dict[str, object]] = {}
    hard_errors: list[str] = []
    resize_similarity_diagnostics: list[str] = []
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
            "lens_material_pixels": lens_material_counts(image, size),
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
                resize_similarity_diagnostics.append(
                    f"{size}px native redesign vs master IoU {shape_iou:.4f}"
                )
            if same_canvas_iou < SAME_CANVAS_IOU_FLOORS[size]:
                resize_similarity_diagnostics.append(
                    f"{size}px native redesign vs NEAREST IoU {same_canvas_iou:.4f}"
                )
            if centroid_delta > CENTROID_DELTA_LIMITS[size]:
                resize_similarity_diagnostics.append(
                    f"{size}px native redesign vs NEAREST centroid delta {centroid_delta:.4f}"
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
        **{
            size: decoded_rgba_sha256(
                render_telescope_tier(size, tier_palettes[size])
            )
            for size in DERIVED_SIZES
        },
        MASTER_SIZE: decoded_rgba_sha256(master),
    }
    reproducible = first_pass == second_pass
    if not reproducible:
        hard_errors.append("two-pass decoded RGBA hashes differ")

    palette_ladder = [color_count(tiers[size]) for size in TIER_SIZES]
    if any(current > following for current, following in zip(palette_ladder, palette_ladder[1:])):
        hard_errors.append(f"palette detail ladder decreases: {palette_ladder}")
    lens_blue_ladder = [lens_blue_pixel_count(tiers[size], size) for size in TIER_SIZES]
    if any(current >= following for current, following in zip(lens_blue_ladder, lens_blue_ladder[1:])):
        hard_errors.append(f"lens blue detail ladder does not increase: {lens_blue_ladder}")

    config_payload = {
        "tiers": TIER_SIZES,
        "tone_budgets": ROLE_TONE_BUDGETS,
        "telescope_spec": TELESCOPE_SPEC,
        "tier_render_plan": TIER_RENDER_PLAN,
    }
    script_path = Path(__file__).resolve()
    experiment_pass = not hard_errors and not difference_warnings
    return {
        "schema_version": 2,
        "status": "PASS" if experiment_pass else "REVISE",
        "scope": "single-asset target-grid rerasterization experiment",
        "design_mode": "telescope-parametric-rerasterizer-v3",
        "compiler_inputs": {
            "geometry": "TELESCOPE_SPEC",
            "tier_plans": "TIER_RENDER_PLAN",
            "palette": "sampled from locked 128px master",
            "master_raster_projection": False,
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
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "reproducibility": {
            "two_pass_decoded_rgba_match": reproducible,
            "first_pass": {str(key): value for key, value in first_pass.items()},
            "second_pass": {str(key): value for key, value in second_pass.items()},
        },
        "hard_errors": hard_errors,
        "validation_basis": (
            "native-grid structure, semantic material presence, landmark continuity, "
            "monotonic detail, deterministic rerender, and difference from plain NEAREST"
        ),
        "resize_similarity_diagnostics": resize_similarity_diagnostics,
        "nearest_difference_warnings": difference_warnings,
        "palette_detail_ladder": palette_ladder,
        "lens_blue_detail_ladder": lens_blue_ladder,
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

    tier_palettes = {
        size: build_tier_palette(master, size) for size in DERIVED_SIZES
    }
    tiers = {
        **{
            size: render_telescope_tier(size, tier_palettes[size])
            for size in DERIVED_SIZES
        },
        MASTER_SIZE: master.copy(),
    }
    baselines = {
        size: master.resize((size, size), Image.Resampling.NEAREST)
        for size in TIER_SIZES
    }
    validation = build_validation(
        master, master_path, master_metadata, tiers, tier_palettes, baselines
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
        "design_mode": "telescope-parametric-rerasterizer-v3",
        "master_raster_projection": "false",
        "geometry_source": "TELESCOPE_SPEC + TIER_RENDER_PLAN",
        "palette_source": "locked 128px master",
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
            f"alpha_redraw={metric['nearest_alpha_diff']:.4f}"
        )


if __name__ == "__main__":
    main()
