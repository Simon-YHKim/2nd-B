#!/usr/bin/env python3
"""Build the searchable HustleK job and icon inventory HTML."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import zipfile
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
TEXT_OUTPUT_PATH = (
    ROOT / "design" / "hustlek-composition-v1" / "hustlek-inventory.txt"
)
DEFINITIONS_PATH = (
    ROOT / "design" / "hustlek-composition-v1" / "hustlek-inventory-definitions.json"
)
DEFAULT_SOURCE_ZIP = Path.home() / "Downloads" / "PIXEL-CLAY Design System.zip"

EXPECTED_COUNTS = {
    "avatars": 270,
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
    parser.add_argument(
        "--refresh-definitions-source",
        type=Path,
        nargs="?",
        const=DEFAULT_SOURCE_ZIP,
        metavar="PIXEL_CLAY_ZIP",
        help="refresh the committed name/definition metadata from the source ZIP",
    )
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


def parse_reference_table(
    markdown: str, allowed_ids: set[str], kind: str
) -> dict[str, dict[str, str]]:
    records: dict[str, dict[str, str]] = {}
    section = ""
    section_definition = ""
    collecting_definition = False
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            section = re.sub(r"\s*·\s*\d+종.*$", "", line[3:]).strip()
            section_definition = ""
            collecting_definition = True
            continue
        if collecting_definition and line and not line.startswith("|"):
            section_definition = line
            collecting_definition = False
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        asset_id = cells[0].strip("`") if cells else ""
        if asset_id not in allowed_ids:
            continue
        if asset_id in records:
            raise ValueError(f"Duplicate {kind} definition: {asset_id}")
        if kind == "avatar":
            if len(cells) < 3:
                raise ValueError(f"Malformed avatar definition: {line}")
            has_english = len(cells) >= 4
            records[asset_id] = {
                "ko": cells[1],
                "en": cells[2] if has_english else "",
                "section": section,
                "sectionDefinition": section_definition,
                "construction": cells[3] if has_english else cells[2],
            }
        else:
            if len(cells) < 4:
                raise ValueError(f"Malformed icon definition: {line}")
            records[asset_id] = {
                "ko": cells[1],
                "section": section,
                "sectionDefinition": section_definition,
                "construction": cells[2],
                "resolution": cells[3],
            }
    missing = sorted(allowed_ids - records.keys())
    if missing:
        raise ValueError(f"Missing {kind} source definitions: {missing[:10]}")
    return records


def refresh_definitions_source(source_zip: Path) -> None:
    if not source_zip.is_file():
        raise ValueError(f"Missing PIXEL-CLAY source ZIP: {source_zip}")
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    avatar_ids = {item["id"] for item in catalog["avatars"]}
    icon_ids = {item["id"] for item in catalog["icons"]}
    if len(avatar_ids) != EXPECTED_COUNTS["avatars"]:
        raise ValueError("Avatar IDs are not unique or count changed")
    with zipfile.ZipFile(source_zip) as archive:
        avatar_bytes = archive.read("export/AVATARS.md")
        icon_bytes = archive.read("export/ICONS.md")
    payload = {
        "source": {
            "archive": source_zip.name,
            "avatarsMarkdownSha256": hashlib.sha256(avatar_bytes).hexdigest(),
            "iconsMarkdownSha256": hashlib.sha256(icon_bytes).hexdigest(),
        },
        "avatars": parse_reference_table(
            avatar_bytes.decode("utf-8"), avatar_ids, "avatar"
        ),
        "icons": parse_reference_table(icon_bytes.decode("utf-8"), icon_ids, "icon"),
    }
    DEFINITIONS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"WROTE {DEFINITIONS_PATH.relative_to(ROOT)}")


def load_definitions() -> dict[str, Any]:
    definitions = json.loads(DEFINITIONS_PATH.read_text(encoding="utf-8"))
    actual = {
        "avatars": len(definitions["avatars"]),
        "icons": len(definitions["icons"]),
    }
    expected = {key: EXPECTED_COUNTS[key] for key in actual}
    if actual != expected:
        raise ValueError(f"Definition source count mismatch: {actual}")
    return definitions


def avatar_definition(
    avatar: dict[str, Any], source: dict[str, str]
) -> str:
    ko = source["ko"]
    if avatar["kind"] == "animal":
        lead = f"{ko}의 종 특징을 실루엣과 얼굴로 구분하는 동물 아바타."
    elif avatar["kind"] == "preset":
        lead = f"{ko} 인물 구성을 제공하는 기본 프리셋 아바타."
    elif avatar["kind"] == "role":
        lead = f"{ko} 관계·상태·생활 역할을 나타내는 역할 아바타."
    elif avatar["group"] == "fantasy":
        lead = f"{ko} 캐릭터 클래스를 나타내는 판타지 아바타."
    else:
        lead = f"{ko} 직업을 의상과 소품으로 구분해 나타내는 직업 아바타."
    return f"{lead} {source['sectionDefinition']} 제작 기준: {source['construction']}."


def icon_definition(icon: dict[str, Any], source: dict[str, str]) -> str:
    category = ICON_CATEGORY_LABELS.get(icon["category"], icon["category"])
    attachment = icon["composition"].get("attachment")
    usage = (
        f"아바타 합성에서는 {attachment['slot']} 위치의 {attachment['role']} 소품으로 사용할 수 있다."
        if attachment
        else "독립 아이콘으로만 사용하며 아바타 합성 대상은 아니다."
    )
    return (
        f"{source['ko']} 개념·동작·사물을 화면에서 식별하도록 표현한 {category} 아이콘. "
        f"{source['sectionDefinition']} 제작 기준: {source['construction']} · "
        f"{source['resolution']}. {usage}"
    )


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


def build_records(
    catalog: dict[str, Any], definitions: dict[str, Any]
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, str]],
]:
    atlas_sizes: dict[str, tuple[int, int]] = {}
    avatars_by_job: dict[str, list[dict[str, Any]]] = {}
    for avatar in catalog["avatars"]:
        job_id = avatar.get("source_spec", {}).get("job")
        if job_id:
            avatars_by_job.setdefault(job_id, []).append(avatar)
    for avatars in avatars_by_job.values():
        avatars.sort(key=lambda item: item["asset_id"])

    avatars: list[dict[str, Any]] = []
    for avatar in catalog["avatars"]:
        source = definitions["avatars"][avatar["id"]]
        avatars.append(
            {
                "id": avatar["id"],
                "assetId": avatar["asset_id"],
                "ko": source["ko"],
                "en": source["en"] or avatar.get("label_en") or avatar["id"],
                "kind": avatar["kind"],
                "group": avatar["group"],
                "groupLabel": source["section"],
                "definition": avatar_definition(avatar, source),
                "construction": source["construction"],
                "sprite": atlas_descriptor(
                    avatar["flattened_native128"], atlas_sizes
                ),
            }
        )

    jobs: list[dict[str, Any]] = []
    for job in catalog["jobs"]:
        candidates = avatars_by_job.get(job["id"], [])
        representative = candidates[0] if candidates else None
        source = definitions["avatars"].get(job["id"])
        if bool(candidates) != bool(job["used_by_avatar_recipe"]):
            raise ValueError(f"Job usage mismatch: {job['id']}")
        definition = f"{job['ko']} 직업 역할을 위한 아바타 제작 정의."
        if source:
            definition += (
                f" {source['sectionDefinition']} 제작 기준: {source['construction']}."
            )
        definition += (
            f" 현재 {len(candidates)}개 아바타 recipe에서 사용된다."
            if candidates
            else " 현재 아바타 recipe에 연결되지 않은 예약 정의다."
        )
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
                "definition": definition,
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
        source = definitions["icons"][icon["id"]]
        icons.append(
            {
                "id": icon["id"],
                "assetId": icon["asset_id"],
                "label": source["ko"],
                "labelEn": icon.get("label_en") or icon["id"],
                "category": icon["category"],
                "categoryLabel": ICON_CATEGORY_LABELS.get(
                    icon["category"], icon["category"]
                ),
                "attachment": attachment is not None,
                "role": attachment["role"] if attachment else None,
                "slot": attachment["slot"] if attachment else None,
                "definition": icon_definition(icon, source),
                "construction": source["construction"],
                "resolution": source["resolution"],
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

    avatars.sort(key=lambda item: (item["group"], item["en"].casefold(), item["id"]))
    jobs.sort(key=lambda item: (item["group"], item["en"].casefold(), item["id"]))
    icons.sort(key=lambda item: (item["category"], item["id"].casefold()))
    aliases.sort(key=lambda item: item["id"].casefold())
    return avatars, jobs, icons, aliases


def validate_counts(
    catalog: dict[str, Any],
    avatars: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    icons: list[dict[str, Any]],
    aliases: list[dict[str, str]],
) -> None:
    actual = {
        "avatars": len(avatars),
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
    if counts["avatars"] != actual["avatars"]:
        raise ValueError("Catalog avatar count mismatch")
    if counts["job_definitions"] != actual["jobs"]:
        raise ValueError("Catalog job definition count mismatch")
    if counts["icons"] != actual["icons"]:
        raise ValueError("Catalog icon count mismatch")


def build_html() -> str:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    definitions = load_definitions()
    avatars, jobs, icons, aliases = build_records(catalog, definitions)
    validate_counts(catalog, avatars, jobs, icons, aliases)
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__AVATARS_JSON__": compact_json(avatars),
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


def build_text() -> str:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    definitions = load_definitions()
    avatars, jobs, icons, aliases = build_records(catalog, definitions)
    validate_counts(catalog, avatars, jobs, icons, aliases)
    lines = [
        "HustleK 아바타·직업·아이콘 전체 텍스트 목록",
        "=" * 48,
        "",
        "범위: 실제 아바타 270개, 직업 정의 232개, canonical 아이콘 533개, 별칭 51개",
        "주의: v1 native128은 검수 참고 자료이며 새 제작 기준은 logical32이다.",
        "",
        "[아바타 · 270개]",
    ]
    for index, item in enumerate(avatars, 1):
        lines.extend(
            [
                f"{index:03d}. {item['ko']} / {item['en']} ({item['assetId']})",
                f"     정의: {item['definition']}",
            ]
        )
    lines.extend(["", "[직업 정의 · 232개]"])
    for index, item in enumerate(jobs, 1):
        lines.extend(
            [
                f"{index:03d}. {item['ko']} / {item['en']} ({item['id']})",
                f"     정의: {item['definition']}",
            ]
        )
    lines.extend(["", "[canonical 아이콘 · 533개]"])
    for index, item in enumerate(icons, 1):
        lines.extend(
            [
                f"{index:03d}. {item['label']} / {item['labelEn']} ({item['assetId']})",
                f"     정의: {item['definition']}",
            ]
        )
    lines.extend(["", "[아이콘 별칭 · 51개]"])
    for index, item in enumerate(aliases, 1):
        lines.extend(
            [
                f"{index:03d}. {item['id']}",
                f"     정의: {item['canonicalAssetId']} canonical 아이콘을 재사용하는 별칭.",
            ]
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    if args.refresh_definitions_source:
        refresh_definitions_source(args.refresh_definitions_source)
    rendered = build_html()
    rendered_text = build_text()
    if args.check:
        if not OUTPUT_PATH.is_file():
            raise SystemExit(f"FAIL missing {OUTPUT_PATH}")
        if OUTPUT_PATH.read_text(encoding="utf-8") != rendered:
            raise SystemExit("FAIL inventory HTML is stale")
        if not TEXT_OUTPUT_PATH.is_file():
            raise SystemExit(f"FAIL missing {TEXT_OUTPUT_PATH}")
        if TEXT_OUTPUT_PATH.read_text(encoding="utf-8") != rendered_text:
            raise SystemExit("FAIL inventory text is stale")
        print("PASS HustleK inventory HTML/text match catalog and definitions")
        return
    OUTPUT_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    TEXT_OUTPUT_PATH.write_text(rendered_text, encoding="utf-8", newline="\n")
    print(f"WROTE {OUTPUT_PATH.relative_to(ROOT)}")
    print(f"WROTE {TEXT_OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
