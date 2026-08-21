#!/usr/bin/env python3
"""Build a deterministic review sheet from the production HustleK composition atlases."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
AVATAR_ATLAS_PATH = ROOT / "design/hustlek-composition-v1/avatar-layers-atlas.png"
ATTACHMENT_ATLAS_PATH = ROOT / "design/hustlek-composition-v1/icon-attachments-atlas.png"
OUTPUT_PATH = ROOT / "design/hustlek-composition-v1/composition-preview.png"

CANVAS = 128
CARD_WIDTH = 176
CARD_HEIGHT = 184
HEADER_HEIGHT = 56
GRID_COLUMNS = 4
LAYER_Z = {
    "base": 30,
    "garment": 40,
    "hair": 50,
    "face": 60,
    "headwear": 70,
    "extra": 90,
}
SAMPLES = (
    ("Plain identity", "avatars/presets/plain", None, ()),
    ("Plain + Chef role", "avatars/presets/plain", "avatars/food/chef", ()),
    ("Plain + Wizard role", "avatars/presets/plain", "avatars/fantasy/wizard", ()),
    ("Cat identity", "avatars/animals/cat", None, ()),
    ("Crown + ID badge", "avatars/presets/plain", None, ("icons/crown", "icons/idBadge")),
    ("Wrench tool", "avatars/presets/plain", None, ("icons/wrench",)),
    ("Fisher + telescope", "avatars/presets/plain", "avatars/agriculture/fisher", ("icons/telescope",)),
    ("Demon + ring", "avatars/presets/plain", "avatars/fantasy/demon", ("icons/ring",)),
)


def crop_tuple(value: object) -> tuple[int, int, int, int]:
    if isinstance(value, list) and len(value) == 4:
        return tuple(int(item) for item in value)
    if isinstance(value, dict):
        return tuple(int(value[key]) for key in ("x", "y", "w", "h"))
    raise ValueError(f"unsupported atlas crop: {value!r}")


def paste_rgba(target: Image.Image, source: Image.Image, position: tuple[int, int] = (0, 0)) -> None:
    target.alpha_composite(source, position)


def compose(
    avatar_by_id: dict[str, dict],
    icon_by_id: dict[str, dict],
    avatar_atlas: Image.Image,
    attachment_atlas: Image.Image,
    base_id: str,
    role_id: str | None,
    attachment_ids: tuple[str, ...],
) -> Image.Image:
    base = avatar_by_id[base_id]
    role = avatar_by_id[role_id or base_id]
    layers = []
    for order, layer_id in enumerate(("base", "garment", "hair", "face", "headwear", "extra")):
        donor = base if layer_id in ("base", "face") else role
        record = donor["composable_native128"]["layers"][layer_id]
        crop = crop_tuple(record["atlas_crop"])
        tile = avatar_atlas.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        layers.append((LAYER_Z[layer_id], order, tile))

    for order, asset_id in enumerate(attachment_ids, start=100):
        attachment = icon_by_id[asset_id]["composition"]["attachment"]
        if attachment is None or attachment["native128_variant"]["status"] != "ready":
            raise ValueError(f"attachment is not ready: {asset_id}")
        crop = crop_tuple(attachment["native128_variant"]["atlas_crop"])
        tile = attachment_atlas.crop(
            (crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3])
        )
        layers.append((int(attachment["z"]), order, tile))

    result = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    for _, _, tile in sorted(layers, key=lambda item: (item[0], item[1])):
        paste_rgba(result, tile)
    return result


def draw_checker(draw: ImageDraw.ImageDraw, left: int, top: int) -> None:
    colors = ((10, 27, 49, 255), (13, 34, 58, 255))
    for y in range(0, CANVAS, 8):
        for x in range(0, CANVAS, 8):
            draw.rectangle(
                (left + x, top + y, left + x + 7, top + y + 7),
                fill=colors[(x // 8 + y // 8) % 2],
            )


def build_preview() -> Image.Image:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if catalog["counts"]["canonical_total"] != 803:
        raise ValueError("composition catalog is not the approved 803-asset inventory")
    if catalog["counts"]["avatar_layers_ready"] != 270:
        raise ValueError("all 270 avatar layer sets must be ready")
    if catalog["counts"]["icon_attachment_variants_ready"] != 267:
        raise ValueError("all 267 attachment variants must be ready")

    avatar_by_id = {item["asset_id"]: item for item in catalog["avatars"]}
    icon_by_id = {item["asset_id"]: item for item in catalog["icons"]}
    rows = (len(SAMPLES) + GRID_COLUMNS - 1) // GRID_COLUMNS
    preview = Image.new(
        "RGBA",
        (CARD_WIDTH * GRID_COLUMNS, HEADER_HEIGHT + CARD_HEIGHT * rows),
        (5, 15, 31, 255),
    )
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    draw.text((16, 12), "HustleK native128 composition", fill=(237, 220, 175, 255), font=font)
    draw.text(
        (16, 31),
        "identity (base + face) / role layers / attachment slots",
        fill=(113, 174, 211, 255),
        font=font,
    )

    with Image.open(AVATAR_ATLAS_PATH) as source_avatar, Image.open(
        ATTACHMENT_ATLAS_PATH
    ) as source_attachment:
        avatar_atlas = source_avatar.convert("RGBA")
        attachment_atlas = source_attachment.convert("RGBA")
        for index, (label, base_id, role_id, attachment_ids) in enumerate(SAMPLES):
            column = index % GRID_COLUMNS
            row = index // GRID_COLUMNS
            card_left = column * CARD_WIDTH
            card_top = HEADER_HEIGHT + row * CARD_HEIGHT
            sprite_left = card_left + (CARD_WIDTH - CANVAS) // 2
            sprite_top = card_top + 8
            draw.rounded_rectangle(
                (card_left + 4, card_top + 4, card_left + CARD_WIDTH - 5, card_top + CARD_HEIGHT - 5),
                radius=3,
                fill=(7, 22, 41, 255),
                outline=(27, 63, 91, 255),
                width=1,
            )
            draw_checker(draw, sprite_left, sprite_top)
            sprite = compose(
                avatar_by_id,
                icon_by_id,
                avatar_atlas,
                attachment_atlas,
                base_id,
                role_id,
                attachment_ids,
            )
            paste_rgba(preview, sprite, (sprite_left, sprite_top))
            draw.text(
                (card_left + 12, card_top + 145),
                label,
                fill=(236, 231, 216, 255),
                font=font,
            )
            detail = f"{base_id.split('/')[-1]}"
            if role_id:
                detail += f" / {role_id.split('/')[-1]}"
            if attachment_ids:
                detail += f" / +{len(attachment_ids)}"
            draw.text(
                (card_left + 12, card_top + 162),
                detail,
                fill=(113, 174, 211, 255),
                font=font,
            )
    return preview


def encoded_png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = encoded_png(build_preview())
    if args.check:
        if not OUTPUT_PATH.exists() or OUTPUT_PATH.read_bytes() != generated:
            raise SystemExit("FAIL composition preview is missing or stale")
        print("PASS composition preview matches the production catalog and atlases")
        return
    temporary = OUTPUT_PATH.with_suffix(".png.tmp")
    temporary.write_bytes(generated)
    temporary.replace(OUTPUT_PATH)
    print(f"WROTE {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
