# HustleK Pixel Asset Production Guide

이 문서는 HustleK 아이콘·아바타를 다른 세션이나 다른 AI가 다시 제작해도 같은 스타일과 픽셀 제작 방식을 유지하기 위한 정본이다. 정적 에셋의 32px 논리 마스터 생성, 정수배 호환 출력, 검증, 프로비넌스를 모두 이 문서로 잠근다.

## 0. 현재 상태와 문서 우선순위

2026-08-22 사용자 결정으로 **앞으로 새로 생성하거나 다시 그리는 모든 HustleK 정적 에셋의 논리 제작 그리드는 32×32**다. 물리 캔버스와 논리 그리드는 다르다. 검토용 ImageGen 결과는 대응 원본의 물리 크기와 비율을 유지하고, 런타임 호환 출력은 32px 논리 마스터의 정수배만 허용한다.

기존 `design/hustlek-assets-v1/catalog.json`의 native128 에셋 803개는 모두 `ready_for_review`이고 `approved`는 0개다. 이 v1 라이브러리와 관련 builder·manifest·atlas는 **read-only legacy**로 동결한다. 새 32px 계약으로 자동 재분류, 변환, 승인하거나 style lock으로 승격하지 않는다. v2 제작기와 catalog migration이 준비되기 전에는 새 결과를 v1 경로에 publish하지 않는다.

관련 문서가 충돌하면 다음 순서를 따른다.

1. 사용자가 명시적으로 승인한 style-lock 이미지와 decoded RGBA hash
2. 이 문서의 정적 에셋 제작 계약
3. `docs/HUSTLEK-COMPOSITION.md`의 합성·레이어 계약
4. `docs/HUSTLEK-OPENING.md`의 캐릭터·애니메이션 계약
5. 생성 스크립트와 manifest
6. 미승인 preview, contact sheet, 과거 실험 산출물

`ready_for_review`와 `approved`는 절대로 같은 상태가 아니다.

## 1. 한 문장 원칙

> 정체성은 원본에서, 그림체는 고정된 승인 reference에서 가져와 32×32 논리 마스터를 처음부터 직접 그리고, 64·96·128px 호환 파일은 그 마스터의 정확한 정수 2×·3×·4× NEAREST 출력으로만 만든다.

이 원칙에서 벗어나는 결과는 보기 좋아도 HustleK production asset으로 승인하지 않는다.

## 2. 절대 규칙

1. **logical32 master first**: 모든 새 canonical 에셋은 진짜 32×32 논리 그리드에서 직접 디자인한다.
2. **논리·물리 크기 분리**: ImageGen 검토 캔버스는 대응 원본의 물리 크기와 비율을 유지한다. 큰 PNG라는 이유로 64px·128px 논리 에셋으로 간주하지 않는다.
3. **원본은 identity reference**: 기존 16·32·64·128px 결과를 축소·확대·필터 처리해 새 32px 마스터로 사용하지 않는다.
4. **고정 style lock**: bulk 생성 전에 종류별 승인 reference와 decoded RGBA hash를 고정한다.
5. **reference daisy-chain 금지**: 직전에 생성한 미승인 이미지를 다음 이미지의 style reference로 사용하지 않는다.
6. **크기별 재생성 금지**: 64·96·128px를 이미지 모델에 각각 다시 그리게 하지 않는다.
7. **정수배 직접 출력**: 64·96·128px는 잠긴 logical32 master에서 각각 직접 `NEAREST` 2×·3×·4×로 만든다. 48px는 1.5×라 기본 출력에서 제외한다.
8. **축소 예외 최소화**: 16px가 실제로 필요할 때만 logical32에서 직접 NEAREST 축소하고, 증명된 소실 픽셀만 좌표 whitelist로 보정한다.
9. **무안티앨리어싱**: bilinear, bicubic, LANCZOS, blur, 반투명 edge를 사용하지 않는다.
10. **불변 프로비넌스**: source, prompt, reference, logical master, physical export, builder, correction plan의 hash를 기록한다.
11. **검증 후 publish**: 모든 검증을 메모리 또는 임시 파일에서 끝낸 뒤 PASS일 때만 승인 경로에 쓴다.
12. **Pixy 금지**: Pixy skill, Pixy CLI, `.pix`, `pixy.spec.json`을 사용하지 않는다.
13. **런타임 임의 scaling 금지**: 합성용 레이어와 attachment는 logical32 좌표로 만들고 필요한 물리 캔버스에 정수배로 미리 출력한다.
14. **v1 쓰기 금지**: 기존 native128 builder와 catalog는 검증·비교용 legacy다. 새 제작 요청이나 새 결과를 v1 batch에 쓰지 않는다.

## 3. 산출물 규격

| 구분                 | 규격                                  | 역할                                                        |
| -------------------- | ------------------------------------- | ----------------------------------------------------------- |
| canonical master     | 32×32 RGBA PNG                        | 정체성·형태·팔레트·디테일의 유일한 논리 원본                |
| review carrier       | 대응 원본과 같은 물리 canvas/aspect   | ImageGen 직접 재작화와 A/B 검수용, canonical 아님           |
| compatibility export | 64·96·128 RGBA PNG                    | logical32에서 직접 만든 정확한 2×·3×·4× NEAREST 출력        |
| compact export       | 필요할 때만 16×16 RGBA PNG            | logical32에서 직접 축소, 증명된 소실만 최소 보정             |
| composition variant  | logical32 + 계약된 정수배 물리 canvas | anchor와 z-order가 반영된 합성 전용 레이어                  |
| production atlas     | RGBA, binary alpha                    | 투명 crop을 그대로 재추출할 수 있는 raw atlas               |
| review sheet         | RGB/RGBA preview                      | checkerboard, label, integer zoom이 포함된 검수 전용 이미지 |
| manifest             | UTF-8 JSON                            | 입력·prompt·hash·논리/물리 규격·검증·승인 상태 기록         |

