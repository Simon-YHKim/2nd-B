# HustleK 803 composition contract

이 문서는 PIXEL-CLAY 원본 803개를 HustleK 네이티브 128px 합성 시스템으로 옮길 때의 단일 계약이다. 기존 `design/hustlek-assets-v1`의 평면화된 128px 마스터는 독립 에셋과 정체성 참조로 보존한다. 합성용 레이어나 장착 변형으로 확대·축소해서 재사용하지 않는다.

## Inventory

| 구분 | 수량 | 합성 처리 |
|---|---:|---|
| 아바타 | 270 | `base / hair / face / headwear / garment / extra` 레시피로 복원 |
| 아이콘 | 533 | 전부 standalone 보존, 명시적 허용 목록 267개만 attachment 후보 |
| 아이콘 alias | 51 | 별도 이미지를 만들지 않고 canonical 아이콘 재사용 |
| 직업 레시피 | 224 | 원본 232개 정의에 모두 존재, 미사용 기본 정의 8개는 예약 상태 |

생성된 전수 카탈로그는 `design/hustlek-composition-v1/catalog.json`이다. 아바타 270개와 아이콘 533개 각각에 기존 native128 atlas crop과 decoded RGBA hash가 연결되어 있다.

## Native-first rule

장착 아이콘은 독립 아이콘의 128px 마스터를 줄여 붙이지 않는다. 각 슬롯이 실제 차지할 픽셀 크기로 128×128 투명 캔버스에 새로 그린 attachment variant만 사용한다. 런타임 리사이즈와 제작 단계 리사이즈는 모두 금지한다.

이 규칙은 다음 두 결과를 분리한다.

- `standalone_native128`: 현재 완성된 독립 아이콘 또는 아바타 마스터
- `native128_variant`: 아바타 anchor에 맞춰 새로 제작할 합성 전용 투명 레이어

## Layer order

| z | 레이어 | 책임 |
|---:|---|---|
| 10 | `extra_back` | 가방처럼 몸 뒤에 오는 소품 |
| 20 | `hair_back` | 목·귀 뒤의 머리카락 |
| 30 | `base` | 피부, 머리, 귀, 기본 몸체 |
| 40 | `garment` | 몸통 의상 교체 영역 |
| 50 | `hair_front` | 이마와 얼굴 앞 머리카락 |
| 60 | `face` | 눈·코·입·수염·표정 |
| 70 | `headwear` | 모자·헬멧 |
| 75 | `extra_face_neck_badge` | 안경·마스크·목·가슴 장식 |
| 80 | `extra_hand` | 손에 든 도구와 grip mask |
| 90 | `extra_foreground` | 캐릭터 앞 대형 소품 |

대표 anchor는 `headwear`, `face`, `neck`, `chest`, `back`, 양쪽 wrist/hand, `feet`, `side_right`, `foreground`다. 좌표·fit box·z-index는 카탈로그 `contract.anchors`가 SoT다.

## Occlusion rules

- 의상은 torso garment mask만 교체하고 목과 머리를 지우지 않는다.
- 모자는 머리 위에 합성한다. 머리카락 삭제가 필요하면 별도 binary occlusion mask가 있는 픽셀만 지운다.
- 얼굴 장식은 기본적으로 덮어 그리며 암묵적으로 얼굴 alpha를 지우지 않는다.
- badge는 최종 garment alpha 안으로 clip한다.
- 손 도구는 몸 위에 그린 뒤 별도 grip mask로 손가락만 앞으로 복원한다.
- 뒤 소품과 전경 소품은 아바타 원본 alpha를 변경하지 않는다.

## Build and check

```powershell
python scripts/build-hustlek-composition-catalog.py
python scripts/build-hustlek-composition-catalog.py --check
npx jest scripts/__tests__/hustlek-composition-catalog.test.ts --runInBand
```

현재 카탈로그의 `pending_layers`와 `native128_variant.status=pending`은 의도된 상태다. 다음 제작 단계에서 대표 base·직업·동물과 accessory/badge/tool/prop 각각을 네이티브 128px로 파일럿 제작한 뒤, 같은 계약으로 전수 생성한다.
