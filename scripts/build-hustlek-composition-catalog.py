#!/usr/bin/env python3
"""Build the audited HustleK avatar/icon composition catalog.

The catalog is metadata only. Existing native128 masters remain immutable, and
attachment variants are explicitly marked pending until they are authored at
their final size on a 128x128 transparent canvas.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import zipfile
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = Path(r"C:\Users\202502\Downloads\PIXEL-CLAY Design System.zip")
DEFAULT_NATIVE_CATALOG = ROOT / "design/hustlek-assets-v1/catalog.json"
DEFAULT_OUTPUT = ROOT / "design/hustlek-composition-v1/catalog.json"

LAYER_ORDER = [
    {"id": "extra_back", "z": 10},
    {"id": "hair_back", "z": 20},
    {"id": "base", "z": 30},
    {"id": "garment", "z": 40},
    {"id": "hair_front", "z": 50},
    {"id": "face", "z": 60},
    {"id": "headwear", "z": 70},
    {"id": "extra_face_neck_badge", "z": 75},
    {"id": "extra_hand", "z": 80},
    {"id": "extra_foreground", "z": 90},
]

ANCHORS = {
    "headwear": {"x": 64, "y": 15, "z": 70, "fit_box": [28, 0, 72, 46]},
    "face": {"x": 64, "y": 55, "z": 75, "fit_box": [37, 39, 54, 32]},
    "neck": {"x": 64, "y": 82, "z": 75, "fit_box": [40, 68, 48, 34]},
    "chest": {"x": 64, "y": 101, "z": 75, "fit_box": [48, 82, 32, 38]},
    "back": {"x": 64, "y": 76, "z": 10, "fit_box": [29, 34, 70, 84]},
    "wrist_left": {"x": 30, "y": 101, "z": 80, "fit_box": [18, 89, 24, 24]},
    "wrist_right": {"x": 98, "y": 101, "z": 80, "fit_box": [86, 89, 24, 24]},
    "feet": {"x": 64, "y": 117, "z": 80, "fit_box": [40, 104, 48, 24]},
    "hand_left": {"x": 29, "y": 101, "z": 80, "fit_box": [7, 71, 44, 57]},
    "hand_right": {"x": 99, "y": 101, "z": 80, "fit_box": [77, 71, 44, 57]},
    "side_right": {"x": 101, "y": 96, "z": 80, "fit_box": [74, 64, 54, 64]},
    "foreground": {"x": 64, "y": 111, "z": 90, "fit_box": [16, 80, 96, 48]},
}

ACCESSORY_SLOTS = {
    "backpack": "back",
    "gradcap": "headwear",
    "headphones": "headwear",
    "vrHeadset": "face",
    "watch": "wrist_left",
    "stethoscope": "neck",
    "medMask": "face",
    "crown": "headwear",
    "ring": "wrist_right",
    "hardhat": "headwear",
    "helmet": "headwear",
    "wizardHat": "headwear",
    "fireHelmet": "headwear",
    "helmetArmy": "headwear",
    "tie": "neck",
    "headset": "headwear",
    "shoe": "feet",
}

BADGE_NAMES = {
    "badge", "certificate", "error", "flag", "heart", "help", "idBadge",
    "idCard", "info", "medal", "skillBadge", "star", "success", "trophy", "warn",
}

TOOL_NAMES = {
    "axe", "axeBattle", "blueprint", "book", "bow", "briefcase", "broom",
    "brush", "calculator", "calligraphy", "camera", "chalk", "chopsticks",
    "clapper", "clipboard", "coffee", "comb", "compass", "contract", "crutch",
    "cutlery", "dagger", "drill", "extinguisher", "fishing", "flask", "gamepad",
    "gavel", "guitar", "hairdryer", "hammer", "handcuffs", "iron", "keyCard",
    "keyboard", "knife", "laptop", "level", "lifeRing", "lipstick", "lute",
    "map", "medkit", "megaphone", "mic", "microscope", "mirror", "mortar",
    "mouse", "nailGun", "nailPolish", "needle", "net", "paintRoller", "palette",
    "pan", "pen", "pencil", "perfume", "phone", "portfolio", "presentation",
    "radar", "razor", "resume", "rollingPin", "ruler", "saw", "scalpel",
    "scissors", "scroll", "screwdriver", "sewing", "shieldKite", "shovel",
    "spellbook", "spray", "staff", "stamp", "steering", "sword", "syringe",
    "tablet", "tattooGun", "telescope", "thermometer", "toolbox", "torch", "tray",
    "trophy", "umbrella", "vacuum", "wand", "wateringCan", "whisk", "wrench",
}

PROP_NAMES = {
    "abacus", "alarm", "ambulance", "anchor", "anvil", "apple", "atm", "bag",
    "bandage", "bank", "banknote", "basket", "bath", "battery", "beachDay",
    "bed", "beer", "beehive", "bellDesk", "bill", "blackboard", "bolt", "bottle",
    "bowl", "bread", "brick", "building", "bulb", "bus", "cake", "campfire",
    "candle", "carrot", "cart", "chest", "chicken", "chip", "coin", "coins",
    "cone", "coupon", "crane", "creditCard", "desktop", "dice", "dna", "drone",
    "dumbbell", "egg", "factory", "film", "fire", "fish", "flower", "forklift",
    "gasPump", "gem", "ghost", "gift", "globe", "greenhouse", "grill", "hammock",
    "hdd", "helicopter", "honey", "hospital", "hourglass", "iceCream", "ivDrip",
    "journal", "ladder", "ledger", "logCut", "lotus", "lungs", "massage",
    "milkCan", "moneyBag", "mountain", "note", "package", "paw", "piano", "piggy",
    "pill", "plane", "plantPot", "popcorn", "portal", "pottery", "prescription",
    "printer", "potion", "rainbow", "ramen", "receipt", "register", "road", "robot",
    "rocket", "route", "rune", "scaleWeight", "sdCard", "seed", "server", "sheep",
    "ship", "signpost", "siren", "skull", "sofa", "speaker", "sprout", "stairs",
    "store", "sushi", "taxi", "tea", "tent", "tooth", "tractor", "trafficLight",
    "train", "tree", "treeRound", "truck", "tv", "usb", "vitamins", "wallet",
    "warehouse", "washer", "waterGlass", "webcam", "wheat", "wheelchair", "wine",
    "xray",
}

FOREGROUND_PROPS = {
    "ambulance", "bed", "blackboard", "building", "bus", "crane", "factory",
    "forklift", "greenhouse", "helicopter", "hospital", "plane", "ship", "sofa",
    "store", "taxi", "tent", "tractor", "train", "truck", "warehouse", "wheelchair",
}

PILOT_VARIANTS = {
    "crown": {
        "path": "design/hustlek-composition-v1/pilot/crown-headwear-128.png",
        "raw_imagegen_source_id": "exec-122c133e-0409-44d4-b894-bf25d10542b8.png",
        "raw_imagegen_sha256": "44968ff24cb0d7719fd86505b9d746d3e213a7a7c55878c5b62e26a9e889f5eb",
        "method": "per-asset-imagegen-chroma-native128-projection-translation-only",
        "translation": [0, 0],
    },
    "idBadge": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [0, 0, 128, 128],
        "raw_imagegen_source_id": "exec-069a6ec8-4641-402c-832f-00611a4eb793.png",
        "raw_imagegen_sha256": "0b942d1c527572a8076973d4dae04f430e5ffe301470c367b7784497555ba8c0",
        "method": "per-asset-imagegen-transparent-native128-projection-translation-only",
        "translation": [0, 12],
    },
    "wrench": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [128, 0, 128, 128],
        "raw_imagegen_source_id": "exec-1a2ff6c0-9b1a-42fe-a534-098e3f801318.png",
        "raw_imagegen_sha256": "51c6cd34978c703cf44c318a41e55352077e76cbc82adb371339d3a9de348aa3",
        "method": "per-asset-imagegen-chroma-native128-projection-translation-only",
        "translation": [0, 9],
    },
    "camera": {
        "path": "design/hustlek-composition-v1/pilot/attachment-pilots-atlas.png",
        "atlas_crop": [256, 0, 128, 128],
        "raw_imagegen_source_id": "exec-b9c855c7-dfa2-4ee4-819e-c18228851b73.png",
        "raw_imagegen_sha256": "3ac52681d83400a7102bf072dc38213bf109d5b68ca9a2040eb3cde7fd3b72c6",
        "method": "per-asset-imagegen-chroma-native128-projection",
        "translation": [0, 0],
    },
}

AVATAR_LAYER_ATLAS = "design/hustlek-composition-v1/avatar-layers-atlas.png"
AVATAR_LAYER_IDS = ["base", "hair", "face", "headwear", "garment", "extra"]
AVATAR_RECOMPOSITION_ORDER = ["base", "garment", "hair", "face", "headwear", "extra"]
ICON_ATTACHMENT_ATLAS = "design/hustlek-composition-v1/icon-attachments-atlas.png"
ICON_ATTACHMENT_COLUMNS = 16


@lru_cache(maxsize=None)
def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def find_member(archive: zipfile.ZipFile, suffix: str) -> str:
    normalized = suffix.replace("\\", "/")
    matches = [name for name in archive.namelist() if name.replace("\\", "/").endswith(normalized)]
    if len(matches) != 1:
        raise ValueError(f"expected one ZIP member ending in {suffix!r}, found {len(matches)}")
    return matches[0]


def parse_svg_spec(svg_text: str, asset_id: str) -> dict[str, Any]:
    decoded = html.unescape(svg_text)
    match = re.search(r"spec:\s*(\{[^\r\n<]+\})", decoded)
    if not match:
        raise ValueError(f"missing spec JSON in {asset_id}")
    return json.loads(match.group(1))


def load_prototype_jobs() -> list[dict[str, Any]]:
    script_paths = [
        ROOT / "design/pixel_clay_v4/app/pxc-ext-avatars.js",
        ROOT / "design/pixel_clay_v4/app/pxc-ext-jobs.js",
        ROOT / "design/pixel_clay_v4/app/pxc-ext-roles.js",
    ]
    javascript = r"""