64·96·128px는 별도 디자인 tier가 아니라 32px 논리 마스터의 표시·호환 envelope다. 48px는 균일한 정수 픽셀 블록을 보존하지 못하므로 새 기본 출력에서 제외한다. 기존 v1의 48px와 native128 결과는 역사적 비교 reference일 뿐 v2 canonical이 아니다.

모든 production PNG는 다음 조건을 만족해야 한다.

- 정확한 canvas 크기
- `RGBA`
- alpha 값은 `0` 또는 `255`만 존재
- 완전 투명 픽셀의 RGB는 `(0, 0, 0)`
- 빈 foreground 금지
- integer grid에 맞는 hard edge
- PNG 파일 hash와 별도로 decoded RGBA hash 기록

## 4. Style Lock을 먼저 만든다

### 4.1 필요한 lock 세트

전체 803개를 생성하기 전에 다음 대표군을 사용자가 1x와 확대 보기에서 승인해야 한다.

| lock        | 대표 샘플             | 통제하는 항목                           |
| ----------- | --------------------- | --------------------------------------- |
| human       | plain person          | 얼굴 비율, 눈높이, 피부 ramp, bust crop |
| job         | chef                  | 직업 모자, 의상, 버튼, 재질 밀도        |
| fantasy     | wizard                | 비정형 모자, 장식, 비대칭 signature     |
| animal      | cat                   | 귀·주둥이·종 구분 silhouette            |
| object      | camera 또는 telescope | 금속·유리·구멍·기계 구조                |
| rectilinear | calendar              | 직선, 셀, 내부 negative space           |
| organic     | tree                  | 곡선형 contour, 줄기, 덩어리 cluster    |
| UI symbol   | error                 | 1-bit topology, 중앙 정렬, 균일 stroke  |

각 lock에는 다음을 기록한다.

- `asset_id`
- 승인된 PNG 경로
- decoded RGBA SHA-256
- 승인 날짜와 승인 주체
- 고정 crop, 방향, padding
- 허용 palette role과 material ramp
- 1x 검수 캡처

현재 `catalog.json`의 803개는 모두 미승인이므로, 위 lock을 새로 승인하기 전까지 기존 master를 자동 style lock으로 사용하지 않는다.

### 4.2 drift 방지

- 모든 같은 종류의 생성 요청은 같은 style-lock 이미지, 같은 순서, 같은 prompt shell을 사용한다.
- Image 2와 Image 3의 역할을 batch 도중 바꾸지 않는다.
- reference는 최대한 적게 유지한다. 서로 다른 그림체를 한 요청에 섞지 않는다.
- 새 산출물이 더 좋아 보여도 다음 산출물의 reference로 즉시 승격하지 않는다.
- style lock 변경은 새 버전이며, 이전 master와 tier를 조용히 덮어쓰지 않는다.
- batch contact sheet에는 lock 샘플을 첫 열에 반복 배치해 drift를 육안 비교한다.

## 5. HustleK 시각 문법

### 5.1 공통 형태

- 정수 좌표에 놓인 사각 픽셀 cluster
- 계단형 contour와 의도적인 덩어리
- warm-charcoal 계열의 연속적 또는 선택적 외곽선
- 좌상단 key light, 우하단 shadow
- 재질별 3~4단계 ramp
- 1~3 logical-pixel 크기의 제한된 highlight
- 넓은 면을 noise로 채우지 않고 읽히는 cluster로 분할
- silhouette, 내부 경계, 핵심 feature의 우선순위가 명확함
- 한 파일에 한 subject, 중앙 정렬, 안정된 padding

### 5.2 아바타

- 정면 head-and-shoulders bust가 기본
- 큰 머리와 작은 몸의 안정된 chibi 비율
- 얼굴 중심선과 눈높이를 같은 family에서 고정
- 피부, 머리, 의상은 서로 명확히 분리
- 눈·코·입은 작아도 각각 읽히는 cluster로 설계
- 직업은 라벨 없이 읽히는 dominant cue 하나를 먼저 설계
- 부가 badge나 tool은 직업 silhouette보다 우선하지 않음
- 다른 캐릭터의 안경, 머리, 의상, pose를 style이라는 이유로 복사하지 않음

### 5.3 아이콘

- canonical silhouette, 방향, aperture 수, contact point를 보존
- object icon은 보통 canvas의 70~80% 안에 배치하고 10~15% margin을 유지
- 고리, 손잡이, 구멍, 다리처럼 topology를 만드는 구조를 색보다 먼저 보존
- UI symbol은 재질 묘사보다 1-bit topology와 stroke 균일성이 우선
- status·navigation icon에는 캐릭터식 표면 묘사를 과도하게 넣지 않음
- 텍스트, 숫자, 문자, logo를 이미지에 굽지 않음

### 5.4 금지 표현

- antialiasing, blur, smooth gradient
- soft glow, glassmorphism, drop shadow, cast shadow
- 무작위 dithering noise
- semitransparent outline 또는 halo
- photorealism, 3D render, vector-like softness
- background scenery, floor, extra character, 임의의 extra prop
- 원본에 없는 종 특징, 장신구, 성별 cue, pose 발명
- 승인 reference의 protagonist 특징을 다른 asset에 이식

## 6. 원본 해석 규칙

원본 SVG 또는 저해상도 이미지는 픽셀을 복제하는 재료가 아니라 정체성 계약이다. 생성 전에 다음을 짧은 asset spec으로 적는다.

```text
asset_id:
kind:
canonical silhouette:
orientation:
crop and padding:
identity anchors:
negative-space count:
appendage/contact-point count:
dominant semantic cue:
forbidden inventions:
chroma key:
style-lock ids and hashes:
```

