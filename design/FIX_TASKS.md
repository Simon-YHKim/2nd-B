# 2nd-Brain · 레거시 → 딥스페이스 수정 태스크 (Codex 앱 / PR 단위)

> 사용법: `design/` 폴더를 레포에 커밋한 상태에서, 아래 **TASK 본문 한 개**를
> Codex에 복붙 → PR 리뷰·머지 → 다음 TASK 복붙. 한 TASK = 한 PR. 순서대로.
>
> 배경: 셸(홈·도크)·인증·계정·그래프·연동은 이미 딥스페이스로 잘 됐다. 문제는
> **별·북극성·도크가 진입하는 "엔진 화면"이 아직 레거시(게임보이/마을)** 라는 것.
> 자세한 근거는 `design/DESIGN_AUDIT.md`.

---

## ⛔ 모든 TASK 공통 규칙 (복붙 시 항상 맨 위에 포함)

너는 RN(Expo) 앱 `2nd-B`의 시니어 개발자다. 이건 **신규 디자인이 아니라
"레거시 화면을 이미 존재하는 딥스페이스 패턴으로 교체"** 하는 작업이다.

**① 따라할 정답이 레포 안에 이미 있다 — 새로 발명하지 마라:**
- 시각 패턴의 기준 = `src/screens/deepspace/DeepSpaceDesignScreens.tsx` 와
  `src/screens/deepspace/ConstellationHome` (이미 머지된, 캐논에 맞는 화면).
  새 화면은 이 둘의 구조·import·토큰 사용법을 **그대로 복제**해서 만들어라.
- 콘텐츠(레이아웃·문구·상태)의 기준 = `design/*.dc.html`. 각 TASK가 어느
  파일인지 지정한다. **거기 없는 카피·섹션을 지어내지 마라.**

**② 레거시에서 절대 가져오지 마라 (어기면 PR 반려):**
아래 import/토큰이 새로 만드는 딥스페이스 화면에 하나라도 남으면 실패다.
- `@/lib/theme/gameboy-tokens` (게임보이 토큰)  ← 전면 금지
- `IslandArt`, `NavGraph`, `SecondBSprite`, `VillageScene` 등 마을 아트
- `PremiumAppShell` 등 레거시 셸 (딥스페이스는 `DeepSpaceScreen` 래퍼 사용)
- `cosmic.signalMint` 같은 **초록/민트를 보더·그림자·강조색**으로 쓰는 것
- `borderStartWidth`/`borderStartColor` (좌측 보더 액센트 트로프) — 금지
- hex 리터럴 색, 글래스모피즘(blur 카드), 필(pill) 칩, off-palette 그라데이션

