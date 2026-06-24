# PRD — 2nd-Brain (상세)

> Product Requirements Document. 제품의 "무엇을·누구를 위해·어떤 기준으로" 를 한 곳에 모은
> 단일 진입점. 구현 세부는 `docs/ARCHITECTURE.md`, 강제 조항은 `docs/CONSTRAINTS.md`.

| 항목 | 값 |
|---|---|
| Status | Draft v2 (2026-06-25 방향 전환 반영) |
| Owner | Simon Kim (solo build) |
| Last updated | 2026-06-25 |
| Deadline | 2026-08-17 06:00 KST (Build with Gemini XPRIZE 제출) |
| Track | XPRIZE — Education & Human Potential |

> ## ⚠️ 방향 전환 (2026-06-25, Simon 결정)
>
> 이 PRD 는 **"core" 세계관 폐기 + 별자리 단일 홈** 방향을 반영한다. 두 결정:
>
> 1. **core 폐기** — Soul Core 를 중심으로 한 **5 Pattern Core** 계층(Bond/Wisdom/
>    Narrative/Muse/Growth + Pattern Tesseract + 마을 그래프 + `/core-brain` 화면)은
>    디자인·세계관에서 제거한다. 세계관은 **별자리(북극성 + 북두칠성 7별)** 하나로 단일화.
>    북극성은 "7별을 종합하는 길잡이 별" 로 **유지하되 'Soul Core' 명칭은 뗀다**.
> 2. **별자리 단일 홈** — 화면 구조는 **별자리 화면이 유일한 홈/네비게이션**. 별을 탭하면
>    해당 렌즈/기능으로 진입한다. 기존 4탭 셸·마을 그래프·`/core-brain` 은 폐기하되, 담기·
>    세컨비·검사·위키·설정 등 **기능 자체는 별/북극성 하위 진입점으로 재배치해 보존**한다.
>
> **문서·코드 부채 (이 전환이 아직 반영 안 됨, §15·§16):** `docs/CONCEPT.md`·`docs/VISION.md`·
> `CLAUDE.md`(Visual Tier System)·`src/lib/assets/constellation-home.ts`(아직 북극성을
> "Soul Core" 로 라벨), 마을 그래프 코드, `/core-brain` 라우트는 여전히 구 core 모델을 담고
> 있다. 이 PRD 가 그들과 충돌하면 **이 PRD 가 새 정본**이며, 그 문서·코드는 이 방향에 맞춰
> 갱신되어야 한다 (마이그레이션 §15).

---

## 1. 한 줄 요약

**AI 시대, 가장 가치있는 자산은 "나 자신" 이다.** 2nd-Brain 은 나에 대한 데이터를 *축적* 하고,
그 위에서 작동하는 *개인 비서로 키우며*, 떠오른 공상을 *나와 같은 결로 구체화* 하는 local-first
개인 플랫폼이다. 임상·의료 카테고리의 앱이 아니라 **나라는 자산을 만드는 생산 도구** 다.

포지셔닝(1줄, GTM 정본): *"당신의 생각, 당신의 Markdown, 당신의 private lab. AI는 당신이
부를 때만 들어옵니다. local-first, 영원히 당신 것."*

추상적인 "자기 이해" 를 **밤하늘** 이라는 단일 은유로 만진다 — 별이 밝아질수록 그 영역의 나를
더 잘 안다.

---

## 2. 문제와 기회

- **문제**: 생성형 AI 는 누구에게나 같은 답을 준다. 모두가 같은 도구를 쓰는 순간 차별화 자산은
  도구가 아니라 그 도구에 들어가는 입력 — 나의 데이터·취향·맥락·패턴 — 인데, 정작 그 "나" 는
  카톡·메모·사진·머릿속에 흩어져 어디에도 구조화돼 있지 않다.
- **기회**: 검증된 정량 평가 + 일상 입력 + LLM 인터뷰로 나에 대한 데이터를 모으고, RAG 로 그
  데이터 위에서 나에게 맞춰 응답하는 개인 비서를 만든다. 데이터는 사용자 소유의 Markdown 으로
  영구 보관(local-first) — "100년 뒤에도 읽힌다."
- **타이밍**: 구독 피로 + 클라우드 lock-in 거부감이 강한 PKM·자기성찰 사용자층이 "AI 는 도구,
  주체는 나" 프레임을 적극적으로 찾고 있다 (GTM Grok 신호, 4개+ 독립 출처 교차검증).