실제 그림과 metadata가 충돌하면 보이는 그림을 우선한다. 예를 들어 metadata에 `species: cat`이 있어도 귀·수염·주둥이 같은 cue가 원본에 없다면 새로 발명하지 않는다.

alias는 별도 master를 만들지 않고 canonical target을 재사용한다.

## 7. Logical32 Master 생성

### 7.1 이미지 입력 역할

가능하면 입력은 세 장 이하로 고정한다.

1. **Image 1, identity reference**: silhouette, 방향, crop, 핵심 부품과 검토용 물리 canvas만 제공
2. **Image 2, family style lock**: 같은 종류의 승인된 비율과 cluster 밀도 제공
3. **Image 3, global style lock**: HustleK 공통 palette role, outline, 광원 제공

Image 1의 저해상도 픽셀을 확대하거나 그대로 따라 그리도록 요청하지 않는다.

### 7.2 공통 prompt shell

이미지 모델에는 영어 shell을 고정해 사용하는 것을 권장한다. `{...}`만 asset별로 교체한다.

```text
Use case: identity-preserve
Asset type: direct-redraw HustleK logical-32 pixel-art {avatar|icon}

Primary request: Completely redraw Image 1 with the information budget and
cluster density of a genuinely authored 32x32 logical HustleK pixel-art
{subject}. Image 1 provides identity, canonical silhouette, orientation, crop,
semantic anchors, and the physical review-canvas dimensions only. Never trace,
pixelate, shrink, or enlarge an existing 64px or 128px result. Images 2 and 3
are immutable style-only references.

Subject: one centered {subject description}. Preserve {identity anchors},
{negative spaces or appendage count}, orientation, proportions, and padding.

Style: authentic handcrafted HustleK pixel art authored for a 32x32 logical
grid; large hard square-edged clusters; warm-charcoal outline; restrained 3-4
tone ramps per material; upper-left key light and lower-right shadow.

Logical detail: newly design {material and feature list} using only details that
remain legible within 32 logical pixels. Eyes, nose, mouth, seams, highlights,
and wrinkles use deliberate 1-2 logical-pixel clusters. Do not add sub-32-grid
micro-detail. Primary identity cues must survive at native logical 1x.

Hard constraints: every mark is grid-aligned, square-edged, and integer-sized.
No filtered pixelation or high-resolution micro-detail. No antialiasing, blur, gradients,
translucency, glow, random dithering, text, logo, watermark, scenery, cast
shadow, floor, extra object, or borrowed character features.

Backdrop: one perfectly flat solid {#00FF00|#FF00FF} chroma-key background,
with no texture, halo, or key color inside the subject. Preserve Image 1's
exact physical canvas dimensions and aspect ratio for this review carrier.
```

### 7.3 종류별 추가 문장

| 종류         | prompt에 추가할 핵심                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| human/role   | `front-facing bust, stable eye line and head/body ratio`                        |
| job          | `one dominant occupational headgear or garment cue; secondary chest/tool cues`  |
| fantasy      | `preserve appendage count and asymmetric signature`                             |
| animal       | `species silhouette first; ears, muzzle and other visible cues remain distinct` |
| rectilinear  | `preserve line count, cell count and negative apertures`                        |
| mechanical   | `preserve ring, hole, handle, leg and contact-point topology`                   |
| organic/tool | `preserve contour landmarks and orientation`                                    |
| UI symbol    | `flat 1-2 tone topology, uniform stroke, exact center and negative-space count` |

### 7.4 chroma와 투명화

- 기본 key는 `#00FF00`이다.
- 녹색 subject에는 `#FF00FF`처럼 subject에 없는 key를 사용한다.
- 네 모서리는 모두 key 또는 완전 투명이어야 한다.
- key 제거 뒤 alpha를 `>=128 → 255`, `<128 → 0`으로 정규화한다.
- 투명화 뒤 hidden RGB를 모두 0으로 지운다.
- key 색이 subject 내부에 섞였으면 자동 복구하지 말고 재생성 또는 명시적 마스크 검수를 한다.

### 7.5 palette

- palette는 숫자보다 역할이 먼저다: outline, base, light, shadow, optional accent.
- logical32 avatar는 보통 8~16색, 복합 object는 8~20색을 참고 범위로 삼되 정체성에 필요한 역할색을 우선한다.
- 숫자를 맞추기 위해 서로 다른 재질을 같은 색으로 뭉개지 않는다.
- master 승인 때 한 번만 `MEDIANCUT + Dither.NONE` 같은 결정적 quantization을 사용할 수 있다.
- compatibility export마다 별도 palette 축소를 하지 않는다.
- NEAREST baseline의 색상 수가 크다는 이유로 전역 palette limit을 강제하지 않는다.

### 7.6 review carrier와 canonical의 경계

- ImageGen이 큰 물리 PNG를 반환해도 그것은 `review carrier`일 뿐 logical32 master가 아니다.
- 일반 resize, thumbnail, pixelation filter로 carrier를 32×32로 줄인 결과는 승인할 수 없다.
- canonical은 32×32 그리드에서 cluster 좌표를 명시적으로 재구성하거나, exact 32×32 출력을 보장하는 v2 builder로 만들어야 한다.
- v2 builder와 검증기가 준비되기 전에는 logical32 review carrier 제작·비교까지만 허용하고 production publish는 금지한다.
- 이전 세션의 32px review strip도 이 경계를 통과하기 전에는 canonical 또는 style lock이 아니다.

## 8. Master 승인 게이트

logical32 master는 다음을 모두 통과해야 `approved`가 될 수 있다. ImageGen review carrier와 canonical logical master를 같은 파일로 취급하지 않는다.

### 8.1 자동 검증

