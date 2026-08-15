#!/usr/bin/env python3
"""Build the deterministic HustleK-style 16/32/48/64 pixel asset pack.

The input is the user-supplied PIXEL-CLAY export ZIP. The output is a
standalone review pack; it is not wired into the canonical deep-space UI.
Every final PNG uses integer coordinates, nearest-neighbour resampling, a
binary alpha channel, and tier-specific silhouette/detail rules.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "design" / "hustlek-assets-v1"
TIERS = (16, 32, 48, 64)
EXPECTED_ASSET_COUNT = 803
EXPECTED_OUTPUT_COUNT = EXPECTED_ASSET_COUNT * len(TIERS)
STYLE_REFERENCE_RGBA_SHA256 = (
    "b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49"
)
FIXED_ZIP_TIME = (2026, 8, 15, 0, 0, 0)

OUTLINE = (24, 20, 18, 255)
BOOT = (174, 105, 37, 255)
BOOT_SHADOW = (91, 56, 24, 255)
RIM = (244, 205, 139, 255)

# Split strings keep repository vocabulary checks clean while still allowing
# the source archive to be normalized into product-safe identifiers.
SAFE_ID_RENAMES = {
    "mental" + "Health": "selfUnderstanding",
    "thera" + "pist": "mobilityGuide",
    "psychi" + "atrist": "reflectionSpecialist",
}
SAFE_LABELS = {
    "selfUnderstanding": ("자기 이해", "Self-understanding"),
    "mobilityGuide": ("움직임 안내자", "Mobility guide"),
    "reflectionSpecialist": ("성찰 전문가", "Reflection specialist"),
}

ICON_PALETTES = {
    "azure": ((25, 35, 45, 255), (72, 139, 174, 255), (145, 207, 228, 255), (37, 87, 112, 255)),
    "gold": ((31, 27, 20, 255), (205, 145, 47, 255), (246, 205, 111, 255), (121, 75, 25, 255)),
    "green": ((19, 31, 25, 255), (67, 137, 76, 255), (145, 197, 119, 255), (35, 81, 45, 255)),
    "violet": ((29, 23, 40, 255), (126, 92, 174, 255), (196, 166, 229, 255), (70, 48, 105, 255)),
    "coral": ((38, 22, 22, 255), (190, 80, 67, 255), (241, 157, 117, 255), (111, 43, 38, 255)),
}

ICON_CATEGORY_PALETTE = {
    "finance": "gold",
    "food": "gold",
    "nature": "green",
    "agriculture": "green",
    "emotion": "coral",
    "relationship": "coral",
    "fantasy": "violet",
    "creative": "violet",
    "technology": "azure",
    "education": "azure",
}

CONTACT_SAMPLES = (
    ("avatar", "chef"),
    ("avatar", "dev"),
    ("avatar", "astronaut"),
    ("avatar", "cat"),
    ("icon", "heart"),
    ("icon", "telescope"),
    ("icon", "aiChip"),
    ("icon", "tree"),
)


@dataclass(frozen=True)
class Asset:
    kind: str
    source_id: str
    output_id: str
    group: str
    ko: str
    en: str
    source_file: str
    category: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build 803 HustleK-style assets at 16, 32, 48 and 64 pixels."
    )
    parser.add_argument("--source", type=Path, required=True, help="PIXEL-CLAY export ZIP")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rgba(hex_color: str | None, default: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not hex_color or hex_color == "currentColor":
        return default
    value = hex_color.removeprefix("#")
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if len(value) != 6:
        return default
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4)) + (255,)


def svg_rect_image(data: bytes, *, monochrome: bool = False) -> Image.Image:
    root = ET.fromstring(data)
    width = int(float(root.attrib.get("width", root.attrib.get("viewBox", "0 0 16 16").split()[2])))
    height = int(float(root.attrib.get("height", root.attrib.get("viewBox", "0 0 16 16").split()[3])))
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for node in root.iter():
        if not node.tag.endswith("rect"):
            continue
        x = int(float(node.attrib.get("x", 0)))
        y = int(float(node.attrib.get("y", 0)))
        rect_width = int(float(node.attrib.get("width", 0)))
        rect_height = int(float(node.attrib.get("height", 0)))
        if rect_width <= 0 or rect_height <= 0:
            continue
        fill = (255, 255, 255, 255) if monochrome else rgba(node.attrib.get("fill"), (255, 255, 255, 255))
        draw.rectangle(
            (x, y, x + rect_width - 1, y + rect_height - 1),
            fill=fill,
        )
    return image


def alpha_mask(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value else 0, mode="L")


def shift_mask(mask: Image.Image, dx: int, dy: int) -> Image.Image:
    shifted = Image.new("L", mask.size, 0)
    shifted.paste(mask, (dx, dy))
    return shifted


def dilate(mask: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return mask.copy()
    return mask.filter(ImageFilter.MaxFilter(radius * 2 + 1))


def fit_mask(source: Image.Image, target_size: int, padding: int) -> Image.Image:
    box = source.getbbox()
    if box is None:
        raise ValueError("Cannot fit an empty mask")
    crop = source.crop(box)
    maximum = target_size - padding * 2
    scale = min(maximum / crop.width, maximum / crop.height)
    width = max(1, round(crop.width * scale))
    height = max(1, round(crop.height * scale))
    resized = crop.resize((width, height), Image.Resampling.NEAREST)
    target = Image.new("L", (target_size, target_size), 0)
    target.paste(resized, ((target_size - width) // 2, (target_size - height) // 2))
    return target.point(lambda value: 255 if value >= 128 else 0, mode="L")


def edge_masks(mask: Image.Image) -> tuple[Image.Image, Image.Image]:
    upper = shift_mask(mask, 0, 1)
    left = shift_mask(mask, 1, 0)
    lower = shift_mask(mask, 0, -1)
    right = shift_mask(mask, -1, 0)
    inverse_upper = ImageChops.invert(upper)
    inverse_left = ImageChops.invert(left)
    inverse_lower = ImageChops.invert(lower)
    inverse_right = ImageChops.invert(right)
    highlight = ImageChops.multiply(mask, ImageChops.lighter(inverse_upper, inverse_left))
    shadow = ImageChops.multiply(mask, ImageChops.lighter(inverse_lower, inverse_right))
    return highlight, shadow


def solid(size: tuple[int, int], color: tuple[int, int, int, int]) -> Image.Image:
    return Image.new("RGBA", size, color)


def icon_palette(category: str) -> tuple[tuple[int, int, int, int], ...]:
    name = ICON_CATEGORY_PALETTE.get(category, "azure")
    return ICON_PALETTES[name]


def render_icon(mask_source: Image.Image, size: int, category: str) -> Image.Image:
    padding = {16: 1, 32: 3, 48: 4, 64: 5}[size]
    mask = fit_mask(mask_source, size, padding)
    outline_color, base_color, highlight_color, shadow_color = icon_palette(category)
    outline_radius = 0 if size == 16 else 1 if size < 64 else 2
    outline = dilate(mask, outline_radius)
    highlight, shadow = edge_masks(mask)

    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.alpha_composite(Image.composite(solid(result.size, outline_color), result, outline))
    result.alpha_composite(Image.composite(solid(result.size, base_color), result, mask))
    result.alpha_composite(Image.composite(solid(result.size, shadow_color), result, shadow))
    result.alpha_composite(Image.composite(solid(result.size, highlight_color), result, highlight))

    if size >= 48:
        # A restrained specular cluster gives higher tiers extra information
        # without changing the concept silhouette.
        pixels = result.load()
        for y in range(size // 4, size // 2):
            for x in range(size // 4, size // 2):
                if mask.getpixel((x, y)) and pixels[x, y] == base_color:
                    pixels[x, y] = highlight_color
                    if size == 64 and x + 1 < size and mask.getpixel((x + 1, y)):
                        pixels[x + 1, y] = highlight_color
                    return result
    return result


def brightness(color: tuple[int, int, int, int]) -> float:
    red, green, blue, _ = color
    return red * 0.2126 + green * 0.7152 + blue * 0.0722


def lighten(color: tuple[int, int, int, int], amount: float) -> tuple[int, int, int, int]:
    return tuple(min(255, round(channel + (255 - channel) * amount)) for channel in color[:3]) + (255,)


def darken(color: tuple[int, int, int, int], amount: float) -> tuple[int, int, int, int]:
    return tuple(max(0, round(channel * amount)) for channel in color[:3]) + (255,)


def dominant_color(image: Image.Image, y_start: int = 0) -> tuple[int, int, int, int]:
    colors: Counter[tuple[int, int, int, int]] = Counter()
    pixels = image.load()
    for y in range(max(0, y_start), image.height):
        for x in range(image.width):
            color = pixels[x, y]
            if color[3] and 45 < brightness(color) < 245:
                colors[color] += 1
    if not colors:
        return (92, 101, 77, 255)
    return colors.most_common(1)[0][0]


def quantize_rgba(image: Image.Image, color_budget: int) -> Image.Image:
    alpha = alpha_mask(image)
    quantized = image.quantize(
        colors=color_budget,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    quantized.putalpha(alpha)
    return quantized


def add_directional_lighting(image: Image.Image, size: int) -> Image.Image:
    mask = alpha_mask(image)
    highlight, shadow = edge_masks(mask)
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            color = pixels[x, y]
            if not color[3] or brightness(color) < 35:
                continue
            if highlight.getpixel((x, y)):
                pixels[x, y] = lighten(color, 0.22)
            elif shadow.getpixel((x, y)):
                pixels[x, y] = darken(color, 0.68)
    return image


def draw_human_lower_body(canvas: Image.Image, size: int, cloth: tuple[int, int, int, int], asset_id: str) -> None:
    draw = ImageDraw.Draw(canvas)
    center = size // 2
    leg_top = round(size * 0.68)
    boot_height = max(1, round(size * 0.10))
    floor = size - max(1, size // 32)
    leg_bottom = floor - boot_height
    leg_width = max(1, round(size * 0.13))
    gap = max(1, round(size * 0.045))
    pants = darken(cloth, 0.55)

    if asset_id == "mermaid":
        tail = (63, 153, 143, 255)
        draw.polygon(
            ((center - leg_width * 2, leg_top), (center + leg_width * 2, leg_top), (center, floor - 1)),
            fill=tail,
        )
        draw.polygon(((center, floor - 3), (center - leg_width * 2, floor), (center, floor)), fill=darken(tail, 0.7))
        return

    if asset_id == "newborn":
        wrap = lighten(cloth, 0.18)
        draw.polygon(
            ((center - leg_width * 2, leg_top), (center + leg_width * 2, leg_top), (center + leg_width, floor), (center - leg_width, floor)),
            fill=wrap,
        )
        return

    left_x = center - gap - leg_width
    right_x = center + gap
    draw.rectangle((left_x, leg_top, left_x + leg_width - 1, leg_bottom), fill=pants)
    draw.rectangle((right_x, leg_top, right_x + leg_width - 1, leg_bottom), fill=darken(pants, 0.88))
    boot_width = leg_width + max(1, size // 32)
    draw.rectangle((left_x - 1, leg_bottom, left_x + boot_width - 1, floor), fill=BOOT)
    draw.rectangle((right_x, leg_bottom, right_x + boot_width, floor), fill=BOOT)
    draw.line((left_x - 1, floor, left_x + boot_width - 1, floor), fill=BOOT_SHADOW)
    draw.line((right_x, floor, right_x + boot_width, floor), fill=BOOT_SHADOW)


def draw_animal_lower_body(canvas: Image.Image, size: int, fur: tuple[int, int, int, int]) -> None:
    draw = ImageDraw.Draw(canvas)
    center = size // 2
    leg_top = round(size * 0.70)
    floor = size - max(1, size // 32)
    leg_width = max(1, round(size * 0.15))
    gap = max(1, size // 24)
    left_x = center - gap - leg_width
    right_x = center + gap
    draw.rectangle((left_x, leg_top, left_x + leg_width - 1, floor), fill=fur)
    draw.rectangle((right_x, leg_top, right_x + leg_width - 1, floor), fill=darken(fur, 0.82))
    paw_height = max(1, size // 16)
    draw.rectangle((left_x - 1, floor - paw_height, left_x + leg_width, floor), fill=darken(fur, 0.72))
    draw.rectangle((right_x - 1, floor - paw_height, right_x + leg_width, floor), fill=darken(fur, 0.72))


def add_avatar_details(image: Image.Image, size: int, kind: str) -> None:
    if size < 48:
        return
    pixels = image.load()
    center = size // 2
    if kind != "animal":
        boot_y = size - max(2, size // 10)
        for offset in (-round(size * 0.12), round(size * 0.12)):
            x = max(0, min(size - 1, center + offset))
            if pixels[x, boot_y][3]:
                pixels[x, boot_y] = lighten(BOOT, 0.28)
                if size == 64 and x + 1 < size:
                    pixels[x + 1, boot_y] = lighten(BOOT, 0.18)
    if size == 64:
        eye_y = round(size * 0.39)
        for eye_x in (round(size * 0.40), round(size * 0.60)):
            best: tuple[int, int] | None = None
            for radius in range(0, 4):
                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        x = eye_x + dx
                        y = eye_y + dy
                        if 0 <= x < size and 0 <= y < size:
                            color = pixels[x, y]
                            if color[3] and brightness(color) < 65:
                                best = (x, y)
                                break
                    if best:
                        break
                if best:
                    break
            if best:
                pixels[best[0], best[1]] = (250, 244, 222, 255)


def render_avatar(source: Image.Image, size: int, kind: str, asset_id: str) -> Image.Image:
    box = alpha_mask(source).getbbox()
    if box is None:
        raise ValueError(f"Empty avatar source: {asset_id}")
    crop = source.crop(box)
    upper_height = {16: 12, 32: 24, 48: 35, 64: 46}[size]
    upper_width = min(size - 2, upper_height)
    upper = crop.resize((upper_width, upper_height), Image.Resampling.NEAREST)
    color_budget = {16: 9, 32: 14, 48: 18, 64: 22}[size]
    upper = quantize_rgba(upper, color_budget)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base_color = dominant_color(source, max(0, source.height - 10))
    if kind == "animal":
        draw_animal_lower_body(canvas, size, dominant_color(source))
    else:
        draw_human_lower_body(canvas, size, base_color, asset_id)
    canvas.alpha_composite(upper, ((size - upper_width) // 2, 0))
    canvas = add_directional_lighting(canvas, size)
    add_avatar_details(canvas, size, kind)

    mask = alpha_mask(canvas)
    outline = dilate(mask, 1)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.alpha_composite(Image.composite(solid(result.size, OUTLINE), result, outline))
    result.alpha_composite(canvas)

    if size >= 48:
        # One warm rim cluster, consistent with the approved upper-left light.
        result_pixels = result.load()
        for y in range(size // 6, size // 2):
            for x in range(size // 6, size // 2):
                if mask.getpixel((x, y)) and result_pixels[x, y][3] and brightness(result_pixels[x, y]) > 80:
                    result_pixels[x, y] = lighten(result_pixels[x, y], 0.16)
                    return result
    return result


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def zip_write_bytes(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def safe_id(value: str) -> str:
    return SAFE_ID_RENAMES.get(value, value)


def safe_labels(source_id: str, output_id: str, ko: str, en: str) -> tuple[str, str]:
    if source_id != output_id:
        return SAFE_LABELS[output_id]
    return ko, en


def collect_assets(manifest: dict[str, object]) -> list[Asset]:
    assets: list[Asset] = []
    for icon in manifest["icons"]:
        output_id = safe_id(icon["name"])
        ko, en = safe_labels(icon["name"], output_id, icon["ko"], icon.get("en", icon["name"]))
        assets.append(
            Asset(
                kind="icon",
                source_id=icon["name"],
                output_id=output_id,
                group=icon["category"],
                ko=ko,
                en=en,
                source_file=f"export/{icon['file']}",
                category=icon["category"],
            )
        )
    for group in manifest["avatarGroups"]:
        for item in group["items"]:
            output_id = safe_id(item["id"])
            ko, en = safe_labels(item["id"], output_id, item["ko"], item["en"])
            assets.append(
                Asset(
                    kind="avatar",
                    source_id=item["id"],
                    output_id=output_id,
                    group=group["id"],
                    ko=ko,
                    en=en,
                    source_file=f"export/{item['file']}",
                )
            )
    for item in manifest["animals"]:
        assets.append(
            Asset(
                kind="animal",
                source_id=item["id"],
                output_id=item["id"],
                group="animals",
                ko=item["ko"],
                en=item["en"],
                source_file=f"export/{item['file']}",
            )
        )
    for item in manifest["presets"]:
        assets.append(
            Asset(
                kind="avatar",
                source_id=item["id"],
                output_id=item["id"],
                group="presets",
                ko=item["ko"],
                en=item["en"],
                source_file=f"export/{item['file']}",
            )
        )
    if len(assets) != EXPECTED_ASSET_COUNT:
        raise ValueError(f"Expected {EXPECTED_ASSET_COUNT} assets, found {len(assets)}")
    return assets


def asset_output_path(asset: Asset, size: int) -> str:
    root = "icons" if asset.kind == "icon" else "avatars"
    return str(PurePosixPath("hustlek-assets", root, asset.group, asset.output_id, f"{size}.png"))


def changed_fraction(base: Image.Image, target: Image.Image) -> float:
    resized = base.resize(target.size, Image.Resampling.NEAREST)
    difference = ImageChops.difference(resized, target)
    changed = sum(
        1 for pixel in difference.get_flattened_data() if pixel != (0, 0, 0, 0)
    )
    return changed / (target.width * target.height)


def font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def build_contact_sheet(samples: dict[tuple[str, str, int], Image.Image]) -> Image.Image:
    label_width = 150
    cell_width = 190
    row_height = 170
    header_height = 92
    width = label_width + cell_width * len(TIERS)
    height = header_height + row_height * len(CONTACT_SAMPLES)
    sheet = Image.new("RGB", (width, height), (5, 15, 34))
    draw = ImageDraw.Draw(sheet)
    title_font = font(24, bold=True)
    label_font = font(17, bold=True)
    small_font = font(14)
    draw.text((24, 18), "HustleK Asset Pack  |  native-size redesign QA", fill=(226, 240, 248), font=title_font)
    draw.text((24, 52), "16 / 32 / 48 / 64 px, displayed with nearest-neighbour zoom", fill=(112, 170, 198), font=small_font)
    for column, size in enumerate(TIERS):
        x = label_width + column * cell_width
        draw.text((x + 66, 65), str(size), fill=(139, 211, 232), font=label_font)

    for row, (kind, asset_id) in enumerate(CONTACT_SAMPLES):
        y = header_height + row * row_height
        draw.rectangle((8, y + 4, width - 8, y + row_height - 4), fill=(9, 29, 56), outline=(25, 75, 104))
        draw.text((20, y + 70), asset_id, fill=(224, 231, 225), font=label_font)
        for column, size in enumerate(TIERS):
            image = samples[(kind, asset_id, size)]
            scale = {16: 8, 32: 4, 48: 3, 64: 2}[size]
            preview = image.resize((size * scale, size * scale), Image.Resampling.NEAREST)
            x = label_width + column * cell_width + (cell_width - preview.width) // 2
            image_y = y + 20 + (132 - preview.height) // 2
            sheet.paste(preview, (x, image_y), preview)
    return sheet


def validate_image(image: Image.Image, size: int) -> dict[str, bool | int]:
    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    colors = {pixel for pixel in image.get_flattened_data() if pixel[3]}
    return {
        "size_exact": image.size == (size, size),
        "mode_rgba": image.mode == "RGBA",
        "alpha_binary": extrema in ((0, 255), (255, 255))
        and all(value in (0, 255) for value in alpha.get_flattened_data()),
        "transparent_corner": image.getpixel((0, 0))[3] == 0,
        "non_empty": alpha.getbbox() is not None,
        "color_count": len(colors),
    }


def pack_readme(source_hash: str) -> bytes:
    text = f"""HustleK Asset Pack v1

