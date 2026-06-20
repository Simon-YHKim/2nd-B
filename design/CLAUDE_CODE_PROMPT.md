# 2nd-Brain · 레거시 → 딥스페이스 변환 (Claude Code `/goal` 자율 모드)

> 이 프롬프트는 Claude Code의 `/goal`(목표 달성까지 멈추지 않는 자율 모드)용이다.
> 그래서 "멈춰서 확인받아라"가 아니라, **스스로 검증 가능한 종료조건**을 박았다.
> Claude Code가 grep·typecheck로 자가검증하며 끝까지 달리게 만든 게 핵심이다.
> 레포 루트에 design/ 폴더가 커밋돼 있어야 한다.

---

## /goal 에 줄 본문 (전체 복붙)

GOAL: 이 RN(Expo) 앱의 모든 "엔진 화면"을 레거시(게임보이/마을)에서
딥스페이스(시안) 디자인으로 교체한다. 아래 "완료 정의"가 전부 참이 될 때까지
멈추지 마라. 신규 발명이 아니라, 레포에 이미 머지된 딥스페이스 화면 패턴을
복제해 나머지 화면에 적용하는 작업이다.

### 0. 시작 전 읽기 (진실의 출처)
- design/DESIGN_AUDIT.md, design/FIX_TASKS.md
- 정본 콘텐츠: design/*.dc.html (렌즈화면·허브화면·화면설계·프로토타입·기타화면 등)
- 따라할 정답 패턴(레포 내 이미 머지된 캐논 화면):
  src/screens/deepspace/DeepSpaceDesignScreens.tsx 와 ConstellationHome.
  이 구조·import·토큰 사용법을 그대로 복제하라.

### 1. 대상 산정 (직접 grep)
레포 전체에서 아래 레거시 마커를 grep해 "고칠 파일 목록"을 만들어라. 이게
작업 대상이다(내 audit는 참고용 — grep 결과가 우선):
`gameboy-tokens`, `IslandArt`, `NavGraph`, `SecondBSprite`, `VillageScene`,
`PremiumAppShell`, `signalMint`, `borderStartColor`, `borderStartWidth`.
FIX_TASKS.md 의 우선순위(별7 → 소울코어+담기 → 세컨비·기록 → off-palette →
주변부)대로 처리하되, 목록의 모든 화면을 빠짐없이 변환하라.

### 2. 각 화면 변환 규칙 (GUARDRAILS)
- 해당 .dc.html(FIX_TASKS.md의 매핑)의 레이아웃·문구·빈/에러/채움 상태를
  그대로 옮겨라. 카피·섹션을 지어내지 마라.
- 레거시 import/토큰(위 1의 마커) 전면 금지. DeepSpaceScreen 래퍼 +
  SecondbStatusHeader(현황+TIP, 문구는 .dc.html에서) + @/theme/tokens 사용.
- 색: 시안 #46B6FF + 보라 #C8B6FF 중심. 민트 #5FF0C0 은 TIP·긍정 델타 전용.
  hex 리터럴·글래스모피즘·필 칩·좌측보더 액센트·off-palette 그라데이션 금지.
- 폰트: 본문 Pretendard / 제목·픽셀 Galmuri11 / 초소형 라벨 "Press Start 2P".
- 데이터 연결은 // TODO, 더미값 사용. 기존에 잘 도는 로직은 임의 리팩터 금지.

### 3. 자가검증 루프 (멈추지 않기 위한 핵심)
화면 하나를 고칠 때마다 즉시:
(a) typecheck(또는 빌드)를 돌려 통과시켜라. 실패하면 고치고 재실행.
(b) 그 파일에 1의 레거시 마커를 다시 grep해 **0개**인지 확인. 남아있으면 고쳐라.
통과하면 의미 있는 커밋 메시지로 커밋하고 다음 화면으로 진행하라.

### 4. 완료 정의 (이게 전부 참일 때까지 멈추지 마라)
- [ ] 1에서 grep된 모든 엔진/주변부 화면이 딥스페이스로 변환됨
- [ ] 레포 전체 grep에서 위 레거시 마커가 **딥스페이스 화면에 0개**
      (레거시 전용 파일이 의도적으로 남는다면 그 목록을 보고)
- [ ] 토큰 포크 통합: 모든 딥스페이스 화면이 동일 토큰 경로(@/theme/tokens) 사용
- [ ] 프로젝트 전체 typecheck/빌드 통과
- [ ] 각 변환 화면 최상단에 SecondbStatusHeader 존재
종료 시: 변환한 화면 수, 제거한 레거시 import 요약, 남긴 레거시 파일(있다면),
최종 typecheck 결과를 리포트로 남겨라.

### 막혔을 때
에셋/폰트가 없거나(예: Galmuri11 한글 폰트) 정본이 불명확하면, 추측으로
레거시를 베끼지 말고 그 화면을 "BLOCKED: 사유"로 표시하고 나머지를 계속
진행하라. 절대 레거시 스타일로 되돌아가 채우지 마라.

---

## 참고
- 중간에 멈추지 않는 모드이므로, 첫 실행 전 design/ 가 최신으로 커밋됐는지만
  확인하면 된다. 끝나면 위 "완료 정의" 체크리스트로 결과를 검수하라.
