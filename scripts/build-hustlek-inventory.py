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
    "opening": 23,
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


def build_opening_records() -> list[dict[str, str]]:
    contract = "docs/HUSTLEK-OPENING.md"
    builder = "scripts/build-hustlek-opening.py"
    atlas = "design/hustlek-opening-v1/hustlek-opening-atlas.png"
    records = [
        {
            "id": "opening/sequence",
            "name": "HustleK 오프닝",
            "en": "HustleK Opening",
            "category": "overview",
            "categoryLabel": "오프닝 개요",
            "definition": "허슬케이가 밤 초원의 망원경으로 걸어가 북극성을 관측하고, 카메라가 하늘로 이동한 뒤 북극성이 한 번 반짝이는 결정적 픽셀 애니메이션. 캐릭터·배경·망원경은 프로젝트 전용 결과이며 제3자 게임 스프라이트와 Pixy를 사용하지 않는다.",
            "spec": "640×360 RGB · 165프레임 · 80ms/프레임 · 총 13,200ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/fade-in",
            "name": "페이드 인",
            "en": "Fade in",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "완전한 검은 화면에서 밤 초원 장면이 서서히 나타나는 도입 구간.",
            "spec": "0–800ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/establish",
            "name": "초원·망원경 설정",
            "en": "Establish meadow and telescope",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "허슬케이가 등장하기 전에 초원과 정북 방향의 고정 망원경을 보여 주어 공간과 목표를 설정하는 구간.",
            "spec": "800–2,200ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/walk-in",
            "name": "허슬케이 보행 진입",
            "en": "HustleK walk-in",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "12프레임 보행 주기를 사용해 허슬케이가 화면 왼쪽에서 망원경 쪽으로 진입하고 자연스럽게 감속하는 구간.",
            "spec": "2,200–4,800ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/turn-setup",
            "name": "최종 접근·회전·접안 준비",
            "en": "Approach, turn, and setup",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "보행 07–12·01–02로 중심축에 도착한 뒤 측면, 대각 후면, 후면의 세 방향과 팔 올림 키포즈로 망원경 접안을 준비하는 구간.",
            "spec": "4,800–7,200ms · F59–75 핵심 전환",
            "source": contract,
        },
        {
            "id": "opening/timeline/observe",
            "name": "망원경 관측",
            "en": "Telescope observation hold",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "허슬케이가 x=320 중심축에서 접안 완료 자세를 유지하고 북쪽 하늘을 관측하는 정지 구간.",
            "spec": "7,200–9,000ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/focus-pan",
            "name": "북극성 포커스 이동",
            "en": "Camera focus pan",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "카메라 X는 고정하고 Y만 280에서 52로 이동해 월드 좌표에 있던 북극성을 화면 안으로 가져오는 구간. 별 자체에는 별도 등장 페이드를 적용하지 않는다.",
            "spec": "9,000–11,600ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/polaris-ping",
            "name": "북극성 반짝임",
            "en": "Polaris ping",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "정북축에 도착한 북극성이 흰색·보라색 십자 형태를 유지하며 한 번만 확장·수축하는 강조 구간.",
            "spec": "11,600–12,300ms",
            "source": contract,
        },
        {
            "id": "opening/timeline/fade-out",
            "name": "페이드 아웃",
            "en": "Fade out",
            "category": "timeline",
            "categoryLabel": "타임라인",
            "definition": "북극성 장면을 완전한 검은 화면으로 닫아 오프닝을 종료하는 구간.",
            "spec": "12,300–13,200ms",
            "source": contract,
        },
        {
            "id": "opening/source/atlas",
            "name": "오프닝 정본 아틀라스",
            "en": "Canonical opening atlas",
            "category": "source",
            "categoryLabel": "정본 소스",
            "definition": "오프닝에 쓰이는 승인 픽셀을 보관하는 유일한 RGBA 이미지 정본. 배경 1장, 보행 12셀, 회전·접안 6셀, 망원경 1셀로 구성하며 리샘플링하지 않는다.",
            "spec": "640×776 RGBA · decoded SHA-256 b077a2d1…cc49",
            "source": atlas,
        },
        {
            "id": "opening/asset/background",
            "name": "밤 초원 배경",
            "en": "Night meadow background",
            "category": "environment",
            "categoryLabel": "환경 에셋",
            "definition": "별이 있는 짙은 밤하늘, 먼 숲, 중앙의 초원을 담은 고정 배경. 카메라 초기 화면의 승인 하단 360픽셀은 아틀라스와 픽셀 단위로 같아야 한다.",
            "spec": "atlas (0,0,640,360) · 640×360 · 완전 불투명",
            "source": atlas,
        },
        {
            "id": "opening/asset/vertical-world",
            "name": "세로 배경 월드",
            "en": "Extended vertical world",
            "category": "environment",
            "categoryLabel": "환경 에셋",
            "definition": "승인 배경의 하늘 행을 재샘플링 없이 반사 반복해 위쪽으로 확장한 합성 월드. 배경·망원경·캐릭터·북극성이 동일한 카메라 좌표계를 공유하게 한다.",
            "spec": "640×640 RGBA · 정수 행 복제 · 리샘플링 없음",
            "source": builder,
        },
        {
            "id": "opening/asset/hustlek-walk",
            "name": "허슬케이 보행 12프레임",
            "en": "HustleK 12-frame walk cycle",
            "category": "character",
            "categoryLabel": "캐릭터 에셋",
            "definition": "큰 머리, 비대칭 가르마 머리, 검은 둥근 안경, 흰 반팔 티셔츠, 카키색 긴 바지, 황갈색 워크부츠의 정체성을 유지하는 보행 셀. 팔과 다리는 반대 위상이며 지지발 기준선을 고정한다.",
            "spec": "12셀 · 각 96×96 RGBA · local floor y=94",
            "source": atlas,
        },
        {
            "id": "opening/asset/hustlek-keyposes",
            "name": "허슬케이 회전·접안 키포즈",
            "en": "HustleK turn and eyepiece key poses",
            "category": "character",
            "categoryLabel": "캐릭터 에셋",
            "definition": "망원경 앞에서 측면 정지, 대각 후면, 후면 정지, 팔 절반 올림, 접안 직전, 접안 완료를 나타내는 여섯 자세. 자세 사이를 보간하지 않고 몸의 공통 부피와 바닥 anchor를 유지한다.",
            "spec": "6셀 · 각 96×96 RGBA · 캐릭터 높이 87px · floor y=94",
            "source": atlas,
        },
        {
            "id": "opening/asset/telescope",
            "name": "북향 망원경",
            "en": "North-facing telescope",
            "category": "prop",
            "categoryLabel": "소품 에셋",
            "definition": "북극성과 같은 x=320 광축을 바라보는 고정 망원경. 캐릭터 셀에 굽지 않고 월드 (256,468)에 한 번만 합성하며 크기·회전·삼각대 폭을 프레임마다 바꾸지 않는다.",
            "spec": "atlas (0,648,128,776) · 128×128 RGBA · world (256,468)",
            "source": atlas,
        },
        {
            "id": "opening/asset/polaris",
            "name": "북극성 본체",
            "en": "Polaris core",
            "category": "effect",
            "categoryLabel": "별·효과 에셋",
            "definition": "흰색 중심과 보라색 가장자리를 가진 네 갈래 십자별. 32×32 논리 픽셀에서 만들고 NEAREST로 64×64에 확대하며 가로·세로 팔 두께와 90도 회전 대칭을 정확히 유지한다.",
            "spec": "logical 32×32 → 64×64 NEAREST · world center (320,232)",
            "source": builder,
        },
        {
            "id": "opening/asset/polaris-flash",
            "name": "북극성 반짝임 5단계",
            "en": "Polaris five-stage flash",
            "category": "effect",
            "categoryLabel": "별·효과 에셋",
            "definition": "북극성 중심과 십자 대칭을 유지하면서 보라색 aura와 core가 한 차례 확장된 뒤 원래 크기로 돌아오는 다섯 단계 효과.",
            "spec": "5프레임 · 112×112 RGBA 컨테이너 · 11,600–12,300ms에 1회",
            "source": builder,
        },
        {
            "id": "opening/asset/camera",
            "name": "정북축 카메라 이동",
            "en": "North-axis camera move",
            "category": "camera",
            "categoryLabel": "카메라 규칙",
            "definition": "640×640 월드에서 640×360 화면을 잘라내는 카메라 규칙. X는 항상 0으로 고정하고 Y만 smootherstep으로 이동해 별과 망원경의 정북축 관계를 보존한다.",
            "spec": "cameraX=0 · cameraY 280→52 · 9,000–11,600ms",
            "source": builder,
        },
        {
            "id": "opening/asset/screen-fades",
            "name": "화면 공간 페이드",
            "en": "Screen-space fades",
            "category": "effect",
            "categoryLabel": "화면 효과",
            "definition": "월드 요소를 수정하지 않고 최종 640×360 RGB 화면과 검은색을 혼합하는 도입·종료 효과. 첫 프레임과 마지막 프레임은 완전한 검은색이어야 한다.",
            "spec": "0–800ms fade in · 12,300–13,200ms fade out",
            "source": builder,
        },
        {
            "id": "opening/output/apng",
            "name": "오프닝 APNG 정본",
            "en": "Canonical opening APNG",
            "category": "output",
            "categoryLabel": "산출물",
            "definition": "승인된 165개 RGB 프레임을 손실 없이 보존하는 애니메이션 정본. 다시 디코딩한 전체 프레임 픽셀 스트림이 승인 해시와 일치해야 한다.",
            "spec": "hustlek-opening.apng · 640×360 · 165프레임 · 13,200ms",
            "source": "Output/hustlek-opening/hustlek-opening.apng",
        },
        {
            "id": "opening/output/gif",
            "name": "오프닝 GIF 검토본",
            "en": "Opening GIF review copy",
            "category": "output",
            "categoryLabel": "산출물",
            "definition": "일반 플레이어에서 타이밍과 동작을 빠르게 검토하기 위한 128색 미리보기. 시각 검토에는 사용하지만 픽셀 정본으로 취급하지 않는다.",
            "spec": "hustlek-opening.gif · 128색 · 디더링 없음 · 총 13,200ms",
            "source": "design/hustlek-opening-v1/hustlek-opening-preview.gif",
        },
        {
            "id": "opening/output/validation",
            "name": "오프닝 검증 보고서",
            "en": "Opening validation report",
            "category": "output",
            "categoryLabel": "산출물",
            "definition": "아틀라스 해시, 프레임 수와 시간, 배경 동일성, 북극성 대칭, 캐릭터 anchor, 망원경 고정, Pixy 호출 부재를 검사한 기계 검증 결과. status가 PASS여야 성공이다.",
            "spec": "validation.json · 필수 gate 전체 PASS",
            "source": "Output/hustlek-opening/validation.json",
        },
        {
            "id": "opening/output/frame-stream-hash",
            "name": "RGB 프레임 스트림 해시",
            "en": "Decoded RGB frame-stream hash",
            "category": "output",
            "categoryLabel": "산출물",
            "definition": "컨테이너 압축이나 메타데이터와 무관하게 165개 디코딩 RGB 프레임의 픽셀이 승인본과 같은지 확인하는 무결성 지문.",
            "spec": "SHA-256 be712f38…ff33",
            "source": "Output/hustlek-opening/decoded-rgb-frame-stream.sha256",
        },
    ]
    if len(records) != EXPECTED_COUNTS["opening"]:
        raise ValueError(f"Opening record count mismatch: {len(records)}")
    return records


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
        "opening": len(build_opening_records()),
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
    opening = build_opening_records()
    avatars, jobs, icons, aliases = build_records(catalog, definitions)
    validate_counts(catalog, avatars, jobs, icons, aliases)
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__OPENING_JSON__": compact_json(opening),
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
    opening = build_opening_records()
    avatars, jobs, icons, aliases = build_records(catalog, definitions)
    validate_counts(catalog, avatars, jobs, icons, aliases)
    lines = [
        "HustleK 오프닝·아바타·직업·아이콘 전체 텍스트 목록",
        "=" * 48,
        "",
        "범위: 오프닝·사용 에셋 23개, 실제 아바타 270개, 직업 정의 232개, canonical 아이콘 533개, 별칭 51개",
        "주의: v1 native128은 검수 참고 자료이며 새 제작 기준은 logical32이다.",
        "",
        "[HustleK 오프닝·사용 에셋 · 23개]",
    ]
    for index, item in enumerate(opening, 1):
        lines.extend(
            [
                f"{index:03d}. {item['name']} / {item['en']} ({item['id']})",
                f"     정의: {item['definition']}",
                f"     규격: {item['spec']}",
                f"     출처: {item['source']}",
            ]
        )
    lines.extend(
        [
            "",
            "[아바타 · 270개]",
        ]
    )
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
