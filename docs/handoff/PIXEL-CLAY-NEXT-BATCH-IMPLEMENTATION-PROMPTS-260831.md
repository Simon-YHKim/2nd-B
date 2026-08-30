# PIXEL-CLAY v4 next-batch implementation prompts

작성일: 2026-08-31  
대상 기준: `origin/main` `5b6bbe71ab1c723ff85d93268dfd0679e6085207`  
순서: `/account` -> `/manual` -> `/profile`

공통 완료 조건은 `PIXEL-CLAY-APP-IMPLEMENTATION-PROMPT-260831.md`를 따른다. 특히 한 화면/한 Draft PR, 실제 데이터와 실제 동작 우선, cosmic-pixel rollback 불변, Android HUMAN 판정 전 PASS 금지를 유지한다.

## 1. `/account`

```text
origin/main 5b6bbe71에서 새 저장소 내부 worktree/branch를 만들고 `/account` 한 화면만 PIXEL-CLAY v4로 이식하라. main 직접 작업 또는 push는 금지하고 Draft PR 하나만 만든다.

먼저 CLAUDE.md, docs/PIXEL-CLAY-MIGRATION.md, design/pixel_clay_v4/REPO-NOTES.md, ANDROID_QA_GUIDELINES.md를 읽는다. 레퍼런스는 design/pixel_clay_260825/captures/account.png와 pixel_clay_v4 앱의 AccountScreen이며 레이아웃만 참고한다.

실제 동작 계약:
- useAuth loading과 미로그인 Redirect를 deep-space 화면에도 복구한다.
- AccountLegacy에 남은 fetchBirthDate/updateBirthDate/canSubmitDobCorrection/AuthContext.refresh 생년월일 수정 경로를 실제 progressive disclosure로 노출한다.
- requestAccountExport/buildExportFilename의 웹 다운로드와 native Share 전체 계정 내보내기를 유지한다.
- 계정 삭제 cascade를 복제하지 않고 실제 단일 소유 화면 `/privacy`로 연결한다.
- `/profile`, `/change-password`, `/settings`, `/data`, `/iden`, `/beyond` 6개 실제 목적지를 유지한다.
- `{{who}}` 개인화를 유지한다.
- deferred `/widget`, StateRow, 고정 이름/이메일, 성공한 척하는 fixture를 만들지 않는다.

구현:
- 거대한 DeepSpaceDesignScreens.tsx를 확장하지 않는다. 새 src/screens/deepspace/dds-account-screen.tsx를 만들고 account.tsx의 deep 분기만 직접 위임한다.
- AccountLegacy와 기존 legacy styles는 시각·기능 모두 변경하지 않는다.
- PixelSurface, PixelPressable, PixelGlyph, 토큰만 사용한다. radius 0, 4방향 베벨, 정적 opacity/blur/곡선 easing/hex literal 금지, 모든 action 44dp 이상.
- 첫 화면은 SecondB head, 한 문장, 실제 계정 행만 둔다. DOB와 export는 한 번에 하나씩 펼치는 progressive disclosure로 제한한다.

테스트:
- auth loading/redirect
- 6개 실제 route
- DOB 성공/실패/refresh
- export 성공/실패와 web/native 분기
- `/widget`, StateRow, 고정 PII 부재
- legacy renderer/style 불변
- PIXEL-CLAY primitive, 44dp, Fabric guard
- targeted Jest, typecheck, lint, pixel rules, constraints, cycles, 전체 npm run verify

390x820 실제 캡처는 DOB/export/delete를 실행하지 않는 read-only QA로 만든다. Android HUMAN PASS는 사람이 판정하기 전까지 pending이다.
```

## 2. `/manual`