- canonical mode와 canvas가 `RGBA 32×32`
- review carrier의 물리 canvas와 aspect ratio가 대응 identity reference와 일치
- binary alpha, hidden RGB 0, foreground non-empty
- source SVG SHA-256 일치
- raw generation과 cutout SHA-256 기록
- prompt와 style-lock hash 기록
- decoded RGBA SHA-256 기록
- two-pass post-processing 결과 동일
- identity reference와 alpha IoU가 asset별 floor 이상
- 기존 64px 또는 128px 결과를 축소·pixelation filter로 만든 provenance가 아님
- 64·96·128 compatibility export가 logical32의 NEAREST 2×·3×·4×와 decoded RGBA byte-identical
- logical32 안에서 필요한 silhouette와 semantic cue가 읽힘
- 8-neighbor component와 negative-space 수가 semantic contract와 일치

### 8.2 육안 검증

1. 투명 배경 1x에서 라벨 없이 정체성을 읽는다.
2. 어두운 배경과 밝은 배경 모두에서 외곽선을 확인한다.
3. logical32 1x와 integer 4x 또는 8x에서 cluster, stray pixel, hidden halo를 확인한다.
4. 원본과 나란히 silhouette, 방향, crop, padding을 비교한다.
5. style lock과 나란히 얼굴 비율, outline, 광원, material ramp를 비교한다.
6. 16px compact export가 실제 요구될 때만 임시 축소에서 dominant cue 생존을 확인한다.
7. 같은 batch contact sheet에서 drift를 확인한다.

`ready_for_review`는 자동 검증을 통과한 상태다. 사용자의 육안 승인이 있어야만 `approved`로 바꾼다.

## 9. 64·96·128px 정수배 출력

### 9.1 유일한 baseline

모든 표시·호환 출력은 승인된 logical32 master에서 직접 만든다. 64·96·128px는 서로 다른 디자인 tier가 아니며, 같은 픽셀을 각각 2×·3×·4× 표시한 파일이다.

```python
from PIL import Image

logical32 = Image.open(master_path).convert("RGBA")
assert logical32.size == (32, 32)
exports = {
    size: logical32.resize((size, size), Image.Resampling.NEAREST)
    for size in (64, 96, 128)
}
```

금지 예시:

- 기존 64px 또는 128px 결과를 32px로 줄여 master라고 부르기
- 기존 결과에 pixelation filter를 적용해 direct redraw라고 기록하기
- 64·96·128px를 image model에 각각 별도 생성하기
- 32 → 64 → 128처럼 호환 출력을 다시 입력으로 쓰기
- 48px처럼 비정수 배율을 새 기본 출력으로 추가하기
- bilinear, bicubic, LANCZOS, sharpen으로 블록 경계를 변형하기

### 9.2 NEAREST가 정답인 이유

NEAREST 정수 확대는 logical32 master의 silhouette, palette, 배치, 재질 cluster를 byte-exact 계보로 유지한다. 각 물리 크기를 따로 생성하면 같은 이름의 에셋이 서로 다른 캐릭터나 물체처럼 보인다. 따라서 logical32가 유일한 identity contract다.

### 9.3 16px compact 예외

16px 파일이 실제 런타임 요구로 확인된 경우에만 logical32에서 직접 `NEAREST`로 축소한다. 16px는 32px와 정보량이 다르므로 compatibility export가 아니라 compact derivative다. semantic cue 소실이 증명되지 않으면 보정 픽셀은 0개가 정답이다.

## 10. Surgical correction

### 10.1 허용 조건

보정은 16px compact derivative에서 다음이 모두 참일 때만 허용한다. logical32 master 자체가 잘못됐으면 32px에서 다시 그리고, 64·96·128px compatibility export는 절대 보정하지 않는다.

- 1x에서 정체성 cue가 실제로 소실되거나 구조가 분리됨
- plain NEAREST의 문제 좌표를 재현할 수 있음
- semantic ROI와 수정 목적을 설명할 수 있음
- 수정 좌표와 source 좌표를 manifest에 선언함
- 가능하면 baseline 내부의 기존 opaque 픽셀을 복사함
- 수정하지 않은 모든 픽셀은 baseline과 byte-identical함

보정은 `baseline.copy()`에서 시작한다. 새 parametric drawing으로 tier 전체를 다시 그리지 않는다.

### 10.2 기본 상한

| derivative | baseline alpha IoU 최저 | baseline foreground 대비 변경 비율 최고 |
| ---------: | ----------------------: | --------------------------------------: |
|       16px |                   0.950 |                                   0.050 |

얇은 다리·안테나·도구처럼 구조적으로 취약한 object는 별도 승인된 category policy에서만 16px 변경 비율을 최대 `0.08`까지 완화할 수 있다. 단순히 더 예쁘게 만들고 싶다는 이유는 예외가 아니다.

64·96·128px는 logical32의 정확한 정수배이므로 수정 픽셀은 항상 0개여야 한다. 16px도 필요한 1~수 픽셀만 보정한다.

### 10.3 허용 operation

- `copy-add`: baseline의 기존 opaque 픽셀을 transparent target에 복사
- `copy-recolor`: baseline의 기존 opaque 색을 다른 opaque target에 복사

각 operation에는 `target`, `source`, `region`, `reason`이 필요하다. 새 색 발명, freehand brush, 주변 영역 재래스터는 기본적으로 금지한다.

### 10.4 검증

- 선언되지 않은 변경 픽셀 0개
- 선언했지만 효과 없는 operation 0개
- bbox edge 변화가 허용 범위 이내
- component 수가 악화되지 않음
- negative-space 수가 의도 없이 변하지 않음
- identity color cue가 baseline보다 감소하지 않음
- alpha IoU와 변경 비율 상한 통과
- baseline과 correction diff 이미지 생성

tight-crop IoU나 인접 tier IoU는 진단값일 뿐이다. 이동·왜곡도 통과시킬 수 있으므로 same-canvas hash, 좌표 whitelist, semantic anchor 검증을 대신할 수 없다.