---

## 3. 비전 · 세 축 (제품 기둥)

모든 기능·화면·PR 은 아래 세 축 중 하나에 명시적으로 속한다.

| # | 축 | 정의 | 별자리에서의 위치 |
|---|---|---|---|
| 1 | **알아가기** (자기 데이터 축적) | 정량 평가 + 시기 회고 + 일상 입력 + LLM 인터뷰로 나에 대한 데이터를 모은다 | 7별 점등 (각 렌즈 밝기 상승) + 담기 |
| 2 | **개인 비서 기반** (RAG 위 vibe) | 축적된 데이터 위에서 나에게 맞춰 작동하는 AI '세컨비' | 북극성 진입 → 세컨비 (별·밝기 근거로 응답) |
| 3 | **공상 → 구체화** (미래의 나) | 떠오른 아이디어·꿈을 나와 같은 결로 펼치고 다음 한 걸음으로 떨군다 | 세컨비 Divergent 모드 + '될 수 있는 나' 별 + propose→ratify |

축의 관계: **알아가기**(별 점등·밝기 상승) → **개인 비서**(밝기·별 근거로 세컨비 응답) →
**공상→구체화**(될 수 있는 나 + 다음 한 걸음).

---

## 4. 정본 개념 모델 — 별자리 (CONSTELLATION)

정본 방향은 **deep-space 별자리**. 캐릭터 주도 별자리 홈이 단일 canonical 앱 본체다.
SoT 자산/좌표: `src/lib/assets/constellation-home.ts` (Polaris + Big Dipper raster, 별 좌표·
엣지·포인터). 픽셀아트·게임보이 스타일 금지.

### 4.1 별자리 구성

밤하늘 단일 은유. 두 요소 + 링크로만 구성된다 (그 외 노드 없음).

| 요소 | 정체 | 역할 |
|---|---|---|
| **북극성 (Polaris)** | 7별 밝기를 종합하는 길잡이 별. 항상 가장 밝고 지배적 | 종합 readout + 세컨비 진입 (내부 키 `soulCoreBrightness` 유지, 표시명은 "북극성") |
| **북두칠성 7별 (Big Dipper)** | 7개 자기이해 렌즈 (§4.2). 각자 엔진 + L1~L5 밝기 | 탭 → 해당 렌즈/기능 진입 |
| **Pattern Link** | 별을 잇는 cyan 엣지 (Big Dipper 형태 + 포인터 2별→북극성) | 전부 cyan 단색. 시각적으로 후퇴 |

> **시각 위계 (구 Visual Tier System 대체)**: 북극성(지배·최대 밝기) > 북두칠성 7별
> (겉보기 등급 baseline × 데이터 밝기 L1~L5 — 점등될수록 밝게) > cyan 링크(후퇴). 구
> "Soul Core 128px / Pattern Core×5 82px / snowflake / crystal" 노드명은 **폐기**(§4.7).
> 위계 *원칙*(하나의 지배 + 하위 후퇴)은 계승, *이름* 은 별자리 용어로.

### 4.2 북두칠성 7별 = 자기이해 렌즈 (증거축)

SoT: `src/lib/persona/stars.ts` (`SELF_UNDERSTANDING_STARS`). 별 = 증거축. (구 5 Pattern
Core 는 별과 무관한 별개 개념이었고 §4.7 에서 폐기.) 7별이 Big Dipper 의 7 별(alkaid·mizar·
alioth·megrez·dubhe·merak·phecda)로 렌더된다.

| # | 렌즈 (KO) | EN | 측정 construct | 엔진 | 상태 |
|---|---|---|---|---|---|
| 1 | 지금의 나 | Trait state | Big Five (BFI-44) | `persona/bfi.ts` | shipped |
| 2 | 회상 | Narrative origins | McAdams 내러티브 정체성 | `interview/probe.ts` | shipped |
| 3 | 보여지는 나 | Other-view | 타인평정 Big Five + 평판 | 360 peer (성인 한정·후순위) | absent |
| 4 | 리듬 | Momentary state | within-person 변동성 | `esm.tsx` | stub |
| 5 | 관계의 나 | Relational self | 애착 (anxiety/avoidance, ECR-S) | `persona/attachment.ts` | shipped |
| 6 | 될 수 있는 나 | Possible self | Possible Selves (Markus & Nurius 1986) | new | absent |
| 7 | 가치의 나 | Values & strivings | SDT + VIA strengths + personal strivings | `audit` sdt:*/via:* 태그 | partial |

