# 2ndB Premium Reference Assetization Audit

> 작성: 2026-05-30 · 기준 브랜치 main `3c7e6a2` · 활성 에셋 팩 `public/assets/2ndb-closeout-v3`
> 목적: `premium_references/` 16장(10 core + 6 alt)을 최종 비주얼 기준으로 삼아, 현재 적용된 단순 placeholder 에셋을 식별하고 교체 목록을 작성한다.
> 원칙: 코드 대규모 수정 금지(보고서 우선). 단 명백한 버그성 항목은 즉시 수정 허용.

마크다운 테이블 없이 plain text list 로 작성한다.

---

## 0. 한눈 요약

- 현재 앱은 구조적으로는 완성도가 높다. `2ndb-closeout-v3` 한 팩으로 islands / workers / tier-icons / shards / auth 가 일관되게 정리돼 있고, 컴포넌트(`IslandArt`, `WorkerSprite`, `TierIcon`, `SecondBSprite`)가 PNG 를 깔끔히 require 한다.
- 그러나 비주얼 밀도/글로우/캐릭터 생동감이 premium reference 대비 큰 차이가 난다. 특히 (a) 메인 그래프 island, (b) SecondB / 동료 캐릭터, (c) 코어 오브의 시안 사각형 아티팩트 3가지가 즉각 눈에 띈다.
- **명백한 버그(P0)**: `core_center_premium_nosquare.png` 와 `auth_secondb_gate_hero_transparent.png` 두 PNG 에 밝은 시안색 사각형 프레임이 그대로 구워져 있다. 파일명에 `nosquare` / `transparent` 가 붙어 있는데도 실제로는 제거되지 않았다. 코드 wrapper 가 아니라 래스터에 박혀 있어 코드 한 줄 수정으로는 못 고친다 → 에셋 교체/재생성 필요.

---

## 1. 현재 사용 중인 ISLAND 에셋

소스 컴포넌트: `src/components/art/IslandArt.tsx` (단순 `<Image resizeMode="contain">`, 코드측 테두리/박스 없음)
사용 화면: `src/components/graph/NavGraph.tsx`, `src/components/premium/graph-bits.tsx`, `src/app/index.tsx` (메인 그래프)

- core (`graph/islands/core_center_premium_nosquare.png`, 480x412 RGBA)
  - 도메인: 중심(나의 중심 / Core Brain)
  - reference 비교 대상: 02_main_graph_premium, 04_core_brain_premium
  - 품질 차이: reference 의 코어는 빛나는 보라 크리스탈 오브 + 성운 글로우 + 살아있는 캐릭터. 현재는 어두운 아이소메트릭 큐브 + 단순 보라 컴퍼스 오브.
  - 검은/시안 사각형: 있음 — 오브 주위에 밝은 시안 사각형 프레임이 구워져 있음 (crop/selection 아티팩트). **P0 버그.**
  - 교체 필요: 예 (P0)

- work_growth (`graph/islands/domain_work_growth_fullpixel.png`, 480x370 RGBA)
  - 도메인: 일과 성장 / 워커 archi
  - reference: 02_main_graph_premium (좌상단 "일과 성장" island)
  - 품질 차이: reference island 는 나무·구조물·창문 불빛·밀도 높은 픽셀 디테일 + 글로우. 현재는 작은 집 2채 + 시안 외곽선 액자 1개가 있는 단순 큐브.
  - 검은/시안 사각형: 부분 — island 상단에 시안 외곽선 사각형(액자 형태) 아티팩트.
  - 교체 필요: 예 (P0/P1)

