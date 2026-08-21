#!/usr/bin/env python3
"""Build and verify lossless native128 layers for every HustleK avatar."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
OUTPUT_PATH = ROOT / "design/hustlek-composition-v1/avatar-layers-atlas.png"
LAYER_IDS = ["base", "hair", "face", "headwear", "garment", "extra"]
RECOMPOSITION_ORDER = ["base", "garment", "hair", "face", "headwear", "extra"]
SOURCE_DRAW_ORDER = ["garment", "extra", "base", "hair", "headwear", "face"]
CANVAS = 128
SOURCE_GRID = 16
GRID_SCALE = CANVAS // SOURCE_GRID

DS_BUNDLE = (
    ROOT
    / "design/pixel_clay_v4/_ds/"
    "pixel-clay-design-system-ca692b6f-ca02-4536-8de2-d5b398695f65/"
    "_ds_bundle.js"
)
AVATAR_SOURCE = ROOT / "design/pixel_clay_v4/app/pxc-ext-avatars.js"
JOB_SOURCE = ROOT / "design/pixel_clay_v4/app/pxc-ext-jobs.js"
ROLE_SOURCE = ROOT / "design/pixel_clay_v4/app/pxc-ext-roles.js"

Pixel = tuple[int, int, int, int]
Mask = list[bool]

SEMANTIC_MASK_NODE = r"""
const fs = require('fs');
const vm = require('vm');
const [dsPath, avatarPath, jobPath, rolePath] = process.argv.slice(1);
const context = { window: {}, console };
vm.createContext(context);
const run = path => vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
run(dsPath);
run(avatarPath);
run(jobPath);
context.window.PXC_EXT.ICON_CATEGORIES = [];
context.window.PXC_EXT.NEW_ICON_NAMES = [];
run(rolePath);

const DS = context.window.PIXELCLAYDesignSystem_ca692b;
const E = context.window.PXC_EXT;
const records = JSON.parse(fs.readFileSync(0, 'utf8'));

function rasterize(layers) {
  const grid = Array.from({ length: 16 }, () => new Uint8Array(16));
  for (const layer of layers) {
    let kind = layer[0];
    const erase = kind.startsWith('-');
    if (erase) kind = kind.slice(1);
    const args = layer.slice(1, -1);
    const tmp = Array.from({ length: 16 }, () => new Uint8Array(16));
    DS.ICON_OPS[kind](tmp, 1, ...args);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (tmp[y][x]) grid[y][x] = erase ? 0 : 1;
      }
    }
  }
  return grid.map(row => row.reduce((bits, value, x) => bits | (value << x), 0));
}

