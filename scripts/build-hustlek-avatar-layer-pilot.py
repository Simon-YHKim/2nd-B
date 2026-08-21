#!/usr/bin/env python3
"""Build and verify representative lossless native128 avatar layer pilots."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Callable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
PLAIN_OUTPUT = ROOT / "design/hustlek-composition-v1/pilot/plain-avatar-layers-atlas.png"
LAYER_IDS = ["base", "hair", "face", "headwear", "garment", "extra"]
RECOMPOSITION_ORDER = ["base", "garment", "hair", "face", "headwear", "extra"]
PILOTS = {
    "avatars/presets/plain": "plain",
    "avatars/food/chef": "chef",
    "avatars/fantasy/wizard": "wizard",
    "avatars/animals/cat": "cat",
}

Pixel = tuple[int, int, int, int]
Classifier = Callable[[int, int, Pixel], str]


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def crop_flattened_master(catalog: dict, asset_id: str) -> Image.Image:
    record = next(avatar for avatar in catalog["avatars"] if avatar["asset_id"] == asset_id)
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
        raise ValueError(f"{asset_id}: flattened native master must be 128x128")
    if decoded_sha256(image) != master["decoded_rgba_sha256"]:
        raise ValueError(f"{asset_id}: flattened native master hash mismatch")
    return image


def is_skin(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red > 135 and green > 90 and blue > 55 and green > blue * 0.9


def is_light_neutral(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and red > 180
        and green > 155
        and blue > 135
        and max(red, green, blue) - min(red, green, blue) < 90
    )


def is_dark(pixel: Pixel) -> bool:
    return pixel[3] > 0 and sum(pixel[:3]) / 3 < 105


def is_brown(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red < 180 and red > green * 1.22 and green > blue * 1.02


def is_purple(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and blue > green * 1.35 and red > green * 1.25


def is_gold(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red > 150 and green > 70 and blue < 125 and red > green * 1.12


def classify_plain(x: int, y: int, pixel: Pixel) -> str:
    red, green, blue, _ = pixel
    dark = sum(pixel[:3]) / 3 < 95
    hair_tone = red < 135 and red >= green and green >= blue * 0.82
    hair = (
        (y < 29 and 24 <= x <= 104)
        or (y < 46 and 25 <= x <= 103 and hair_tone)
        or (y < 56 and (x < 43 or x > 84) and hair_tone)
    )
    face = not hair and 41 <= x <= 88 and 43 <= y <= 81 and dark
    garment = y >= 100 or (y >= 87 and not is_skin(pixel))
    return "hair" if hair else "face" if face else "garment" if garment else "base"


def classify_chef(x: int, y: int, pixel: Pixel) -> str:
    headwear = y < 39 or (y < 50 and is_light_neutral(pixel))
    hair = not headwear and (
        (y < 55 and is_brown(pixel))
        or (y < 66 and (x < 46 or x > 82) and (is_brown(pixel) or is_dark(pixel)))
    )
    face = (
        not headwear
        and not hair
        and 40 <= x <= 89
        and 50 <= y <= 88
        and sum(pixel[:3]) / 3 < 155
    )
    extra = y >= 105 and 43 <= x <= 84 and is_dark(pixel)
    garment = y >= 95 and (not is_skin(pixel) or y >= 108)
    if headwear:
        return "headwear"
    if hair:
        return "hair"
    if face:
        return "face"
    if extra:
        return "extra"
    if garment:
        return "garment"
    return "base"


def classify_wizard(x: int, y: int, pixel: Pixel) -> str:
    headwear = y < 56 or (y < 70 and (is_purple(pixel) or x < 34 or x > 95))
    hair = (
        not headwear
        and 56 <= y < 105
        and 30 < x < 98
        and (is_brown(pixel) or (is_dark(pixel) and (x < 47 or x > 82)))
    )
    face = (
        not headwear
        and not hair
        and 40 <= x <= 90
        and 70 <= y <= 104
        and sum(pixel[:3]) / 3 < 150
    )
    extra = y >= 98 and is_gold(pixel) and not (53 <= x <= 75 and y < 106)
    garment = y >= 98 and (is_purple(pixel) or is_dark(pixel) or y >= 108)
    if headwear:
        return "headwear"
    if hair:
        return "hair"
    if face:
        return "face"
    if extra:
        return "extra"
    if garment:
        return "garment"
    return "base"


def classify_cat(x: int, y: int, pixel: Pixel) -> str:
    red, green, blue, _ = pixel
    muzzle = red > 150 and green > 145 and blue > 145 and y >= 61
    face = 34 <= x <= 94 and 42 <= y <= 88 and (is_dark(pixel) or muzzle)
    return "face" if face else "base"


CLASSIFIERS: dict[str, Classifier] = {
    "plain": classify_plain,
    "chef": classify_chef,
    "wizard": classify_wizard,
    "cat": classify_cat,
}


def partition(master: Image.Image, classifier: Classifier) -> dict[str, Image.Image]:
    layers = {
        layer_id: Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        for layer_id in LAYER_IDS
    }
    for y in range(128):
        for x in range(128):
            pixel = master.getpixel((x, y))
            if pixel[3]:
                layers[classifier(x, y, pixel)].putpixel((x, y), pixel)
    return layers


def most_common_fill(master: Image.Image, *, animal: bool) -> Pixel:
    candidates = [
        pixel
        for y in range(35, 90)
        for x in range(30, 98)
        if (pixel := master.getpixel((x, y)))[3]
        and (70 < sum(pixel[:3]) / 3 < 180 if animal else is_skin(pixel))
    ]
    if not candidates:
        raise ValueError("pilot did not expose a base fill ramp")
    return Counter(candidates).most_common(1)[0][0]


def add_swap_underlays(
    master: Image.Image,
    layers: dict[str, Image.Image],
    *,
    animal: bool,
) -> dict[str, int]:
    base_fill = most_common_fill(master, animal=animal)
    base = layers["base"]
    face_pixels = 0
    for y in range(128):
        for x in range(128):
            if layers["face"].getpixel((x, y))[3] and not base.getpixel((x, y))[3]:
                base.putpixel((x, y), base_fill)
                face_pixels += 1

    scalp_pixels = 0
    if not animal:
        skin_pixels = [pixel for pixel in master.get_flattened_data() if is_skin(pixel)]
        ramp = sorted(set(skin_pixels), key=lambda pixel: sum(pixel[:3]))
        skin_shadow = ramp[len(ramp) // 4]
        skin_light = ramp[-1]
        outline = min(
            (pixel for pixel in master.get_flattened_data() if pixel[3]),
            key=lambda pixel: sum(pixel[:3]),
        )

        def inside_bald_contour(x: int, y: int) -> bool:
            return ((x - 64) / 31) ** 2 + ((y - 47) / 35) ** 2 <= 1

        occlusion = Image.alpha_composite(layers["hair"], layers["headwear"]).getchannel("A")
        for y in range(128):
            for x in range(128):
                if (
                    occlusion.getpixel((x, y)) == 0
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
                    pixel = base_fill
                base.putpixel((x, y), pixel)
                scalp_pixels += 1

    garment_pixels = 0
    garment_candidates = [
        pixel
        for pixel in layers["garment"].get_flattened_data()
        if pixel[3] and not is_dark(pixel)
    ]
    if garment_candidates:
        garment_fill = Counter(garment_candidates).most_common(1)[0][0]
        garment = layers["garment"]
        for y in range(128):
            for x in range(128):
                if layers["extra"].getpixel((x, y))[3] and not garment.getpixel((x, y))[3]:
                    garment.putpixel((x, y), garment_fill)
                    garment_pixels += 1
    return {
        "base_under_face": face_pixels,
        "base_under_scalp": scalp_pixels,
        "garment_under_extra": garment_pixels,
    }


def alpha_composite(layers: dict[str, Image.Image]) -> Image.Image:
    output = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    for layer_id in RECOMPOSITION_ORDER:
        output = Image.alpha_composite(output, layers[layer_id])
    return output


def validate_layer(image: Image.Image, label: str, *, allow_empty: bool) -> None:
    pixels = list(image.get_flattened_data())
    if {pixel[3] for pixel in pixels} - {0, 255}:
        raise ValueError(f"{label}: alpha must be binary")
    if any(pixel[3] == 0 and pixel[:3] != (0, 0, 0) for pixel in pixels):
        raise ValueError(f"{label}: transparent pixels contain hidden RGB")
    if not allow_empty and image.getbbox() is None:
        raise ValueError(f"{label}: layer is empty")


def build_layers(catalog: dict, asset_id: str) -> tuple[dict[str, Image.Image], dict]:
    profile = PILOTS[asset_id]
    master = crop_flattened_master(catalog, asset_id)
    layers = partition(master, CLASSIFIERS[profile])
    underlays = add_swap_underlays(master, layers, animal=profile == "cat")
    recomposed = alpha_composite(layers)
    if decoded_sha256(recomposed) != decoded_sha256(master):
        raise ValueError(f"{asset_id}: layers do not recompose to the flattened master")
    allowed_empty = {"headwear", "extra"}
    if profile == "cat":
        allowed_empty |= {"hair", "garment"}
    for layer_id, image in layers.items():
        validate_layer(
            image,
            f"{asset_id}/{layer_id}",
            allow_empty=layer_id in allowed_empty,
        )
    return layers, {
        "asset_id": asset_id,
        "profile": profile,
        "underlays": underlays,
        "layer_bboxes": {
            layer_id: list(image.getbbox()) if image.getbbox() else None
            for layer_id, image in layers.items()
        },
        "recomposition_decoded_rgba_sha256": decoded_sha256(recomposed),
    }


def write_atlas(
    catalog: dict,
    asset_ids: list[str],
    output_path: Path,
) -> list[dict]:
    atlas = Image.new("RGBA", (128 * len(LAYER_IDS), 128 * len(asset_ids)), (0, 0, 0, 0))
    metrics: list[dict] = []
    for row, asset_id in enumerate(asset_ids):
        layers, record = build_layers(catalog, asset_id)
        record["atlas_row"] = row
        metrics.append(record)
        for column, layer_id in enumerate(LAYER_IDS):
            atlas.alpha_composite(layers[layer_id], (column * 128, row * 128))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_path)
    return metrics


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    metrics = write_atlas(
        catalog,
        [
            "avatars/presets/plain",
            "avatars/food/chef",
            "avatars/fantasy/wizard",
            "avatars/animals/cat",
        ],
        PLAIN_OUTPUT,
    )
    print(json.dumps(metrics, sort_keys=True))


if __name__ == "__main__":
    main()
