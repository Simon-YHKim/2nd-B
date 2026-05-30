# 2ndB 진행 현황 인계 (메인 그래프 UX 오버홀) — 2026-05-30

당신은 2ndB(React Native + Expo, TypeScript strict, Supabase, Gemini) 앱을 이어서 구현하는 코딩 LLM입니다. 아래는 직전 세션까지의 진행 현황과 방금 머지된 변경입니다. 이 맥락 위에서 이어서 작업하세요.

## 0. 제품 한 줄 요약
"AI 시대 가장 가치 있는 자산 = 나 자신"을 데이터로 축적하는 개인 비서. 메인 화면은 Cosmic Pixel Graph Village(밤빛 조각마을): 중심(나의 중심) + 6개 도메인 섬 + 하위 조각. SecondB(세컨비)가 AI 안내자.

## 1. 절대 깨면 안 되는 제약
- 모든 LLM 호출은 src/lib/llm/gemini.ts 경유. classifyInput() 안전분류가 LLM 호출 전 실행(C9).
- ai_audit_log INSERT(C3), 18세 이상 가입(C10), i18n EN↔KO 키 패리티(C7).
- 임상 용어 금지(정신건강/심리치료/치유/therapy/diagnosis/treatment 등). 단어 단위 CI 스캔이 막음.
- 기술 용어(RAG/vector/embedding/classifier) 사용자 UI 노출 금지.
- 메인 그래프는 라이트 모드에서도 항상 어두움(제약 #4).
- 검증: `npm run verify` (lint+type+i18n+lexicon+LLM boundary+C1~C12+jest). 푸시 전 필수.
- PR은 항상 draft로 생성, CI(verify+lint) 그린 확인 후 squash 머지. main 직접 푸시 금지.

## 2. 아키텍처 핵심 파일
- 메인 그래프: src/components/graph/NavGraph.tsx (제스처/렌더/노드 시트)
- 레이아웃 수학(순수, 테스트됨): src/components/graph/world-layout.ts (1200x1600 월드 + fit + 섹터)
- 줌 가시성: src/components/graph/tier-visibility.ts
- 워커 캐릭터: src/components/graph/CharacterPathLayer.tsx
- 프리미엄 컴포넌트 라이브러리: src/components/premium/ (PremiumAppShell, CosmicBackground, PremiumTopBar/Card/Button/CTA, BottomSheet, ReferenceShardCard, GraphNodeChip, StatTile, ContextPill, PremiumTabBar)
- 테마: src/lib/theme/tokens.ts (cosmic 팔레트 + semantic/semanticLight), ThemeContext.tsx (ForceDark 포함)
- 폰트: 전역 NeoDunggeunmo(둥근모꼴) 픽셀폰트, src/theme/typography.ts
- 외부 자료 수입: src/lib/wiki/import-external.ts + src/app/import.tsx

## 3. 그래프 구조(현재 상태)
- Tier 1: core(나의 중심) — 중심 섬. route /core-brain.
- Tier 2: 6개 도메인 섬 — work(일과 성장,/trinity), relation(관계와 사람,/interview), knowledge(배움과 지식,/wiki), records(기록 보관소,/records), imagine(공상 작업실,/imagine), taste(취향과 영감,/insights).
- Tier 3: 도메인 하위(일상/전문 지식, 유년기~30대) — 줌인/선택 시에만.
- Tier 4: 실제 데이터 조각(wiki_pages) — 더 줌인 시.
- 섹터: 원을 6등분(60도)하고, 각 도메인의 하위 티어/조각은 자기 섹터 안에만 배치(이웃 침범 없음). 데이터 늘면 부채꼴이 넓어짐.
- 기본 줌(scale=1)은 Tier 1+2만 보임. scaleBucket: <1.15=far(1+2), <1.8=mid(+3), >=1.8=close(+4).

## 4. 방금 머지된 변경 (PR #58, main 5910775)
1. 부유 캐릭터가 팝업 위에 뜨던 레이어 버그 → 캐릭터를 줌 트랜스폼 안으로 이동(시트/FAB 아래).
2. 1손가락 팬 가능(minDistance 8, 노드 탭 유지) + 팬/더블탭에 스프링·관성. 마을과 매칭된 워커 캐릭터가 중심↔마을 도로를 걸어다님(momo=기록, lulu=지식, archi=관계, vela=공상, gadi=일과성장, secondb=중심 주변).
3. 화면 전환/로딩에 브랜드 InlineLoader(코스믹 오브+민트 스피너) 적용.
4. 라이트 모드 글자가 어두운 배경에 묻히던 문제 → PremiumAppShell이 children을 ForceDark로 감싸 항상 다크 팔레트 사용.
5. world-layout 6등분 섹터 + 하위 노드 섹터 내부 고정(테스트 포함).
6. 마을 탭 → 해당 섹터가 화면에 꽉 차게 스프링 줌(sectorFocus + focusWorldPoint) 후 시트 오픈.
7. 뒤로가기 버튼이 텍스트/아이콘과 겹치던 문제 → 탭바 라우트에선 숨김 + 유리 원형 배경.

## 5. 직전까지 누적된 주요 변경 (참고)
- 핸드오프 큐 A~E(월드좌표 그래프, records 브라우저+highlight, persona 5필드, walker 모션, companion 트리거).
- A-to-Z 구조 플레이스홀더(/profile /theme /data /support, records/record 상세).
- 프리미엄 비주얼 패스(컴포넌트 라이브러리, 코어브레인/챗, 전 화면 cosmic 셸, 하단 탭바, 플로팅 섬 PNG, 저널/캡처 저장 카드).
- 무한로딩 수정(auth probe 8s 타임아웃 + 세션당 1회 인트로 + 실제 !loading 게이트 + auto-continue), 첫글 팝업 닫기, auth/loading cosmic 배경.
- NeoDunggeunmo 폰트 전역.

## 6. 검증/배포
- `npm run verify` 현재 그린: jest 622/622 (64 suites).
- main push 시 GitHub Pages 자동 배포(~2-3분). Live: https://simon-yhkim.github.io/2nd-B/

## 7. 남은 작업(다음 후보)
- C5: 페르소나 "집" 노드 전용 아트 + 데이터 계약(프리미엄 에셋 대기 중이었음).
- Wiki 딥 리스타일(지식 창고 스토리지 카드), 평가 화면(big-five/mbti/attachment/audit/interview) 프리미엄 questionnaire 컴포넌트.
- 비-탭 설정 하위 화면 상단 헤더의 back arrow 좌측 들여쓰기(시각 충돌 최종 정리).
- 실제 Gemini 라이브 연결(현재 기본 mock; GOOGLE_API_KEY repo Variable + EXPO_PUBLIC_LLM_MODE=live, XPRIZE는 Vertex 권장).

## 8. 작업 규칙
- 새 작업은 항상 fresh main에서 새 브랜치. 푸시 후 draft PR 생성, CI 그린 확인 후 머지.
- 순수 로직은 별도 모듈 + jest 테스트(이 레포의 관용). UI는 컴포넌트 얇게.
- 강제 푸시/main 직접 푸시/`.env` 커밋 금지.