## 11. 종류별 semantic QA

| 군           | 반드시 보존할 것                                  | 자주 생기는 실패                |
| ------------ | ------------------------------------------------- | ------------------------------- |
| human/role   | head/body ratio, eye line, face–hair–garment 분리 | 눈·입 소실, 머리와 몸 merge     |
| job          | dominant 직업 silhouette, headgear, coat cue      | badge만 남고 직업이 안 읽힘     |
| fantasy      | appendage 수, hat/horn tip, asymmetric signature  | tip 절단, 장비 분리             |
| animal       | 귀·주둥이 등 실제 species silhouette              | 사람 얼굴화, 귀 merge           |
| rectilinear  | line count, cell count, aperture                  | 내부 grid 폐쇄, 선 굵기 불균형  |
| mechanical   | ring/hole 수, concentricity, leg·handle 연결      | 렌즈가 초승달로 축소, 다리 단절 |
| organic/tool | contour landmark, stem, diagonal orientation      | 잎·줄기 merge, 방향 drift       |
| UI symbol    | center, stroke width, Euler topology              | 색은 맞지만 기호가 다른 모양    |

16px는 8-neighbor 연결을 사용하고, 대각선을 허용하지 않는 4-neighbor 강제 연결로 선을 불필요하게 두껍게 만들지 않는다. 64·96·128px는 각 논리 픽셀이 정확히 2×2·3×3·4×4 동일 RGBA 블록인지 확인한다.

## 12. 아바타 합성 규칙

평면 logical32 master와 합성 layer는 별도 산출물이다. logical32 좌표에서 분해한 layer는 다시 합성했을 때 decoded RGBA가 32×32 master와 정확히 같아야 한다.

|   z | layer                   | 책임                      |
| --: | ----------------------- | ------------------------- |
|  10 | `extra_back`            | 몸 뒤 소품                |
|  20 | `hair_back`             | 목·귀 뒤 머리             |
|  30 | `base`                  | 피부, 머리, 귀, 기본 몸체 |
|  40 | `garment`               | 몸통 의상                 |
|  50 | `hair_front`            | 얼굴 앞 머리              |
|  60 | `face`                  | 눈·코·입·표정             |
|  70 | `headwear`              | 모자·헬멧                 |
|  75 | `extra_face_neck_badge` | 안경·마스크·목·가슴 장식  |
|  80 | `extra_hand`            | 손 도구와 grip mask       |
|  90 | `extra_foreground`      | 전경 대형 소품            |

- 의상은 torso mask만 교체하고 목과 머리를 지우지 않는다.
- 모자 때문에 머리를 지울 때는 승인된 binary occlusion mask만 사용한다.
- badge는 최종 garment alpha 안으로 clip한다.
- 손 도구는 몸 위에 놓고 grip mask로 손가락만 복원한다.
- 새 v2 anchor와 fit box는 logical32 좌표로 정의하고, 물리 128px 호환 variant는 모든 좌표를 정확히 4배해 출력한다.
- attachment는 logical32 variant를 먼저 만들고 필요한 64·96·128px 정수배 canvas로 미리 출력한다.
- runtime에서 standalone icon을 임의 또는 비정수 배율로 확대·축소해 장착하지 않는다.
- 기존 v1의 128px anchor는 4의 배수가 아닌 좌표를 포함하므로 v2 logical32 anchor로 자동 나눗셈·이관하지 않는다.
- 모든 533개 icon은 standalone으로 보존하되, 허용된 267개만 attachment로 사용한다.

자세한 anchor와 occlusion 계약은 `docs/HUSTLEK-COMPOSITION.md`를 따른다.

## 13. Batch와 publish

### 13.1 batch 단위

- 생성은 한 asset씩 수행하되 publish batch는 최대 32개로 묶는다.
- avatar와 UI symbol을 같은 prompt family로 생성하지 않는다.
- 같은 batch는 동일한 style-lock set과 prompt shell을 사용한다.
- batch마다 raw input, master atlas, manifest, contact sheet를 만든다.
- alias 51개는 생성 batch에 포함하지 않는다.

### 13.2 immutable output

v2 권장 경로:

```text
design/hustlek-assets-v2/logical32/batches/<batch-id>/<contract-hash-12>/
  master-atlas.png
  manifest.json
```

- `design/hustlek-assets-v1/native128/`과 `design/hustlek-composition-v1/`은 legacy read-only다.
- v2 builder와 schema가 준비되기 전에는 위 권장 경로를 수동 생성하거나 v1 catalog pointer를 갱신하지 않는다.
- 기존 content-addressed 경로를 다른 bytes로 덮어쓰지 않는다.
- 모든 검증이 끝나기 전에 catalog pointer를 갱신하지 않는다.
- 실패 실행은 기존 PASS atlas, manifest, preview를 덮어쓰지 않는다.
- catalog는 마지막에 atomic update한다.
- master가 변경되면 그 master에서 파생된 모든 tier와 composition variant를 무효화한다.

### 13.3 manifest 필수 항목

```json
{
  "asset_id": "icons/example",
  "state": "ready_for_review",
  "source_svg_sha256": "...",
  "raw_generation_sha256": "...",
  "prompt_sha256": "...",
  "style_lock_rgba_sha256": ["..."],
  "logical_grid_px": 32,
  "logical_master_decoded_rgba_sha256": "...",
  "review_canvas_policy": "preserve-identity-reference",
  "compatibility_exports": {"64": 2, "96": 3, "128": 4},
  "derived_from_legacy_64_or_128": false,
  "builder_sha256_lf": "...",
  "imagegen_used_for_master": true,
  "imagegen_used_for_compatibility_exports": false,
  "pixy_used": false,
  "resampling": "Pillow Image.Resampling.NEAREST integer-only",
  "correction_manifest_sha256": "...",
  "validation_result": "PASS"
}
```