### 4.3 북극성 = 7별 종합 (길잡이)

북극성 밝기 = 7별 밝기의 평균 + 전별점등 보너스(모든 별 ≥ L2 시 +0.05). 너비(7개를 조금씩
다 아는 것)가 한 별 깊은 spike 보다 더 밝게 — "모든 별이 켜지면 북극성이 더 밝아진다."
결정론적·LLM-free. 함수 `soulCoreBrightness(levels)` (`stars.ts`). 표시명은 "북극성", 내부
키는 회귀 위험 때문에 `soulCoreBrightness` 유지.

### 4.4 L1~L5 밝기 사다리

하나의 서수 척도가 **밝기 = 데이터 품질 = 출처 신뢰도 = 인터뷰 드릴 정지레벨** 을 동시에
의미한다. `src/lib/persona/brightness.ts` (`ladderLevel`/`brightnessFraction`, 20~100%).
UI 의 모든 빛/크기/위계는 "이 부분의 나를 얼마나 아는가" 라는 단일 정보를 시각화한다.

### 4.5 propose → ratify (핵심 신뢰 장치)

AI 는 자기모델을 **직접 바꾸지 못한다.** `SelfModelProposal` diff 를 제안
(`propose-self-model.ts`, C9→C3→`gemini.ts` 경로)하고, **사용자 승인** 만이 L5 확정
(`proposal.ts::applyRatify`)을 만든다. AI 가 멋대로 "너는 이런 사람" 이라 못 박지 않는다.

### 4.6 공상 = 장소가 아니라 세컨비 대화 모드

- **Analytic 모드** — 사용자 data 기반 분석/조언.
- **Divergent 모드** — data 기반이되 전혀 다른 관점에서 새 가능성 탐색. UI에 "새로운 관점/
  가정" 라벨.
- 두 모드 모두 예외 없이 **C9(classifyInput) → C3(ai_audit_log) → `gemini.ts`** 경로. 공상이
  안전 분류를 우회하는 통로가 되어서는 안 된다.

### 4.7 폐기 (Deprecated / Legacy)

이 방향 전환으로 다음은 디자인·세계관에서 **제거**한다 (롤백 스킨 `EXPO_PUBLIC_UI=legacy` +
git history 로만 보존):

| 폐기 대상 | 비고 |
|---|---|
| **Soul Core** (명칭) | 북극성으로 개명. 종합 readout 역할만 계승, "Soul Core" 라벨 제거 |
| **5 Pattern Core** (Bond/Wisdom/Narrative/Muse/Growth) + **Pattern Tesseract** | 세계관·디자인에서 제거. 별과 무관한 별개 축이었음 |
| **마을 그래프** (`/graph`, Cosmic Pixel Graph Village) | 별자리 홈으로 대체 |
| **`/core-brain`** 화면 | 북극성 종합 뷰로 흡수 |
| **Brain Trinity** (`/trinity`) | 이미 legacy. 별자리 세계관에 부적합 |
| **v3 tesseract 아트 트랙** | Pattern Core(tesseract) 전제라 폐기. 별자리 raster 자산이 정본 |
| **Visual Tier System 노드명** (128/82px, snowflake, crystal) | §4.1 별자리 위계로 대체 |
| 내부 도메인 키 (work/relation/knowledge/records/taste) | **데이터 레이어에선 잔존**(회귀 안전, 태그 분류). 단 **디자인·세계관 표면에는 노출 금지** |

---

## 5. 목표 · 비목표

### 5.1 목표 (~2026-08-17)

1. **별자리 단일 홈** 으로 세 축이 한 흐름으로 동작하는 end-to-end 제품 라이브 시연 (입력 →
   별 점등·밝기 상승 → 북극성/세컨비가 그 근거를 인용).
2. core→별자리 마이그레이션 완료 (마을 그래프·`/core-brain` 폐기, 북극성 개명, 별 진입점
   재배치, 정본 문서·코드 정합 — §15).
3. 12개 강제 조항(C1~C12) 코드·스키마·CI 100% 유지.
4. KR-first 출시 (한국어 고품질 + 관대한 무료 티어), XPRIZE 제출 요건 충족.

