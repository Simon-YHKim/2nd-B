#!/usr/bin/env python3
"""Build the searchable HustleK job and icon inventory HTML."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "design" / "hustlek-composition-v1" / "catalog.json"
TEMPLATE_PATH = (
    ROOT
    / "design"
    / "hustlek-composition-v1"
    / "hustlek-inventory.template.html"
)
OUTPUT_PATH = (
    ROOT / "design" / "hustlek-composition-v1" / "hustlek-inventory.html"
)

EXPECTED_COUNTS = {
    "jobs": 232,
    "jobs_used": 224,
    "jobs_reserved": 8,
    "icons": 533,
    "attachments": 267,
    "standalone_only": 266,
    "aliases": 51,
}

GROUP_LABELS = {
    "agriculture": "농림·수산",
    "art": "예술·창작",
    "basic": "기본 예약",
    "business": "비즈니스",
    "construction": "건설·기술",
    "education": "교육·연구",
    "fantasy": "판타지",
    "food": "식음료",
    "it": "IT·디지털",
    "medical": "의료",
    "role-family": "가족 역할",
    "role-life": "생활 단계",
    "role-social": "사회 관계",
    "role-work": "직장 역할",
    "safety": "안전·공공",
    "service": "서비스",
    "transport": "운송·물류",
}

ICON_CATEGORY_LABELS = {
    "art": "예술",
    "basics": "기본",
    "beauty": "미용",
    "career": "커리어",
    "code": "코드",
    "commerce": "상거래",
    "communication": "소통",
    "construction": "건설",
    "data": "데이터",
    "devices": "기기",
    "education": "교육",
    "fantasy": "판타지",
    "farm": "농장",
    "files": "파일",
    "finance": "재정",
    "food": "음식",
    "game": "게임",
    "growth": "성장",
    "health": "건강",
    "logistics": "물류",
    "map": "지도",
    "media": "미디어",
    "medical": "의료",
    "navigation": "탐색",
    "office": "오피스",
    "relations": "관계",
    "rest": "휴식",
    "roles": "역할",
    "safety": "안전",
    "security": "보안",
    "social": "소셜",
    "status": "상태",
    "system": "시스템",
    "text": "텍스트",
    "time": "시간",
    "user": "사용자",
    "weather": "날씨",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def compact_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).replace("<", "\\u003c")


def relative_asset_path(value: str) -> str:
    source = ROOT / value
    if not source.is_file():
        raise ValueError(f"Missing inventory atlas: {value}")
    return Path(os.path.relpath(source, OUTPUT_PATH.parent)).as_posix()


def atlas_descriptor(master: dict[str, Any], cache: dict[str, tuple[int, int]]) -> dict[str, Any]:
    repo_path = master["atlas_path"]
    if repo_path not in cache:
        with Image.open(ROOT / repo_path) as atlas:
            cache[repo_path] = atlas.size
    crop = master["atlas_crop"]
    if isinstance(crop, dict):
        normalized_crop = [crop["x"], crop["y"], crop["w"], crop["h"]]
    else:
        normalized_crop = list(crop)
    return {
        "path": relative_asset_path(repo_path),
        "width": cache[repo_path][0],
        "height": cache[repo_path][1],
        "crop": normalized_crop,
        "rgbaSha256": master["decoded_rgba_sha256"],
        "state": master.get("state", "unknown"),
    }


def build_records(catalog: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, str]]]:
    atlas_sizes: dict[str, tuple[int, int]] = {}
    avatars_by_job: dict[str, list[dict[str, Any]]] = {}
    for avatar in catalog["avatars"]:
        job_id = avatar.get("source_spec", {}).get("job")
        if job_id:
            avatars_by_job.setdefault(job_id, []).append(avatar)
    for avatars in avatars_by_job.values():
        avatars.sort(key=lambda item: item["asset_id"])

    jobs: list[dict[str, Any]] = []
    for job in catalog["jobs"]:
        candidates = avatars_by_job.get(job["id"], [])
        representative = candidates[0] if candidates else None
        if bool(candidates) != bool(job["used_by_avatar_recipe"]):
            raise ValueError(f"Job usage mismatch: {job['id']}")
        jobs.append(
            {
                "id": job["id"],
                "ko": job["ko"],
                "en": job["en"],
                "group": job["group"],
                "groupLabel": GROUP_LABELS.get(job["group"], job["group"]),
                "cloth": job["cloth"],
                "used": bool(job["used_by_avatar_recipe"]),
                "avatarCount": len(candidates),
                "representativeAssetId": (
                    representative["asset_id"] if representative else None
                ),
                "sprite": (
                    atlas_descriptor(
                        representative["flattened_native128"], atlas_sizes
                    )
                    if representative
                    else None
                ),
            }
        )

    icons: list[dict[str, Any]] = []
    for icon in catalog["icons"]:
        attachment = icon["composition"].get("attachment")
        icons.append(
            {
                "id": icon["id"],
                "assetId": icon["asset_id"],
                "label": icon.get("label_en") or icon["id"],
                "category": icon["category"],
                "categoryLabel": ICON_CATEGORY_LABELS.get(
                    icon["category"], icon["category"]
                ),
                "attachment": attachment is not None,
                "role": attachment["role"] if attachment else None,
                "slot": attachment["slot"] if attachment else None,
                "sprite": atlas_descriptor(icon["standalone_native128"], atlas_sizes),
            }
        )

    aliases = [
        {
            "id": alias["id"],
            "canonicalAssetId": alias["canonical_asset_id"],
        }
        for alias in catalog["aliases"]
    ]

    jobs.sort(key=lambda item: (item["group"], item["en"].casefold(), item["id"]))
    icons.sort(key=lambda item: (item["category"], item["id"].casefold()))
    aliases.sort(key=lambda item: item["id"].casefold())
    return jobs, icons, aliases


def validate_counts(
    catalog: dict[str, Any],
    jobs: list[dict[str, Any]],
    icons: list[dict[str, Any]],
    aliases: list[dict[str, str]],
) -> None:
    actual = {
        "jobs": len(jobs),
        "jobs_used": sum(item["used"] for item in jobs),
        "jobs_reserved": sum(not item["used"] for item in jobs),
        "icons": len(icons),
        "attachments": sum(item["attachment"] for item in icons),
        "standalone_only": sum(not item["attachment"] for item in icons),
        "aliases": len(aliases),
    }
    if actual != EXPECTED_COUNTS:
        raise ValueError(f"Inventory count mismatch: {actual}")
    counts = catalog["counts"]
    if counts["job_definitions"] != actual["jobs"]:
        raise ValueError("Catalog job definition count mismatch")
    if counts["icons"] != actual["icons"]:
        raise ValueError("Catalog icon count mismatch")


def build_html() -> str:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    jobs, icons, aliases = build_records(catalog)
    validate_counts(catalog, jobs, icons, aliases)
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__JOBS_JSON__": compact_json(jobs),
        "__ICONS_JSON__": compact_json(icons),
        "__ALIASES_JSON__": compact_json(aliases),
        "__COUNTS_JSON__": compact_json(EXPECTED_COUNTS),
        "__CATALOG_SHA256__": sha256_file(CATALOG_PATH),
        "__CONTRACT_SHA256__": catalog["contract_sha256"],
    }
    for marker, value in replacements.items():
        if template.count(marker) != 1:
            raise ValueError(f"Template marker count must be one: {marker}")
        template = template.replace(marker, value)
    return template


def main() -> None:
    args = parse_args()
    rendered = build_html()
    if args.check:
        if not OUTPUT_PATH.is_file():
            raise SystemExit(f"FAIL missing {OUTPUT_PATH}")
        if OUTPUT_PATH.read_text(encoding="utf-8") != rendered:
            raise SystemExit("FAIL inventory HTML is stale")
        print("PASS HustleK inventory HTML matches catalog")
        return
    OUTPUT_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"WROTE {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
