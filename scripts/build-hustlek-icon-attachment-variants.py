#!/usr/bin/env python3
"""Build final-canvas native128 variants for every attachable HustleK icon."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
OUTPUT_PATH = ROOT / "design/hustlek-composition-v1/icon-attachments-atlas.png"
CANVAS = 128
ATLAS_COLUMNS = 16

APPROVED_PILOTS = {
    "icons/crown": {
        "path": "design/hustlek-composition-v1/pilot/crown-headwear-128.png",
        "atlas_crop": None,
    },
    "icons/idBadge": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [0, 0, 128, 128],
    },
    "icons/wrench": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [128, 0, 128, 128],
    },
    "icons/camera": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [256, 0, 128, 128],
    },
}


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def crop_from_record(record: dict, *, path_key: str, crop_key: str) -> Image.Image:
    path = ROOT / record[path_key]
    crop = record.get(crop_key)
    with Image.open(path) as source:
        image = source.convert("RGBA")
        if crop is not None:
            if isinstance(crop, dict):
                x, y, width, height = crop["x"], crop["y"], crop["w"], crop["h"]
            else:
                x, y, width, height = crop
            image = image.crop((x, y, x + width, y + height))
    if image.size != (CANVAS, CANVAS):
        raise ValueError(f"{path}: native source crop must be 128x128")
    return image


def standalone_master(icon: dict) -> Image.Image:
    master = icon["standalone_native128"]
    image = crop_from_record(master, path_key="atlas_path", crop_key="atlas_crop")
    if decoded_sha256(image) != master["decoded_rgba_sha256"]:
        raise ValueError(f"{icon['asset_id']}: standalone native128 hash mismatch")
    return image


def approved_pilot(icon: dict) -> Image.Image | None:
    source = APPROVED_PILOTS.get(icon["asset_id"])
    if source is None:
        return None
    return crop_from_record(source, path_key="path", crop_key="atlas_crop")


def nearest_fit_variant(icon: dict) -> Image.Image:
    attachment = icon["composition"]["attachment"]
    source = standalone_master(icon)
    bbox = source.getbbox()
    if bbox is None:
        raise ValueError(f"{icon['asset_id']}: standalone native128 is empty")
    tight = source.crop(bbox)
    fit_x, fit_y, fit_width, fit_height = attachment["fit_box"]
    scale = min(fit_width / tight.width, fit_height / tight.height)
    width = max(1, min(fit_width, round(tight.width * scale)))
    height = max(1, min(fit_height, round(tight.height * scale)))
    resized = tight.resize((width, height), Image.Resampling.NEAREST)
    x = fit_x + (fit_width - width) // 2
    y = fit_y + (fit_height - height) // 2
    output = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    output.alpha_composite(resized, (x, y))
    return output


def validate_variant(icon: dict, image: Image.Image) -> dict:
    attachment = icon["composition"]["attachment"]
    pixels = list(image.get_flattened_data())
    if {pixel[3] for pixel in pixels} - {0, 255}:
        raise ValueError(f"{icon['asset_id']}: attachment alpha must be binary")
    if any(pixel[3] == 0 and pixel[:3] != (0, 0, 0) for pixel in pixels):
        raise ValueError(f"{icon['asset_id']}: attachment has hidden RGB")
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError(f"{icon['asset_id']}: attachment is empty")
    fit_x, fit_y, fit_width, fit_height = attachment["fit_box"]
    if not (
        bbox[0] >= fit_x
        and bbox[1] >= fit_y
        and bbox[2] <= fit_x + fit_width
        and bbox[3] <= fit_y + fit_height
    ):
        raise ValueError(f"{icon['asset_id']}: attachment exceeds its fit box")
    opaque_colors = {pixel for pixel in pixels if pixel[3]}
    return {
        "asset_id": icon["asset_id"],
        "bbox": list(bbox),
        "opaque_colors": len(opaque_colors),
        "decoded_rgba_sha256": decoded_sha256(image),
    }


def build_atlas(catalog: dict) -> tuple[Image.Image, list[dict]]:
    icons = sorted(
        (
            icon
            for icon in catalog["icons"]
            if icon["composition"]["attachment"] is not None
        ),
        key=lambda icon: icon["asset_id"],
    )
    if len(icons) != 267:
        raise ValueError(f"attachable icon count must be 267, got {len(icons)}")
    rows = (len(icons) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new(
        "RGBA",
        (ATLAS_COLUMNS * CANVAS, rows * CANVAS),
        (0, 0, 0, 0),
    )
    metrics: list[dict] = []
    for index, icon in enumerate(icons):
        pilot = approved_pilot(icon)
        variant = pilot if pilot is not None else nearest_fit_variant(icon)
        record = validate_variant(icon, variant)
        record["index"] = index
        record["method"] = "approved_imagegen_pilot" if pilot is not None else "nearest_tight_bbox_fit"
        metrics.append(record)
        column, row = index % ATLAS_COLUMNS, index // ATLAS_COLUMNS
        atlas.alpha_composite(variant, (column * CANVAS, row * CANVAS))
    return atlas, metrics


def write_or_check(atlas: Image.Image, *, check: bool) -> None:
    if check:
        if not OUTPUT_PATH.exists():
            raise ValueError(f"missing attachment atlas: {OUTPUT_PATH}")
        with Image.open(OUTPUT_PATH) as existing:
            if existing.convert("RGBA").tobytes() != atlas.tobytes():
                raise ValueError("attachment atlas is stale")
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
                "attachments": len(metrics),
                "approved_pilots": sum(
                    metric["method"] == "approved_imagegen_pilot" for metric in metrics
                ),
                "nearest_derived": sum(
                    metric["method"] == "nearest_tight_bbox_fit" for metric in metrics
                ),
                "atlas_size": list(atlas.size),
                "decoded_rgba_sha256": decoded_sha256(atlas),
                "mode": "check" if args.check else "write",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