### 5.2 비목표 (이번 사이클)

- 임상·의료 성격의 기능 일체 (카테고리 자체가 비목표 — 어휘 정책 §11 로 강제).
- 비-KR 관할 정밀 연령 게이트 (US COPPA <13, EU GDPR Art.8) — country 신호 + 법률 검토 후속.
- 결제 실활성화 (가격·티어 확정, 스토어 IAP/SBP/KR PG 실계약 미결).
- Planner 엔진 풀버전(v1.1), Brain 티어 리텐션 루프 풀구현.
- '보여지는 나'(360 peer)·'될 수 있는 나' 엔진 풀구현 (별 자리는 두되 absent 상태로 시작).

---

## 6. 성공 지표 (KPI · 제안값 — 검증 대상)

| 축 / 영역 | 지표 | 제안 목표 |
|---|---|---|
| 활성화 | 첫 세션 내 1개 이상 검사/기록 완료율 | ≥ 60% |
| 알아가기 | 가입 후 7일 내 7별 중 ≥ 3개 점등(L2+) | ≥ 40% |
| 축적 | 사용자당 누적 Log(sources/records), 7일/30일 | 7일 ≥ 5 · 30일 ≥ 20 |
| 개인 비서 | 세컨비 turn 중 RAG 근거(위키/별) 인용 비율 | ≥ 70% |
| 별자리 | 북극성 밝기 중앙값 (가입 후 30일) | 추적·보정 |
| 리텐션 | D7 / D30 재방문 | D7 ≥ 30% · D30 ≥ 15% |
| 데이터 주권 | 위키 export(MD/JSON) 사용률 | 추적 |
| 안전 | red-zone 입력 LLM 우회 0건 (C9), 핫라인 라우팅 정확도 | 100% / 100% |
| XPRIZE | 강제 조항 CI green, 심사자 모드 무제한 | 100% |

---

## 7. 타깃 사용자 · 페르소나

획득 우선순위 (GTM §3): (1) Obsidian/PKM 커뮤니티 — local-first + AI optional. (2) Stoic/
자기성찰 실천가 — morning/evening review. (3) KR 자가구축 빌더 — "내가 정의한 온톨로지"
주도권. (4) ADHD/외부화 커뮤니티 — second-brain 실용성.

연령 티어(C10): 성인(≥18) · 자가동의 미성년(14–17) 직접 가입 / 14세 미만 보호자 검증 필요
(`pending_guardian_consent`).

---

## 8. 기능 요구사항

### 8.1 7개 엔진 (책임 단위)

| # | 엔진 | 책임 | 상태(2026-06-25) |
|---|---|---|---|
| 1 | Capture | 일상 기록, 자유 메모, 시기 회고 Q&A, 5-mode 자재 반입 | 라이브 |
| 2 | Inference | 특성/가치/패턴 추출 → 별 밝기·북극성 종합 산출 | 라이브 |
| 3 | Memory (RAG) | 위키 ingest + Claude/ChatGPT 호환 MD/JSON export | 라이브 (Phase1/2 보강 진행) |
| 4 | Advisor | 검증된 심리학에 ground 된 토글 모드 가이드 | 진행 |
| 5 | Planner | 성향 보정 액션 플랜 + 리마인더 | v1.1 (비목표) |
| 6 | Curator | 사람이 검증한 참조 문헌 (C8 provenance) | 진행 |
| 7 | Safety Classifier | green/yellow/red 라우팅. 상시·우회불가 | 라이브 (C9) |

### 8.2 별자리 홈 (유일한 홈)

- 화면 = 밤하늘. 북극성 + 북두칠성 7별 + cyan 링크. 자산 = `constellation-home.ts`
  (landscape/mobile/card 3종, 별 좌표는 자산별 정규화 x/y).
- 각 별의 밝기 = 그 렌즈의 L1~L5 (마운트 시 `load-star-levels.ts` 로 Gemini 없이 표시).
- **정보 밀도 원칙** (Simon 표준): 화면당 메시지 하나 + 그래픽 하나. 별자리 자체가 설명이다
  (설명 텍스트가 필요하면 그래픽 실패 → 카피 추가 대신 그래픽 수정).
