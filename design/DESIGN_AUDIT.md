# 2nd-Brain · 라이브 디자인 감사 (소스 기반)

> 작성: 디자인 정본 대비 GitHub `main` 소스 직접 분석.
> 캡처는 이 환경(셸·헤드리스 브라우저 없음)에서 못 돌리므로, 스크린샷 산출물은
> 이 폴더의 `CODEX_AUDIT_TASK.md`(당신이 알려준 Playwright 우회 레시피 반영)로
> Codex가 자기 컨테이너에서 생성하면 됩니다. 아래 표는 코드가 진실의 출처라
> 스크린샷보다 오탐이 없습니다.

---

## 한 줄 결론
**"AI가 시안을 못 그린다"는 오진이었다.** 셸(홈·도크)과 인증/계정/그래프/연동
계열은 이미 캐논 딥스페이스로 잘 만들어졌다. **진짜 문제는 별·도크·캡처가
실제로 진입하는 "엔진 화면" ~25개가 전부 레거시(게임보이/마을)** 라는 것 —
딥스페이스 모드에서 `semantic` 토큰만 시안으로 자동 재색칠될 뿐 구조·아트·
좌측보더·민트(초록) 액센트가 그대로 남아있다.

---

## 트랙 분류 (소스 확인 완료)

### ✅ 캐논 딥스페이스 (완료 — 시안 정확)
| 화면 | 구현 | 비고 |
|---|---|---|
| 홈 `/` | `DeepSpaceShell` → `ConstellationHome` + `DeepSpaceScreen`(상태헤더+5탭 도크) | prototype.dc.html 홈의 1:1 클론. 7별→엔진 라우트, 북극성→/core-brain |
| `/deepspace-home` `/deepspace-hub` `/deepspace-preview` | `src/screens/deepspace/*` | 별도 프리뷰 라우트 |
| `/sign-in` `/sign-up` `/reset-password` | `DeepSpaceDesignScreens.tsx` | `@/theme/tokens` 시안 + `SecondbHead` |
| `/account` `/privacy` `/graph` `/integrations` `/support` | `DeepSpaceDesignScreens.tsx` | 〃 |

### ❌ 레거시 잔존 (재작성 필요 — 시안 재색칠만 된 게임보이/마을)
별 7개·북극성·도크·캡처가 실제로 들어가는 화면들. **여기가 사용자가 "레거시로
보인다"고 느끼는 지점.**

| 라우트 | 진입 경로 | 확인된 위반 |
|---|---|---|
| `/big-five` | 홈 별1(지금의 나) | `gameboy-tokens` import · `borderStartColor: signalMint`(좌측보더+초록) · `isDeepSpaceUI` 분기 없음 |
| `/interview` | 홈 별2(회상) | 레거시(PremiumAppShell 계열) |
| `/persona` | 홈 별3(보여지는 나) | 레거시 |
| `/esm` | 홈 별4(리듬) | 레거시 |
| `/attachment` | 홈 별5(관계) | 레거시 |
| `/imagine` | 홈 별6(미래의 나) | 스텁/레거시 |
| `/audit` | 홈 별7(가치) | 레거시 |
| `/core-brain` | 북극성(소울코어) | 레거시 |
| `/capture` | 도크(담기) — 91KB | 레거시, 최대 화면 |
| `/secondb` `/jarvis` | 도크(세컨비) | 레거시/스텁 |
| `/iden` | 도크/홈(나·IDEN) | 레거시 |
| `/records` `/inbox` `/research` `/insights` `/data` `/formats` `/import` | 기록·인사이트 계열 | 레거시 |
| `/profile` `/settings` `/theme` `/plans` `/permissions` | 계정·설정 계열 | 레거시 |
| `/onboarding` `/complete-profile` | 온보딩 | 레거시 |
| `/manual` `/ops` `/review` `/mbti` `/journal` `/discover` | 기타 | 레거시/스텁 |

---

## 캐논 위반 유형 (CLAUDE.md / DESIGN.md 기준)

1. **레거시 마스코트/아트 잔존** — 엔진 화면은 `IslandArt`, `NavGraph`,
   `SecondBSprite`(마을 6주민/보라 로봇), `PremiumAppShell` 등 마을 컴포넌트를
   계속 import. 캐논은 단일 세컨비 머리(`SecondbHead`)만 허용.
2. **off-palette 색 (초록/민트 액센트)** — `cosmic.signalMint`(#72F2C7)를
   보더·그림자·강조에 사용. 캐논 딥스페이스는 시안(#46B6FF)+보라(#C8B6FF)+
   민트는 "TIP/긍정 델타"에만 제한.
3. **좌측 보더 액센트 트로프** — `borderStartWidth: 3 + borderStartColor`
   (예: big-five 헤더). DESIGN.md가 명시적으로 금지한 AI-slop 패턴.
4. **토큰 파일 포크** — 캐논 화면은 `@/theme/tokens`, 레거시는
   `@/lib/theme/tokens`. 둘 다 시안값이라 색은 맞지만 장기 드리프트 위험.
5. **정보 밀도** — 레거시 화면 일부는 "한 화면 한 메시지" 위반(카드 과다).
   (스크린샷으로 정밀 확인 권장 → CODEX_AUDIT_TASK.md)

---

## 우선순위 (심각도순)

### 🔴 Blocker — 첫인상 직결
- **엔진 화면 7개(별 목적지) 딥스페이스 재작성**: big-five, interview,
  persona, esm, attachment, imagine, audit. 아름다운 새 홈에서 별을 누르면
  곧장 옛 마을로 떨어지는 단절이 가장 큰 문제.
- **`/core-brain`(북극성 목적지) 재작성** — 소울코어는 앱의 상징.
- **`/capture`(담기) 재작성** — 매일 쓰는 핵심, 91KB 레거시.

### 🟠 Major
- `/secondb` `/iden` `/records` `/inbox` `/insights` 딥스페이스화.
- off-palette 초록·좌측보더 트로프 전수 제거.
- 토큰 포크 통합(`@/theme/tokens` → `@/lib/theme/tokens` 의 `deepSpace`).

### 🟡 Minor
- `/profile` `/settings` `/theme` `/plans` `/permissions` `/manual` 등 주변부.
- 스텁 라우트(`/mbti` `/journal` `/discover` `/jarvis`) 정리/연결.

---

## 다음 액션
1. `CODEX_AUDIT_TASK.md` 를 Codex에 줘서 **스크린샷 증거**를 생성(선택).
2. `FIX_TASKS.md`(아래) 순서대로 Blocker→Major 재작성.