- relationship (`graph/islands/domain_relationship_fullpixel.png`)
  - 도메인: 관계와 사람 / 워커 gadi (accent #FF7A90)
  - reference: 02_main_graph_premium (우상단 "관계와 사람")
  - 품질 차이: 동일 — 단순 큐브 vs 밀도 높은 마을 island.
  - 교체 필요: 예 (P1)

- knowledge (`graph/islands/domain_knowledge_fullpixel.png`)
  - 도메인: 배움과 지식 / 워커 lulu (accent #72F2C7)
  - reference: 02_main_graph_premium (우측 "배움과 지식", 07_wiki_records 도서관 카드)
  - 교체 필요: 예 (P1)

- records (`graph/islands/domain_records_fullpixel.png`)
  - 도메인: 기록 보관소 / 워커 momo (accent #FFD166)
  - reference: 02_main_graph_premium (좌측 "기록 보관소")
  - 교체 필요: 예 (P1)

- imagine (`graph/islands/domain_imagine_fullpixel.png`)
  - 도메인: 공상/상상 / 워커 vela (accent #FF9FD6)
  - reference: 02_main_graph_premium (하단 "공상 놀이터"), 05_imagine_premium
  - 교체 필요: 예 (P1)

- inspiration (`graph/islands/domain_inspiration_fullpixel.png`)
  - 도메인: 영감 / 워커 lumi (accent #FFD166)
  - reference: 02_main_graph_premium (하단 "허망과 영감")
  - 교체 필요: 예 (P1)

판정: 6개 도메인 island 전부 동일한 "단순 아이소메트릭 큐브" 톤으로, reference 의 "코스믹 픽셀 그래프 마을" 밀도에 못 미친다. core 는 시안 사각형 때문에 P0, 나머지 6개는 P1 일괄 재생성 대상.

---

## 2. 현재 사용 중인 CHARACTER 에셋

소스 컴포넌트: `src/components/art/WorkerSprite.tsx` (idle + walk_strip_6f), `SecondBSprite.tsx`, `CompanionSprite.tsx`
사용 위치: `src/components/graph/CharacterPathLayer.tsx` (그래프 위 글로벌 클럭 커뮤트), SecondB FAB / 채팅

워커 7종 (각 `_idle.png` 96x96 + `_walk_strip_6f.png` 576x96 = 6프레임):

- secondb — AI 네비게이터. 사용: FAB, 채팅 헤더, auth hero, 그래프 커뮤트.
  - reference: 01_character_sheet_premium 의 SECOND B (보라 로봇 네비게이터, 음영·글로우 풍부)
  - 품질 차이: 큼. 현재 secondb_idle 은 96x96 의 단순 픽셀 로봇(어두운 몸통 + 보라 안테나 + 흰 점 눈). reference 의 캐릭터성·디테일 없음.
  - static icon vs 살아있는 캐릭터: static icon 에 가까움. walk strip 은 있으나 프레임 디테일이 얕음.
  - 교체 필요: 예 (P0~P1, 가장 노출 빈도 높은 캐릭터)

- archi (work_growth), gadi (relationship), lulu (knowledge), momo (records), vela (imagine), lumi (inspiration)
  - reference: 01_character_sheet_premium 의 6 동료(MOMO/LULU/ARCHI/VELA/GADI 각자 고유 디자인·역할·팔레트)
  - 품질 차이: 큼. 현재는 전부 secondb 와 비슷한 저밀도 96px 스프라이트로, reference 처럼 캐릭터별 개성(모자/장비/표정)이 살아있지 않음.
  - static vs 살아있음: 6프레임 walk 가 있어 약간의 생동감은 있으나 idle 디테일이 얕다.
  - 교체 필요: 예 (P1)
  - 참고: reference 캐릭터 시트는 6종이지만 현재 워커는 7종(lumi 추가). lumi 는 reference 시트에 대응 캐릭터가 없음 → 신규 디자인 또는 도메인 매핑 재검토 필요.

---

## 3. 현재 TIER 3 / TIER 4 NODE ICON

소스 컴포넌트: `src/components/art/TierIcon.tsx`
매핑: `public/assets/2ndb-closeout-v3/domain_worker_shard_mapping_v3.json`

좋은 소식: generic robot-face glyph 는 더 이상 노드 아이콘으로 쓰이지 않는다. 이미 조각 아이콘 세트로 교체돼 있다.

- 보유 아이콘(11): paper_journal, book_wiki, link_capture, file_source, cube_data, crystal_imagine, seed_growth, heart_relationship, compass_inspiration, spark_recent (+ shard_* 변형 5)
- robot glyph 사용: 없음 (audit order 의 우려 항목은 이미 해소됨)
- 조각 아이콘(paper/book/link/file/crystal/cube) 교체 여부: 이미 적용됨
- tag/source/recency 색상 매핑 가능 여부: 가능. mapping_v3.json 이 도메인별 accent(#4CC9F0/#FF7A90/#72F2C7/#FFD166/#FF9FD6) + tierIcons 배열을 이미 정의. recency 는 spark_recent 로 표현 중.
- 품질: 64x64 픽셀 아이콘은 reference 톤과 대체로 일치하나, reference(07_wiki 주요 지식 카드)의 글로우/입체감 대비 평면적. tile 배경(둥근 사각형 보라 그라데이션)이 구워져 있어 패널 위에서 이중 카드처럼 보일 수 있음 → CSS/표시 방식 점검 권장.

판정: 교체 우선순위 낮음(P2). 색상 매핑은 코드로 해결 가능. tile 배경 이중카드 문제만 CSS 로 정리.

---

## 4. UI PANEL / CARD / BOTTOM SHEET 비교

각 항목을 [CSS 로 해결] / [에셋 교체 필요] / [컴포넌트 구조 수정] 으로 분류한다.

- bottom sheet (노드 상세 / Core Brain 카드)
  - reference: 02/04/07 의 하단 글래스 패널(반투명 + 보라 글로우 + 읽기 좋은 한글).
  - [CSS 로 해결]: 글래스 배경, 보더 글로우, 패널 depth(그림자/내부 하이라이트), Pretendard readable 타이포. 대부분 토큰/CSS 로 가능.
  - [컴포넌트 구조 수정]: 통계 칩 행(아이콘+숫자) 레이아웃 정렬.

- auth screen
  - reference: 직접 reference 없음(가장 가까운 톤은 08_onboarding hero).
  - [에셋 교체 필요]: auth hero PNG 의 시안 사각형 아티팩트 제거 + SecondB 캐릭터 premium 교체. **P0.**
  - [CSS 로 해결]: hero 뒤 성운 글로우, 안전영역, eye 아이콘(이미 적용).

- chat bubble (SecondB 채팅)
  - reference: 03_chat_premium (좌측 캐릭터 아바타 + 말풍선 + 참고한 조각 칩 + 제안 칩).
  - [CSS 로 해결]: 말풍선 라운드/보더/배경, 제안 칩, "참고한 조각" 섹션.
  - [에셋 교체 필요]: 채팅 아바타용 SecondB premium 스프라이트(2번 항목과 공유).

- core brain card
  - reference: 04_core_brain_premium (중앙 크리스탈 오브 + 성운 + 글래스 스탯 카드).
  - [에셋 교체 필요]: 코어 오브 아트(시안 사각형 제거판). **P0.**
  - [CSS 로 해결]: 스탯 카드 글래스, 글로우.

- imagine result card
  - reference: 05_imagine_premium (장면/사물/등장 캐릭터 카드 그리드 + 보라/핑크 글로우).
  - [CSS 로 해결]: 결과 카드 그리드, 글래스, 글로우.
  - [에셋 교체 필요]: 카드 썸네일 픽셀 일러(선택). P2.

- journal / capture input
  - reference: 06_journal_capture_premium (조각 입력 진입점, 골드 shard 톤).
  - [CSS 로 해결]: 입력 필드, shard 진입 버튼.
  - [에셋 교체 필요]: shard 진입 아이콘은 기존 shard_*.png 재사용 가능. P2.

- wiki record card
  - reference: 07_wiki_records_premium (주요 지식 카드 3종 + 글로우 썸네일).
  - [CSS 로 해결]: 카드 레이아웃, 필터 칩.
  - [에셋 교체 필요]: 카드 썸네일(Core Brain/도서관/공상) premium 일러. P1~P2.

- assessment question card
  - reference: 직접 reference 없음(part4 는 지시문 위주).
  - [CSS 로 해결]: 문항 카드, 진행바, 선택지. 전부 CSS.
  - [에셋 교체 필요]: 없음. P2.

---

## 5. 교체 우선순위 (P0 / P1 / P2)

P0 — 지금 화면에서 눈에 띄게 품질을 떨어뜨림:
- core 오브 시안 사각형 아티팩트 (core island + auth hero 두 PNG)
- 메인 그래프 core island 가 reference 대비 과도하게 단순
- (audit order 의 "generic robot glyph as data/persona node" 는 이미 해소됨 → P0 에서 제외)

P1 — 핵심 경험 화면에서 reference 와 큰 차이:
- SecondB 캐릭터 스프라이트 품질(노출 1순위)
- 6개 도메인 island 밀도/글로우
- 동료 캐릭터 6종 개성/품질
- bottom sheet 타이포·패널 depth (대부분 CSS)
- 워커 커뮤트 모션 풍부함

P2 — 나중에 polish:
- assessment 화면
- settings/profile 미세 polish
- 아이콘 세트 일관성 / tier-icon tile 이중카드 정리
- imagine/wiki 카드 썸네일 일러

---

## 6. 필요한 새 PRODUCTION ASSET 목록

assetKey: core_center_premium_clean
description: 나의 중심 코어 섬, 빛나는 보라 크리스탈 오브 + 성운 글로우, 시안 사각형 프레임 없음, 텍스트 없음
targetReference: 04_core_brain_premium.png, 02_main_graph_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 중심 노드(IslandArt id=core), auth hero 합성
replaces: core_center_premium_nosquare.png (시안 사각형 버그)
priority: P0

assetKey: auth_secondb_gate_hero_clean
description: auth 화면 hero, premium SecondB + 코어 오브, 시안 사각형 없음, 투명 배경
targetReference: 08_onboarding_premium.png, 04_core_brain_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 768x360
usedIn: src/app/(auth)/sign-in.tsx authHero
replaces: auth_secondb_gate_hero_transparent.png (시안 사각형 버그)
priority: P0

assetKey: domain_work_growth_premium
description: 일과 성장 floating pixel island, 나무/구조물/창문불빛 밀도, premium lighting, 텍스트 없음
targetReference: 02_main_graph_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (work_growth)
replaces: domain_work_growth_fullpixel.png
priority: P1

assetKey: domain_relationship_premium
description: 관계와 사람 island, 따뜻한 로즈 accent(#FF7A90) glow
targetReference: 02_main_graph_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (relationship)
replaces: domain_relationship_fullpixel.png
priority: P1

assetKey: domain_knowledge_premium
description: 배움과 지식 island, 민트 accent(#72F2C7), 도서관 톤
targetReference: 02_main_graph_premium.png, 07_wiki_records_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (knowledge)
replaces: domain_knowledge_fullpixel.png
priority: P1

assetKey: domain_records_premium
description: 기록 보관소 island, 골드 accent(#FFD166)
targetReference: 02_main_graph_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (records)
replaces: domain_records_fullpixel.png
priority: P1

assetKey: domain_imagine_premium
description: 공상 놀이터 island, 드림핑크 accent(#FF9FD6)
targetReference: 02_main_graph_premium.png, 05_imagine_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (imagine)
replaces: domain_imagine_fullpixel.png
priority: P1

assetKey: domain_inspiration_premium
description: 영감 island, 램프 골드 accent(#FFD166)
targetReference: 02_main_graph_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 512x512
usedIn: Main Graph 도메인 island (inspiration)
replaces: domain_inspiration_fullpixel.png
priority: P1

assetKey: secondb_premium_idle + secondb_premium_walk_strip_6f
description: SecondB 보라 로봇 네비게이터, 캐릭터성·음영·글로우 강화, idle 1프레임 + walk 6프레임
targetReference: 01_character_sheet_premium.png (SECOND B)
requiredFormat: transparent PNG (idle 128x128, strip 768x128)
transparentBackground: yes
recommendedSize: idle 128x128, walk strip 768x128
usedIn: WorkerSprite/SecondBSprite — FAB, 채팅, 그래프 커뮤트, auth
replaces: secondb_idle.png, secondb_walk_strip_6f.png
priority: P1

assetKey: companions_premium_set (archi, gadi, lulu, momo, vela, lumi)
description: 도메인 동료 6종, 각자 고유 디자인/팔레트, idle + walk 6프레임
targetReference: 01_character_sheet_premium.png (MOMO/LULU/ARCHI/VELA/GADI), lumi 는 신규 디자인
requiredFormat: transparent PNG (idle 128x128, strip 768x128)
transparentBackground: yes
recommendedSize: idle 128x128, walk strip 768x128
usedIn: WorkerSprite — CharacterPathLayer 커뮤트
replaces: archi/gadi/lulu/momo/vela/lumi _idle + _walk_strip_6f
priority: P1

assetKey: wiki_card_thumbs_premium (core_brain, library, imagine)
description: Wiki 주요 지식 카드 썸네일 픽셀 일러 3종
targetReference: 07_wiki_records_premium.png
requiredFormat: transparent PNG
transparentBackground: yes
recommendedSize: 256x256
usedIn: src/app/wiki.tsx 주요 지식 카드
replaces: (현재 placeholder/없음)
priority: P2

---

## 7. 최종 제안

선택지:
A. 현재 asset 유지 + CSS 만 polish
B. 핵심 asset 만 premium replacement
C. premium reference 기준 main graph/character 전면 재생성

추천: **B (핵심 asset 만 premium replacement) + 일부 CSS polish.**

근거:
- 솔로 빌더 + XPRIZE 마감(2026-08-17) 상황에서 C(전면 재생성)는 비용·리스크가 크다. 구조(NavGraph/world-layout/zoom-math)는 이미 테스트로 안정적이라 갈아엎을 이유가 없다.
- 체감 품질을 가장 크게 끌어올리는 건 (1) core 오브 시안 사각형 제거 [P0], (2) 메인 그래프 6 island premium 재생성 [P1], (3) SecondB + 동료 캐릭터 premium 교체 [P1] — 즉 "핵심 asset"에 집중하면 reference 수준에 근접한다.
- bottom sheet / chat / core-brain 카드 / imagine 결과 / assessment 는 asset 신규 없이 CSS+토큰 polish 로 대부분 reference 톤에 도달 가능 → A 의 장점(저비용)을 흡수.
- A 단독은 island/캐릭터 격차를 못 메우고, C 는 과투자. 따라서 B 가 현실적 최적.

권장 실행 순서:
1. P0 즉시: core 오브 + auth hero 의 시안 사각형 제거판 에셋 2개 교체(재생성). 코드는 require 경로만 교체.
2. P1: 6 도메인 island premium 재생성 → IslandArt 매핑 교체.
3. P1: SecondB premium 스프라이트(idle+walk) 교체 → WorkerSprite/SecondBSprite.
4. P1: 동료 6종 premium 스프라이트 교체. lumi 도메인 매핑 확정.
5. P1(CSS): bottom sheet / chat / core-brain 글래스 패널 depth·타이포 polish.
6. P2: wiki/imagine 카드 썸네일, assessment·settings 미세 polish, tier-icon tile 이중카드 정리.

각 단계는 별도 브랜치 → draft PR → CI(verify) 그린 → squash 머지. 에셋 교체는 require 경로 1:1 치환이라 로직 테스트 영향 없음(C1~C12 / lexicon 무관).

---

## 8. PLAIN-TEXT HANDOFF (다른 LLM 공유용)

CURRENT STATE
- 활성 에셋 팩은 public/assets/2ndb-closeout-v3 하나로 통합돼 있고, 구조/컴포넌트(IslandArt, WorkerSprite, TierIcon, SecondBSprite, CompanionSprite)는 안정적이다.
- main HEAD 3c7e6a2, npm run verify green (jest 627/627), working tree clean.
- 6 도메인 island + 1 core, 워커 7종(idle+walk6f), tier-icon 11종, shard 5종, auth hero + loading orb 보유.

WHAT IS ALREADY GOOD
- 구조 일관성: 한 팩으로 정리, 도메인-워커-accent-tierIcon 매핑(domain_worker_shard_mapping_v3.json) 명확.
- tier 3/4 노드 아이콘은 generic robot glyph 가 아니라 paper/book/link/file/cube/crystal/seed/heart/compass/spark 조각 아이콘으로 이미 교체됨.
- 도메인 accent 색상 매핑(#4CC9F0/#FF7A90/#72F2C7/#FFD166/#FF9FD6) 이미 존재.
- 코드 측 island 렌더는 단순 Image contain 으로 깔끔(테두리/박스 없음).

WHAT IS STILL PLACEHOLDER
- core 오브와 auth hero PNG 에 밝은 시안 사각형 프레임이 구워져 있음(파일명 nosquare/transparent 인데 실제 미제거). 명백한 버그.
- 6 도메인 island 가 단순 아이소메트릭 큐브 수준으로, reference 의 코스믹 픽셀 마을 밀도/글로우에 못 미침.
- SecondB 및 동료 6종 캐릭터가 96px 저밀도 스프라이트로 static icon 에 가깝다. reference 캐릭터 시트의 개성·음영·생동감 부족.

WHAT NEEDS NEW PRODUCTION ASSETS
- core 오브(시안 사각형 제거판), auth hero(시안 사각형 제거판) — P0.
- 6 도메인 island premium 재생성 — P1.
- SecondB premium 스프라이트(idle+walk6f), 동료 6종 premium 스프라이트 — P1.
- (선택) wiki/imagine 카드 썸네일 일러 — P2.

EXACT ASSET LIST NEEDED
- core_center_premium_clean.png (512x512, transparent) replaces core_center_premium_nosquare.png [P0]
- auth_secondb_gate_hero_clean.png (768x360, transparent) replaces auth_secondb_gate_hero_transparent.png [P0]
- domain_work_growth_premium.png / domain_relationship_premium.png / domain_knowledge_premium.png / domain_records_premium.png / domain_imagine_premium.png / domain_inspiration_premium.png (각 512x512, transparent) [P1]
- secondb_premium_idle.png (128x128) + secondb_premium_walk_strip_6f.png (768x128) [P1]
- archi/gadi/lulu/momo/vela/lumi premium idle(128x128) + walk_strip_6f(768x128) [P1]
- wiki_card_thumbs_premium core_brain/library/imagine (각 256x256) [P2]

COMPONENTS AFFECTED
- src/components/art/IslandArt.tsx (island require 경로)
- src/components/art/WorkerSprite.tsx (worker idle/walk require 경로)
- src/components/art/SecondBSprite.tsx, CompanionSprite.tsx (SecondB/동료)
- src/components/art/TierIcon.tsx (tile 이중카드 CSS 정리만)
- src/app/(auth)/sign-in.tsx (authHero require 경로)
- src/components/graph/NavGraph.tsx, CharacterPathLayer.tsx, premium/graph-bits.tsx (소비처, 로직 변경 없음)
- public/assets/2ndb-closeout-v3/domain_worker_shard_mapping_v3.json (lumi 매핑 확정 시)

RECOMMENDED NEXT IMPLEMENTATION ORDER
1. P0 core 오브 + auth hero 시안 사각형 제거판 교체(require 경로 1:1).
2. P1 6 도메인 island premium 교체.
3. P1 SecondB premium 스프라이트 교체.
4. P1 동료 6종 premium 스프라이트 교체 + lumi 매핑 확정.
5. P1 CSS: bottom sheet / chat / core-brain 글래스 패널 depth·타이포 polish.
6. P2 wiki/imagine 썸네일, assessment/settings polish, tier-icon tile 정리.
- 각 단계 별도 브랜치 -> draft PR -> npm run verify green -> squash merge. 에셋 교체는 로직 테스트 영향 없음.

RECOMMENDED OVERALL DIRECTION
- Option B: 핵심 asset 만 premium replacement + 일부 CSS polish. 구조 재작성(Option C)은 마감 대비 과투자, CSS 단독(Option A)은 island/캐릭터 격차 미해결.