- **터치 규칙** (O-7): 한 번의 탭은 화면을 *단순화* 한다 — 별 탭 → 화면 전환(또는 바텀시트)으로
  그 렌즈에 드릴다운. 노드 위 겹치는 모달 금지. Back 은 한 곳(별자리 홈 = back-stack root).

### 8.3 별 → 렌즈/기능 매핑 (새 네비게이션)

별을 탭하면 그 렌즈의 상세(현재 밝기·근거·"이 렌즈를 키우는 검사")로 진입한다.

| 별 (렌즈) | 진입 기능 / 라우트 | 상태 |
|---|---|---|
| 지금의 나 | Big Five `/big-five` (+ 참고용 MBTI `/mbti`, 비검증·보조) | shipped |
| 회상 | 심층 인터뷰 `/interview` (LLM drill 5×5, 드릴 정지규칙 + 50턴 하드캡) · 과거의 나 `/audit` | shipped |
| 보여지는 나 | 360 peer (성인 한정, 후순위) | absent |
| 리듬 | 순간기록 `/esm` · 일상 기록 리듬 | stub |
| 관계의 나 | 애착 `/attachment` (ECR-S) · 관계 인터뷰 | shipped |
| 될 수 있는 나 | Possible Selves(신규) · 세컨비 **Divergent** · propose→ratify 다음 한 걸음 | absent |
| 가치의 나 | 가치/강점 `/audit` (sdt:*/via:* 태그) | partial |

### 8.4 북극성 → 종합 / 세컨비

- 북극성 탭 → **종합 뷰**: 북극성 밝기% + 켜진 별 요약 (구 `/persona`·`/core-brain` 역할 흡수),
  그리고 **세컨비** `/secondb` 진입 — RAG-backed chat. 상단 일일 사용량 미터.
  **Analytic / Divergent** 모드 토글. 모든 turn 이 `callGemini`(C9→C3) 경유. 위기 라우팅
  turn 은 quota 미차감.
- "통찰" `/insights` (요즘 뭘 적었나 종합) · "참조 문헌" `/research` (RAG ground 출처)는 북극성
  종합 뷰 하위의 보조 surface 로 재배치.

### 8.5 상시 진입점 (별이 아닌 것)

- **담기** `/capture` — 모든 입력 단일 진입(메모·일기/링크·스크랩/이미지·OCR/문서). 일기 모드는
  streak·성찰질문 흡수, records 저장 + C9 crisis. 별자리 홈에서 상시 접근(예: 떠 있는 입력
  어포던스). 입력은 7별 전체로 흘러간다.
- **받은항목/위키** `/inbox` · `/wiki` — 반입 sources → 위키 페이지(태그·백링크). 북극성 종합
  또는 담기에서 진입.
- **설정** `/settings` (계정/요금제/개인정보/권한/데이터/테마/지원/운영진단) — 코너 유틸 진입.

### 8.6 인증·시스템 + 4-state

- `(auth)/sign-in` · `sign-up`(birth_date, C10) · `/complete-profile` · `/onboarding`. 가입
  후 별자리 홈으로. 하드웨어 Back 은 별자리 홈으로 복귀.
- 모든 핵심 화면은 empty/loading/error/filled 4상태 정의·구현 (`docs/ui-audit/
  SCREEN_TREE_SPEC.md` 가 동작 정본).

---

## 9. 정보 구조 (IA) — 별자리 단일 홈

별자리(`/`)가 유일한 홈/네비게이션. 구 4탭 셸·마을 그래프·`/core-brain` 폐기. 모든 기능은
별/북극성/상시 진입점 하위로 도달. 기존 라우트 처분:

| 처분 | 라우트 |
|---|---|
| **KEEP — 별 진입점** | `/big-five` · `/mbti`(보조) · `/interview` · `/audit` · `/esm` · `/attachment` |
| **KEEP — 북극성 종합 하위** | `/secondb`(세컨비, 자비스/공상 토글) · `/persona` · `/insights` · `/research` |
| **KEEP — 상시/유틸** | `/capture` · `/inbox` · `/wiki` · `/settings`(+계정/요금제/개인정보/권한/데이터/테마/지원/운영진단) |
| **KEEP — 인증/시스템** | `(auth)/*` · `/onboarding` · `/complete-profile` · `/+not-found` |
| **DEPRECATE** | `/graph`(마을) · `/core-brain` · `/trinity`(Brain Trinity) · `/journal`(→`/capture` redirect 유지) · 구 `/imagine`(→세컨비 Divergent redirect, vestigial) |