실제 생성에 ImageGen을 사용했다면 `imagegen_used_for_master: false`로 기록하면 안 된다. provenance는 구현 세부가 아니라 승인 조건이다.

## 14. 검수 화면과 atlas

- production atlas는 투명 raw pixels만 담는다.
- label, checkerboard, zoom은 comparison 또는 review sheet에만 넣는다.
- 개별 PNG를 저장하지 않는 경우에도 atlas crop으로 원본 RGBA를 정확히 복원할 수 있어야 한다.
- 검수 HTML은 실제 local PNG atlas를 직접 참조한다.
- 외부 CDN, 압축 decoder, fetch 성공 여부에 에셋 표시를 의존하지 않는다.
- 모든 `<img>`는 `naturalWidth > 0`을 자동 확인한다.
- desktop과 390px mobile에서 overflow와 선택 동작을 검사한다.

## 15. 실패 패턴과 복구

| 실패                             | 원인                                     | 복구                                                |
| -------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| 크기마다 모습이 다름             | 물리 크기별 독립 생성                    | 승인 logical32에서 2×·3×·4× NEAREST 재출력         |
| 32px가 흐리거나 과도하게 세밀함  | 64/128 축소 또는 pixelation filter       | 원본을 identity로만 쓰고 logical32에서 직접 재작화  |
| asset마다 그림체가 달라짐        | reference와 prompt가 batch마다 변함      | 고정 style-lock hash와 공통 shell로 재생성          |
| 뒤로 갈수록 style drift          | 직전 결과를 다음 reference로 사용        | daisy-chain 폐기, 원래 lock으로 복귀                |
| 16px에서 부품이 끊김             | sampling phase로 1px 연결 소실           | baseline 픽셀 copy whitelist로 최소 연결            |
| 64·96·128px가 다시 그려짐        | compatibility export를 tier로 오해       | logical32 정수배 NEAREST로 되돌리고 0px 수정        |
| 렌즈가 얇은 초승달처럼 보임      | 축 방향 핵심 픽셀 소실                   | master cue 폭을 재검토하거나 whitelist 최소 보정    |
| preview만 있고 투명 asset이 없음 | label·배경이 baked된 sheet만 저장        | raw transparent atlas 또는 개별 PNG publish         |
| 검증 FAIL인데 승인 파일이 바뀜   | 검증 전에 output overwrite               | memory/temp 검증 후 PASS에서 atomic replace         |
| 검수 화면에서 이미지가 안 보임   | 외부 decoder·fetch 의존                  | local runtime PNG 직접 참조                         |
| v1 catalog에 새 결과가 들어감    | legacy builder를 새 계약에 재사용        | publish 중단, v1 복원, v2 builder 준비 후 재시작    |
| manifest와 실제 생성법이 다름    | provenance를 수동 추측                   | 실행 시점의 prompt·tool·hash를 자동 기록            |

## 16. Context Guard와 세션 교체

긴 세션에서 품질이 무너지는 직접 원인은 단순한 token 수가 아니라 다음 상태 변화다.

- 최초 승인 기준보다 최근 대화의 임시 판단을 더 강하게 따름
- compaction 뒤 reference 이미지의 역할과 승인 상태가 요약됨
- 서로 다른 asset family의 prompt와 QA 규칙이 섞임
- 이전 실패 원인과 현재 correction plan을 혼동함
- 이미지 생성, 육안 판단, 코드 수정, batch publish를 한 세션에서 너무 많이 반복함

따라서 컨텍스트 사용량과 상관없이 style drift 징후가 보이면 세션을 교체한다.

### 16.1 단계별 중단선

| 상태            | 허용 작업                        | 금지 작업                              | 필수 조치                        |
| --------------- | -------------------------------- | -------------------------------------- | -------------------------------- |
| 70% 이상        | 현재 asset의 검증·정리           | 새 batch, 새 family, prompt 구조 변경  | `SESSION_RECOVERY.md` 초안 갱신  |
| 80% 이상        | 현재 atomic unit의 안전한 종료만 | 새 ImageGen 호출, 새 master, bulk 작업 | 검증·commit·인계 후 새 세션 권장 |
| 90% 이상        | read-only 상태 확인과 인계       | 생성·편집·승인·catalog 갱신            | 즉시 중단하고 새 세션으로 전환   |
| compaction 발생 | 완료된 결과 확인과 인계          | 기억에 의존한 계속 작업                | 80% 이상으로 간주하고 세션 교체  |

플랫폼이 정확한 context 사용률을 보여주지 않으면 다음 중 하나만 발생해도 80% 이상으로 간주한다.

- 대화가 자동 요약 또는 compaction되었다는 표시가 나타남
- 처음의 reference 역할, 승인 이미지, prompt shell을 원문 없이 회상해야 함
- 같은 규칙을 다시 찾기 위해 긴 대화 기록을 반복 탐색함
- 미승인 결과를 승인 reference로 착각하거나 prompt가 batch 중간에 바뀜
- 사용자가 style drift, 깨진 픽셀, 이전과 다른 그림체를 발견함
- agent가 동일한 실패를 한 세션에서 두 번째 반복함

### 16.2 중단 후 허용되는 일

중단선에 도달하면 “조금만 더 생성”하지 않는다. 다음 작업만 수행한다.

1. 진행 중인 tool call 결과가 있으면 raw output을 보존한다.
2. 현재 atomic asset의 자동 검증을 끝내거나 미완료라고 명시한다.
3. 승인 파일과 catalog가 변경되지 않았는지 확인한다.
4. `git status`, diff, 마지막 commit을 기록한다.
5. repo root의 `SESSION_RECOVERY.md`를 현재 사실로 갱신한다.
6. 최종 인계 상태를 `docs/HUSTLEK-SESSION-HANDOFF.md`에 반영한다.
7. 필요한 변경만 checkpoint commit으로 남긴다.
8. 사용자에게 새 세션 시작을 권장하고 전용 prompt 파일을 제공한다.