**③ 쓸 것만 써라:**
- 토큰: `@/theme/tokens` 의 시안 토큰(기존 딥스페이스 화면과 동일 import 경로로
  통일). 색은 시안(#46B6FF)+보라(#C8B6FF) 중심, 민트(#5FF0C0)는 **TIP·긍정
  델타 전용**.
- 폰트: 본문 Pretendard / 제목·픽셀 Galmuri11 / 초소형 라벨 "Press Start 2P".
- 모든 화면 최상단에 `SecondbStatusHeader`(현황 + TIP). 문구는 해당 .dc.html
  헤더에서 가져와라.

**④ 작업 방식:** 한 PR = 한 TASK 범위. 빌드/타입체크 통과. 데이터는 .dc.html의
더미값으로 두고 실제 연결은 `// TODO`. `isDeepSpaceUI()` 분기가 필요하면
기존 화면과 동일한 패턴을 써라. 막히면 추측하지 말고 PR 설명에 질문으로.
**작업 끝에 "레거시 import 0개 확인"을 PR 설명에 체크로 남겨라.**

---

## 🔴 TASK 1 — 별 7개 목적지 재작성 (PR #1)
> 정본: `design/2nd-Brain 렌즈화면.dc.html`

위 공통 규칙 준수. 홈에서 별을 누르면 가는 7개 라우트를 딥스페이스로 재작성하라.
각 라우트 ↔ .dc.html 화면 매핑:
- `src/app/big-five.tsx`  ← "지금의 나"(Big Five 5축 바 + 신뢰도 L레벨 + 다시검사/이어가기 버튼)
- `src/app/interview.tsx` ← "회상"(시기별 바둑판 그리드 drill-down)
- `src/app/persona.tsx`   ← "보여지는 나"(자기인식 vs 타인평가 비교 바 + 설문지/공유)
- `src/app/esm.tsx`       ← "리듬"(시간대별 감정/에너지)
- `src/app/attachment.tsx`← "관계"(애착 4유형)
- `src/app/imagine.tsx`   ← "미래의 나"
- `src/app/audit.tsx`     ← "가치"(라이프 오딧)

각 파일에서 `gameboy-tokens`·`IslandArt`·`PremiumAppShell`·`signalMint`·
`borderStart*` 를 제거하고, `DeepSpaceDesignScreens.tsx` 구조를 복제해
`DeepSpaceScreen` + `SecondbStatusHeader` + `@/theme/tokens` 로 다시 만들어라.
빈/에러/채움 상태는 .dc.html 그대로.

---

## 🔴 TASK 2 — 북극성(소울코어) + 담기(캡처) (PR #2)
> 정본: `렌즈화면.dc.html`(소울코어) · `허브화면.dc.html`(담기)

- `src/app/core-brain.tsx` ← 북극성/소울코어: 보라 오브 + 북극성 문장 + 7별 종합 밝기.
- `src/app/capture.tsx` ← 담기: 5입력 모드 + 입력창 + 최근 기록. (현재 91KB 레거시 —
  레거시 마을 import 전부 제거하고 .dc.html 구조로 새로 작성. 큰 파일이니
  PR 설명에 "제거한 레거시 import 목록"을 명시.)

---

## 🟠 TASK 3 — 세컨비 / 기록 / 인사이트 (PR #3)
> 정본: `허브화면.dc.html` · `기타화면.dc.html`

- `src/app/secondb.tsx`(+`jarvis.tsx`) ← 세컨비 AI 채팅(근거 인용·후속 제안).
- `src/app/iden.tsx` ← IDEN 내보내기/뷰어.
- `src/app/records.tsx` `inbox.tsx` `research.tsx` `insights.tsx`
  `data.tsx` `formats.tsx` `import.tsx` ← 기록 보관소·인사이트 계열.

---

## 🟠 TASK 4 — off-palette·트로프 전수 제거 (PR #4)
레포 전체에서 딥스페이스 화면에 남은 캐논 위반을 일괄 제거하라:
- `signalMint`/초록을 보더·그림자·강조로 쓰는 곳 → 시안/보라로.
- `borderStart*`(좌측 보더 액센트) → 제거하거나 상단 보더/배경으로 대체.
- 글래스모피즘·필 칩·hex 리터럴 → 토큰으로.
변경 파일 목록과 before/after를 PR 설명에 표로.

---

## 🟡 TASK 5 — 주변부 + 토큰 통합 (PR #5)
- `profile` `settings` `theme` `plans` `permissions` `manual` `ops`
  `review` `onboarding` `complete-profile` 딥스페이스화(`기타화면`·`인증·설정화면` 정본).
- 스텁 라우트(`mbti` `journal` `discover`) 연결 또는 정리.
- **토큰 포크 제거**: `@/theme/tokens` 와 `@/lib/theme/tokens` 중 하나로 통일
  (기존 딥스페이스 화면이 쓰는 경로 기준). 모든 화면이 같은 토큰을 import하게.

---

## 검수 체크리스트 (각 PR 머지 전)
- [ ] 새 화면에 `gameboy-tokens`/`IslandArt`/`NavGraph`/`SecondBSprite`/`PremiumAppShell` import 0개
- [ ] 초록/민트가 보더·그림자·강조에 안 쓰임 (TIP·긍정 델타만 허용)
- [ ] `borderStart*` 좌측보더 트로프 없음
- [ ] 최상단 `SecondbStatusHeader` 존재, 문구는 .dc.html과 일치
- [ ] 배경 #070A13~#0B2142, 포인트 #46B6FF — 베이지/그린 없음
- [ ] 빌드/타입체크 통과