원칙: 한 라우트는 한 가지 일만 한다. 떠 있는 화면 없음(모두 별/북극성/유틸 하위). 입력은
"담기" 단일 진입. Deep-link 직접 로드는 유지(라우트는 존재, 홈만 별자리).

---

## 10. 비기능 요구사항 · 12개 강제 조항 (C1~C12)

절대 약화 불가. 코드·스키마·CI 강제. 불확실하면 `npm run check:constraints`.

| ID | 규칙 |
|---|---|
| C1 | 모든 LLM 호출은 `src/lib/llm/gemini.ts::callGemini()` 단일 래퍼 경유. ESLint 가 타 LLM SDK 차단. |
| C2 | `@google/genai` 를 `EXPO_PUBLIC_USE_VERTEX=true` 시 `vertexai: true` 로 구성. backend 기록. |
| C3 | 성공 호출마다 `ai_audit_log` INSERT (mock·crisis 포함). audit 직접 import 차단. |
| C4 | `revenue_events` = `month_bucket` + `is_related_party` + `customer_relation_type`. |
| C5 | `testimonials.consent_given_at` NOT NULL. `share_with_judges_flag` 기본 false. |
| C6 | `@xprize.org`·`@devpost.com`·`@hacker.fund` 심사자 모드 무제한. client + DB trigger 이중, DB authoritative. |
| C7 | i18n EN↔KO 키 패리티. EN canonical. 빈 값 CI 실패. |
| C8 | `knowledge_sources` = DOI OR URL 필수, `verified_by`/`verified_at` 쌍 강제(CHECK). |
| C9 | `classifyInput()` 가 `callGemini` 최상단 실행. red-zone 단락 → 핫라인 안내, LLM 미호출. jest 단언. |
| C10 | 연령 티어 가입: 성인·14–17 자가동의 직접 / 14세 미만 보호자 검증(PIPA §22-2). DB BEFORE INSERT trigger 가 실게이트. |
| C11 | 지원 SLA 영업일 2일(KST). README 선언 + issue-sla 워크플로. |
| C12 | README "Pre-existing assets used" (rulebook §04) + `docs/ASSETS.md` 레지스트리. |

기타 비기능:
- **Android 안정성**: `ANDROID_QA_GUIDELINES.md` 준수 — OOM, SVG 렌더 락, AsyncStorage 2MB
  한계, z-index 역전, BackHandler 누수 예방. (별자리 raster + 별 SVG 오버레이 렌더 주의.)
- **i18n**: EN canonical, KO 패리티 (C7). **데이터 주권**: 위키 MD export. **RLS**: sources/
  wiki_pages/wiki_links/chat_usage owner-only.

---

## 11. 안전 · 컴플라이언스 · 어휘 정책

- **이 앱은 임상·의료·웰니스 카테고리의 앱이 아니다.** 임상·병리 용어 일체는 코드·UI·주석·
  문서(이 문서 포함) 어디서도 쓰지 않는다. 금지어 단일 정본 = `src/lib/safety/lexicon.ts`
  (`FORBIDDEN_TERMS` + `ANALYSIS_UNIVERSAL_FORBIDDEN`), CI 게이트 =
  `scripts/check-forbidden-lexicon.ts` (`docs/` 포함 스캔, allowlist 예외만). 대체어:
  self-understanding, growth, reflection, self-knowledge / 자기 이해, 성장.
- **위기 라우팅 (C9)**: red-zone 입력은 LLM 호출 없이 핫라인 안내로 단락. KO 미성년 → 1388 +
  109, KO 성인 → 109, EN → 988.
- **연령·동의 (C10)**: KR-first 자가동의 14세. 14세 미만 보호자 동의 원장(`guardian_consents`).
- **데이터 윤리**: 미성년 DPIA 초안 + 데이터 윤리/동의 리서치 트랙 유지.

---

## 12. 기술 아키텍처 · 스택

| 레이어 | 선택 |
|---|---|
| 앱 | React Native 0.85 + Expo SDK 56, React 19, TypeScript strict, expo-router |
| UI | NativeWind/Tailwind, react-native-reanimated 4 + worklets, react-native-svg, FlashList |
| LLM | `@google/genai` (Gemini), Vertex 옵션(C2), 단일 래퍼 `gemini.ts`(C1) |
| Backend | Supabase (Postgres + Auth + Storage), owner-only RLS |
| 결제 | react-native-purchases (RevenueCat) — 활성화 전 |
| 빌드/배포 | EAS Build + EAS Update(OTA), Vercel(web), GitHub Actions(CI) |
| 모니터링 | Sentry, PostHog (단계적) |