컨텍스트 경계 이후에는 다음을 하지 않는다.

- 새 이미지 생성
- style reference 교체
- 새로운 보정 좌표 판단
- 다수 asset의 승인 또는 반려
- 실패한 validation을 우회하는 코드 수정
- 결과를 `approved`로 승격

### 16.3 한 세션의 작업 상한

컨텍스트 표시가 여유로워도 다음 상한을 지킨다.

- 한 세션에는 한 asset family만 다룬다.
- style-lock 단계는 대표 asset 1개만 생성하고 사용자 승인을 기다린다.
- production 단계는 한 세션당 새 logical32 master 최대 4개다.
- 하나의 master가 반려되면 같은 세션에서 bulk 생성을 계속하지 않는다.
- prompt shell 또는 style lock이 바뀌면 현재 batch를 닫고 새 세션에서 새 version으로 시작한다.
- generation, 1x 검수, manifest, commit까지를 하나의 atomic unit으로 본다.

4개는 목표가 아니라 상한이다. 1개에서 품질 문제가 발견되면 즉시 멈춘다.

### 16.4 인계 파일 계약

repo root의 `SESSION_RECOVERY.md`는 작업 중 자주 갱신하는 local recovery 파일이며 `.gitignore` 대상이다. `docs/HUSTLEK-SESSION-HANDOFF.md`는 새 worktree나 다른 환경에서도 읽을 수 있도록 commit하는 durable handoff다.

세션 종료 시 local recovery의 최종 사실을 durable handoff에 반영한다. 새 세션은 durable handoff를 먼저 읽고, 같은 worktree에 더 최신 `SESSION_RECOVERY.md`가 있으면 두 파일의 timestamp와 저장소 상태를 비교한 뒤 local recovery를 우선한다.

두 파일은 항상 다음을 포함한다.

- worktree, branch, 시작 기준 commit, 현재 `git status`
- 사용자의 최신 결정과 작업 목적
- 읽어야 할 정본 문서
- 현재 catalog의 `ready_for_review`와 `approved` 수
- 승인된 style-lock id, 경로, decoded hash 또는 `없음`
- 현재 atomic asset과 완료·미완료 상태
- 이번 세션에서 변경한 파일과 commit
- 실행한 검증과 실제 결과
- 생성된 raw/master/tier/review 경로
- 실패·반려·보류 항목과 이유
- 새 세션이 수행할 정확히 하나의 다음 작업
- 절대로 반복하거나 수행하면 안 되는 작업

스크린샷이나 “이전 대화 참고”만으로 인계하지 않는다. 경로, 좌표, hash, 명령을 텍스트로 기록한다.

### 16.5 새 세션의 수신 확인

새 세션의 첫 단계는 읽기 전용 인수다. read-only 상태 확인 외에는 실행하지 않는다. 특히 이미지 생성, contact sheet 생성, 파일 수정, commit, catalog 변경을 금지한다.

새 세션은 첫 응답에서 다음을 사용자에게 짧게 보고해야 한다.

1. 읽은 정본 파일
2. repo, branch, HEAD, clean/dirty 상태
3. style lock과 catalog 승인 상태
4. 인계 파일의 마지막 완료 지점
5. 이해한 핵심 제작 규칙
6. 사용자에게 제안할 단 하나의 atomic task
7. 실행 전에 필요한 사용자 결정

보고 내용과 실제 저장소가 다르면 생성하지 말고 차이를 먼저 해결한다. 일치하더라도 첫 응답 뒤 반드시 멈추고 사용자의 명시적 승인을 기다린다.

`읽어라`, `파악해라`, `검토해라`는 실행 승인이 아니다. 사용자가 제안된 atomic task를 명확히 승인하거나 수정 범위를 지정한 다음 메시지부터 작업할 수 있다. 모호하면 한 가지 짧은 질문으로 범위를 확정한다.

첫 응답의 마지막 줄은 다음으로 고정한다.

```text
승인 대기 중 — 아직 어떤 이미지나 제작 파일도 생성·수정하지 않았습니다.
```

전용 시작 prompt는 `docs/HUSTLEK-NEW-SESSION-PROMPT.txt`에 두고, commit된 최신 상태는 `docs/HUSTLEK-SESSION-HANDOFF.md`에 둔다.

## 17. 새 세션의 표준 작업 순서

1. 이 문서를 끝까지 읽는다.
2. repo, branch, `git status`, 적용되는 `AGENTS.md`를 확인한다.
3. `catalog.json`에서 `ready_for_review`와 `approved` 수를 보고한다.
4. 작업 대상의 canonical source, alias 여부, 현재 v1 reference hash와 v2 logical32 master 유무를 확인한다.
5. 해당 종류의 style lock이 사용자 승인됐는지 확인한다.
6. 정확히 하나의 atomic task를 제안하고 사용자 승인 전까지 멈춘다.
7. 승인 후 lock이 없으면 대표 샘플 1개만 만들고 bulk 생성을 중단한다.
8. asset spec과 고정 prompt shell을 작성한다.
9. 대응 원본과 같은 물리 canvas의 logical32 review carrier 하나만 만들고 자동 검증·contact sheet를 만든다.
10. 사용자의 1x 육안 승인을 받는다.
11. 승인 logical32 master에서 필요한 64·96·128 정수배 export를 각각 직접 만든다.
12. 16px가 실제로 필요하고 소실이 증명된 경우에만 whitelist correction을 적용한다.
13. diff, hash, semantic QA, 모바일 검수까지 통과시킨다.
14. immutable batch를 publish하고 catalog를 마지막에 갱신한다.
15. 변경 파일, 검증 명령, commit, 남은 미승인 항목을 보고한다.