const output = {};
for (const record of records) {
  const spec = record.source_spec;
  const job = spec.job ? E.JOB_BY_ID[spec.job] : null;
  if (spec.job && !job) throw new Error(`${record.asset_id}: missing job ${spec.job}`);
  const cloth = job && job.cloth ? job.cloth : E.CLOTH[spec.cloth];
  const palette = {
    skin: E.SKIN[spec.skin],
    hairColor: E.HAIRC[spec.hairColor],
    cloth,
    cloth2: E.CLOTH[(spec.cloth + 5) % E.CLOTH.length],
  };
  const resolve = value => typeof value === 'function' ? value(palette) : (value || []);
  const groups = {
    base: [
      ['R', 6, 10, 4, 1, palette.skin],
      ['R', 4, 3, 8, 7, palette.skin],
      ['R', 3, 5, 1, 3, palette.skin],
      ['R', 12, 5, 1, 3, palette.skin],
    ],
    garment: [
      ['R', 3, 11, 10, 5, palette.cloth],
      ['R', 2, 12, 1, 4, palette.cloth],
      ['R', 13, 12, 1, 4, palette.cloth],
    ],
    extra: job ? resolve(job.extra) : [],
    hair: E.HAIR[spec.hair].f(palette.hairColor),
    headwear: job ? resolve(job.hat) : E.ACC[spec.acc].f(palette),
    face: E.EXPR[spec.expr].f(palette).concat(E.FACE[spec.face].f(palette)),
  };
  output[record.asset_id] = Object.fromEntries(
    Object.entries(groups).map(([layerId, operations]) => [layerId, rasterize(operations)])
  );
}
process.stdout.write(JSON.stringify(output));
"""


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def crop_flattened_master(catalog: dict, asset_id: str) -> Image.Image:
    record = next(avatar for avatar in catalog["avatars"] if avatar["asset_id"] == asset_id)
    master = record["flattened_native128"]
    crop = master["atlas_crop"]
    with Image.open(ROOT / master["atlas_path"]) as source:
        image = source.convert("RGBA").crop(
            (crop["x"], crop["y"], crop["x"] + crop["w"], crop["y"] + crop["h"])
        )
    if image.size != (CANVAS, CANVAS):
        raise ValueError(f"{asset_id}: flattened native master must be 128x128")
    if decoded_sha256(image) != master["decoded_rgba_sha256"]:
        raise ValueError(f"{asset_id}: flattened native master hash mismatch")
    return image


def is_skin(pixel: Pixel) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and red > 135 and green > 80 and blue > 45 and green > blue * 0.82


def is_dark(pixel: Pixel) -> bool:
    return pixel[3] > 0 and sum(pixel[:3]) / 3 < 105


def color_distance(left: Pixel, right: Pixel) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def expand_mask(rows: list[int]) -> Mask:
    if len(rows) != SOURCE_GRID:
        raise ValueError("semantic mask must contain sixteen rows")
    mask = [False] * (CANVAS * CANVAS)
    for source_y, bits in enumerate(rows):
        for source_x in range(SOURCE_GRID):
            if not bits & (1 << source_x):
                continue
            for y in range(source_y * GRID_SCALE, (source_y + 1) * GRID_SCALE):
                offset = y * CANVAS
                for x in range(source_x * GRID_SCALE, (source_x + 1) * GRID_SCALE):
                    mask[offset + x] = True
    return mask


def distance_transform(mask: Mask) -> list[int]:
    infinity = CANVAS * 4
    distance = [0 if value else infinity for value in mask]
    for y in range(CANVAS):
        for x in range(CANVAS):
            index = y * CANVAS + x
            if x:
                distance[index] = min(distance[index], distance[index - 1] + 1)
            if y:
                distance[index] = min(distance[index], distance[index - CANVAS] + 1)
    for y in range(CANVAS - 1, -1, -1):
        for x in range(CANVAS - 1, -1, -1):
            index = y * CANVAS + x
            if x + 1 < CANVAS:
                distance[index] = min(distance[index], distance[index + 1] + 1)
            if y + 1 < CANVAS:
                distance[index] = min(distance[index], distance[index + CANVAS] + 1)
    return distance


def semantic_masks(catalog: dict) -> dict[str, dict[str, Mask]]:
    records = [
        {"asset_id": avatar["asset_id"], "source_spec": avatar["source_spec"]}
        for avatar in catalog["avatars"]
        if avatar["source_spec"]["type"] == "human"
    ]
    result = subprocess.run(
        [
            "node",
            "-e",
            SEMANTIC_MASK_NODE,
            str(DS_BUNDLE),
            str(AVATAR_SOURCE),
            str(JOB_SOURCE),
            str(ROLE_SOURCE),
        ],
        cwd=ROOT,
        input=json.dumps(records),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"semantic mask extraction failed: {result.stderr.strip()}")
    raw = json.loads(result.stdout)
    return {
        asset_id: {layer_id: expand_mask(rows) for layer_id, rows in layers.items()}
        for asset_id, layers in raw.items()
    }


def layer_palettes(master: Image.Image, masks: dict[str, Mask]) -> dict[str, list[Pixel]]:
    topmost: list[str | None] = [None] * (CANVAS * CANVAS)
    for layer_id in SOURCE_DRAW_ORDER:
        for index, active in enumerate(masks[layer_id]):
            if active:
                topmost[index] = layer_id

    pixels = list(master.get_flattened_data())
    palettes: dict[str, list[Pixel]] = {}
    for layer_id in LAYER_IDS:
        exclusive = Counter(
            pixels[index]
            for index, label in enumerate(topmost)
            if label == layer_id and pixels[index][3]
        )
        fallback = Counter(
            pixels[index]
            for index, active in enumerate(masks[layer_id])
            if active and pixels[index][3]
        )
        colors = exclusive if exclusive else fallback
        palettes[layer_id] = [pixel for pixel, _ in colors.most_common(16)]
    return palettes


def new_layers() -> dict[str, Image.Image]:
    return {
        layer_id: Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        for layer_id in LAYER_IDS
    }


def partition_human(master: Image.Image, masks: dict[str, Mask]) -> dict[str, Image.Image]:
    layers = new_layers()
    active_layers = [layer_id for layer_id in LAYER_IDS if any(masks[layer_id])]
    distances = {layer_id: distance_transform(masks[layer_id]) for layer_id in active_layers}
    palettes = layer_palettes(master, masks)
    tie_priority = {layer_id: index for index, layer_id in enumerate(SOURCE_DRAW_ORDER)}

    for y in range(CANVAS):
        for x in range(CANVAS):
            pixel = master.getpixel((x, y))
            if not pixel[3]:
                continue
            index = y * CANVAS + x

            def score(layer_id: str) -> tuple[float, int]:
                palette = palettes[layer_id]
                chroma = min((color_distance(pixel, color) for color in palette), default=300)
                value = distances[layer_id][index] + chroma * 0.34
                if masks[layer_id][index]:
                    value -= 5
                if layer_id == "garment" and y < 68:
                    value += 24
                elif layer_id == "base" and y > 114:
                    value += 18
                elif layer_id == "face" and not (30 <= x <= 98 and 32 <= y <= 105):
                    value += 28
                elif layer_id == "hair" and y > 108:
                    value += 24
                elif layer_id == "headwear" and y > 94:
                    value += 32
                return value, -tie_priority[layer_id]

            selected = min(active_layers, key=score)
            layers[selected].putpixel((x, y), pixel)
    return layers


def dominant_color(pixels: Iterable[Pixel], *, prefer_nondark: bool = False) -> Pixel:
    opaque = [pixel for pixel in pixels if pixel[3]]
    if prefer_nondark:
        nondark = [pixel for pixel in opaque if not is_dark(pixel)]
        if nondark:
            opaque = nondark
    if not opaque:
        raise ValueError("layer did not expose a fill color")
    return Counter(opaque).most_common(1)[0][0]


def partition_animal(master: Image.Image) -> dict[str, Image.Image]:
    layers = new_layers()
    head_samples = [
        master.getpixel((x, y))
        for y in range(18, 91)
        for x in range(24, 104)
        if master.getpixel((x, y))[3]
    ]
    fur = dominant_color(head_samples, prefer_nondark=True)
    for y in range(CANVAS):
        for x in range(CANVAS):
            pixel = master.getpixel((x, y))
            if not pixel[3]:
                continue
            central = 28 <= x <= 100 and 32 <= y <= 94
            facial_contrast = is_dark(pixel) or color_distance(pixel, fur) > 54
            layer_id = "face" if central and facial_contrast else "base"
            layers[layer_id].putpixel((x, y), pixel)
    return layers


def add_swap_underlays(
    master: Image.Image,
    layers: dict[str, Image.Image],
    *,
    animal: bool,
) -> dict[str, int]:
    base = layers["base"]
    base_candidates = [
        pixel
        for pixel in base.get_flattened_data()
        if pixel[3]
    ]
    base_fill = dominant_color(base_candidates, prefer_nondark=True)

    face_pixels = 0
    for y in range(CANVAS):
        for x in range(CANVAS):
            if layers["face"].getpixel((x, y))[3] and not base.getpixel((x, y))[3]:
                base.putpixel((x, y), base_fill)
                face_pixels += 1

    scalp_pixels = 0
    hair_under_headwear = 0
    if not animal:
        skin_pixels = [pixel for pixel in master.get_flattened_data() if is_skin(pixel)]
        ramp = sorted(set(skin_pixels), key=lambda pixel: sum(pixel[:3]))
        skin_shadow = ramp[len(ramp) // 4] if ramp else base_fill
        skin_light = ramp[-1] if ramp else base_fill
        outline = min(
            (pixel for pixel in master.get_flattened_data() if pixel[3]),
            key=lambda pixel: sum(pixel[:3]),
        )
        hair_pixels = [pixel for pixel in layers["hair"].get_flattened_data() if pixel[3]]
        hair_fill = dominant_color(hair_pixels, prefer_nondark=True) if hair_pixels else None

        def inside_bald_contour(x: int, y: int) -> bool:
            return ((x - 64) / 32) ** 2 + ((y - 49) / 38) ** 2 <= 1

        occlusion = Image.alpha_composite(layers["hair"], layers["headwear"]).getchannel("A")
        for y in range(CANVAS):
            for x in range(CANVAS):
                if (
                    occlusion.getpixel((x, y)) == 0
                    or base.getpixel((x, y))[3]
                    or not inside_bald_contour(x, y)
                ):
                    continue
                outer_edge = any(
                    0 <= x + dx < CANVAS
                    and 0 <= y + dy < CANVAS
                    and not inside_bald_contour(x + dx, y + dy)
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
                )
                if outer_edge:
                    pixel = outline
                elif x < 58 and y < 34:
                    pixel = skin_light
                elif x > 78 or y > 48:
                    pixel = skin_shadow
                else:
                    pixel = base_fill
                base.putpixel((x, y), pixel)
                scalp_pixels += 1

                if (
                    hair_fill
                    and layers["headwear"].getpixel((x, y))[3]
                    and not layers["hair"].getpixel((x, y))[3]
                ):
                    layers["hair"].putpixel((x, y), hair_fill)
                    hair_under_headwear += 1

    garment_pixels = 0
    garment_pixels_visible = [
        pixel for pixel in layers["garment"].get_flattened_data() if pixel[3]
    ]
    if garment_pixels_visible:
        garment_fill = dominant_color(garment_pixels_visible, prefer_nondark=True)
        garment = layers["garment"]
        for y in range(CANVAS):
            for x in range(CANVAS):
                if layers["extra"].getpixel((x, y))[3] and not garment.getpixel((x, y))[3]:
                    garment.putpixel((x, y), garment_fill)
                    garment_pixels += 1
    return {
        "base_under_face": face_pixels,
        "base_under_scalp": scalp_pixels,
        "hair_under_headwear": hair_under_headwear,
        "garment_under_extra": garment_pixels,
    }


def alpha_composite(layers: dict[str, Image.Image]) -> Image.Image:
    output = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
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


def build_layers(
    catalog: dict,
    avatar: dict,
    masks_by_asset: dict[str, dict[str, Mask]],
) -> tuple[dict[str, Image.Image], dict]:
    asset_id = avatar["asset_id"]
    animal = avatar["source_spec"]["type"] == "animal"
    master = crop_flattened_master(catalog, asset_id)
    masks = masks_by_asset.get(asset_id)
    layers = partition_animal(master) if animal else partition_human(master, masks)
    if layers["base"].getbbox() is None:
        raise ValueError(f"{asset_id}: base layer is empty before underlay generation")
    try:
        underlays = add_swap_underlays(master, layers, animal=animal)
    except ValueError as error:
        raise ValueError(f"{asset_id}: {error}") from error
    recomposed = alpha_composite(layers)
    if decoded_sha256(recomposed) != decoded_sha256(master):
        raise ValueError(f"{asset_id}: layers do not recompose to the flattened master")

    allowed_empty = {"hair", "headwear", "garment", "extra"} if animal else {
        "hair",
        "headwear",
        "extra",
    }
    for layer_id, image in layers.items():
        validate_layer(
            image,
            f"{asset_id}/{layer_id}",
            allow_empty=layer_id in allowed_empty,
        )
    if not animal and layers["hair"].getbbox() is None and layers["headwear"].getbbox() is None:
        raise ValueError(f"{asset_id}: both hair and headwear layers are empty")
    return layers, {
        "asset_id": asset_id,
        "profile": "animal" if animal else "human",
        "underlays": underlays,
        "layer_bboxes": {
            layer_id: list(image.getbbox()) if image.getbbox() else None
            for layer_id, image in layers.items()
        },
        "recomposition_decoded_rgba_sha256": decoded_sha256(recomposed),
    }


def build_atlas(catalog: dict) -> tuple[Image.Image, list[dict]]:
    avatars = sorted(catalog["avatars"], key=lambda avatar: avatar["asset_id"])
    masks_by_asset = semantic_masks(catalog)
    atlas = Image.new(
        "RGBA",
        (CANVAS * len(LAYER_IDS), CANVAS * len(avatars)),
        (0, 0, 0, 0),
    )
    metrics: list[dict] = []
    for row, avatar in enumerate(avatars):
        layers, record = build_layers(catalog, avatar, masks_by_asset)
        record["atlas_row"] = row
        metrics.append(record)
        for column, layer_id in enumerate(LAYER_IDS):
            atlas.alpha_composite(layers[layer_id], (column * CANVAS, row * CANVAS))
    return atlas, metrics


def write_or_check(atlas: Image.Image, *, check: bool) -> None:
    if check:
        if not OUTPUT_PATH.exists():
            raise ValueError(f"missing avatar layer atlas: {OUTPUT_PATH}")
        with Image.open(OUTPUT_PATH) as existing:
            if existing.convert("RGBA").tobytes() != atlas.tobytes():
                raise ValueError("avatar layer atlas is stale")
        return
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT_PATH.with_suffix(".tmp.png")
    atlas.save(temporary, optimize=True)
    temporary.replace(OUTPUT_PATH)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    atlas, metrics = build_atlas(catalog)
    write_or_check(atlas, check=args.check)
    print(
        json.dumps(
            {
                "avatars": len(metrics),
                "humans": sum(record["profile"] == "human" for record in metrics),
                "animals": sum(record["profile"] == "animal" for record in metrics),
                "atlas_size": list(atlas.size),
                "decoded_rgba_sha256": decoded_sha256(atlas),
                "mode": "check" if args.check else "write",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
