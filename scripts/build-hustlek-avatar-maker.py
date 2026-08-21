#!/usr/bin/env python3
"""Build the standalone HustleK avatar maker review screen."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design/hustlek-composition-v1/catalog.json"
TEMPLATE_PATH = ROOT / "design/hustlek-composition-v1/avatar-maker.template.html"
OUTPUT_PATH = ROOT / "design/hustlek-composition-v1/avatar-maker.html"
RUNTIME_DIR = ROOT / "design/hustlek-composition-v1/runtime"
ATTACHMENT_ATLAS = ROOT / "design/hustlek-composition-v1/icon-attachments-atlas.png"


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace(
        "<", "\\u003c"
    )


def validate_sources() -> None:
    for index in range(7):
        path = RUNTIME_DIR / f"avatar-runtime-{index:02d}.png"
        with Image.open(path) as image:
            if image.mode != "RGBA" or image.size != (1920, 2048):
                raise ValueError(f"invalid runtime avatar atlas: {path}")
    with Image.open(ATTACHMENT_ATLAS) as image:
        if image.mode != "RGBA" or image.size != (2048, 2176):
            raise ValueError("invalid attachment atlas")


def build_html() -> str:
    validate_sources()
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    counts = catalog["counts"]
    if counts["avatars"] != 270 or counts["icon_attachment_variants_ready"] != 267:
        raise ValueError("avatar maker requires 270 avatars and 267 ready attachments")

    avatars = []
    for index, avatar in enumerate(sorted(catalog["avatars"], key=lambda item: item["asset_id"])):
        if avatar["composable_native128"]["status"] != "ready":
            raise ValueError(f"avatar layers are not ready: {avatar['asset_id']}")
        avatars.append(
            {
                "assetId": avatar["asset_id"],
                "group": avatar["group"],
                "index": index,
                "kind": avatar["kind"],
                "label": avatar.get("label_en") or avatar["id"],
            }
        )

    attachments = []
    ready_icons = [
        icon
        for icon in sorted(catalog["icons"], key=lambda item: item["asset_id"])
        if icon["composition"]["attachment"] is not None
    ]
    for index, icon in enumerate(ready_icons):
        attachment = icon["composition"]["attachment"]
        variant = attachment["native128_variant"]
        if variant["status"] != "ready" or variant["runtime_scaling_allowed"]:
            raise ValueError(f"attachment variant is not runtime-ready: {icon['asset_id']}")
        attachments.append(
            {
                "assetId": icon["asset_id"],
                "index": index,
                "label": icon.get("label_en") or icon["id"],
                "role": attachment["role"],
                "slot": attachment["slot"],
                "z": attachment["z"],
            }
        )

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    generated = template.replace("__AVATARS__", compact_json(avatars)).replace(
        "__ATTACHMENTS__", compact_json(attachments)
    )
    if "__AVATARS__" in generated or "__ATTACHMENTS__" in generated:
        raise ValueError("unreplaced avatar maker placeholder")
    return generated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = build_html().encode("utf-8")
    if args.check:
        if not OUTPUT_PATH.exists() or OUTPUT_PATH.read_bytes() != generated:
            raise SystemExit("FAIL avatar maker is missing or stale")
        print("PASS avatar maker matches the production composition catalog")
        return
    temporary = OUTPUT_PATH.with_suffix(".html.tmp")
    temporary.write_bytes(generated)
    temporary.replace(OUTPUT_PATH)
    print(f"WROTE {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
