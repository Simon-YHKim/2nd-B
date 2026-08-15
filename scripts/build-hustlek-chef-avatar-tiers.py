#!/usr/bin/env python3
"""Build a deterministic HustleK chef-avatar NEAREST sample.

The approved 128px avatar is the only visual input.  Every smaller tier is a
direct Pillow NEAREST projection.  A coordinate whitelist may copy an existing
baseline pixel when a semantic cue is proven to disappear; all other pixels
must remain byte-identical to the baseline.  No image model or Pixy component
is used while deriving the tiers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin, __version__ as PILLOW_VERSION


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "design"
    / "hustlek-assets-pilot"
    / "avatar-chef-nearest-v1"
)
DEFAULT_MASTER = DEFAULT_OUTPUT / "128.png"

MASTER_SIZE = 128
TIER_SIZES = (16, 32, 48, 64, 128)
PRODUCTION_SIZES = (16, 32, 48, 64)
EXPECTED_MASTER_ASSET_ID = "avatars/food/chef"
EXPECTED_MASTER_RGBA_SHA256 = (
    "9956c4c6f6b7e6d0ce0accd77452a3c655e8a0ac92485d26f0cf91fe7d22a96d"
)
SOURCE_ARCHIVE_SHA256 = "2a5a6a14d81ca22dafd87b9b5f0547312cfac7682b95d74ae263c132b299238e"
SOURCE_CHEF_SVG_SHA256 = "023cc3723d64a9f27483021d98fe43a71168f13753cfb206b75b0a20adc74416"
STYLE_ATLAS_SHA256 = "2780df89aa6f1d472ec82a03610a6d7e81a20dbf9e767103cd198233e44213be"
RAW_IMAGEGEN_SHA256 = "23de26e00ed859076a6ef25220cc83e01a6611ba1e83869b3b9665d486b6ba31"

BASELINE_ALPHA_IOU_FLOORS = {16: 0.95, 32: 0.98, 48: 0.985, 64: 0.99}
CORRECTION_RATIO_LIMITS = {16: 0.05, 32: 0.02, 48: 0.015, 64: 0.01}
ADJACENT_TIGHT_IOU_FLOORS = {
    (16, 32): 0.87,
    (32, 48): 0.94,
    (48, 64): 0.95,
    (64, 128): 0.97,
}

# Filled after the first approved deterministic build.  Leaving these empty is
# allowed only while bootstrapping a new sample; the committed sample locks all
# three contracts below.
EXPECTED_CORRECTION_MANIFEST_SHA256 = (
    "8370ed143781253c78923c4e1beedf41fb8513eca23cab2e85014c134a9b0d3e"
)
EXPECTED_BASELINE_RGBA_SHA256 = {
    16: "a094a70d73c1e661ca512c489ff6395b636269a46145fd0317b1ce89502be216",
    32: "1bf8ab3632c19eed3c788fe069edf55de4094ff5cb2dced0b5c9697a8b09a547",
    48: "bb1d531c958614356b3a6a09df6ed6299a8ff742312aec3d7f51b82866d0bc5d",
    64: "1026f2a73ec8239749222df8b10e72bd7bbf5980a856894363cb476635f98628",
    128: "9956c4c6f6b7e6d0ce0accd77452a3c655e8a0ac92485d26f0cf91fe7d22a96d",
}
EXPECTED_TIER_RGBA_SHA256 = {
    16: "82a7198fc731c926eac7916837b8da9ccd4da854b5bab6b2f9a956dce3d4b783",
    32: "1bf8ab3632c19eed3c788fe069edf55de4094ff5cb2dced0b5c9697a8b09a547",
    48: "bb1d531c958614356b3a6a09df6ed6299a8ff742312aec3d7f51b82866d0bc5d",
    64: "1026f2a73ec8239749222df8b10e72bd7bbf5980a856894363cb476635f98628",
    128: "9956c4c6f6b7e6d0ce0accd77452a3c655e8a0ac92485d26f0cf91fe7d22a96d",
}

CORRECTION_PLAN: dict[int, tuple[dict[str, object], ...]] = {
    16: (
        {
            "op": "copy-recolor",
            "target": (7, 13),
            "source": (6, 7),
            "region": "garment",
            "reason": "restore left chef-coat button lost by sampling phase",
        },
        {
            "op": "copy-recolor",
            "target": (9, 13),
            "source": (6, 7),
            "region": "garment",
            "reason": "restore right chef-coat button lost by sampling phase",
        },
    ),
    32: (),
    48: (),
    64: (),
    128: (),
}

AVATAR_SPEC = {
    "hat_roi": (0.18, 0.00, 0.82, 0.34),
    "face_roi": (0.25, 0.31, 0.75, 0.69),
    "garment_roi": (0.20, 0.68, 0.80, 1.00),
    "eye_anchors_128": ((52, 63), (75, 63)),
    "mouth_anchor_128": (64, 78),
    "button_anchors_128": ((55, 104), (72, 104)),
}

FINAL_IMAGEGEN_PROMPT = """Edit Image 1 into the final canonical 128-grid pixel-art chef avatar.

