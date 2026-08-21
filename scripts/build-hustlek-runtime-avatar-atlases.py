#!/usr/bin/env python3
"""Pack production avatar layers into Android-safe runtime sprite atlases."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
SOURCE_PATH = ROOT / "design/hustlek-composition-v1/avatar-layers-atlas.png"
OUTPUT_DIR = ROOT / "design/hustlek-composition-v1/runtime"
CANVAS = 128
LAYERS_PER_AVATAR = 6
BLOCK_COLUMNS = 3
BLOCK_ROWS = 2
AVATARS_PER_ROW = 5
AVATAR_ROWS_PER_ATLAS = 8
AVATARS_PER_ATLAS = AVATARS_PER_ROW * AVATAR_ROWS_PER_ATLAS
ATLAS_WIDTH = CANVAS * BLOCK_COLUMNS * AVATARS_PER_ROW
ATLAS_HEIGHT = CANVAS * BLOCK_ROWS * AVATAR_ROWS_PER_ATLAS
TOTAL_AVATARS = 270
TOTAL_ATLASES = (TOTAL_AVATARS + AVATARS_PER_ATLAS - 1) // AVATARS_PER_ATLAS


def decoded_sha256(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def output_path(batch: int) -> Path:
    return OUTPUT_DIR / f"avatar-runtime-{batch:02d}.png"


def validate_source(catalog: dict, source: Image.Image) -> None:
    expected = (CANVAS * LAYERS_PER_AVATAR, CANVAS * TOTAL_AVATARS)
    if source.size != expected:
        raise ValueError(f"source avatar layer atlas must be {expected[0]}x{expected[1]}")
    if len(catalog["avatars"]) != TOTAL_AVATARS:
        raise ValueError("catalog avatar count mismatch")


def build_batch(catalog: dict, source: Image.Image, batch: int) -> Image.Image:
    if not 0 <= batch < TOTAL_ATLASES:
        raise ValueError(f"batch must be between 0 and {TOTAL_ATLASES - 1}")
    atlas = Image.new("RGBA", (ATLAS_WIDTH, ATLAS_HEIGHT), (0, 0, 0, 0))
    first = batch * AVATARS_PER_ATLAS
    last = min(first + AVATARS_PER_ATLAS, TOTAL_AVATARS)
    for avatar_index in range(first, last):
        avatar = catalog["avatars"][avatar_index]
        local = avatar_index - first
        block_x = (local % AVATARS_PER_ROW) * BLOCK_COLUMNS * CANVAS
        block_y = (local // AVATARS_PER_ROW) * BLOCK_ROWS * CANVAS
        for layer_index, layer_id in enumerate(
            ["base", "hair", "face", "headwear", "garment", "extra"]
        ):
            source_x = layer_index * CANVAS
            source_y = avatar_index * CANVAS
            tile = source.crop(
                (source_x, source_y, source_x + CANVAS, source_y + CANVAS)
            )
            expected_sha = avatar["composable_native128"]["layers"][layer_id][
                "decoded_rgba_sha256"
            ]
            if decoded_sha256(tile) != expected_sha:
                raise ValueError(f"{avatar['asset_id']}/{layer_id}: source tile hash mismatch")
            target_x = block_x + (layer_index % BLOCK_COLUMNS) * CANVAS
            target_y = block_y + (layer_index // BLOCK_COLUMNS) * CANVAS
            atlas.alpha_composite(tile, (target_x, target_y))
            copied = atlas.crop(
                (target_x, target_y, target_x + CANVAS, target_y + CANVAS)
            )
            if decoded_sha256(copied) != expected_sha:
                raise ValueError(f"{avatar['asset_id']}/{layer_id}: runtime tile copy mismatch")
    return atlas


def write_or_check(image: Image.Image, path: Path, *, check: bool) -> None:
    if check:
        if not path.exists():
            raise ValueError(f"missing runtime atlas: {path}")
        with Image.open(path) as existing:
            if existing.convert("RGBA").tobytes() != image.tobytes():
                raise ValueError(f"stale runtime atlas: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp.png")
    image.save(temporary, optimize=True)
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-start", type=int, default=0)
    parser.add_argument("--batch-end", type=int, default=TOTAL_ATLASES)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not 0 <= args.batch_start < args.batch_end <= TOTAL_ATLASES:
        raise ValueError("invalid runtime atlas batch range")
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    with Image.open(SOURCE_PATH) as encoded:
        source = encoded.convert("RGBA")
    validate_source(catalog, source)
    records = []
    for batch in range(args.batch_start, args.batch_end):
        atlas = build_batch(catalog, source, batch)
        path = output_path(batch)
        write_or_check(atlas, path, check=args.check)
        records.append(
            {
                "batch": batch,
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "decoded_rgba_sha256": decoded_sha256(atlas),
            }
        )
    print(
        json.dumps(
            {
                "atlas_size": [ATLAS_WIDTH, ATLAS_HEIGHT],
                "avatars_per_atlas": AVATARS_PER_ATLAS,
                "batches": records,
                "mode": "check" if args.check else "write",
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