```text
origin/main 5b6bbe71에서 `/manual` 한 화면만 구현하는 독립 branch와 Draft PR을 만든다.

captures/manual.png는 레이아웃만 사용한다. 레퍼런스와 현재 canonGaps.manualConcepts의 생활영역 별 설명은 2026-08-24 이전 구조이므로 내용 정본으로 사용하지 않는다. 최신 내용 정본은 docs/PRD.md Draft v4와 src/lib/persona/seven-stars.ts다.

필수 계약:
- 공개 접근을 유지한다.
- 검색처럼 보이는 장식 View를 금지한다. 실제 로컬 TextInput 필터를 구현하거나 검색 UI를 제거한다.
- q1~q5를 모두 같은 `/support` 첫 화면으로 보내지 않는다. 각 질문에 실제 최신 답을 펼치거나 support가 소비하는 query/anchor를 구현한다.
- resetCoachmarks() 후 홈 이동과 `/secondb` 직접 질문을 유지한다.
- 핵심 개념을 최신 사실로 작성한다.
  1) 일곱 별은 프로필·영유아기·학창시절·20대·30대 이후·직장·지금이다.
  2) 밝기는 실제로 연 층이며 L5는 비준이다.
  3) 북극성은 입력에서 파생된 요약이다.
  4) 위키/기록이 원본이며 SecondB는 원문을 읽는다.
  5) 생활 여섯 영역은 별이 아니라 SecondB 대시보드다.
  6) 제안은 ratify 전까지 반영되지 않는다.
- 고정 StateRow와 fixture 상태를 금지한다.

구현:
- 새 dds-manual-screen.tsx로 분리하고 manual.tsx에서 직접 import한다. shared 대형 화면 파일을 확장하지 않는다.
- PixelSurface/PixelPressable, radius 0, 4방향 베벨, 토큰 색, 44dp를 지킨다.
- 한 번에 한 섹션만 펼쳐 정보 밀도를 제한한다.
- legacy 안내의 안전·프라이버시·내보내기 링크 중 최신 사실과 맞는 부분만 progressive disclosure로 살린다.
- KO/EN parity를 유지한다.

테스트:
- public route
- 실제 검색 필터 또는 검색 UI 부재
- 질문별 실제 답/목적지
- coachmark reset + home replace
- SecondB 이동
- 옛 생활영역 별 설명과 fake StateRow 부재
- i18n, pixel rules, constraints, cycles, 전체 verify

390x820 실제 캡처를 남기고 Android HUMAN 검토는 pending으로 둔다.
```

## 3. `/profile`

```text
origin/main 5b6bbe71에서 `/profile` 한 화면만 PIXEL-CLAY v4로 이식하는 독립 branch와 Draft PR을 만든다.

레퍼런스는 captures/profile.png와 pixel_clay_v4 앱의 ProfileHubScreen이다. 레이아웃만 참고하고 고정 이름, 고정 등급, StateRow 같은 fixture는 이식하지 않는다.

실제 동작 계약:
- useAuth loading/Redirect를 유지한다.
- Supabase users.display_name을 우선 표시한다. 실패하면 기존 local session email local-part, 마지막에는 번역 fallback을 쓴다.
- useProgression()의 실제 tier와 loading 상태를 유지한다.
- 최신 일곱 번째 프로필 별 진입점 `/profile-details`를 유지한다.
- `/core-brain`, `/insights`, `/brightness`, `/growth`, `/big-five`, `/ipip-neo`, `/rlss`, `/attachment`, `/seen`, `/esm`, `/interview`, `/audit` 실제 경로를 보존한다.
- `/persona`를 중복 Polaris 메뉴로 되살리지 않는다.
- `/audit`의 옛 ERAS reference 디자인을 가져오지 않는다.
- 한 탭만 펼치는 progressive disclosure를 유지한다.

구현:
- 현재 profile.tsx의 legacy와 deep-space가 공유하는 gameboy 스타일을 건드리지 않는다. 새 dds-profile-screen.tsx를 만들고 deep 분기만 위임한다.
- legacy rollback renderer/style은 그대로 둔다.
- PixelSurface/PixelPressable/PixelGlyph, radius 0, 4방향 베벨, 토큰 색만 사용한다.
- reference의 avatar/name, actual plan card, 2-tab 계층을 실제 데이터와 최신 route로 구성한다.
- 모든 행과 탭은 44dp 이상이며 한글 clipping을 피할 lineHeight/paddingBottom을 둔다.

테스트:
- auth loading/redirect
- 실제 display_name 우선 및 offline email fallback
- 실제 progression tier
- `/profile-details`와 전체 실제 route 집합
- 정적 이름/등급, StateRow, `/persona` 중복 항목 부재
- legacy branch 불변
- targeted Jest, typecheck, pixel rules, constraints, cycles, 전체 verify

QA 계정 read-only로 390x820 캡처를 만들고 Android HUMAN PASS는 사람이 확인하기 전까지 pending이다.
```

## Salvage registry 보정

- `account`: `adapt-reference`; 숨은 실제 기능 복구 필수
- `profile`: `adapt-reference`; 실제 데이터와 최신 route 우선
- `manual`: `redesign`; `referenceUse: layout-only`

`manual`을 단순 직접 이식 대상으로 취급하면 최신 제품 개념을 이전 구조로 되돌리므로, 코드 착수 전에 이 분류를 구현자와 리뷰어가 함께 확인한다.