Image 1: edit target. Preserve exactly the single front-facing chef identity, head-and-shoulders framing, toque silhouette, face proportions, neutral expression, chef coat shape, four buttons, centered placement, padding, and #00FF00 background.
Image 2: style-only reference. Apply only its handcrafted HustleK sprite treatment: compact stepped contours, purposeful near-black ink clusters, warm peach skin ramps, ivory fabric ramps, tiny ochre highlights, and clearly separated pixel-sized shadow/highlight clusters.

Change only the rendering treatment:
- Remove every smooth gradient, blur, semitransparent edge, and vector-like softness.
- Convert skin, hat, hair, eyes, mouth, coat, seams, and buttons to a restrained palette of flat solid colors.
- Add sparse deliberate 1-3 logical-pixel clusters for cheek warmth, hat folds, hair shine, collar, lapels, sleeve folds, and apron depth.
- Make the eyes and nose more characterful but still readable when reduced; keep identity symmetric overall with slight handcrafted highlight asymmetry.
- Keep a continuous dark outline and clear face/hat, face/hair, neck/collar, and torso/background boundaries.
- Render as if it were exactly 128x128 logical pixel art enlarged for display: every mark grid-aligned, square-edged, and integer-sized.

Hard invariants: no pose change, no crop change, no extra character, no prop, no glasses, no text, no logo, no watermark, no scenery. Background must remain one perfectly flat solid #00FF00 with no shadows, texture, glow, halo, or green inside the subject. No gradients, no antialiasing, no dithering noise, no 3D, no photorealism."""


