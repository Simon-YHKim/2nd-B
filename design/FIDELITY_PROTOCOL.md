# 화면을 "정확히" 구현시키는 법 — Claude Code 충실도 프로토콜

> 문제: Claude Code가 .dc.html 정본을 받고도 "대충 비슷하게" 만들고 레거시로 샌다.
> 원인: 정본을 **읽고 눈대중**하기 때문. 해결: ① 값을 **추출**하게 하고 ② 자기 결과를
> **레퍼런스와 대조**하는 루프를 강제한다. 아래를 화면 구현 태스크에 항상 덧붙여라.

---

## 복붙용 — 화면 구현 시 항상 첨부

첨부한 `<파일>.dc.html` 이 이 화면의 **픽셀 정본**이다. "비슷하게"가 아니라 **정확히**
옮긴다. 아래 충실도 프로토콜을 지켜라.

### 1. 눈대중 금지 — 값을 추출하라
.dc.html 은 인라인 스타일에 **정확한 수치**가 다 박혀 있다. 화면을 보고 짐작하지 말고,
각 요소의 실제 값을 그대로 읽어 옮겨라:
- 색 → 해당 hex 를 찾아 **토큰으로 매핑**(아래 표). 새 색 만들지 마라.
- 간격/크기 → `padding`·`gap`·`font-size`·`border-radius`·`width`/`height` 의 px 를 그대로.
- 레이아웃 → `display:flex`/`grid`, `flex-direction`, `align-items`, `justify-content` 구조 그대로.
- 텍스트 → 카피 한 글자도 바꾸지 마라(EN/KO 표가 있으면 그 키로).
- 위계 → `font-family`(Galmuri11=제목/픽셀, Pretendard=본문, Press Start 2P=라벨), 굵기, opacity.

### 2. hex → 토큰 매핑 (이 표로만 변환, 하드코딩 hex 0)
| .dc.html 리터럴 | deepSpace 토큰 | 용도 |
|---|---|---|
| #0A0E1A / #070A13 | deepSpace.bg | 배경(가장 깊음) |
| #0B2142 / rgba(26,72,120,…) | deepSpace.bgMid / glow | 상단 광원 |
| #46B6FF | deepSpace.cyan | 1차 액센트·링크 |
| #5FD4FF / #9FE4FF | deepSpace.cyanBright / cyanSoft | 강조 텍스트·별 |
| #7FC9F0 | deepSpace.cyanDim | 후퇴 요소 |
| #E8F7FF / #CCFAFF | deepSpace.textHi / textTitle | 본문 강조·제목 |
| rgba(159,228,255,…) | deepSpace.textMid/Lo | 본문·메타 |
| #C8B6FF / #8B7BD8 | deepSpace.soul | 북극성·AI·소울 |
| #5FF0C0 | deepSpace.mint | 1차 액션·긍정·활성 |
| rgba(70,182,255,.06/.22) | deepSpace.cardBg / border | 카드 면·테두리 |
> 표에 없는 색(예: 초록 #72F…, 베이지)이 .dc.html 에 보이면 그건 레거시 오염이니 가져오지 마라.

### 3. 자기 대조 루프 (이게 핵심 — 건너뛰지 마라)
화면을 만든 직후 **끝났다고 하지 말고** 아래를 돌려라:
1. 그 화면을 시뮬레이터/스토리북/스크린샷으로 **렌더**한다.
2. 첨부 .dc.html(또는 같은 폴더 `screenshots/<이름>.png` 레퍼런스)을 **나란히 놓고** 비교한다.
3. 체크: 배경색 · 카드 테두리 · 폰트 위계 · 간격 · 별/그래픽 위치 · 버튼 색(1차 민트/보조 ghost)
   · 상태칩 색 — 각 항목이 정본과 일치하나?
4. 어긋난 항목을 **고치고 2번부터 다시**. 일치할 때까지 반복. "대충 맞으면 통과" 금지.

### 4. 구조적 충실도
- .dc.html 의 프레임 하나 = 화면 하나(또는 바텀시트/상태 하나). 한 프레임을 임의로 합치거나 쪼개지 마라.
- 진행성 노출(progressive disclosure): .dc.html 에서 "탭 후" 라고 된 디테일은 처음에 숨기고 탭에 붙여라.
- 빈/에러/미연결 상태가 프레임으로 있으면 **다 구현**하라. 채움만 만들고 끝내지 마라.
- 키트 매핑 메모(있으면)대로 기존 컴포넌트로 조립 — 새 컴포넌트 신설 최소화.

### 5. 완료 정의 (전부 참일 때만 "끝")
- [ ] hex 리터럴 0개 (전부 deepSpace.* 토큰)
- [ ] 표에 없는 색(초록·베이지) 0개
- [ ] 레거시 import 0개(gameboy/IslandArt/NavGraph/SecondBSprite/PremiumAppShell)
- [ ] 폰트 3종 위계 일치(Galmuri11/Pretendard/Press Start 2P)
- [ ] 1차=민트·보조=ghost, 터치타깃 ≥44px, 본문 ≥14px
- [ ] 자기 대조 루프(3번)에서 정본과 육안 일치 확인
- [ ] typecheck 통과
- [ ] glassmorphism·pill chip·em dash·이모지 아이콘 0개

위 7개 체크가 전부 참이 될 때까지 멈추지 마라. 막히면 추측하지 말고 어느 항목이 왜
안 맞는지 보고하라.

---

## 왜 이게 통하나 (당신을 위한 메모)
- **추출 > 눈대중**: .dc.html 은 디자인 명세서가 아니라 *값이 박힌 코드*다. "보고 따라 그려"가
  아니라 "이 값을 읽어 토큰으로 바꿔"라고 시키면 드리프트가 급감한다.
- **자기 대조 루프**: AI가 자기 결과를 레퍼런스와 비교하게 만드는 한 줄이, 100줄의 규칙보다
  세다. `screenshots/` 폴더의 레퍼런스 PNG를 같이 커밋해두면 비교 대상이 생긴다.
- **완료 정의 = grep 가능한 체크**: "예쁘게"가 아니라 "hex 0개·레거시 0개"처럼 기계적으로
  확인되는 조건이라야 Claude Code가 스스로 통과/실패를 판정한다.
