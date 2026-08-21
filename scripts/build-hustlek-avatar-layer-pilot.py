#!/usr/bin/env python3
"""Build and verify the first lossless native128 avatar layer pilot."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
OUTPUT_PATH = ROOT / "design/hustlek-composition-v1/pilot/plain-avatar-layers-atlas.png"
ASSET_ID = "avatars/presets/plain"
LAYER_IDS = ["base", "hair", "face", "headwear", "garment", "extra"]


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def crop_flattened_master(catalog: dict) -> Image.Image:
    record = next(avatar for avatar in catalog["avatars"] if avatar["asset_id"] == ASSET_ID)
    master = record["flattened_native128"]
    crop = master["atlas_crop"]
    atlas = Image.open(ROOT / master["atlas_path"]).convert("RGBA")
    image = atlas.crop(
        (
            crop["x"],
            crop["y"],
            crop["x"] + crop["w"],
            crop["y"] + crop["h"],
        )
    )
    if image.size != (128, 128):
        raise ValueError("plain flattened native master must be 128x128")
    if decoded_sha256(image) != master["decoded_rgba_sha256"]:
        raise ValueError("plain flattened native master hash mismatch")
    return image


def is_skin(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red > 135 and green > 90 and blue > 55 and green > blue * 0.9


def partition(master: Image.Image) -> dict[str, Image.Image]:
    layers = {
        layer_id: Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        for layer_id in LAYER_IDS
    }
    for y in range(128):
        for x in range(128):
            pixel = master.getpixel((x, y))
            red, green, blue, alpha = pixel
            if alpha == 0:
                continue
            dark = (red + green + blue) / 3 < 95
            hair_tone = red < 135 and red >= green and green >= blue * 0.82
            hair = (
                (y < 29 and 24 <= x <= 104)
                or (y < 46 and 25 <= x <= 103 and hair_tone)
            ) or (
                y < 56 and (x < 43 or x > 84) and hair_tone
            )
            garment = y >= 100 or (y >= 87 and not is_skin(pixel))
            face = 41 <= x <= 88 and 43 <= y <= 81 and dark and not hair
            layer_id = "hair" if hair else "face" if face else "garment" if garment else "base"
            layers[layer_id].putpixel((x, y), pixel)
    return layers


def add_hidden_scalp(master: Image.Image, layers: dict[str, Image.Image]) -> int:
    skin_pixels = [
        pixel
        for y in range(29, 84)
        for x in range(34, 93)
        if is_skin(pixel := master.getpixel((x, y)))
    ]
    counts = Counter(skin_pixels)
    if len(counts) < 3:
        raise ValueError("plain pilot did not expose a usable skin ramp")
    ramp = sorted(counts, key=lambda pixel: sum(pixel[:3]))
    skin_shadow = ramp[len(ramp) // 4]
    skin_base = counts.most_common(1)[0][0]
    skin_light = ramp[-1]
    outline = min(
        (pixel for pixel in master.get_flattened_data() if pixel[3]),
        key=lambda pixel: sum(pixel[:3]),
    )
    hair_alpha = layers["hair"].getchannel("A")
    base = layers["base"]

    def inside_bald_contour(x: int, y: int) -> bool:
        return ((x - 64) / 31) ** 2 + ((y - 47) / 35) ** 2 <= 1

    added = 0
    for y in range(128):
        for x in range(128):
            if (
                hair_alpha.getpixel((x, y)) == 0
                or base.getpixel((x, y))[3]
                or not inside_bald_contour(x, y)
            ):
                continue
            outer_edge = any(
                0 <= x + dx < 128
                and 0 <= y + dy < 128
                and not inside_bald_contour(x + dx, y + dy)
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
            )
            if outer_edge:
                pixel = outline
            elif x < 58 and y < 34:
                pixel = skin_light
            elif x > 78 or y > 45:
                pixel = skin_shadow
            else:
                pixel = skin_base
            base.putpixel((x, y), pixel)
            added += 1
    return added


def alpha_composite(layers: dict[str, Image.Image], order: list[str]) -> Image.Image:
    output = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    for layer_id in order:
        output = Image.alpha_composite(output, layers[layer_id])
    return output


def validate_layer(image: Image.Image, layer_id: str, *, allow_empty: bool = False) -> None:
    pixels = list(image.get_flattened_data())
    if {pixel[3] for pixel in pixels} - {0, 255}:
        raise ValueError(f"{layer_id}: alpha must be binary")
    if any(pixel[3] == 0 and pixel[:3] != (0, 0, 0) for pixel in pixels):
        raise ValueError(f"{layer_id}: transparent pixels contain hidden RGB")
    if not allow_empty and image.getbbox() is None:
        raise ValueError(f"{layer_id}: layer is empty")


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    master = crop_flattened_master(catalog)
    layers = partition(master)
    partition_recomposition = alpha_composite(
        layers, ["base", "garment", "hair", "face", "headwear", "extra"]
    )
    if decoded_sha256(partition_recomposition) != decoded_sha256(master):
        raise ValueError("disjoint layer partition does not recompose exactly")
    hidden_scalp_pixels = add_hidden_scalp(master, layers)
    recomposed = alpha_composite(
        layers, ["base", "garment", "hair", "face", "headwear", "extra"]
    )
    if decoded_sha256(recomposed) != decoded_sha256(master):
        raise ValueError("swap-ready layers do not recompose to the flattened master")
    for layer_id, image in layers.items():
        validate_layer(image, layer_id, allow_empty=layer_id in {"headwear", "extra"})

    atlas = Image.new("RGBA", (128 * len(LAYER_IDS), 128), (0, 0, 0, 0))
    for index, layer_id in enumerate(LAYER_IDS):
        atlas.alpha_composite(layers[layer_id], (index * 128, 0))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT_PATH)
    print(
        json.dumps(
            {
                "asset_id": ASSET_ID,
                "atlas": str(OUTPUT_PATH.relative_to(ROOT)).replace("\\", "/"),
                "hidden_scalp_pixels": hidden_scalp_pixels,
                "layer_bboxes": {
                    layer_id: list(image.getbbox()) if image.getbbox() else None
                    for layer_id, image in layers.items()
                },
                "recomposition_decoded_rgba_sha256": decoded_sha256(recomposed),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