RGBA = tuple[int, int, int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the locked-master HustleK chef avatar sample."
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


def foreground_count(image: Image.Image) -> int:
    return sum(alpha > 0 for alpha in image.getchannel("A").get_flattened_data())


def color_count(image: Image.Image) -> int:
    return len({rgba for rgba in image.get_flattened_data() if rgba[3] > 0})


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def validate_master(master: Image.Image, path: Path) -> dict[str, object]:
    metadata = dict(Image.open(path).info)
    errors: list[str] = []
    if master.mode != "RGBA":
        errors.append(f"mode must be RGBA, got {master.mode}")
    if master.size != (MASTER_SIZE, MASTER_SIZE):
        errors.append(f"size must be 128x128, got {master.size}")

    alpha_values = set(master.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        errors.append(f"alpha must be binary, got {sorted(alpha_values)}")
    hidden_rgb = sum(
        rgba[3] == 0 and rgba[:3] != (0, 0, 0)
        for rgba in master.get_flattened_data()
    )
    if hidden_rgb:
        errors.append(f"transparent pixels with hidden RGB: {hidden_rgb}")
    if metadata.get("asset_id") != EXPECTED_MASTER_ASSET_ID:
        errors.append(
            f"asset_id must be {EXPECTED_MASTER_ASSET_ID!r}, "
            f"got {metadata.get('asset_id')!r}"
        )

    rgba_hash = decoded_rgba_sha256(master)
    if rgba_hash != EXPECTED_MASTER_RGBA_SHA256:
        errors.append(
            "master decoded hash changed: "
            f"expected {EXPECTED_MASTER_RGBA_SHA256}, got {rgba_hash}"
        )

    bbox = alpha_bbox(master)
    if bbox is None:
        errors.append("master has no foreground")
    else:
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        center_x = (bbox[0] + bbox[2]) / 2
        if not 0.50 <= width / MASTER_SIZE <= 0.65:
            errors.append(f"master width ratio out of range: {width / MASTER_SIZE:.4f}")
        if height / MASTER_SIZE < 0.95:
            errors.append(f"master height ratio too small: {height / MASTER_SIZE:.4f}")
        if abs(center_x - MASTER_SIZE / 2) > 2:
            errors.append(f"master x center drifted: {center_x:.2f}")

    if errors:
        raise ValueError("Invalid chef master:\n- " + "\n- ".join(errors))
    return metadata


def build_nearest_baseline(master: Image.Image, size: int) -> Image.Image:
    if size == MASTER_SIZE:
        return master.copy()
    return master.resize((size, size), Image.Resampling.NEAREST)


def apply_surgical_corrections(baseline: Image.Image, size: int) -> Image.Image:
    corrected = baseline.copy()
    pixels = corrected.load()
    baseline_pixels = baseline.load()
    for operation in CORRECTION_PLAN[size]:
        op = str(operation["op"])
        target = tuple(operation["target"])
        source = tuple(operation["source"])
        if op not in {"copy-add", "copy-recolor"}:
            raise ValueError(f"Unsupported correction op: {op}")
        if not all(0 <= value < size for value in (*target, *source)):
            raise ValueError(f"Correction outside {size}px canvas: {operation}")
        source_rgba = baseline_pixels[source]
        target_rgba = baseline_pixels[target]
        if source_rgba[3] == 0:
            raise ValueError(f"Correction source must be opaque: {operation}")
        if op == "copy-add" and target_rgba[3] != 0:
            raise ValueError(f"copy-add target must be transparent: {operation}")
        if op == "copy-recolor" and target_rgba[3] == 0:
            raise ValueError(f"copy-recolor target must be opaque: {operation}")
        region = str(operation.get("region", ""))
        if region != "garment":
            raise ValueError(f"Unsupported correction region: {operation}")
        if not (
            0.20 * size <= target[0] < 0.80 * size
            and 0.68 * size <= target[1] < size
        ):
            raise ValueError(f"Garment correction target is outside garment ROI: {operation}")
        source_luma = (
            0.2126 * source_rgba[0]
            + 0.7152 * source_rgba[1]
            + 0.0722 * source_rgba[2]
        )
        if "button" in str(operation.get("reason", "")) and source_luma >= 80:
            raise ValueError(f"Button correction source must be dark ink: {operation}")
        pixels[target] = source_rgba
    return corrected


def build_tiers(master: Image.Image) -> tuple[dict[int, Image.Image], dict[int, Image.Image]]:
    baselines = {
        size: build_nearest_baseline(master, size)
        for size in TIER_SIZES
    }
    tiers = {
        size: apply_surgical_corrections(baselines[size], size)
        for size in TIER_SIZES
    }
    return baselines, tiers


def canvas_alpha_iou(left: Image.Image, right: Image.Image) -> float:
    left_alpha = left.getchannel("A").get_flattened_data()
    right_alpha = right.getchannel("A").get_flattened_data()
    intersection = 0
    union = 0
    for left_value, right_value in zip(left_alpha, right_alpha, strict=True):
        left_on = left_value > 0
        right_on = right_value > 0
        intersection += left_on and right_on
        union += left_on or right_on
    return intersection / union if union else 1.0


def tight_alpha_iou(left: Image.Image, right: Image.Image, canvas: int = 128) -> float:
    def normalized(image: Image.Image) -> Image.Image:
        alpha = image.getchannel("A")
        bbox = alpha.getbbox()
        if bbox is None:
            return Image.new("L", (canvas, canvas), 0)
        cropped = alpha.crop(bbox)
        return cropped.resize((canvas, canvas), Image.Resampling.NEAREST)

    left_alpha = normalized(left).get_flattened_data()
    right_alpha = normalized(right).get_flattened_data()
    intersection = 0
    union = 0
    for left_value, right_value in zip(left_alpha, right_alpha, strict=True):
        left_on = left_value > 0
        right_on = right_value > 0
        intersection += left_on and right_on
        union += left_on or right_on
    return intersection / union if union else 1.0


def eight_connected_components(image: Image.Image) -> list[int]:
    alpha = image.getchannel("A")
    remaining = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if alpha.getpixel((x, y)) > 0
    }
    component_sizes: list[int] = []
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        size = 1
        while stack:
            x, y = stack.pop()
            for delta_y in (-1, 0, 1):
                for delta_x in (-1, 0, 1):
                    neighbor = (x + delta_x, y + delta_y)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        stack.append(neighbor)
                        size += 1
        component_sizes.append(size)
    return sorted(component_sizes, reverse=True)


def roi_box(normalized_box: tuple[float, float, float, float], size: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = normalized_box
    return (
        max(0, math.floor(x0 * size)),
        max(0, math.floor(y0 * size)),
        min(size, math.ceil(x1 * size)),
        min(size, math.ceil(y1 * size)),
    )


def pixels_in_box(image: Image.Image, box: tuple[int, int, int, int]) -> list[RGBA]:
    return [
        image.getpixel((x, y))
        for y in range(box[1], box[3])
        for x in range(box[0], box[2])
    ]


def luma(rgba: RGBA) -> float:
    red, green, blue, _ = rgba
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def scaled_anchor(anchor: tuple[int, int], size: int) -> tuple[int, int]:
    return (
        min(size - 1, round(anchor[0] * size / MASTER_SIZE)),
        min(size - 1, round(anchor[1] * size / MASTER_SIZE)),
    )


def dark_count_near(image: Image.Image, anchor: tuple[int, int], radius: int) -> int:
    center_x, center_y = scaled_anchor(anchor, image.width)
    count = 0
    for y in range(max(0, center_y - radius), min(image.height, center_y + radius + 1)):
        for x in range(max(0, center_x - radius), min(image.width, center_x + radius + 1)):
            rgba = image.getpixel((x, y))
            count += rgba[3] > 0 and luma(rgba) < 80
    return count


def maximum_dark_run(image: Image.Image, box: tuple[int, int, int, int]) -> int:
    best = 0
    for y in range(box[1], box[3]):
        run = 0
        for x in range(box[0], box[2]):
            rgba = image.getpixel((x, y))
            if rgba[3] > 0 and luma(rgba) < 80:
                run += 1
                best = max(best, run)
            else:
                run = 0
    return best


def semantic_audit(image: Image.Image, size: int) -> tuple[dict[str, object], list[str]]:
    errors: list[str] = []
    radius = 1 if size <= 32 else 2 if size <= 64 else 3
    feature_minimum = {16: 1, 32: 1, 48: 3, 64: 4, 128: 8}[size]
    hat_box = roi_box(AVATAR_SPEC["hat_roi"], size)
    face_box = roi_box(AVATAR_SPEC["face_roi"], size)
    garment_box = roi_box(AVATAR_SPEC["garment_roi"], size)
    hat_pixels = pixels_in_box(image, hat_box)
    face_pixels = pixels_in_box(image, face_box)
    garment_pixels = pixels_in_box(image, garment_box)

    bright_hat = sum(rgba[3] > 0 and luma(rgba) >= 210 for rgba in hat_pixels)
    dark_band_box = roi_box((0.18, 0.27, 0.82, 0.36), size)
    dark_band_run = maximum_dark_run(image, dark_band_box)
    eye_counts = [
        dark_count_near(image, anchor, radius)
        for anchor in AVATAR_SPEC["eye_anchors_128"]
    ]
    mouth_count = dark_count_near(image, AVATAR_SPEC["mouth_anchor_128"], radius)
    button_counts = [
        dark_count_near(image, anchor, radius)
        for anchor in AVATAR_SPEC["button_anchors_128"]
    ]
    warm_face = sum(
        rgba[3] > 0
        and rgba[0] >= 210
        and rgba[0] - rgba[1] >= 8
        and rgba[1] - rgba[2] >= 4
        for rgba in face_pixels
    )
    bright_garment = sum(
        rgba[3] > 0 and luma(rgba) >= 205 for rgba in garment_pixels
    )
    dark_garment = sum(
        rgba[3] > 0 and luma(rgba) < 80 for rgba in garment_pixels
    )

    if bright_hat < max(4, round(size * size * 0.05)):
        errors.append(f"toque bright area too small: {bright_hat}")
    if dark_band_run < max(3, math.ceil(size * 0.38)):
        errors.append(f"toque dark band is not continuous enough: {dark_band_run}")
    if min(eye_counts) < feature_minimum:
        errors.append(f"one or both eyes disappeared: {eye_counts}")
    if mouth_count < feature_minimum:
        errors.append(f"mouth cue disappeared: {mouth_count}")
    if min(button_counts) < feature_minimum:
        errors.append(f"one or both coat-button cues disappeared: {button_counts}")
    if warm_face < max(4, round(size * size * 0.025)):
        errors.append(f"warm face area too small: {warm_face}")
    if bright_garment < max(4, round(size * size * 0.04)):
        errors.append(f"bright chef garment area too small: {bright_garment}")
    if dark_garment < 2:
        errors.append(f"garment contrast too small: {dark_garment}")

    metrics = {
        "hat_bright_pixels": bright_hat,
        "hat_dark_band_max_run": dark_band_run,
        "eye_dark_pixels": eye_counts,
        "mouth_dark_pixels": mouth_count,
        "button_dark_pixels": button_counts,
        "warm_face_pixels": warm_face,
        "garment_bright_pixels": bright_garment,
        "garment_dark_pixels": dark_garment,
    }
    return metrics, errors


def correction_audit(
    baseline: Image.Image,
    corrected: Image.Image,
    size: int,
) -> dict[str, object]:
    baseline_pixels = list(baseline.get_flattened_data())
    corrected_pixels = list(corrected.get_flattened_data())
    changed = {
        (index % size, index // size)
        for index, (left, right) in enumerate(
            zip(baseline_pixels, corrected_pixels, strict=True)
        )
        if left != right
    }
    planned = {tuple(operation["target"]) for operation in CORRECTION_PLAN[size]}
    additions = 0
    removals = 0
    recolors = 0
    for x, y in changed:
        left = baseline.getpixel((x, y))
        right = corrected.getpixel((x, y))
        if left[3] == 0 and right[3] > 0:
            additions += 1
        elif left[3] > 0 and right[3] == 0:
            removals += 1
        else:
            recolors += 1

    return {
        "planned_targets": [list(target) for target in sorted(planned)],
        "changed_targets": [list(target) for target in sorted(changed)],
        "unplanned_targets": [list(target) for target in sorted(changed - planned)],
        "no_effect_targets": [list(target) for target in sorted(planned - changed)],
        "changed_pixels": len(changed),
        "alpha_added": additions,
        "alpha_removed": removals,
        "rgba_recolored": recolors,
        "changed_ratio_of_baseline_foreground": (
            len(changed) / max(1, foreground_count(baseline))
        ),
        "canvas_alpha_iou": canvas_alpha_iou(baseline, corrected),
        "baseline_bbox": alpha_bbox(baseline),
        "corrected_bbox": alpha_bbox(corrected),
    }


def validate_tier(
    master_palette: set[RGBA],
    baseline: Image.Image,
    corrected: Image.Image,
    size: int,
) -> tuple[dict[str, object], list[str]]:
    errors: list[str] = []
    correction = correction_audit(baseline, corrected, size)
    semantic, semantic_errors = semantic_audit(corrected, size)
    errors.extend(semantic_errors)

    if corrected.size != (size, size):
        errors.append(f"wrong canvas: {corrected.size}")
    alpha_values = set(corrected.getchannel("A").get_flattened_data())
    if not alpha_values <= {0, 255}:
        errors.append(f"non-binary alpha: {sorted(alpha_values)}")
    hidden_rgb = sum(
        rgba[3] == 0 and rgba[:3] != (0, 0, 0)
        for rgba in corrected.get_flattened_data()
    )
    if hidden_rgb:
        errors.append(f"transparent pixels with hidden RGB: {hidden_rgb}")
    tier_palette = {rgba for rgba in corrected.get_flattened_data() if rgba[3] > 0}
    if not tier_palette <= master_palette:
        errors.append("tier introduced colors outside the master palette")
    if correction["unplanned_targets"]:
        errors.append(f"unplanned pixel changes: {correction['unplanned_targets']}")
    if correction["no_effect_targets"]:
        errors.append(f"declared corrections had no effect: {correction['no_effect_targets']}")

    if size in PRODUCTION_SIZES:
        if correction["canvas_alpha_iou"] < BASELINE_ALPHA_IOU_FLOORS[size]:
            errors.append(
                f"baseline alpha IoU too low: {correction['canvas_alpha_iou']:.6f}"
            )
        if correction["changed_ratio_of_baseline_foreground"] > CORRECTION_RATIO_LIMITS[size]:
            errors.append(
                "correction ratio too high: "
                f"{correction['changed_ratio_of_baseline_foreground']:.6f}"
            )
    elif decoded_rgba_sha256(corrected) != EXPECTED_MASTER_RGBA_SHA256:
        errors.append("128px tier must be decoded-byte identical to the master")

    baseline_bbox = correction["baseline_bbox"]
    corrected_bbox = correction["corrected_bbox"]
    if baseline_bbox is None or corrected_bbox is None:
        errors.append("empty alpha bbox")
    elif max(abs(left - right) for left, right in zip(baseline_bbox, corrected_bbox, strict=True)) > 1:
        errors.append(f"bbox moved by more than 1px: {baseline_bbox} -> {corrected_bbox}")

    baseline_components = eight_connected_components(baseline)
    corrected_components = eight_connected_components(corrected)
    if len(corrected_components) > len(baseline_components):
        errors.append(
            "correction increased foreground components: "
            f"{len(baseline_components)} -> {len(corrected_components)}"
        )
    if corrected_components and corrected_components[0] / sum(corrected_components) < 0.995:
        errors.append(f"largest foreground component too small: {corrected_components}")

    metrics = {
        "baseline_decoded_rgba_sha256": decoded_rgba_sha256(baseline),
        "final_decoded_rgba_sha256": decoded_rgba_sha256(corrected),
        "foreground_pixels": foreground_count(corrected),
        "opaque_colors": color_count(corrected),
        "bbox": corrected_bbox,
        "components_8_neighbor": corrected_components,
        "correction": correction,
        "semantic": semantic,
    }
    return metrics, errors


def checkerboard(width: int, height: int, tile: int = 8) -> Image.Image:
    image = Image.new("RGBA", (width, height), (26, 31, 42, 255))
    draw = ImageDraw.Draw(image)
    colors = ((34, 41, 54, 255), (43, 51, 66, 255))
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            draw.rectangle(
                (x, y, min(width - 1, x + tile - 1), min(height - 1, y + tile - 1)),
                fill=colors[((x // tile) + (y // tile)) % 2],
            )
    return image


def paste_centered(canvas: Image.Image, sprite: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    x = x0 + (x1 - x0 - sprite.width) // 2
    y = y0 + (y1 - y0 - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))


def integer_zoom(image: Image.Image, maximum: int = 128) -> Image.Image:
    scale = max(1, maximum // image.width)
    return image.resize(
        (image.width * scale, image.height * scale),
        Image.Resampling.NEAREST,
    )


def correction_diff_visual(baseline: Image.Image, corrected: Image.Image) -> Image.Image:
    visual = Image.new("RGBA", baseline.size, (0, 0, 0, 0))
    output = visual.load()
    for y in range(baseline.height):
        for x in range(baseline.width):
            left = baseline.getpixel((x, y))
            right = corrected.getpixel((x, y))
            if left == right:
                if right[3] > 0:
                    output[x, y] = (118, 128, 147, 105)
            elif left[3] == 0 and right[3] > 0:
                output[x, y] = (35, 225, 210, 255)
            elif left[3] > 0 and right[3] == 0:
                output[x, y] = (255, 176, 67, 255)
            else:
                output[x, y] = (255, 72, 190, 255)
    return visual


def build_atlas(tiers: dict[int, Image.Image]) -> Image.Image:
    """Pack native transparent tiers into fixed 128px horizontal cells."""
    cell_size = MASTER_SIZE
    sheet = Image.new(
        "RGBA",
        (cell_size * len(TIER_SIZES), cell_size),
        (0, 0, 0, 0),
    )
    for index, size in enumerate(TIER_SIZES):
        x = index * cell_size + (cell_size - size) // 2
        y = (cell_size - size) // 2
        sheet.alpha_composite(tiers[size], (x, y))
    return sheet


def build_comparison(
    baselines: dict[int, Image.Image],
    tiers: dict[int, Image.Image],
) -> Image.Image:
    cell_width = 160
    sheet = Image.new("RGBA", (cell_width * len(PRODUCTION_SIZES), 535), (15, 19, 27, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((12, 10), "Fine-tuned NEAREST vs plain NEAREST", fill=(242, 239, 232, 255), font=font)
    rows = (
        ("Fine-tuned", tiers),
        ("Plain NEAREST", baselines),
    )
    for column, size in enumerate(PRODUCTION_SIZES):
        x0 = column * cell_width
        draw.text((x0 + 10, 35), f"{size}px", fill=(235, 240, 248, 255), font=font)
        for row, (label, source) in enumerate(rows):
            y0 = 56 + row * 160
            draw.text((x0 + 10, y0), label, fill=(166, 180, 201, 255), font=font)
            panel = checkerboard(136, 128)
            paste_centered(panel, integer_zoom(source[size]), (0, 0, 136, 128))
            sheet.alpha_composite(panel, (x0 + 7, y0 + 20))
        y0 = 376
        draw.text((x0 + 10, y0), "Correction diff", fill=(166, 180, 201, 255), font=font)
        diff = integer_zoom(correction_diff_visual(baselines[size], tiers[size]))
        panel = checkerboard(136, 128)
        paste_centered(panel, diff, (0, 0, 136, 128))
        sheet.alpha_composite(panel, (x0 + 7, y0 + 20))
    draw.text(
        (12, 519),
        "diff: recolor=magenta, add=cyan, remove=amber, unchanged foreground=gray",
        fill=(132, 146, 166, 255),
        font=font,
    )
    return sheet


def encode_png(image: Image.Image, metadata: dict[str, str]) -> bytes:
    png_info = PngImagePlugin.PngInfo()
    for key, value in metadata.items():
        png_info.add_text(key, value)
    output = BytesIO()
    image.save(
        output,
        format="PNG",
        pnginfo=png_info,
        optimize=False,
        compress_level=9,
    )
    return output.getvalue()


def atomic_write(path: Path, data: bytes) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def canonical_manifest_hash() -> str:
    manifest = {
        str(size): [
            {
                **operation,
                "target": list(operation["target"]),
                "source": list(operation["source"]),
            }
            for operation in CORRECTION_PLAN[size]
        ]
        for size in TIER_SIZES
    }
    return sha256_bytes(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )


def main() -> None:
    args = parse_args()
    master_path = args.master.resolve()
    output = args.output.resolve()

    source_master = Image.open(master_path)
    master = source_master.convert("RGBA")
    master_metadata = validate_master(master, master_path)
    master_palette = {rgba for rgba in master.get_flattened_data() if rgba[3] > 0}

    baselines, tiers = build_tiers(master)
    repeat_baselines, repeat_tiers = build_tiers(master)
    deterministic = all(
        decoded_rgba_sha256(baselines[size])
        == decoded_rgba_sha256(repeat_baselines[size])
        and decoded_rgba_sha256(tiers[size])
        == decoded_rgba_sha256(repeat_tiers[size])
        for size in TIER_SIZES
    )

    errors: list[str] = []
    tier_report: dict[str, object] = {}
    for size in TIER_SIZES:
        metrics, tier_errors = validate_tier(
            master_palette, baselines[size], tiers[size], size
        )
        tier_report[str(size)] = {"metrics": metrics, "errors": tier_errors}
        errors.extend(f"{size}px: {message}" for message in tier_errors)

    adjacency: dict[str, object] = {}
    for pair, floor in ADJACENT_TIGHT_IOU_FLOORS.items():
        score = tight_alpha_iou(tiers[pair[0]], tiers[pair[1]])
        passed = score >= floor
        adjacency[f"{pair[0]}->{pair[1]}"] = {
            "tight_alpha_iou": score,
            "floor": floor,
            "pass": passed,
        }
        if not passed:
            errors.append(
                f"{pair[0]}->{pair[1]} tight alpha IoU {score:.6f} < {floor:.6f}"
            )

    manifest_hash = canonical_manifest_hash()
    baseline_hashes = {
        size: decoded_rgba_sha256(baselines[size]) for size in TIER_SIZES
    }
    tier_hashes = {size: decoded_rgba_sha256(tiers[size]) for size in TIER_SIZES}
    locks_enabled = bool(
        EXPECTED_CORRECTION_MANIFEST_SHA256
        and EXPECTED_BASELINE_RGBA_SHA256
        and EXPECTED_TIER_RGBA_SHA256
    )
    if not locks_enabled:
        errors.append("approved hash locks must all be configured")
    else:
        if manifest_hash != EXPECTED_CORRECTION_MANIFEST_SHA256:
            errors.append("correction manifest hash does not match approved value")
        if baseline_hashes != EXPECTED_BASELINE_RGBA_SHA256:
            errors.append("baseline decoded hashes do not match approved values")
        if tier_hashes != EXPECTED_TIER_RGBA_SHA256:
            errors.append("final tier decoded hashes do not match approved values")
    if not deterministic:
        errors.append("in-memory two-pass generation was not deterministic")

    atlas_image = build_atlas(tiers)
    atlas_layout: dict[str, object] = {}
    for index, size in enumerate(TIER_SIZES):
        sprite_x = index * MASTER_SIZE + (MASTER_SIZE - size) // 2
        sprite_y = (MASTER_SIZE - size) // 2
        sprite_box = (sprite_x, sprite_y, sprite_x + size, sprite_y + size)
        atlas_layout[str(size)] = {
            "cell": [index * MASTER_SIZE, 0, MASTER_SIZE, MASTER_SIZE],
            "sprite_rect": list(sprite_box),
        }
        extracted = atlas_image.crop(sprite_box)
        if decoded_rgba_sha256(extracted) != tier_hashes[size]:
            errors.append(f"{size}px atlas crop does not match approved tier bytes")

    if errors:
        print("result=FAIL")
        for error in errors:
            print(f"error={error}")
        raise SystemExit("\n".join(errors))

    script_hash = sha256_text_lf(Path(__file__))
    common_metadata = {
        "asset_id": EXPECTED_MASTER_ASSET_ID,
        "design_mode": "hustlek-avatar-nearest-surgical-v1",
        "master_decoded_rgba_sha256": EXPECTED_MASTER_RGBA_SHA256,
        "correction_manifest_sha256": manifest_hash,
        "script_sha256_lf": script_hash,
        "derived_with_imagegen": "false",
        "pixy_used": "false",
    }
    atlas_path = output / "chef-nearest-v1-atlas.png"
    comparison_path = output / "chef-nearest-v1-comparison.png"
    validation_path = output / "validation.json"
    atlas_bytes = encode_png(
        atlas_image,
        {
            **common_metadata,
            "atlas_layout": "horizontal 128px cells; 16,32,48,64,128; native sprites centered",
        },
    )
    comparison_bytes = encode_png(
        build_comparison(baselines, tiers),
        common_metadata,
    )

    report = {
        "schema": "hustlek-avatar-nearest-validation/v1",
        "result": "PASS",
        "errors": [],
        "asset": {
            "asset_id": EXPECTED_MASTER_ASSET_ID,
            "source_archive": "PIXEL-CLAY Design System.zip",
            "source_archive_sha256": SOURCE_ARCHIVE_SHA256,
            "source_asset": "export/avatars/food/chef.svg",
            "source_asset_sha256": SOURCE_CHEF_SVG_SHA256,
            "style_reference": "design/hustlek-opening-v1/hustlek-opening-atlas.png",
            "style_reference_sha256": STYLE_ATLAS_SHA256,
        },
        "generation_contract": {
            "master_first": True,
            "master_size": 128,
            "production_sizes": list(PRODUCTION_SIZES),
            "reference_sizes": [128],
            "resampling": "Pillow Image.Resampling.NEAREST",
            "sibling_tier_inputs": False,
            "imagegen_used_for_master": True,
            "imagegen_used_for_derived_tiers": False,
            "pixy_used": False,
            "corrections": "coordinate-whitelisted baseline pixel copies only",
        },
        "master": {
            "path": master_path.relative_to(REPO_ROOT).as_posix(),
            "file_sha256": sha256_file(master_path),
            "decoded_rgba_sha256": decoded_rgba_sha256(master),
            "metadata": master_metadata,
            "bbox": alpha_bbox(master),
            "foreground_pixels": foreground_count(master),
            "opaque_colors": color_count(master),
            "imagegen_source_id": master_metadata.get("imagegen_source"),
            "imagegen_source_sha256": RAW_IMAGEGEN_SHA256,
            "final_prompt": FINAL_IMAGEGEN_PROMPT,
        },
        "locks": {
            "enabled": locks_enabled,
            "correction_manifest_sha256": manifest_hash,
            "baseline_decoded_rgba_sha256": {
                str(size): value for size, value in baseline_hashes.items()
            },
            "tier_decoded_rgba_sha256": {
                str(size): value for size, value in tier_hashes.items()
            },
        },
        "tiers": tier_report,
        "adjacent_tiers": adjacency,
        "determinism": {
            "two_pass_in_memory_match": deterministic,
            "python": platform.python_version(),
            "pillow": PILLOW_VERSION,
        },
        "provenance": {
            "script": Path(__file__).relative_to(REPO_ROOT).as_posix(),
            "script_sha256_lf": script_hash,
            "master_preparation": "built-in ImageGen -> chroma removal -> 128px NEAREST grid projection -> 24-color opaque median-cut",
        },
        "artifacts": {
            "atlas": atlas_path.relative_to(REPO_ROOT).as_posix(),
            "atlas_sha256": sha256_bytes(atlas_bytes),
            "atlas_canvas": [atlas_image.width, atlas_image.height],
            "atlas_layout": atlas_layout,
            "comparison": comparison_path.relative_to(REPO_ROOT).as_posix(),
            "comparison_sha256": sha256_bytes(comparison_bytes),
        },
    }
    validation_bytes = (
        json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    ).encode("utf-8")

    output.mkdir(parents=True, exist_ok=True)
    atomic_write(atlas_path, atlas_bytes)
    atomic_write(comparison_path, comparison_bytes)
    atomic_write(validation_path, validation_bytes)

    print(f"result={report['result']}")
    print(f"master_rgba_sha256={decoded_rgba_sha256(master)}")
    print(f"correction_manifest_sha256={manifest_hash}")
    for size in TIER_SIZES:
        correction = tier_report[str(size)]["metrics"]["correction"]
        print(
            f"{size}px baseline={baseline_hashes[size]} final={tier_hashes[size]} "
            f"changed={correction['changed_pixels']} colors={color_count(tiers[size])}"
        )
    print(f"atlas={atlas_path}")
    print(f"comparison={comparison_path}")
    print(f"validation={validation_path}")


if __name__ == "__main__":
    main()