**데이터 흐름 (핵심 경로)**:
```
User input
  → callGemini()
      → classifyInput()        # C9
      → red ? return routeCrisis()
      → getClient()            # C2 (Vertex when configured)
      → models.generateContent()
      → classifyInput(output)  # output zone
      → insertAiAuditLog()     # C3
  ← GeminiResult { text, safety, audit }
```

**RAG**: `sources`(8 kind) → `wiki_pages`(source/entity/concept) → `wiki_links`(`[[wikilink]]`
엣지). 세컨비는 `exportUserWiki` 로 RAG context 번들을 만들어 `callGemini(purpose=
'jarvis_chat')` 에 주입. mock LLM 모드로 Gemini 연결 없이 full UX exercisable.

**별 측정**: `brightness.ts`(L1~L5) · `stars.ts`(7별 + `soulCoreBrightness` 종합) ·
`star-levels.ts`(카드별 산출) · `load-star-levels.ts`(홈 마운트, LLM-free).

검증 게이트: `npm run verify` = lint + type-check + i18n + lexicon + legal-review + LLM
boundary + constraints + emdash + anti-anthro + mascot-voice + jest. push 전 필수.

---

## 13. 수익화 (Monetization v2 · 2026-06-10 확정)

- **Core 영구 무료** + local Markdown + 기본 reflection. 게이트는 *AI 사용 한도만*. "내 생각을
  저장하려면 매달 돈 내라" 금지. **어떤 티어도 더 좋은 답을 주지 않는다** — 답변 품질 전원 동일,
  티어는 횟수·기능·히스토리 보관 기간으로만 차등.
- **티어 / 일일 세컨비 한도**: Free 2 · Soma 30 · Cortex 80 · Brain 250 (SoT =
  `src/lib/chat/limits.ts`). 위기 라우팅 turn 미차감.
- **가격**: 월 ₩4,900/9,900/19,900 · 연간 = 월×10(2개월 무료) · Soma 평생 ₩99,000. SoT =
  `src/lib/progression/pricing.ts`. `FORCE_TIER` off 전 결제 비활성.
- **오픈**: 별자리 방향에 맞춰 티어를 **별 테마 명칭**(별바라기 무료 · 항해자 · 북극성)으로
  개명할지 — `CONCEPT-BRIEF.md` 에 스케치됨, 가격·명칭 확정은 Simon (§17).
- **미결 (M3)**: Apple/Google IAP + Small Business Program(15%) 우선, KR 외부 PG 후순위 +
  PPP. 스토어 IAP 등록·SBP 가입·KR PG 실계약 미결.

---

## 14. Go-To-Market (요약 · 정본 `docs/GTM.md`)

- **메시지 Primary**: "Your data. Your patterns. Your private laboratory. AI enters only when
  you invite it."
- **바이럴 훅**: 아침 한 줄 브리핑(vault 기반 30초 opt-in) · future-self 과거형 기록 · "패턴으로
  나를 업그레이드".
- **절대 피할 표현**: "AI가 당신을 학습/기억/이해", "second brain 이 다 해결" (creepy·agency
  offload 거부).
- **가드레일**: forbidden lexicon 준수, gamification 최소("witness has no streak"), ownership +
  progressive disclosure. (별 점등 = 진척이되 streak/badge 가 아님.)

---

## 15. 마일스톤 · 로드맵 (→ 2026-08-17)

