# HustleK composition contract — v1 legacy / v2 logical32

이 문서는 기존 PIXEL-CLAY 원본 803개의 v1 네이티브 128px 합성 상태와, 앞으로 제작할 v2 logical32 합성 규칙을 함께 기록한다. 기존 `design/hustlek-assets-v1`과 `design/hustlek-composition-v1`의 평면화된 128px 결과는 read-only legacy와 정체성 reference로 보존한다. 새 logical32 결과로 자동 변환·승인하거나 조용히 덮어쓰지 않는다.

## Future authoring contract — logical32

- 모든 새 아바타·아이콘·attachment·합성 layer는 32×32 논리 좌표에서 직접 설계한다.
- ImageGen review carrier는 대응 identity reference의 물리 canvas와 aspect ratio를 그대로 유지하며 canonical이 아니다.
- 현재 런타임의 128×128 호환 파일이 필요하면 logical32를 `NEAREST` 4×로 출력한다. 각 논리 픽셀은 정확히 같은 RGBA의 4×4 블록이어야 한다.
- opening의 96×96 캐릭터 셀은 logical32의 3× envelope로 취급한다. 기존 승인 opening atlas와 hash는 변경하지 않는다.
- v2 anchor, fit box, occlusion mask는 logical32 좌표로 새로 정의하고, 128px export에서는 모든 좌표를 정확히 4배한다.
- 기존 v1 anchor에는 4의 배수가 아닌 좌표가 있으므로 4로 나누거나 반올림해 v2로 자동 이관하지 않는다.
- 64·96·128px는 별도 디자인 tier가 아니라 2×·3×·4× 호환 출력이다. 비정수 48px는 새 기본 출력에서 제외한다.
- v2 builder와 catalog schema가 준비되기 전에는 review-only 제작까지 허용하고 production publish는 금지한다.

아래 Inventory, atlas, runtime 사용법은 현재 보존 중인 **v1 legacy의 실측 상태**다. 새 제작의 authoring 기준으로 사용하지 않는다.

## Inventory

| 구분 | 수량 | 합성 처리 |
|---|---:|---|
| 아바타 | 270 | `base / hair / face / headwear / garment / extra` 네이티브 레이어 완성 |
| 아이콘 | 533 | 전부 standalone 보존, 267개 attachment variant 완성 |
| 아이콘 alias | 51 | 별도 이미지를 만들지 않고 canonical 아이콘 재사용 |
| 직업 레시피 | 224 | 원본 232개 정의에 모두 존재, 미사용 기본 정의 8개는 예약 상태 |

생성된 전수 카탈로그는 `design/hustlek-composition-v1/catalog.json`이다. 아바타 270개와 아이콘 533개 각각에 기존 native128 atlas crop과 decoded RGBA hash가 연결되어 있다.

## Legacy v1 native128 rule

장착 아이콘은 최종 점유 크기로 배치된 128×128 투명 variant만 렌더링한다. 승인된 ImageGen 파일럿 4개는 그대로 보존하고, 나머지 263개는 사용자가 승인한 방식에 따라 standalone 128px master의 tight bbox를 슬롯 fit box에 NEAREST로 투영했다. 런타임 asset-to-asset 리사이즈는 금지한다.

이 규칙은 다음 두 결과를 분리한다.

- `standalone_native128`: 현재 완성된 독립 아이콘 또는 아바타 마스터
- `native128_variant`: 아바타 anchor에 맞춰 완성된 합성 전용 투명 레이어

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

다음 명령은 기존 v1 산출물의 무결성 검사 전용이다. 새 logical32 batch를 만들거나 publish하는 데 사용하지 않는다.

```powershell
python scripts/build-hustlek-composition-catalog.py
python scripts/build-hustlek-composition-catalog.py --check
python scripts/build-hustlek-avatar-layer-pilot.py --check
python scripts/build-hustlek-icon-attachment-variants.py --check
python scripts/build-hustlek-runtime-avatar-atlases.py --check
python scripts/build-hustlek-composition-preview.py --check
python scripts/build-hustlek-avatar-maker.py --check
npx jest scripts/__tests__/hustlek-composition-catalog.test.ts --runInBand
```

## Runtime usage

`Avatar64`의 기존 절차형 렌더링은 기본값으로 유지된다. 네이티브 합성은 `nativeComposition`을 명시한 경우에만 활성화된다.

```tsx
<Avatar64
  spec={fallbackSpec}
  size={128}
  nativeComposition={{
    avatarAssetId: "avatars/presets/plain",
    roleAssetId: "avatars/food/chef",
    attachmentAssetIds: ["icons/idBadge", "icons/wrench"],
  }}
/>
```

- `avatarAssetId`는 정체성을 결정하는 `base + face`를 공급한다.
- `roleAssetId`는 교체 가능한 `garment + hair + headwear + extra`를 공급한다.
- `attachmentAssetIds`는 catalog의 `z`, `slot`, anchor 계약에 따라 합성된다.
- 270개 아바타는 7개의 1,920×2,048 runtime atlas로 나눴다. 한 합성은 최대 두 avatar atlas와 선택적인 attachment atlas만 참조해 Android에서 34,560px 원본 atlas 전체를 로드하지 않는다.

## Completed outputs

| 산출물 | 상태 |
|---|---|
| `avatar-layers-atlas.png` | 270개 × 6레이어, 원본 master와 전수 무손실 재합성 |
| `icon-attachments-atlas.png` | 267개 attachment, binary alpha, 런타임 scaling 없음 |
| `runtime/avatar-runtime-00.png` ~ `06.png` | RN용 7개 분할 atlas, production layer hash와 일치 |
| `hustlek-runtime-manifest.ts` | 270 avatar ID와 267 attachment ID의 정적 require/crop/z/slot |
| `composition-preview.png` | identity·role·attachment 대표 조합 8개 검토 시트 |
| `avatar-maker.html` | 실제 runtime atlas를 직접 표시하는 정체성·스타일·소품 선택형 검수 화면 |

아이콘 266개는 캐릭터에 억지로 장착하지 않고 standalone 전용으로 남긴다. 따라서 “803개 전체 합성 카탈로그”는 270개 합성형 아바타, 267개 장착형 아이콘, 266개 standalone 아이콘으로 구성된다.
