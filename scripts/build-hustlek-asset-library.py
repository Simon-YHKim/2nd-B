#!/usr/bin/env python3
"""Publish reviewed, native-detail 128px HustleK masters.

Identity SVGs are references only.  This compiler never scales a 16/32/64px
canonical asset into a master.  Each non-control master must come from a
separate ImageGen result, pass chroma removal, and retain measurable detail
that disappears when collapsed to the identity asset's original grid.

The compiler intentionally produces no lower-resolution tiers.  Those remain
blocked until the complete 128px library has been reviewed and approved.
Pixy is never used.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import platform
import sys
import zipfile
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin, __version__ as PILLOW_VERSION


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ZIP = Path(r"C:\Users\202502\Downloads\PIXEL-CLAY Design System.zip")
OUTPUT_ROOT = REPO_ROOT / "design" / "hustlek-assets-v1"
CATALOG_PATH = OUTPUT_ROOT / "catalog.json"
MASTER_SIZE = 128
ATLAS_COLUMNS = 4
COMPILER_VERSION = "hustlek-native128-compiler/v1"
REQUEST_SCHEMA = "hustlek-native128-request/v1"
SOURCE_ARCHIVE_SHA256 = "2a5a6a14d81ca22dafd87b9b5f0547312cfac7682b95d74ae263c132b299238e"
CANONICAL_COUNTS = {"icons": 533, "avatars": 270, "total": 803, "aliases": 51}

RGBA = tuple[int, int, int, int]
RGB = tuple[int, int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish native 128px HustleK masters.")
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_SOURCE_ZIP)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--preview", type=Path)
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


def canonical_json_bytes(value: Any, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return text.encode("utf-8")


def decoded_rgba_sha256(image: Image.Image) -> str:
    return sha256_bytes(image.convert("RGBA").tobytes())


def png_bytes(image: Image.Image, metadata: dict[str, str]) -> bytes:
    png_info = PngImagePlugin.PngInfo()
    for key, value in metadata.items():
        png_info.add_text(key, value)
    output = io.BytesIO()
    image.save(output, format="PNG", pnginfo=png_info, optimize=False, compress_level=9)
    return output.getvalue()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def publish_immutable(path: Path, data: bytes) -> None:
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError(f"Refusing to overwrite immutable artifact: {path}")
        return
    atomic_write(path, data)


def hex_rgb(value: str) -> RGB:
    value = value.lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB, got {value!r}")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def foreground_count(image: Image.Image) -> int:
    return sum(alpha > 0 for alpha in image.convert("RGBA").getchannel("A").get_flattened_data())


def opaque_palette(image: Image.Image) -> set[RGBA]:
    return {pixel for pixel in image.convert("RGBA").get_flattened_data() if pixel[3]}


def validate_binary_rgba(image: Image.Image, label: str) -> list[str]:
    rgba = image.convert("RGBA")
    errors: list[str] = []
    alpha_values = set(rgba.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        errors.append(f"{label}: alpha is not binary")
    hidden_rgb = sum(
        alpha == 0 and (red != 0 or green != 0 or blue != 0)
        for red, green, blue, alpha in rgba.get_flattened_data()
    )
    if hidden_rgb:
        errors.append(f"{label}: {hidden_rgb} transparent pixels contain hidden RGB")
    if foreground_count(rgba) == 0:
        errors.append(f"{label}: foreground is empty")
    return errors


def alpha_iou(left: Image.Image, right: Image.Image) -> float:
    left_alpha = left.convert("RGBA").getchannel("A").get_flattened_data()
    right_alpha = right.convert("RGBA").getchannel("A").get_flattened_data()
    intersection = 0
    union = 0
    for left_value, right_value in zip(left_alpha, right_alpha, strict=True):
        left_set = left_value > 0
        right_set = right_value > 0
        intersection += left_set and right_set
        union += left_set or right_set
    return intersection / union if union else 1.0


def eight_components(image: Image.Image) -> list[int]:
    alpha = image.convert("RGBA").getchannel("A")
    width, height = alpha.size
    opaque = {(x, y) for y in range(height) for x in range(width) if alpha.getpixel((x, y))}
    components: list[int] = []
    while opaque:
        seed = opaque.pop()
        queue: deque[tuple[int, int]] = deque([seed])
        size = 0
        while queue:
            x, y = queue.popleft()
            size += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    point = (x + dx, y + dy)
                    if point in opaque:
                        opaque.remove(point)
                        queue.append(point)
        components.append(size)
    return sorted(components, reverse=True)


def transition_count(image: Image.Image) -> int:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    transitions = 0
    for y in range(rgba.height):
        for x in range(rgba.width):
            if x + 1 < rgba.width and pixels[x, y] != pixels[x + 1, y]:
                transitions += 1
            if y + 1 < rgba.height and pixels[x, y] != pixels[x, y + 1]:
                transitions += 1
    return transitions


def rgba_difference_ratio(left: Image.Image, right: Image.Image) -> float:
    different = sum(
        left_pixel != right_pixel
        for left_pixel, right_pixel in zip(
            left.convert("RGBA").get_flattened_data(),
            right.convert("RGBA").get_flattened_data(),
            strict=True,
        )
    )
    return different / (left.width * left.height)


def nearest_palette_color(rgb: RGB, palette: list[RGB]) -> RGB:
    return min(
        palette,
        key=lambda candidate: sum((rgb[index] - candidate[index]) ** 2 for index in range(3)),
    )


def quantize_foreground(image: Image.Image, colors: int) -> Image.Image:
    rgba = image.convert("RGBA")
    foreground = [pixel[:3] for pixel in rgba.get_flattened_data() if pixel[3]]
    if not foreground:
        raise ValueError("Cannot quantize empty foreground")
    strip = Image.new("RGB", (len(foreground), 1))
    strip.putdata(foreground)
    quantized = strip.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    palette = sorted(set(quantized.get_flattened_data()))
    cache: dict[RGB, RGB] = {}
    output: list[RGBA] = []
    for red, green, blue, alpha in rgba.get_flattened_data():
        if alpha == 0:
            output.append((0, 0, 0, 0))
            continue
        rgb = (red, green, blue)
        if rgb not in cache:
            cache[rgb] = nearest_palette_color(rgb, palette)
        output.append((*cache[rgb], 255))
    result = Image.new("RGBA", rgba.size)
    result.putdata(output)
    return result


def project_cutout_to_native128(cutout: Image.Image, colors: int) -> Image.Image:
    projected = cutout.convert("RGBA").resize(
        (MASTER_SIZE, MASTER_SIZE), Image.Resampling.NEAREST
    )
    hard_pixels: list[RGBA] = []
    for red, green, blue, alpha in projected.get_flattened_data():
        hard_pixels.append((red, green, blue, 255) if alpha >= 128 else (0, 0, 0, 0))
    projected.putdata(hard_pixels)
    return quantize_foreground(projected, colors)


def project_identity_reference(path: Path, key_color: RGB) -> Image.Image:
    source = Image.open(path).convert("RGB").resize(
        (MASTER_SIZE, MASTER_SIZE), Image.Resampling.NEAREST
    )
    pixels: list[RGBA] = []
    for pixel in source.get_flattened_data():
        distance = sum((pixel[index] - key_color[index]) ** 2 for index in range(3))
        pixels.append((0, 0, 0, 0) if distance < 100 else (*pixel, 255))
    output = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE))
    output.putdata(pixels)
    return output


def resolve_request_path(request_path: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (request_path.parent / path).resolve()


def build_master(record: dict[str, Any], request_path: Path) -> tuple[Image.Image, str]:
    approved = record.get("approved_master_path")
    if approved:
        master_path = REPO_ROOT / approved
        return Image.open(master_path).convert("RGBA"), "approved-native128-control"
    cutout_path = resolve_request_path(request_path, record["cutout_path"])
    cutout = Image.open(cutout_path).convert("RGBA")
    corners = (
        cutout.getpixel((0, 0))[3],
        cutout.getpixel((cutout.width - 1, 0))[3],
        cutout.getpixel((0, cutout.height - 1))[3],
        cutout.getpixel((cutout.width - 1, cutout.height - 1))[3],
    )
    if any(corners):
        raise ValueError(f"{record['asset_id']}: chroma cutout has opaque corner")
    return (
        project_cutout_to_native128(cutout, int(record["palette_colors"])),
        "per-asset-imagegen-chroma-native128-projection",
    )


def build_asset(
    record: dict[str, Any],
    request_path: Path,
    source_zip: zipfile.ZipFile,
) -> dict[str, Any]:
    asset_id = record["asset_id"]
    source_svg_path = f"export/{asset_id}.svg"
    source_svg = source_zip.read(source_svg_path)
    raw_path = resolve_request_path(request_path, record["raw_imagegen_path"])
    identity_path = resolve_request_path(request_path, record["identity_reference_path"])
    raw = Image.open(raw_path).convert("RGBA")
    master, method = build_master(record, request_path)
    identity = project_identity_reference(identity_path, hex_rgb(record["key_color"]))
    identity_size = int(record["identity_size"])
    collapsed = master.resize((identity_size, identity_size), Image.Resampling.NEAREST).resize(
        (MASTER_SIZE, MASTER_SIZE), Image.Resampling.NEAREST
    )
    metrics = {
        "identity_alpha_iou": alpha_iou(master, identity),
        "identity_alpha_iou_floor": float(record["identity_alpha_iou_floor"]),
        "native_detail_loss_ratio": rgba_difference_ratio(master, collapsed),
        "native_detail_loss_floor": float(record.get("native_detail_loss_floor", 0.10)),
        "master_transitions": transition_count(master),
        "identity_transitions": transition_count(identity),
        "transition_gain": transition_count(master) / max(1, transition_count(identity)),
        "not_identity_upscale": decoded_rgba_sha256(master) != decoded_rgba_sha256(identity),
    }
    errors = validate_binary_rgba(master, f"{asset_id} master")
    color_count = len(opaque_palette(master))
    if color_count < int(record["minimum_colors"]):
        errors.append(f"{asset_id}: only {color_count} opaque colors")
    if color_count > int(record["palette_colors"]):
        errors.append(f"{asset_id}: palette exceeds requested maximum")
    if metrics["identity_alpha_iou"] < metrics["identity_alpha_iou_floor"]:
        errors.append(f"{asset_id}: identity alpha IoU below floor")
    if metrics["native_detail_loss_ratio"] < metrics["native_detail_loss_floor"]:
        errors.append(f"{asset_id}: master collapses to the original low-resolution grid")
    if metrics["transition_gain"] <= 1.20:
        errors.append(f"{asset_id}: insufficient native-detail transition gain")
    if not metrics["not_identity_upscale"]:
        errors.append(f"{asset_id}: master is decoded-identical to identity upscale")
    return {
        "record": record,
        "asset_id": asset_id,
        "kind": record["kind"],
        "source_svg_path": source_svg_path,
        "source_svg_sha256": sha256_bytes(source_svg),
        "raw_path": raw_path,
        "raw": raw,
        "raw_sha256": sha256_file(raw_path),
        "cutout_sha256": (
            None
            if record.get("approved_master_path")
            else sha256_file(resolve_request_path(request_path, record["cutout_path"]))
        ),
        "master": master,
        "master_method": method,
        "identity": identity,
        "metrics": metrics,
        "errors": errors,
    }


def atlas_dimensions(count: int, cell_width: int, cell_height: int) -> tuple[int, int]:
    return ATLAS_COLUMNS * cell_width, math.ceil(count / ATLAS_COLUMNS) * cell_height


def build_master_atlas(results: list[dict[str, Any]]) -> Image.Image:
    master_width, master_height = atlas_dimensions(len(results), MASTER_SIZE, MASTER_SIZE)
    master_atlas = Image.new("RGBA", (master_width, master_height), (0, 0, 0, 0))
    for index, result in enumerate(results):
        column = index % ATLAS_COLUMNS
        row = index // ATLAS_COLUMNS
        master_x = column * MASTER_SIZE
        master_y = row * MASTER_SIZE
        master_atlas.alpha_composite(result["master"], (master_x, master_y))
        result["master_crop"] = {"x": master_x, "y": master_y, "w": 128, "h": 128}
    return master_atlas


def crop_from(image: Image.Image, crop: dict[str, int]) -> Image.Image:
    return image.crop((crop["x"], crop["y"], crop["x"] + crop["w"], crop["y"] + crop["h"]))


def verify_encoded_atlas(
    master_bytes: bytes,
    results: list[dict[str, Any]],
    contract_hash: str,
) -> list[str]:
    errors: list[str] = []
    encoded_master = Image.open(io.BytesIO(master_bytes))
    if encoded_master.info.get("contract_sha256") != contract_hash:
        errors.append("master atlas contract metadata mismatch")
    master_rgba = encoded_master.convert("RGBA")
    errors.extend(validate_binary_rgba(master_rgba, "encoded master atlas"))
    for result in results:
        master_crop = crop_from(master_rgba, result["master_crop"])
        if decoded_rgba_sha256(master_crop) != decoded_rgba_sha256(result["master"]):
            errors.append(f"{result['asset_id']}: encoded master crop mismatch")
    return errors


def build_preview(results: list[dict[str, Any]]) -> Image.Image:
    columns = 4
    cell_width = 160
    cell_height = 180
    rows = math.ceil(len(results) / columns)
    preview = Image.new("RGBA", (columns * cell_width, rows * cell_height), (15, 19, 27, 255))
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    for index, result in enumerate(results):
        x = (index % columns) * cell_width
        y = (index // columns) * cell_height
        for checker_y in range(128):
            for checker_x in range(128):
                color = (31, 38, 50, 255) if (checker_x // 8 + checker_y // 8) % 2 == 0 else (40, 48, 62, 255)
                preview.putpixel((x + 16 + checker_x, y + 28 + checker_y), color)
        preview.alpha_composite(result["master"], (x + 16, y + 28))
        draw.text((x + 16, y + 8), result["asset_id"].split("/")[-1], fill=(240, 238, 232, 255), font=font)
        draw.text((x + 16, y + 158), "native 128px / 1x", fill=(151, 166, 186, 255), font=font)
    return preview


def public_asset_manifest(result: dict[str, Any]) -> dict[str, Any]:
    record = result["record"]
    master = result["master"]
    return {
        "asset_id": result["asset_id"],
        "kind": result["kind"],
        "source": {
            "path": result["source_svg_path"],
            "svg_sha256": result["source_svg_sha256"],
            "role": "identity-and-silhouette-reference-only",
        },
        "imagegen": {
            "source_id": result["raw_path"].name,
            "source_sha256": result["raw_sha256"],
            "source_size": list(result["raw"].size),
            "source_storage": "external-imagegen-provenance-by-id-and-sha256",
            "prompt": record["prompt"],
            "chroma_key": record["key_color"],
            "cutout_sha256": result["cutout_sha256"],
        },
        "master": {
            "method": result["master_method"],
            "atlas_crop": result["master_crop"],
            "decoded_rgba_sha256": decoded_rgba_sha256(master),
            "bbox": master.getchannel("A").getbbox(),
            "foreground_pixels": foreground_count(master),
            "opaque_colors": len(opaque_palette(master)),
            "components_8_neighbor": eight_components(master),
        },
        "native_detail_validation": result["metrics"],
        "errors": result["errors"],
    }


def build_catalog(existing: dict[str, Any] | None, batch_entry: dict[str, Any]) -> dict[str, Any]:
    batches: list[dict[str, Any]] = []
    for original in [] if existing is None else existing.get("batches", []):
        entry = dict(original)
        if entry.get("batch_id") == "pilot-000":
            entry["state"] = "rejected"
            entry["rejection_reason"] = "non-chef masters were derived by low-resolution upscale"
            entry["replaced_by"] = "native128-000"
        if entry.get("batch_id") != batch_entry["batch_id"]:
            batches.append(entry)
    batches.append(batch_entry)
    batches.sort(key=lambda entry: entry["batch_id"])
    ready_batches = [
        entry
        for entry in batches
        if entry.get("stage") == "native128-master"
        and entry.get("state") in {"ready_for_review", "approved"}
    ]
    seen: set[str] = set()
    for entry in reversed(ready_batches):
        superseded = sorted(asset_id for asset_id in entry["asset_ids"] if asset_id in seen)
        if superseded:
            entry["superseded_asset_ids"] = superseded
        else:
            entry.pop("superseded_asset_ids", None)
        seen.update(entry["asset_ids"])
    active_asset_index: dict[str, dict[str, Any]] = {}
    for entry in ready_batches:
        superseded = set(entry.get("superseded_asset_ids", []))
        for asset_id in entry["asset_ids"]:
            if asset_id in superseded:
                continue
            active_asset_index[asset_id] = {
                "batch_id": entry["batch_id"],
                "version": entry["version"],
                "state": entry["state"],
                "manifest_path": entry["manifest_path"],
                "master_atlas_path": entry["master_atlas_path"],
            }
    ready_ids = sorted(active_asset_index)
    approved_ids = sorted(
        asset_id
        for asset_id, active in active_asset_index.items()
        if active["state"] == "approved"
    )
    return {
        "schema": "hustlek-asset-catalog/v3",
        "source_archive_sha256": SOURCE_ARCHIVE_SHA256,
        "inventory": CANONICAL_COUNTS,
        "policy": {
            "current_stage": "native128-master-first",
            "master_size": MASTER_SIZE,
            "lower_tier_generation": "blocked-until-all-native128-masters-approved",
            "low_resolution_upscale_allowed": False,
            "per_asset_imagegen_required": True,
            "aliases_reuse_canonical": True,
            "pixy_used": False,
        },
        "coverage": {
            "native128_ready_or_approved": len(ready_ids),
            "native128_approved": len(approved_ids),
            "native128_remaining": CANONICAL_COUNTS["total"] - len(ready_ids),
            "ready_asset_ids": ready_ids,
            "approved_asset_ids": approved_ids,
        },
        "active_asset_index": active_asset_index,
        "batches": batches,
    }


def main() -> None:
    args = parse_args()
    request_path = args.request.resolve()
    source_zip_path = args.source_zip.resolve()
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if request.get("schema") != REQUEST_SCHEMA:
        raise ValueError(f"Unsupported request schema: {request.get('schema')}")
    records = request.get("assets", [])
    if not records or len(records) > 32:
        raise ValueError("A native128 batch must contain 1-32 assets")
    asset_ids = [record["asset_id"] for record in records]
    if len(asset_ids) != len(set(asset_ids)):
        raise ValueError("Duplicate asset id in request")
    if sha256_file(source_zip_path) != SOURCE_ARCHIVE_SHA256:
        raise ValueError("PIXEL-CLAY source archive hash changed")

    with zipfile.ZipFile(source_zip_path) as source_zip:
        results = [build_asset(record, request_path, source_zip) for record in records]

    repeated: list[tuple[str, dict[str, Any]]] = []
    with zipfile.ZipFile(source_zip_path) as source_zip:
        for record in records:
            repeat = build_asset(record, request_path, source_zip)
            repeated.append((decoded_rgba_sha256(repeat["master"]), repeat["metrics"]))
    deterministic = all(
        repeated[index] == (decoded_rgba_sha256(result["master"]), result["metrics"])
        for index, result in enumerate(results)
    )

    master_atlas = build_master_atlas(results)
    script_hash = sha256_text_lf(Path(__file__))
    contract = {
        "compiler": COMPILER_VERSION,
        "builder_sha256_lf": script_hash,
        "source_archive_sha256": SOURCE_ARCHIVE_SHA256,
        "batch_id": request["batch_id"],
        "master_size": MASTER_SIZE,
        "lower_tiers_generated": False,
        "low_resolution_upscale_allowed": False,
        "per_asset_imagegen": True,
        "pixy_used": False,
        "assets": [
            {
                "asset_id": result["asset_id"],
                "raw_imagegen_sha256": result["raw_sha256"],
                "cutout_sha256": result["cutout_sha256"],
                "prompt_sha256": sha256_bytes(result["record"]["prompt"].encode("utf-8")),
                "identity_size": result["record"]["identity_size"],
                "palette_colors": result["record"]["palette_colors"],
                "master_method": result["master_method"],
            }
            for result in results
        ],
    }
    contract_hash = sha256_bytes(canonical_json_bytes(contract))
    metadata = {
        "contract_sha256": contract_hash,
        "batch_id": request["batch_id"],
        "builder_sha256_lf": script_hash,
        "native_master_size": str(MASTER_SIZE),
        "lower_tiers_generated": "false",
        "pixy_used": "false",
    }
    master_bytes = png_bytes(master_atlas, metadata)
    errors = [error for result in results for error in result["errors"]]
    if not deterministic:
        errors.append("two-pass native128 projection is not deterministic")
    errors.extend(verify_encoded_atlas(master_bytes, results, contract_hash))

    manifest = {
        "schema": "hustlek-native128-batch/v1",
        "state": "ready_for_review",
        "result": "PASS" if not errors else "FAIL",
        "errors": errors,
        "batch_id": request["batch_id"],
        "contract": contract,
        "contract_sha256": contract_hash,
        "validation": {
            "two_pass_deterministic": deterministic,
            "encoded_atlases_reopened": True,
            "encoded_crop_hashes_match": not any("crop mismatch" in error for error in errors),
            "native_detail_gate": "master must lose >= configured pixel ratio when collapsed to identity grid",
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "assets": [public_asset_manifest(result) for result in results],
    }
    manifest_bytes = canonical_json_bytes(manifest, pretty=True)
    version = contract_hash[:12]
    batch_dir = OUTPUT_ROOT / "native128" / "batches" / request["batch_id"] / version
    master_path = batch_dir / "master-atlas.png"
    manifest_path = batch_dir / "manifest.json"
    batch_entry = {
        "batch_id": request["batch_id"],
        "stage": "native128-master",
        "state": "ready_for_review",
        "version": version,
        "contract_sha256": contract_hash,
        "asset_ids": asset_ids,
        "manifest_path": manifest_path.relative_to(REPO_ROOT).as_posix(),
        "manifest_sha256": sha256_bytes(manifest_bytes),
        "master_atlas_path": master_path.relative_to(REPO_ROOT).as_posix(),
        "master_atlas_sha256": sha256_bytes(master_bytes),
        "imagegen_sources": "external-provenance-by-id-and-sha256",
        "lower_tiers_generated": False,
    }
    existing_catalog = (
        json.loads(CATALOG_PATH.read_text(encoding="utf-8")) if CATALOG_PATH.exists() else None
    )
    catalog = build_catalog(existing_catalog, batch_entry)
    catalog_bytes = canonical_json_bytes(catalog, pretty=True)

    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        build_preview(results).convert("RGB").save(args.preview)

    print(f"result={manifest['result']}")
    print(f"batch_id={request['batch_id']}")
    print(f"contract_sha256={contract_hash}")
    print(f"version={version}")
    print(f"assets={len(results)}")
    print("lower_tiers_generated=false")
    for result in results:
        metrics = result["metrics"]
        print(
            f"{result['asset_id']} iou={metrics['identity_alpha_iou']:.6f} "
            f"detail_loss={metrics['native_detail_loss_ratio']:.6f} "
            f"transition_gain={metrics['transition_gain']:.3f} "
            f"colors={len(opaque_palette(result['master']))} errors={len(result['errors'])}"
        )
    if errors:
        for error in errors:
            print(f"error={error}", file=sys.stderr)
        raise SystemExit(1)
    if args.dry_run:
        print("publish=false")
        return

    publish_immutable(master_path, master_bytes)
    publish_immutable(manifest_path, manifest_bytes)
    atomic_write(CATALOG_PATH, catalog_bytes)
    print(f"master_atlas={master_path}")
    print(f"manifest={manifest_path}")
    print(f"catalog={CATALOG_PATH}")


if __name__ == "__main__":
    main()
