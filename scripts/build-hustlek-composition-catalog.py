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
from pathlib import Path
from typing import Any


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
    "chest": {"x": 64, "y": 101, "z": 75, "fit_box": [49, 86, 30, 30]},
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


def attachment_for(icon_name: str) -> dict[str, Any] | None:
    if icon_name in ACCESSORY_SLOTS:
        role, slot = "accessory", ACCESSORY_SLOTS[icon_name]
    elif icon_name in BADGE_NAMES:
        role, slot = "badge", "chest"
    elif icon_name in TOOL_NAMES:
        role, slot = "tool", "hand_right"
    elif icon_name in PROP_NAMES:
        role = "prop"
        slot = "foreground" if icon_name in FOREGROUND_PROPS else "side_right"
    else:
        return None
    anchor = ANCHORS[slot]
    return {
        "role": role,
        "slot": slot,
        "anchor": {"x": anchor["x"], "y": anchor["y"]},
        "z": anchor["z"],
        "fit_box": anchor["fit_box"],
        "native128_variant": {
            "status": "pending",
            "canvas": [128, 128],
            "runtime_scaling_allowed": False,
            "source_master_resizing_allowed": False,
        },
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
            avatars.append({
                "asset_id": asset_id,
                "id": item["id"],
                "kind": item["kind"],
                "group": item["catalog_group"],
                "label_en": item.get("en"),
                "source_svg": f"export/{source_path}",
                "source_spec": spec,
                "recipe": recipe,
                "composable_native128": {
                    "status": "pending_layers",
                    "required_layers": ["base", "hair", "face", "headwear", "garment", "extra"],
                    "runtime_scaling_allowed": False,
                },
                "flattened_native128": native_index[asset_id],
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
    for icon in source_manifest["icons"]:
        asset_id = icon["file"].removesuffix(".svg")
        attachment = attachment_for(icon["name"])
        icons.append({
            "asset_id": asset_id,
            "id": icon["name"],
            "category": icon["category"],
            "label_en": icon.get("en"),
            "source_svg": f"export/{icon['file']}",
            "standalone_native128": native_index[asset_id],
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
            "Author every attachment at its final occupied pixel size on a 128x128 transparent canvas; "
            "never resize the standalone native128 master at runtime or during asset production."
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
            "job_definitions": len(jobs),
            "job_definitions_unused": len(jobs) - len(used_jobs),
            "icon_attachments": sum(attachment_counts.values()),
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