const fs=require('fs'), vm=require('vm');
const paths=process.argv.slice(1);
const window={PIXELCLAYDesignSystem_ca692b:{ICON_OPS:{},ICONS:{}}};
const context=vm.createContext({window,console});
vm.runInContext(fs.readFileSync(paths[0],'utf8'),context,{filename:paths[0]});
window.PXC_EXT.ICON_CATEGORIES=[];
window.PXC_EXT.NEW_ICON_NAMES=[];
for(const path of paths.slice(1)) vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});
const jobs=window.PXC_EXT.JOB.map(({id,ko,en,group,cloth})=>({id,ko,en,group,cloth}));
process.stdout.write(JSON.stringify(jobs));
"""
    result = subprocess.run(
        ["node", "-e", javascript, *[str(path) for path in script_paths]],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(result.stdout)


def native_master_index(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    result: dict[str, dict[str, Any]] = {}
    for asset_id, pointer in catalog["active_asset_index"].items():
        manifest_path = ROOT / pointer["manifest_path"]
        key = manifest_path.as_posix()
        if key not in cache:
            cache[key] = read_json(manifest_path)
        manifest = cache[key]
        matches = [asset for asset in manifest["assets"] if asset["asset_id"] == asset_id]
        if len(matches) != 1:
            raise ValueError(f"native manifest lookup failed for {asset_id}")
        master = matches[0]["master"]
        result[asset_id] = {
            "state": pointer["state"],
            "batch_id": pointer["batch_id"],
            "version": pointer["version"],
            "atlas_path": pointer["master_atlas_path"],
            "atlas_crop": master["atlas_crop"],
            "decoded_rgba_sha256": master["decoded_rgba_sha256"],
            "method": master["method"],
        }
    return result


@lru_cache(maxsize=1)
def icon_attachment_atlas() -> Image.Image:
    path = ROOT / ICON_ATTACHMENT_ATLAS
    atlas = Image.open(path).convert("RGBA")
    expected_rows = (267 + ICON_ATTACHMENT_COLUMNS - 1) // ICON_ATTACHMENT_COLUMNS
    expected_size = (128 * ICON_ATTACHMENT_COLUMNS, 128 * expected_rows)
    if atlas.size != expected_size:
        raise ValueError(
            f"icon attachment atlas must be {expected_size[0]}x{expected_size[1]}"
        )
    return atlas


def native128_variant(
    icon_name: str,
    slot: str,
    standalone_master: dict[str, Any],
    atlas_index: int,
) -> dict[str, Any]:
    pilot = PILOT_VARIANTS.get(icon_name)
    path = ROOT / ICON_ATTACHMENT_ATLAS
    atlas = icon_attachment_atlas()
    column, row = atlas_index % ICON_ATTACHMENT_COLUMNS, atlas_index // ICON_ATTACHMENT_COLUMNS
    atlas_crop = [column * 128, row * 128, 128, 128]
    image = atlas.crop(
        (
            atlas_crop[0],
            atlas_crop[1],
            atlas_crop[0] + atlas_crop[2],
            atlas_crop[1] + atlas_crop[3],
        )
    )
    pixels = list(image.get_flattened_data())
    if {pixel[3] for pixel in pixels} - {0, 255}:
        raise ValueError(f"{icon_name} attachment alpha must be binary")
    if any(pixel[3] == 0 and pixel[:3] != (0, 0, 0) for pixel in pixels):
        raise ValueError(f"{icon_name} attachment has hidden RGB")
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError(f"{icon_name} attachment is empty")
    fit_x, fit_y, fit_width, fit_height = ANCHORS[slot]["fit_box"]
    if not (
        bbox[0] >= fit_x
        and bbox[1] >= fit_y
        and bbox[2] <= fit_x + fit_width
        and bbox[3] <= fit_y + fit_height
    ):
        raise ValueError(f"{icon_name} attachment exceeds {slot} fit box")
    opaque_colors = len({pixel for pixel in pixels if pixel[3]})
    result = {
        "status": "ready",
        "canvas": [128, 128],
        "runtime_scaling_allowed": False,
        "path": ICON_ATTACHMENT_ATLAS,
        "atlas_crop": atlas_crop,
        "encoded_png_sha256": sha256_file(path),
        "decoded_rgba_sha256": hashlib.sha256(image.tobytes()).hexdigest(),
        "bbox": list(bbox),
        "opaque_colors": opaque_colors,
        "method": (
            pilot["method"]
            if pilot is not None
            else "nearest-tight-bbox-fit-from-standalone-native128/v1"
        ),
        "derived_from_standalone_native128": pilot is None,
        "source_standalone_decoded_rgba_sha256": standalone_master[
            "decoded_rgba_sha256"
        ],
    }
    if pilot is not None:
        result.update(
            {
                "raw_imagegen_source_id": pilot["raw_imagegen_source_id"],
                "raw_imagegen_sha256": pilot["raw_imagegen_sha256"],
                "projection_translation": pilot["translation"],
            }
        )
    return result


@lru_cache(maxsize=1)
def avatar_layer_atlas() -> Image.Image:
    path = ROOT / AVATAR_LAYER_ATLAS
    atlas = Image.open(path).convert("RGBA")
    expected_size = (128 * len(AVATAR_LAYER_IDS), 128 * 270)
    if atlas.size != expected_size:
        raise ValueError(
            f"avatar layer atlas must be {expected_size[0]}x{expected_size[1]}"
        )
    return atlas


def native128_avatar_layers(
    asset_id: str,
    flattened_master: dict[str, Any],
    *,
    atlas_row: int,
    profile: str,
) -> dict[str, Any]:
    common = {
        "required_layers": AVATAR_LAYER_IDS,
        "runtime_scaling_allowed": False,
    }
    path = ROOT / AVATAR_LAYER_ATLAS
    atlas = avatar_layer_atlas()
    row_y = atlas_row * 128
    layers: dict[str, Image.Image] = {}
    layer_records: dict[str, Any] = {}
    allowed_empty = {"hair", "headwear", "garment", "extra"} if profile == "animal" else {
        "hair",
        "headwear",
        "extra",
    }
    for index, layer_id in enumerate(AVATAR_LAYER_IDS):
        crop = [index * 128, row_y, 128, 128]
        layer = atlas.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        pixels = list(layer.get_flattened_data())
        if {pixel[3] for pixel in pixels} - {0, 255}:
            raise ValueError(f"{asset_id}/{layer_id}: alpha must be binary")
        if any(pixel[3] == 0 and pixel[:3] != (0, 0, 0) for pixel in pixels):
            raise ValueError(f"{asset_id}/{layer_id}: hidden RGB is forbidden")
        bbox = layer.getbbox()
        if bbox is None and layer_id not in allowed_empty:
            raise ValueError(f"{asset_id}/{layer_id}: required layer is empty")
        layers[layer_id] = layer
        layer_records[layer_id] = {
            "atlas_crop": crop,
            "bbox": list(bbox) if bbox else None,
            "decoded_rgba_sha256": hashlib.sha256(layer.tobytes()).hexdigest(),
            "empty": bbox is None,
        }
    if profile != "animal" and layers["hair"].getbbox() is None and layers["headwear"].getbbox() is None:
        raise ValueError(f"{asset_id}: both hair and headwear layers are empty")
    recomposed = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    for layer_id in AVATAR_RECOMPOSITION_ORDER:
        recomposed = Image.alpha_composite(recomposed, layers[layer_id])
    recomposed_sha = hashlib.sha256(recomposed.tobytes()).hexdigest()
    if recomposed_sha != flattened_master["decoded_rgba_sha256"]:
        raise ValueError(f"{asset_id}: layer recomposition differs from flattened native128 master")
    base_alpha = layers["base"].getchannel("A")
    face_alpha = layers["face"].getchannel("A")
    scalp_alpha = Image.alpha_composite(layers["hair"], layers["headwear"]).getchannel("A")
    hair_alpha = layers["hair"].getchannel("A")
    headwear_alpha = layers["headwear"].getchannel("A")
    garment_alpha = layers["garment"].getchannel("A")
    extra_alpha = layers["extra"].getchannel("A")
    underlay_overlaps = {
        "base_under_face": sum(
            bool(base_pixel and face_pixel)
            for base_pixel, face_pixel in zip(
                base_alpha.get_flattened_data(),
                face_alpha.get_flattened_data(),
                strict=True,
            )
        ),
        "base_under_scalp": sum(
            bool(base_pixel and scalp_pixel)
            for base_pixel, scalp_pixel in zip(
                base_alpha.get_flattened_data(),
                scalp_alpha.get_flattened_data(),
                strict=True,
            )
        ),
        "hair_under_headwear": sum(
            bool(hair_pixel and headwear_pixel)
            for hair_pixel, headwear_pixel in zip(
                hair_alpha.get_flattened_data(),
                headwear_alpha.get_flattened_data(),
                strict=True,
            )
        ),
        "garment_under_extra": sum(
            bool(garment_pixel and extra_pixel)
            for garment_pixel, extra_pixel in zip(
                garment_alpha.get_flattened_data(),
                extra_alpha.get_flattened_data(),
                strict=True,
            )
        ),
    }
    return {
        "status": "ready",
        **common,
        "atlas_path": AVATAR_LAYER_ATLAS,
        "encoded_atlas_sha256": sha256_file(path),
        "method": "lossless-native128-source-recipe-partition-with-swap-underlays/v3",
        "profile": profile,
        "underlay_overlaps": underlay_overlaps,
        "layers": layer_records,
        "recomposition_decoded_rgba_sha256": recomposed_sha,
    }


def attachment_role_slot(icon_name: str) -> tuple[str, str] | None:
    if icon_name in ACCESSORY_SLOTS:
        return "accessory", ACCESSORY_SLOTS[icon_name]
    if icon_name in BADGE_NAMES:
        return "badge", "chest"
    if icon_name in TOOL_NAMES:
        return "tool", "hand_right"
    if icon_name in PROP_NAMES:
        return "prop", "foreground" if icon_name in FOREGROUND_PROPS else "side_right"
    return None


def attachment_for(
    icon_name: str,
    standalone_master: dict[str, Any],
    atlas_index: int,
) -> dict[str, Any] | None:
    role_slot = attachment_role_slot(icon_name)
    if role_slot is None:
        return None
    role, slot = role_slot
    anchor = ANCHORS[slot]
    return {
        "role": role,
        "slot": slot,
        "anchor": {"x": anchor["x"], "y": anchor["y"]},
        "z": anchor["z"],
        "fit_box": anchor["fit_box"],
        "native128_variant": native128_variant(
            icon_name, slot, standalone_master, atlas_index
        ),
    }


def build_catalog(source_zip: Path, native_catalog_path: Path) -> dict[str, Any]:
    native_catalog = read_json(native_catalog_path)
    archive_sha = sha256_file(source_zip)
    if archive_sha != native_catalog["source_archive_sha256"]:
        raise ValueError("source ZIP SHA-256 does not match the native128 catalog")
    native_index = native_master_index(native_catalog)

    with zipfile.ZipFile(source_zip) as archive:
        manifest_member = find_member(archive, "export/manifest.json")
        source_manifest = json.loads(archive.read(manifest_member))

        source_avatar_items: list[dict[str, Any]] = []
        for group in source_manifest["avatarGroups"]:
            for item in group["items"]:
                source_avatar_items.append({**item, "catalog_group": group["id"]})
        for item in source_manifest["animals"]:
            source_avatar_items.append({**item, "kind": "animal", "catalog_group": "animals"})
        for item in source_manifest["presets"]:
            source_avatar_items.append({**item, "kind": "preset", "catalog_group": "presets"})

        avatar_rows = {
            asset_id: row
            for row, asset_id in enumerate(
                sorted(item["file"].removesuffix(".svg") for item in source_avatar_items)
            )
        }

        parts = source_manifest["parts"]
        palettes = parts["palettes"]
        avatars: list[dict[str, Any]] = []
        used_jobs: set[str] = set()
        for item in source_avatar_items:
            source_path = item["file"]
            asset_id = source_path.removesuffix(".svg")
            member = find_member(archive, f"export/{source_path}")
            spec = parse_svg_spec(archive.read(member).decode("utf-8"), asset_id)
            if item.get("spec") is not None and spec != item["spec"]:
                raise ValueError(f"manifest/SVG spec mismatch for {asset_id}")
            if spec["type"] == "human":
                recipe = {
                    "type": "human",
                    "base": {"skin": palettes["skin"][spec["skin"]]},
                    "hair": {
                        "part_id": parts["hair"][spec["hair"]]["id"],
                        "color": palettes["hair"][spec["hairColor"]],
                    },
                    "face": {
                        "part_id": parts["face"][spec["face"]]["id"],
                        "expression_id": parts["expr"][spec["expr"]]["id"],
                    },
                    "headwear": {"part_id": parts["acc"][spec["acc"]]["id"]},
                    "garment": {
                        "color": palettes["cloth"][spec["cloth"]],
                        "source_palette_index": spec["cloth"],
                        "job_id": spec.get("job"),
                    },
                    "extra": [],
                }
                if spec.get("job"):
                    used_jobs.add(spec["job"])
            else:
                recipe = {
                    "type": "animal",
                    "base": {
                        "species_id": spec["species"],
                        "fur": palettes["fur"][spec["fur"]],
                    },
                    "garment": {
                        "color": palettes["cloth"][spec["cloth"]],
                        "source_palette_index": spec["cloth"],
                    },
                    "extra": [],
                }
            flattened_master = native_index[asset_id]
            avatars.append({
                "asset_id": asset_id,
                "id": item["id"],
                "kind": item["kind"],
                "group": item["catalog_group"],
                "label_en": item.get("en"),
                "source_svg": f"export/{source_path}",
                "source_spec": spec,
                "recipe": recipe,
                "composable_native128": native128_avatar_layers(
                    asset_id,
                    flattened_master,
                    atlas_row=avatar_rows[asset_id],
                    profile="animal" if spec["type"] == "animal" else "human",
                ),
                "flattened_native128": flattened_master,
            })

    prototype_jobs = load_prototype_jobs()
    defined_jobs = {job["id"] for job in prototype_jobs}
    missing_jobs = used_jobs - defined_jobs
    if missing_jobs:
        raise ValueError(f"avatar recipes reference undefined jobs: {sorted(missing_jobs)}")
    jobs = [
        {
            **job,
            "used_by_avatar_recipe": job["id"] in used_jobs,
            "native128_layers": {
                "garment": "pending",
                "headwear": "pending",
                "extra": "pending",
            },
        }
        for job in prototype_jobs
    ]

    icons: list[dict[str, Any]] = []
    attachment_rows = {
        asset_id: index
        for index, asset_id in enumerate(
            sorted(
                icon["file"].removesuffix(".svg")
                for icon in source_manifest["icons"]
                if attachment_role_slot(icon["name"]) is not None
            )
        )
    }
    for icon in source_manifest["icons"]:
        asset_id = icon["file"].removesuffix(".svg")
        standalone_master = native_index[asset_id]
        attachment = (
            attachment_for(
                icon["name"], standalone_master, attachment_rows[asset_id]
            )
            if asset_id in attachment_rows
            else None
        )
        icons.append({
            "asset_id": asset_id,
            "id": icon["name"],
            "category": icon["category"],
            "label_en": icon.get("en"),
            "source_svg": f"export/{icon['file']}",
            "standalone_native128": standalone_master,
            "composition": {
                "standalone": True,
                "attachment": attachment,
                "classification": "explicit_allowlist" if attachment else "standalone_only",
            },
        })

    aliases = [
        {"id": alias["name"], "canonical_asset_id": f"icons/{alias['of']}"}
        for alias in source_manifest["aliases"]
    ]
    contract = {
        "canvas": {"width": 128, "height": 128, "alpha": "binary", "grid": "integer"},
        "layer_order": LAYER_ORDER,
        "anchors": ANCHORS,
        "icon_roles": ["standalone", "accessory", "badge", "tool", "prop"],
        "native_attachment_rule": (
            "Store every attachment at its final occupied pixel size on a 128x128 transparent canvas. "
            "Approved pilots remain unchanged; other variants use a build-time tight-bbox NEAREST "
            "identity derivation from the standalone native128 master. Runtime resizing is forbidden."
        ),
        "occlusion": {
            "back": "draw behind the avatar base without clearing avatar pixels",
            "garment": "replace only the authored torso garment mask; never clear neck or head",
            "headwear": "draw above hair; clear hair only through an authored binary occlusion mask",
            "face": "overlay face details; no implicit alpha clearing",
            "chest": "clip badge pixels to the final garment alpha mask",
            "hand": "draw held item above the body; use an authored grip mask for fingers",
            "foreground": "draw last and do not mutate avatar alpha",
        },
        "identity": {
            "recipe_key": "stable IDs, never array positions at runtime",
            "animal_key": "species_id",
            "job_key": "job_id",
            "flat_master_role": "visual identity reference and standalone fallback only",
        },
    }

    attachment_counts = Counter(
        icon["composition"]["attachment"]["role"]
        for icon in icons
        if icon["composition"]["attachment"] is not None
    )
    if len(avatars) != 270 or len(icons) != 533 or len(native_index) != 803:
        raise ValueError("canonical inventory count mismatch")
    if len({asset["asset_id"] for asset in [*avatars, *icons]}) != 803:
        raise ValueError("duplicate canonical asset IDs")
    if len(used_jobs) != 224 or len(jobs) != 232:
        raise ValueError("job inventory count mismatch")

    return {
        "schema": "hustlek-composition-catalog/v1",
        "contract_sha256": canonical_sha256(contract),
        "sources": {
            "archive_sha256": archive_sha,
            "native_catalog": str(native_catalog_path.relative_to(ROOT)).replace("\\", "/"),
            "native_catalog_schema": native_catalog["schema"],
            "prototype_job_definitions": [
                "design/pixel_clay_v4/app/pxc-ext-avatars.js",
                "design/pixel_clay_v4/app/pxc-ext-jobs.js",
                "design/pixel_clay_v4/app/pxc-ext-roles.js",
            ],
        },
        "counts": {
            "canonical_total": 803,
            "avatars": 270,
            "icons": 533,
            "aliases": len(aliases),
            "avatar_job_recipes": len(used_jobs),
            "avatar_layers_ready": sum(
                avatar["composable_native128"]["status"] == "ready"
                for avatar in avatars
            ),
            "job_definitions": len(jobs),
            "job_definitions_unused": len(jobs) - len(used_jobs),
            "icon_attachments": sum(attachment_counts.values()),
            "icon_attachment_variants_ready": sum(
                icon["composition"]["attachment"] is not None
                and icon["composition"]["attachment"]["native128_variant"]["status"]
                == "ready"
                for icon in icons
            ),
            "icon_attachment_approved_pilots": sum(
                icon["asset_id"] in {"icons/camera", "icons/crown", "icons/idBadge", "icons/wrench"}
                for icon in icons
            ),
            "icon_standalone_only": 533 - sum(attachment_counts.values()),
            "attachments_by_role": dict(sorted(attachment_counts.items())),
        },
        "contract": contract,
        "parts": parts,
        "jobs": jobs,
        "avatars": sorted(avatars, key=lambda item: item["asset_id"]),
        "icons": sorted(icons, key=lambda item: item["asset_id"]),
        "aliases": sorted(aliases, key=lambda item: item["id"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--native-catalog", type=Path, default=DEFAULT_NATIVE_CATALOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    catalog = build_catalog(args.source_zip.resolve(), args.native_catalog.resolve())
    serialized = json.dumps(catalog, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    output = args.output.resolve()
    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != serialized:
            print(f"OUT OF DATE: {output}", file=sys.stderr)
            return 1
        print(f"PASS: {output}")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(serialized, encoding="utf-8")
    print(json.dumps(catalog["counts"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