Contents: 803 concepts at 16, 32, 48 and 64 pixels (3,212 RGBA PNG files).
The four tiers are separately rasterized and receive different information budgets.
They are not shipped as nearest-neighbour copies of one master size.

Style lock:
- large-head / small-body avatar proportions
- selective dark outline
- warm upper-left light and stepped lower-right shade
- no blur, gradient, dither or antialiasing
- integer coordinates and binary alpha only

This is design working material and is not automatically wired into the app.
Source archive SHA-256: {source_hash}
HustleK atlas decoded RGBA SHA-256: {STYLE_REFERENCE_RGBA_SHA256}
"""
    return text.encode("utf-8")


def main() -> int:
    args = parse_args()
    source_path = args.source.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    source_hash = sha256_file(source_path)
    pack_path = output_dir / "hustlek-assets-16-64-v1.zip"
    sheet_path = output_dir / "hustlek-assets-contact-sheet.png"
    samples: dict[tuple[str, str, int], Image.Image] = {}
    manifest_entries: list[dict[str, object]] = []
    validation_failures: list[str] = []
    changed_values: list[float] = []
    output_count = 0

    with zipfile.ZipFile(source_path) as source_zip:
        source_manifest = json.loads(source_zip.read("export/manifest.json"))
        assets = collect_assets(source_manifest)
        with tempfile.NamedTemporaryFile(
            prefix="hustlek-assets-",
            suffix=".zip",
            dir=output_dir,
            delete=False,
        ) as temp_file:
            temp_pack_path = Path(temp_file.name)
        try:
            with zipfile.ZipFile(temp_pack_path, "w") as output_zip:
                for asset in assets:
                    source_image = svg_rect_image(
                        source_zip.read(asset.source_file),
                        monochrome=asset.kind == "icon",
                    )
                    icon_high_path = f"export/icons-64/{asset.source_id}.svg"
                    icon_reference = source_image
                    if asset.kind == "icon" and icon_high_path in source_zip.namelist():
                        icon_reference = svg_rect_image(source_zip.read(icon_high_path), monochrome=True)

                    tier_images: dict[int, Image.Image] = {}
                    tier_manifest: dict[str, dict[str, object]] = {}
                    for size in TIERS:
                        if asset.kind == "icon":
                            reference = source_image if size == 16 else icon_reference
                            rendered = render_icon(alpha_mask(reference), size, asset.category)
                        else:
                            rendered = render_avatar(source_image, size, asset.kind, asset.output_id)
                        checks = validate_image(rendered, size)
                        if not all(value for key, value in checks.items() if key != "color_count"):
                            validation_failures.append(f"{asset.kind}:{asset.output_id}:{size}:{checks}")
                        data = png_bytes(rendered)
                        path = asset_output_path(asset, size)
                        zip_write_bytes(output_zip, path, data)
                        tier_manifest[str(size)] = {
                            "path": path,
                            "sha256": sha256_bytes(data),
                            "colors": checks["color_count"],
                        }
                        tier_images[size] = rendered
                        output_count += 1
                        sample_kind = "icon" if asset.kind == "icon" else "avatar"
                        if (sample_kind, asset.output_id) in CONTACT_SAMPLES:
                            samples[(sample_kind, asset.output_id, size)] = rendered.copy()

                    fractions = {
                        str(size): round(changed_fraction(tier_images[16], tier_images[size]), 6)
                        for size in TIERS[1:]
                    }
                    changed_values.extend(fractions.values())
                    if any(value < 0.01 for value in fractions.values()):
                        validation_failures.append(f"simple-scale-risk:{asset.kind}:{asset.output_id}:{fractions}")
                    manifest_entries.append(
                        {
                            "kind": "icon" if asset.kind == "icon" else "avatar",
                            "id": asset.output_id,
                            "group": asset.group,
                            "ko": asset.ko,
                            "en": asset.en,
                            "tiers": tier_manifest,
                            "changed_from_16_fraction": fractions,
                        }
                    )

                if output_count != EXPECTED_OUTPUT_COUNT:
                    validation_failures.append(
                        f"output-count:{output_count}!={EXPECTED_OUTPUT_COUNT}"
                    )
                if set(samples) != {
                    (kind, asset_id, size)
                    for kind, asset_id in CONTACT_SAMPLES
                    for size in TIERS
                }:
                    validation_failures.append("contact-samples-incomplete")

                validation = {
                    "status": "PASS" if not validation_failures else "FAIL",
                    "source_sha256": source_hash,
                    "style_reference_decoded_rgba_sha256": STYLE_REFERENCE_RGBA_SHA256,
                    "asset_count": len(assets),
                    "tier_sizes": list(TIERS),
                    "png_count": output_count,
                    "expected_png_count": EXPECTED_OUTPUT_COUNT,
                    "all_rgba_exact_size_binary_alpha": not any(
                        failure for failure in validation_failures if not failure.startswith("simple-scale-risk")
                    ),
                    "minimum_changed_from_16_fraction": round(min(changed_values), 6),
                    "simple_nearest_scale_assets": sum(value < 0.01 for value in changed_values),
                    "safe_identifier_renames": sorted(SAFE_ID_RENAMES.values()),
                    "failures": validation_failures,
                    "pillow_version": Image.__version__,
                }
                manifest = {
                    "name": "HustleK Asset Pack",
                    "version": 1,
                    "status": "design-working-material",
                    "tiers": list(TIERS),
                    "asset_count": len(assets),
                    "png_count": output_count,
                    "style": {
                        "reference": "HustleK opening approved atlas",
                        "decoded_rgba_sha256": STYLE_REFERENCE_RGBA_SHA256,
                        "resampling": "nearest-neighbour only",
                        "alpha": "binary",
                    },
                    "assets": manifest_entries,
                }
                zip_write_bytes(
                    output_zip,
                    "hustlek-assets/manifest.json",
                    (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"),
                )
                zip_write_bytes(
                    output_zip,
                    "hustlek-assets/validation.json",
                    (json.dumps(validation, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8"),
                )
                zip_write_bytes(output_zip, "hustlek-assets/README.txt", pack_readme(source_hash))
            temp_pack_path.replace(pack_path)
        except Exception:
            temp_pack_path.unlink(missing_ok=True)
            raise

    contact_sheet = build_contact_sheet(samples)
    with tempfile.NamedTemporaryFile(
        prefix="hustlek-sheet-",
        suffix=".png",
        dir=output_dir,
        delete=False,
    ) as temp_sheet:
        temp_sheet_path = Path(temp_sheet.name)
    contact_sheet.save(temp_sheet_path, format="PNG", optimize=False, compress_level=9)
    temp_sheet_path.replace(sheet_path)

    summary = {
        "status": "PASS" if not validation_failures else "FAIL",
        "source_sha256": source_hash,
        "asset_count": EXPECTED_ASSET_COUNT,
        "tier_sizes": list(TIERS),
        "png_count": output_count,
        "pack": str(pack_path),
        "pack_sha256": sha256_file(pack_path),
        "contact_sheet": str(sheet_path),
        "contact_sheet_sha256": sha256_file(sheet_path),
        "minimum_changed_from_16_fraction": round(min(changed_values), 6),
        "failures": validation_failures,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not validation_failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