현재(2026-06-25) 라이브: Gemini 실연동(chat + clipper 분류, 2026-06-01 확인), 별자리 홈(실
밝기 연결 #564), RAG ingest + 세컨비(Analytic/Divergent), 7별·밝기 측정 시스템, 14–17 자가동의
가입(prod 0028–0033), 수익화 v2 가격 정의.

| 단계 | 범위 | 상태 |
|---|---|---|
| **M-migrate** (이번 1순위) | **core→별자리 정합** — 마을 그래프·`/core-brain`·`/trinity` 폐기, 북극성 개명(Soul Core 라벨 제거), 별→기능 진입 재배치, `CONCEPT.md`·`VISION.md`·`CLAUDE.md`(Visual Tier)·`constellation-home.ts` 라벨 갱신, v3 tesseract 아트 트랙 종료 | 신규 |
| M-now | 세 축 end-to-end(별자리 기준) + 강제 조항 green | 진행 |
| M-RAG | Phase1(요약 + 4 reflection Q + auto-tag) · Phase2(entity/concept 추출) | 진행 |
| M-stars | '리듬'(stub→shipped) · '가치의 나'(partial→shipped). '보여지는 나'·'될 수 있는 나'는 자리만 두고 후순위 | 예정 |
| M-auth | OAuth Kakao/Naver Edge Functions | 예정 |
| M-pay | 결제 실활성화 (스토어 IAP/SBP/KR PG) — Simon 결정 후 | 미결 |
| M-submit | XPRIZE 제출 패키지 (에셋 공시 C12, 심사자 모드 C6, SLA C11, README) | 예정 |
| M-store | App Store / Play Store 제출 | 예정 |

---

## 16. 리스크 · 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **방향 전환 미반영** (문서·코드가 구 core 모델 유지) | 에이전트·사람 혼선, 회귀 | M-migrate 1순위 + 이 PRD 가 새 정본 선언(§0). 내부 키만 잔존, 표면 제거 |
| 어휘 정책 위반(임상어 유입) | 카테고리 포지셔닝·심사 | `check:lexicon` CI 차단(docs 포함) + 단일 lexicon SoT |
| 안전 분류 우회 | 사용자 위해·치명 | C9 상시·우회불가, jest 호출순서 단언, Divergent 동일 경로 |
| 비-KR 연령 게이트 미비 | 컴플라이언스(US/EU) | KR 룰 전 사용자 게이트 + country 신호 후속(값은 존재) |
| Android 런타임 크래시 | 빌드·데모 실패 | `ANDROID_QA_GUIDELINES.md` 강제 (별자리 raster + SVG 별 렌더 주의) |
| 별 메타포 한계(프로크루스테스 침대) | 자기이해 왜곡 | 7별은 증거축(고정 5분류 아님), absent 별은 빈 자리로 정직하게 노출 |
| 결제 미결 | 수익화 시연 공백 | 가격·티어 확정 유지, FORCE_TIER off 전 비활성(제출 무영향) |
| Gemini 비용/쿼터 | 운영비·$0/mo 약속 | 일일 한도(티어), mock 모드, 위기 turn 미차감 |
| 솔로 빌드 시간(야간·주말) | 일정 | 엔진 단위 분해, worktree 격리, draft-PR + CI 자동화 |

---

## 17. 오픈 퀘스천

- 티어 명칭을 별 테마(별바라기/항해자/북극성)로 개명할지 + M3 결제 실계약 — Simon.
- 채널 예산·런치일, 신뢰 인증(SOC2 등, M5) — Simon.
- country/jurisdiction 신호 도입 시점(비-KR 정밀 연령 게이트 활성 조건).
- 북극성 탭의 1차 목적지: 종합 뷰 우선 vs 세컨비 우선 (UX 디테일, M-migrate 에서 확정).
- '보여지는 나'(360 peer) 성인 한정 출시 시점.

---

## 18. 부록 — 용어 · 매핑 · 폐기

- **별자리** = 북극성(Polaris, 7별 종합 길잡이) + 북두칠성 7별(자기이해 렌즈) + cyan Pattern
  Link. SoT 자산 `constellation-home.ts`.
- **7별** = now/recall/seen/rhythm/relational/possible/values (`stars.ts`). **밝기 L1~L5**
  (`brightness.ts`). **북극성 종합** `soulCoreBrightness`(내부 키 유지, 표시명 "북극성").
- **propose→ratify** = AI 제안 → 사용자 승인만 쓰기 (`proposal.ts`).
- **내부 키 잔존(표면 금지)**: work/relation/knowledge/records/taste 는 데이터 태그로만 유지.
- **폐기 목록**: Soul Core 명칭 · 5 Pattern Core · Pattern Tesseract · 마을 그래프(`/graph`) ·
  `/core-brain` · Brain Trinity(`/trinity`) · v3 tesseract 아트 · Visual Tier 노드명 (§4.7).
- **강제 조항 → 코드 맵**: `docs/ARCHITECTURE.md` "Hard Constraint to Code Map".