## 18. 새 세션에 전달할 프롬프트

새 세션에서는 `docs/HUSTLEK-NEW-SESSION-PROMPT.txt`의 내용을 첫 요청으로 그대로 붙여 넣는다. 아래는 같은 계약의 축약본이다.

```text
먼저 docs/HUSTLEK-PIXEL-ASSET-GUIDE.md를 끝까지 읽고 그 문서를
HustleK 정적 픽셀 에셋 제작의 정본으로 사용해라.
repo root의 SESSION_RECOVERY.md도 읽고, 채팅 기억보다 그 파일의
경로·hash·검증·다음 작업을 우선해라.
SESSION_RECOVERY.md가 없으면 docs/HUSTLEK-SESSION-HANDOFF.md를 사용하고,
둘 다 있으면 timestamp와 실제 저장소 상태를 대조해 더 최신 사실을 사용해라.

Pixy skill, Pixy CLI, .pix, pixy.spec.json은 사용하지 마라.
원본이나 기존 64/128 결과를 축소·확대·pixelation filter 처리해 32 master로 사용하지 마라.
크기별로 이미지를 따로 생성하지 마라.

작업 시작 시 repo/branch/status와 catalog의 ready_for_review/approved 수,
대상 asset의 source와 현재 decoded RGBA hash, 사용할 style-lock id/hash를
먼저 보고해라. 현재 catalog의 ready_for_review 결과는 사용자 승인본으로
간주하지 마라.

이 첫 응답은 읽기 전용 인수다. 이해한 규칙과 단 하나의 atomic task를
제안한 뒤 멈추고 사용자 승인을 기다려라. 이미지, contact sheet, 파일,
commit, catalog를 생성·수정하지 마라. “읽어라”, “파악해라”, “검토해라”는
작업 승인이 아니다.

고정된 identity reference와 승인 style lock으로 진짜 logical32 master
하나를 처음부터 직접 만들어라. ImageGen 검토 결과는 대응 원본의 물리
canvas와 aspect ratio를 유지한다. 1x 검수와 자동 검증을 통과하고 사용자가
승인하기 전에는 bulk 생성이나 compatibility export 제작을 진행하지 마라.

승인 후 64, 96, 128은 모두 잠긴 logical32 master에서 Pillow NEAREST
정수 2x, 3x, 4x로 각각 직접 출력해라. 이 출력은 다시 그리는 tier가 아니다.
16px가 실제로 필요할 때만 logical32에서 직접 축소하고, 1x에서 semantic cue
소실이 증명된 픽셀만 좌표 whitelist로 최소 보정해라. 수정하지 않은 픽셀은
baseline과 byte-identical해야 한다. 48px는 새 기본 출력에 포함하지 마라.

RGBA logical32와 필요한 16/64/96/128, binary alpha, hidden RGB 0,
source/prompt/reference/logical-master/physical-export/builder/correction hash,
64/96/128의 정수배 byte identity, two-pass determinism, same-canvas diff,
semantic anchor, 1x 및 integer zoom 검수를 기록해라. 모든 검증이 PASS하기
전에 기존 승인 파일이나 catalog를 덮어쓰지 마라.

기존 design/hustlek-assets-v1 native128 builder와 catalog는 legacy read-only다.
새 logical32 결과를 그 경로에 publish하지 마라.

context 사용량이 70%에 도달하면 인계 초안을 만들고, 80% 또는 compaction에
도달하면 새 생성 작업을 멈춰라. 검증·commit·SESSION_RECOVERY.md 갱신만
끝낸 뒤 새 세션을 권장해라. 정확한 context 수치가 보이지 않더라도 style
drift, 규칙 재탐색, 기억 의존이 발생하면 같은 중단 규칙을 적용해라.
```

## 19. 최종 승인 체크리스트

- [ ] 사용자 승인 style-lock id와 decoded RGBA hash가 고정됨
- [ ] 원본을 identity reference로만 사용함
- [ ] master가 진짜 32×32 logical detail로 직접 제작됨
- [ ] review carrier가 대응 원본의 물리 canvas와 aspect ratio를 유지함
- [ ] 기존 64/128 결과의 축소·필터 결과가 아님
- [ ] 같은 family의 crop, 비율, outline, 광원이 일치함
- [ ] binary alpha와 hidden RGB 0을 통과함
- [ ] `ready_for_review`와 `approved`를 구분함
- [ ] 64·96·128이 logical32에서 직접 2×·3×·4× NEAREST로 출력됨
- [ ] 16px는 실제 필요와 cue 소실이 증명된 경우에만 생성됨
- [ ] correction이 좌표 whitelist와 비율 상한을 통과함
- [ ] 1x, integer zoom, 밝은/어두운 배경에서 검수함
- [ ] 새 기본 출력에 비정수 48px가 없음
- [ ] production atlas에서 각 crop을 무손실 복원할 수 있음
- [ ] 검수 화면이 local PNG를 실제로 로드함
- [ ] source, prompt, reference, builder, logical master, physical export hash가 기록됨
- [ ] 기존 v1 native128 catalog와 builder가 변경되지 않음
- [ ] 실패 실행이 승인 산출물을 변경하지 않음
- [ ] Pixy 사용 흔적이 없음
- [ ] context 70%에서 인계 초안을 갱신함
- [ ] context 80%, compaction 또는 style drift에서 새 생성을 중단함
- [ ] `SESSION_RECOVERY.md`에 다음 atomic task가 하나만 기록됨
- [ ] durable `docs/HUSTLEK-SESSION-HANDOFF.md`가 최종 recovery와 동기화됨
- [ ] 새 세션 첫 응답이 읽기 전용으로 끝나고 사용자 승인을 기다림
