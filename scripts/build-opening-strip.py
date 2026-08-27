#!/usr/bin/env python
"""앱 오프닝용 스프라이트 스트립을 승인된 아틀라스에서 만든다.

## 왜 이 파일이 따로 있는가

`build-hustlek-opening.py` 는 **13.2초 165프레임** 정본을 만든다. 그건 리뷰용
길이지 앱 오프닝 길이가 아니다 — 앱은 최소 2.5초에 4초면 자동으로 넘어간다.

그래서 이 스크립트는 같은 합성기를 **그대로 재사용**해서, 타임라인을 앱 길이로
압축한 프레임만 뽑아 **가로 스트립 한 장**으로 잇는다.

  ⚠ 새 그림을 만들지 않는다. `compose_frame` 을 부르므로 픽셀은 승인본과 같다.
    아틀라스 RGBA 해시를 시작할 때 확인하고, 다르면 멈춘다.

## 왜 한 장인가 — 그리고 왜 **격자**인가

RN 에서 프레임 애니메이션을 하려면 낱장 여러 개보다 **한 장을 밀어 쓰는 것**이
싸다. 낱장은 디코드가 프레임 수만큼 일어나고, 그게 부팅 때마다 반복된다
(#857 이 6MB 디코드로 겪은 문제와 같은 종류다).

⚠ **한 줄로 늘어놓지 않는다.** 44프레임 × 320px = 14,080px 인데, 여러 기기의
  최대 텍스처 크기(흔히 4,096~8,192)를 넘는다. 넘으면 조용히 안 그려지거나
  축소돼 흐려진다 — 둘 다 코드 리뷰에서 안 보이고 실기기에서만 보인다.
  그래서 **격자**로 접는다.

## 무엇을 압축하나 — 길이가 아니라 **뼈대**

원본의 다섯 비트를 순서대로 유지한다:

    등장(무대) -> 접근(걸음) -> 정착(회전·접안) -> 시선(카메라 팬) -> 도착(반짝임)

`design/OPENING-AUDIT-260827.md` 가 이 비트들이 왜 그 순서인지 적어놨다.
비트를 빼지 말고 각 비트에서 뽑는 프레임 수만 줄인다.

사용법:

    python scripts/build-opening-strip.py                 # 저장소 에셋 자리에 쓴다
    python scripts/build-opening-strip.py --out <경로>    # 다른 곳에
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILDER = REPO_ROOT / "scripts" / "build-hustlek-opening.py"
DEFAULT_OUT = REPO_ROOT / "assets" / "opening" / "hustlek-opening-strip.png"

# 앱 오프닝 길이. `LoadingScreen.tsx` 의 상수와 맞춰야 한다:
#   MIN_INTRO_MS 2,500 안에 첫 두 비트가 들어가고
#   AUTO_CONTINUE_MS 4,000 을 넘지 않는다.
STRIP_FRAME_MS = 80
STRIP_FRAMES = 48                      # 48 * 80ms = 3,840ms (자동 진행 4,000ms 안)
STRIP_SCALE = 2                        # 640x360 -> 320x180 (정수 축소만)
STRIP_COLS = 8                         # 8 x 6 격자 -> 2,560 x 1,080 (텍스처 한도 안)

# 원본 13.2초의 어느 시각을 뽑을지. **비트를 빼지 않는다** — 각 비트에서 고르게
# 솎아낸다. 값은 원본 타임라인(ms)이고, 경계는 `TIMELINE` 과 같다.
BEATS = [
    ("fade_in", 0, 800, 3),
    ("establish", 800, 2_200, 5),
    ("walk_in", 2_200, 4_800, 11),
    ("turn_setup", 4_800, 7_200, 10),
    ("observe", 7_200, 9_000, 5),
    ("focus_pan", 9_000, 11_600, 9),
    ("ping", 11_600, 12_300, 3),
    ("fade_out", 12_300, 13_200, 2),
]


def load_builder():
    """승인된 합성기를 모듈로 불러온다. import 시점에 아무것도 실행하지 않는다."""
    spec = importlib.util.spec_from_file_location("hustlek_builder", BUILDER)
    if spec is None or spec.loader is None:
        raise SystemExit(f"합성기를 못 읽었다: {BUILDER}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["hustlek_builder"] = mod
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    hk = load_builder()

    # ⚠ `load_atlas` 는 아틀라스가 아니라 **배경 crop** 을 첫 값으로 돌려준다.
    #   이름만 보고 아틀라스라고 생각하면 해시가 안 맞는다(실제로 한 번 틀렸다).
    background, walk, keyposes, telescope = hk.load_atlas()

    # 승인 픽셀인지 파일에서 직접 확인한다. 다르면 만들지 않는다 — 새 그림을
    # 섞지 않는 것이 이 파이프라인의 요점이다.
    atlas_hash = hk.rgba_file_pixels_sha256(hk.ATLAS_PATH)
    if atlas_hash != hk.EXPECTED_ATLAS_RGBA_SHA256:
        raise SystemExit("아틀라스 픽셀이 승인본과 다르다. 스트립을 만들지 않는다.")

    world = hk.build_vertical_world(background)
    polaris, flashes = hk.build_polaris()

    times: list[int] = []
    for _name, start, end, count in BEATS:
        span = end - start
        for i in range(count):
            t = start + int(span * (i + 0.5) / count)
            times.append((t // hk.FRAME_MS) * hk.FRAME_MS)
    if len(times) != STRIP_FRAMES:
        raise SystemExit(f"BEATS 합이 {len(times)} 인데 STRIP_FRAMES 는 {STRIP_FRAMES} 다")

    frames = [
        hk.compose_frame(t, world, walk, keyposes, telescope, polaris, flashes)
        for t in times
    ]

    fw, fh = frames[0].size
    tw, th = fw // STRIP_SCALE, fh // STRIP_SCALE
    if tw * STRIP_SCALE != fw or th * STRIP_SCALE != fh:
        raise SystemExit("정수 축소가 아니다. STRIP_SCALE 을 다시 볼 것")

    rows = (len(frames) + STRIP_COLS - 1) // STRIP_COLS
    strip = Image.new("RGB", (tw * STRIP_COLS, th * rows), (0, 0, 0))
    for i, f in enumerate(frames):
        # NEAREST 만 쓴다. bilinear/bicubic 은 픽셀을 흐린다(PIXEL-CLAY 규칙 3).
        cell = f.convert("RGB").resize((tw, th), Image.NEAREST)
        strip.paste(cell, ((i % STRIP_COLS) * tw, (i // STRIP_COLS) * th))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(args.out, optimize=True)

    digest = hashlib.sha256(strip.tobytes()).hexdigest()
    print(json.dumps({
        "out": str(args.out),
        "frames": len(frames),
        "frame_size": [tw, th],
        "cols": STRIP_COLS,
        "rows": rows,
        "strip_size": list(strip.size),
        "frame_ms": STRIP_FRAME_MS,
        "total_ms": len(frames) * STRIP_FRAME_MS,
        "atlas_rgba_sha256": atlas_hash,
        "strip_pixels_sha256": digest,
        "beats": [{"name": n, "frames": c} for n, _s, _e, c in BEATS],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
