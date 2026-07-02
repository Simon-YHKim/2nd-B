# PRD — 2nd-Brain (상세)

> Product Requirements Document. 제품의 "무엇을·누구를 위해·어떤 기준으로" 를 한 곳에 모은
> 단일 진입점. 구현 세부는 `docs/ARCHITECTURE.md`, 강제 조항은 `docs/CONSTRAINTS.md`,
> 별자리 모델 상세 설계는 `docs/CONSTELLATION-DESIGN.md`.

| 항목 | 값 |
|---|---|
| Status | Draft v3 (2026-06-25 별자리 3-레이어 정본화) |
| Owner | Simon Kim (solo build) |
| Last updated | 2026-06-25 |
| Deadline | 2026-08-17 06:00 KST (Build with Gemini XPRIZE 제출) |
| Track | XPRIZE — Education & Human Potential |

> ## 0. ⚠️ 방향 전환 (2026-06-25, Simon 결정 → 설계 완료)
>
> 이 PRD 는 **"core" 세계관 폐기 + 별자리 단일 모델**을 정본화한다. 핵심 두 결정:
>
> 1. **core 폐기** — Soul Core 중심의 **5 Pattern Core** 계층(Bond/Wisdom/Narrative/Muse/
>    Growth + Pattern Tesseract + 마을 그래프 + `/core-brain`)을 디자인·세계관에서 제거.
>    세계관은 **별자리(북극성 + 북두칠성 7별)** 하나로 단일화. 북극성은 "7별을 종합하는 길잡이
>    별" 로 유지하되 **'Soul Core' 명칭은 뗀다**.
> 2. **별자리 단일 홈** — 별자리 화면이 유일한 홈/네비게이션. 별을 탭하면 해당 도메인/기능으로
>    진입. 기존 4탭 셸·마을 그래프·`/core-brain` 은 폐기하되 담기·세컨비·검사·위키·설정 등
>    **기능은 별/북극성 하위 진입점으로 재배치해 보존**한다.
>
> **3-레이어로 설계 확정 (이 PRD §4; 상세 = `docs/CONSTELLATION-DESIGN.md` §1~§5):** 7별의 두 정의 충돌
> ("심리구인 7축" vs "삶의 도메인 7개")을 해소 — **7별 = 입력 도메인(레이어 A)**, 기존 심리구인은
> 버리지 않고 **북극성 출력의 검증 레이어(레이어 B)** 로 이동, **북극성 = 종합 출력(레이어 C)**.
>
> **문서·코드 부채 (이 전환이 아직 코드에 미반영, §15·§16):** `docs/CONCEPT.md`·`docs/VISION.md`·
> `CLAUDE.md`(Visual Tier System)·`src/lib/assets/constellation-home.ts`(아직 북극성을 "Soul
> Core" 로 라벨), 마을 그래프 코드, `/core-brain` 라우트, `chat/personas.ts` 캐릭터 보이스는
> 여전히 구 모델을 담고 있다. 이 PRD 가 충돌 시 **새 정본**이며, 그들은 이 방향으로 갱신된다
> (마이그레이션 §15 M-migrate).

---

## 1. 한 줄 요약

**AI 시대, 가장 가치있는 자산은 "나 자신" 이다.** 2nd-Brain 은 나에 대한 데이터를 *축적* 하고,
그 위에서 작동하는 *개인 비서로 키우며*, 떠오른 공상을 *나와 같은 결로 구체화* 하는 local-first
개인 플랫폼이다. 임상·의료 카테고리의 앱이 아니라 **나라는 자산을 만드는 생산 도구** 다.

포지셔닝(1줄, GTM 정본): *"당신의 생각, 당신의 Markdown, 당신의 private lab. AI는 당신이
부를 때만 들어옵니다. local-first, 영원히 당신 것."*

추상적인 "자기 이해" 를 **밤하늘** 이라는 단일 은유로 만진다 — 삶의 도메인 별이 밝아질수록 북극성
(종합된 나)이 더 또렷해진다.

---

## 2. 문제와 기회

- **문제**: 생성형 AI 는 누구에게나 같은 답을 준다. 모두가 같은 도구를 쓰는 순간 차별화 자산은
  도구가 아니라 그 도구에 들어가는 입력 — 나의 데이터·취향·맥락·패턴 — 인데, 정작 그 "나" 는
  카톡·메모·사진·머릿속에 흩어져 어디에도 구조화돼 있지 않다.
- **기회**: 쉬운 삶 데이터(도메인)를 받아 모으고, 검증된 심리학 틀로 그 데이터를 **근거로 받쳐**
  RAG 위에서 나에게 맞춰 응답하는 개인 비서를 만든다. 데이터는 사용자 소유의 Markdown 으로 영구
  보관(local-first) — "100년 뒤에도 읽힌다." 차별점 = **삶 데이터 → 검증된 나의 초상** (단순
  인생 대시보드가 아니다).
- **타이밍**: 구독 피로 + 클라우드 lock-in 거부감이 강한 PKM·자기성찰 사용자층이 "AI 는 도구,
  주체는 나" 프레임을 적극적으로 찾고 있다 (GTM 신호, 4개+ 독립 출처 교차검증).

---

## 3. 비전 · 세 축 (제품 기둥)

모든 기능·화면·PR 은 아래 세 축 중 하나에 명시적으로 속한다.

| # | 축 | 정의 | 별자리에서의 위치 |
|---|---|---|---|
| 1 | **알아가기** (자기 데이터 축적) | 삶의 도메인 입력 + 일상 기록 + LLM 인터뷰로 나에 대한 데이터를 모은다 | 7 도메인 별 점등 (각 도메인 밝기 상승) + 담기 |
| 2 | **개인 비서 기반** (RAG 위 vibe) | 축적된 데이터 위에서 나에게 맞춰 작동하는 AI '세컨비' | 북극성 진입 → 세컨비 (7 도메인·검증틀·북극성 근거로 응답) |
| 3 | **공상 → 구체화** (미래의 나) | 떠오른 아이디어·꿈을 나와 같은 결로 펼치고 다음 한 걸음으로 떨군다 | 세컨비 Divergent 모드 + 북극성 propose→ratify (미래 페르소나) |

축의 관계: **알아가기**(도메인 별 점등·밝기 상승) → **개인 비서**(밝기·도메인·검증틀 근거로 세컨비
응답) → **공상→구체화**(미래 페르소나 + 다음 한 걸음).

---

## 4. 정본 개념 모델 — 별자리 (3-레이어)

정본 방향은 **deep-space 별자리**. 별자리 홈이 단일 canonical 앱 본체다(캐릭터 보이스는 폐기,
§4.8). 픽셀아트·게임보이 스타일 금지. **상세 설계 SoT = `docs/CONSTELLATION-DESIGN.md` §1~§5**
(이 절은 그 요약).
SoT 자산/좌표: `src/lib/assets/constellation-home.ts`.

밤하늘 단일 은유는 3개 레이어로 작동한다:

```
A 입력   7 도메인 별 (홈에 보이는 별) — 커리어·재정·성장·관계·건강·휴식·담아내기
   ↓        쉬운 삶 데이터를 넣는 곳. 각 별: 입력 → 출력 + 리스트업
B 검증   심리구인 (홈에 안 보임. 추론·근거 레이어)
   ↓        기존 stars.ts 7축을 "별"에서 "검증틀"로 재분류. 도메인 데이터로 삼각측량
C 출력   북극성 — 7별 종합 → 실시간 페르소나(역할/모자) + 강점 요약. propose→ratify로만 변경
```

**왜 3-레이어인가 (차별점).** 레이어 A만 있으면 "인생 대시보드"다. 레이어 B(검증된 구인틀, C8
큐레이터)가 도메인 데이터를 근거로 받쳐줘야 레이어 C가 **검증된 나의 초상**이 된다.

### 4.1 별자리 구성

밤하늘 단일 은유. 두 요소 + 링크로만 구성된다 (그 외 노드 없음).

| 요소 | 정체 | 역할 |
|---|---|---|
| **북극성 (Polaris)** | 7 도메인 별을 종합하는 길잡이 별. 항상 가장 밝고 지배적 | 레이어 C 출력. 종합 readout + 세컨비 진입 (내부 키 `soulCoreBrightness` 유지, 표시명 "북극성") |
| **북두칠성 7별 (Big Dipper)** | 7개 삶의 도메인 (§4.2). 각자 엔진 + L1~L5 밝기 | 레이어 A 입력. 탭 → 해당 도메인 진입 |
| **Pattern Link** | 별을 잇는 cyan 엣지 (Big Dipper 형태 + 포인터 2별→북극성) | 전부 cyan 단색. 시각적으로 후퇴 |

> **시각 위계 (구 Visual Tier System 대체)**: 북극성(지배·최대 밝기) > 북두칠성 7 도메인 별
> (겉보기 등급 baseline × 도메인 밝기 L1~L5) > cyan 링크(후퇴). 구 "Soul Core 128px / Pattern
> Core×5 82px / snowflake / crystal" 노드명은 **폐기**(§4.8). 위계 *원칙*(하나의 지배 + 하위
> 후퇴)은 계승, *이름* 은 별자리 용어로.

### 4.2 레이어 A — 7 도메인 별 (입력)

SoT: 신규 `DOMAIN_STARS` (Phase 4). 각 별은 4-슬롯 계약을 갖는다 — **입력**(어디서·어떻게) ·
**출력**(조언/요약) · **리스트업**(편집 가능 + 카테고리 + 태그 = 종합의 깊이가 나오는 substrate) ·
**검증 피드**(레이어 B 중 어떤 구인에 기여하나). 모든 입력은 PIPA·어휘정책 준수, 모든 LLM 출력은
C9→C3→`gemini.ts`.

| # | 도메인 별 | 입력(현실경로) | 기존 자산 (재사용) | 신규 |
|---|---|---|---|---|
| 1 | **커리어** | 프로젝트·이력·업무스타일 (수동 + GitHub) | `projects/github.ts` | 이력·스타일 폼 |
| 2 | **재정** | 자산·현금흐름·목표 (수동 먼저, 연동 후순위) | `finance/ledger.ts`·`fx.ts` | (수동 유지) |
| 3 | **성장** (옛 회상) | 연령대별 패턴 deep drill (AI 인터뷰) | `interview/probe.ts` | 연령 타임라인 |
| 4 | **관계** | 대상별 생각·지향 (수동 + 카톡/문자/연락처 import + Slack) | `import/kakao.ts`·`sms.ts` | peer2peer 폼 |
| 5 | **건강** | 컨디션·생활습관 자기기록 (헬스 import + 수동) | `import/health-export.ts` | Kakao/Naver Places 안내 |
| 6 | **휴식** | 취미·독서·경험 기록 | `reading/books.ts` | 취미 폼 |
| 7 | **담아내기** | catch-all: 6별 못 담은 것 + 계속 추가 메모 | `import/detect.ts`·capture/wiki | catch-all 라우팅 |

담아내기(7번째 별)는 라우팅 메타 별 — 무차별 흡수 → `detect.ts` 분류 시 도메인 이동 *제안*
(propose→ratify, 민감·모호는 raw 유지) → 태깅된 항목은 목적지 도메인 밝기에 보조 증거로 기여
(상세 `CONSTELLATION-DESIGN.md` §5.1).

### 4.3 레이어 B — 검증틀 (심리구인, 홈에 안 보임)

SoT: `src/lib/persona/stars.ts` (`SELF_UNDERSTANDING_STARS`) — **기존 7축을 "별"에서 "북극성
출력의 검증·추론 레이어"로 재분류**. 각 구인은 (1) 검증 측정도구 1개(고신뢰)와 (2) 복수 도메인의
행동 보강(저신뢰 교차근거)으로 추정. 둘이 일치하면 `crossSourceAgreement` → 한 tier 상승.

| 구인 | 1차 측정도구 | 보강 도메인 (삼각측량) | 엔진 |
|---|---|---|---|
| 성실성 (Big Five C) | BFI-44 | 커리어·재정·건강·담아내기 | `persona/bfi.ts` |
| 개방성 (Big Five O) | BFI-44 | 휴식·담아내기·성장 | `persona/bfi.ts` |
| 외향성 (Big Five E) | BFI-44 | 관계·휴식 | `persona/bfi.ts` |
| 우호성 (Big Five A) | BFI-44 | 관계 | `persona/bfi.ts` |
| 정서 반응성 (Big Five) | BFI-44 | 리듬(감정 톤 변동) | `persona/bfi.ts` |
| 애착 (불안/회피) | ECR-S | 관계 (도메인 앵커) | `persona/attachment.ts` |
| 내러티브 정체성 | 인터뷰 코딩 | 성장 (도메인 앵커) | `interview/probe.ts` |
| SDT 자율·유능·관계 | 간이 척도 | 커리어·재정·관계 | `audit` sdt:* 태그 |
| VIA 강점 | 강점 태깅 | 전역 (sdt:*/via:* 태그) | `audit` via:* 태그 |
| 가능자아 | 서술 | 성장 궤적 + 북극성 Divergent | new |

설계 통찰: 성실성은 3~4 도메인이 동시에 보강 → 단일 측정보다 강건. **삶 도메인 행동이 구인을
삼각측량**하는 것이 2-레이어의 수학적 이점. 신뢰도 게이트: 구인 레벨이 페르소나 주장 세기를
통제(< L3이면 "잠정" 라벨).

### 4.4 레이어 C — 북극성 (출력)

북극성은 직접 입력을 받지 않고 7 도메인 별을 종합한다. 4단계: ① 결정론적 도메인 요약(LLM-free)
→ ② 구인 추정(레이어 B) → ③ `callGemini(purpose='persona_synthesis')` 페르소나 종합 →
④ propose→ratify 사용자 승인.

- **페르소나 = 역할/모자 (여럿)**: 단일 라벨 아님. 각 페르소나는 어떤 도메인 + 어떤 구인이
  받치는지 근거를 달고 나온다(C8). 안정성 규칙 — 매번 새로 만들지 않고 prior 대비 diff만 제안
  (상세 `CONSTELLATION-DESIGN.md` §3.3).
- **밝기 정직성 (핵심 규칙)**: 홈의 별 빛 = "내가 얼마나 넣었나"(도메인 커버리지). 페르소나 주장
  세기 = "얼마나 검증됐나"(숨은 구인 신뢰도). 둘을 섞지 않는다.
- **북극성 헤드라인 밝기** = 7 도메인 별 밝기 평균 + 전별점등 보너스(+0.05). `soulCoreBrightness`
  (`stars.ts`) 그대로 재사용, 입력 의미만 도메인축으로. 결정론적·LLM-free. 내부 키 유지(회귀
  위험), 표시명 "북극성". **설계 원칙** — 7 도메인에 고르게 분포된 밝기가 한 도메인만 치솟은
  스파이크보다 우선한다(너비 > 깊이, 안정성·정직성).

### 4.5 L1~L5 밝기 사다리 (DIKW)

하나의 서수 척도가 **밝기 = 데이터 품질 = 출처 신뢰도 = 인터뷰 드릴 정지레벨** 을 동시에 의미.
L1 꺼짐 · L2 Data · L3 Information · L4 Knowledge · L5 Wisdom. `src/lib/persona/brightness.ts`
(`ladderLevel`/`brightnessFraction`, 20~100%). v1 산정 = ①커버리지 + ②내적일관성(③교차검증은
거의 공짜, ④최신성은 v1.1). 신규 `domainConfidence(entries)` 어댑터가 도메인 항목수를 기존
`brightness.ts` 체인에 잇는다.

### 4.6 propose → ratify (핵심 신뢰 장치)

AI 는 자기모델을 **직접 바꾸지 못한다.** `SelfModelProposal` diff 를 제안(`propose-self-model.ts`,
C9→C3→`gemini.ts`)하고, **사용자 승인**(페르소나별)만이 L5 확정(`proposal.ts::applyRatify`)을
만든다. AI 가 멋대로 "너는 이런 사람" 이라 못 박지 않는다.

### 4.7 공상 = 장소가 아니라 세컨비 대화 모드

- **Analytic 모드** — 사용자 data 기반 분석/조언.
- **Divergent 모드** — data 기반이되 전혀 다른 관점에서 새 가능성 탐색. UI에 "새로운 관점/가정"
  라벨.
- 두 모드 모두 예외 없이 **C9(classifyInput) → C3(ai_audit_log) → `gemini.ts`** 경로. 공상이
  안전 분류를 우회하는 통로가 되어서는 안 된다.

### 4.8 폐기 (Deprecated / Legacy)

롤백 스킨 `EXPO_PUBLIC_UI=legacy` + git history 로만 보존:

| 폐기 대상 | 비고 |
|---|---|
| **Soul Core** (명칭) | 북극성으로 개명. 종합 readout 역할만 계승 |
| **5 Pattern Core** + **Pattern Tesseract** | 세계관·디자인에서 제거 |
| **마을 그래프** (`/graph`) | 별자리 홈으로 대체 |
| **`/core-brain`** 화면 | 북극성 종합 뷰로 흡수 |
| **Brain Trinity** (`/trinity`) | 이미 legacy |
| **v3 tesseract 아트 트랙** | Pattern Core 전제라 폐기. 별자리 raster 가 정본 |
| **Visual Tier System 노드명** (128/82px, snowflake, crystal) | §4.1 별자리 위계로 대체 |
| **캐릭터 보이스** (아치·가디·루루·모모·루미, `chat/personas.ts`) | 옛 5 내부 도메인 키에 결속 → 폐기/축소(§17-j). `systemHint`만 Divergent 컬러링에 잔존 가능 |
| 내부 도메인 키 (work/relation/knowledge/records/taste) | **데이터 레이어에선 잔존**(회귀 안전, 태그). 디자인·세계관 표면 노출 금지 |

> **주의 — 레이어 A 도메인 ≠ 내부 키.** 새 7 도메인(커리어·재정·성장·관계·건강·휴식·담아내기)은
> 표면 모델이고, 잔존하는 내부 키(work/relation/...)는 데이터 태그일 뿐 1:1 매핑이 아니다.

---

## 5. 목표 · 비목표

### 5.1 목표 (~2026-08-17)

1. **별자리 단일 홈** 으로 세 축이 한 흐름으로 동작하는 end-to-end 제품 라이브 시연 (도메인 입력 →
   별 점등·밝기 상승 → 북극성/세컨비가 그 근거를 인용).
2. core→별자리 마이그레이션 완료 (마을 그래프·`/core-brain` 폐기, 북극성 개명, 7 도메인 별 진입점
   재배치, 레이어 B 검증 이관, 정본 문서·코드 정합 — §15).
3. 12개 강제 조항(C1~C12) 코드·스키마·CI 100% 유지.
4. KR-first 출시 (한국어 고품질 + 관대한 무료 티어), XPRIZE 제출 요건 충족.

### 5.2 비목표 (이번 사이클)

- 임상·의료 성격의 기능 일체 (카테고리 자체가 비목표 — 어휘 정책 §11 로 강제). 건강 별은
  생활습관·컨디션 자기기록까지만(§11, 의료선).
- 비-KR 관할 정밀 연령 게이트 (US COPPA <13, EU GDPR Art.8) — country 신호 + 법률 검토 후속.
- 결제 실활성화 (가격·티어 확정, 스토어 IAP/SBP/KR PG 실계약 미결).
- 재정 도메인 계좌·카드 연동 (오픈뱅킹급 민감 — 수동입력으로 시작, 연동은 XPRIZE 이후).
- 레이어 B 풀 구현: '보여지는 나'(360 peer 타인평정)·'될 수 있는 나'(가능자아) 구인은 자리만 두고
  후순위(absent). 관계 별의 제3자 분석은 §11 프라이버시 계약 내에서만.

---

## 6. 성공 지표 (KPI · 제안값 — 검증 대상)

| 축 / 영역 | 지표 | 제안 목표 |
|---|---|---|
| 활성화 | 첫 세션 내 1개 이상 도메인 입력/기록 완료율 | ≥ 60% |
| 알아가기 | 가입 후 7일 내 7 도메인 별 중 ≥ 3개 점등(L2+) | ≥ 40% |
| 축적 | 사용자당 누적 Log(sources/records), 7일/30일 | 7일 ≥ 5 · 30일 ≥ 20 |
| 개인 비서 | 세컨비 turn 중 RAG 근거(위키/도메인/구인) 인용 비율 | ≥ 70% |
| 별자리 | 북극성 밝기 중앙값 (가입 후 30일) | 추적·보정 |
| 리텐션 | D7 / D30 재방문 | D7 ≥ 30% · D30 ≥ 15% |
| 데이터 주권 | 위키 export(MD/JSON) 사용률 | 추적 |
| 안전 | red-zone 입력 LLM 우회 0건 (C9), 핫라인 라우팅 정확도 | 100% / 100% |
| XPRIZE | 강제 조항 CI green, 심사자 모드 무제한 | 100% |

---

## 7. 타깃 사용자 · 페르소나

획득 우선순위 (GTM §3): (1) Obsidian/PKM 커뮤니티 — local-first + AI optional. (2) Stoic/
자기성찰 실천가 — morning/evening review. (3) KR 자가구축 빌더 — "내가 정의한 온톨로지" 주도권.
(4) ADHD/외부화 커뮤니티 — second-brain 실용성.

연령 티어(C10): 성인(≥18) · 자가동의 미성년(14–17) 직접 가입 / 14세 미만 보호자 검증 필요
(`pending_guardian_consent`).

---

## 8. 기능 요구사항

### 8.1 7개 엔진 (책임 단위)

| # | 엔진 | 책임 | 상태(2026-06-25) |
|---|---|---|---|
| 1 | Capture | 일상 기록, 자유 메모, 시기 회고 Q&A, 5-mode 자재 반입 | 라이브 |
| 2 | Inference | 도메인 요약 → 밝기 산출 + 레이어 B 구인 추정 + 북극성 종합 | 라이브 (도메인 어댑터·종합 신규) |
| 3 | Memory (RAG) | 위키 ingest + Claude/ChatGPT 호환 MD/JSON export | 라이브 (Phase1/2 보강 진행) |
| 4 | Advisor | 검증된 심리학에 ground 된 토글 모드 가이드 | 진행 |
| 5 | Planner | 성향 보정 액션 플랜 + 리마인더 | v1.1 (비목표) |
| 6 | Curator | 사람이 검증한 참조 문헌 (C8 provenance) | 진행 |
| 7 | Safety Classifier | green/yellow/red 라우팅. 상시·우회불가 | 라이브 (C9) |

### 8.2 별자리 홈 (유일한 홈)

- 화면 = 밤하늘. 북극성 + 북두칠성 7 도메인 별 + cyan 링크. 자산 = `constellation-home.ts`
  (landscape/mobile/card 3종, 별 좌표는 자산별 정규화 x/y).
- 각 별의 밝기 = 그 도메인의 L1~L5 (마운트 시 `load-star-levels.ts` 로 Gemini 없이 표시).
- **정보 밀도 원칙** (Simon 표준): 화면당 메시지 하나 + 그래픽 하나. 별자리 자체가 설명이다.
- **터치 규칙** (O-7): 한 번의 탭은 화면을 *단순화* 한다 — 별 탭 → 화면 전환(또는 바텀시트)으로
  드릴다운. 노드 위 겹치는 모달 금지. Back 은 한 곳(별자리 홈 = back-stack root).

### 8.3 도메인 별 → 기능 매핑 (새 네비게이션)

별을 탭하면 그 도메인의 상세(현재 밝기·근거·입력 어포던스·"이 별을 키우는 것")로 진입한다. 검증
측정도구(big-five/attachment/esm)는 레이어 B 진입점으로, 해당 도메인 하위 또는 북극성 종합에서
도달한다.

| 도메인 별 | 진입 기능 / 라우트 | 레이어 B 측정도구(보조 진입) | 상태 |
|---|---|---|---|
| 커리어 | 이력·스타일·프로젝트 (수동 + `projects/github.ts`) | (성실성·VIA → BFI `/big-five`) | 자산 일부 |
| 재정 | 가계부 `finance/ledger.ts` + FX | (SDT 자율) | shipped(수동) |
| 성장 | 심층 인터뷰 `/interview` (연령대 drill) · 과거의 나 `/audit` | 내러티브 코딩 | shipped |
| 관계 | peer2peer + 카톡/문자/연락처 import | 애착 `/attachment` (ECR-S) | shipped(애착) |
| 건강 | 헬스 import + 생활습관 수동 + Places 안내 | (SDT 신체 자율) | 자산 일부 |
| 휴식 | 취미·독서 `reading/books.ts` | (개방성 → BFI) | shipped(독서) |
| 담아내기 | 담기 `/capture` detect 라우팅 (catch-all) | (교차 태그) | 라이브 |
| (레이어 B 공통) | 순간기록 `/esm` (리듬) · 참고 MBTI `/mbti`(비검증·보조) | | stub/보조 |

### 8.4 북극성 → 종합 / 세컨비

- 북극성 탭 → **종합 뷰**: 북극성 밝기% + 켜진 도메인 별 요약 + 페르소나(역할/모자) 제안(구
  `/persona`·`/core-brain` 역할 흡수), 그리고 **세컨비** `/secondb` 진입 — RAG-backed chat.
  상단 일일 사용량 미터. **Analytic / Divergent** 모드 토글. 모든 turn 이 `callGemini`(C9→C3)
  경유. 위기 라우팅 turn 은 quota 미차감.
- 세컨비는 wiki 스냅샷 + **별자리 맥락**(7 도메인 요약 + 레이어 B 구인 추정 + 북극성 밝기,
  `exportConstellationContext` 신규)을 `<UNTRUSTED>` 펜스로 주입받아 응답. 페르소나 변경은 트렌드
  제안 → propose→ratify (비준은 쿼터 미차감).
- "통찰" `/insights` · "참조 문헌" `/research` (RAG ground 출처, C8)는 북극성 종합 뷰 하위 보조
  surface 로 재배치.

### 8.5 상시 진입점 (별이 아닌 것)

- **담기** `/capture` — 모든 입력 단일 진입(메모·일기/링크·스크랩/이미지·OCR/문서). 담아내기 별의
  착지점이자 7 도메인 전체로 흘러가는 입구. 일기 모드는 streak·성찰질문 흡수, records 저장 + C9
  crisis. 별자리 홈에서 상시 접근(떠 있는 입력 어포던스).
- **받은항목/위키** `/inbox` · `/wiki` — 반입 sources → 위키 페이지(태그·백링크). 북극성 종합
  또는 담기에서 진입.
- **설정** `/settings` (계정/요금제/개인정보/권한/데이터/테마/지원/운영진단) — 코너 유틸 진입.

### 8.6 인증·시스템 + 4-state

- `(auth)/sign-in` · `sign-up`(birth_date, C10) · `/complete-profile` · `/onboarding`(+ 4W1H
  기초입력 seed, 강제 아님). 가입 후 별자리 홈으로. 하드웨어 Back 은 별자리 홈으로 복귀.
- 모든 핵심 화면은 empty/loading/error/filled 4상태 정의·구현 (`docs/ui-audit/
  SCREEN_TREE_SPEC.md` 가 동작 정본).

---

## 9. 정보 구조 (IA) — 별자리 단일 홈

별자리(`/`)가 유일한 홈/네비게이션. 구 4탭 셸·마을 그래프·`/core-brain` 폐기. 모든 기능은 도메인
별/북극성/상시 진입점 하위로 도달. 기존 라우트 처분:

| 처분 | 라우트 |
|---|---|
| **KEEP — 도메인 별 진입** | 커리어/재정/성장(`/interview`·`/audit`)/관계/건강/휴식/담아내기(`/capture`) |
| **KEEP — 레이어 B 측정도구** | `/big-five` · `/mbti`(보조) · `/attachment` · `/esm` |
| **KEEP — 북극성 종합 하위** | `/secondb`(세컨비, Analytic/Divergent) · `/persona` · `/insights` · `/research` |
| **KEEP — 상시/유틸** | `/inbox` · `/wiki` · `/settings`(+계정/요금제/개인정보/권한/데이터/테마/지원/운영진단) |
| **KEEP — 인증/시스템** | `(auth)/*` · `/onboarding` · `/complete-profile` · `/+not-found` |
| **DEPRECATE** | `/graph`(마을) · `/core-brain` · `/trinity` · `/journal`(→`/capture` redirect) · 구 `/imagine`(→세컨비 Divergent redirect, vestigial) |

원칙: 한 라우트는 한 가지 일만 한다. 떠 있는 화면 없음. 입력은 "담기" 단일 진입. Deep-link 직접
로드는 유지(라우트는 존재, 홈만 별자리).

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
- **건강 도메인 의료선**: 생활습관·컨디션 자기기록까지만. 검진결과 해석·진단·의료성 조언 = 범위
  밖. Kakao/Naver Places 는 "가까운 전문가/기관 안내" 길안내 프레이밍(비임상).
- **관계 도메인 제3자**: 실명 타인은 수동입력·import만, 온디바이스 보관, RAG/Gemini 전 익명화
  (이름→토큰). 구인 추정은 "내 관계방식"만 — named 타인 프로파일링 금지 (PIPA 제3자).
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

**LLM 하네스 (모델별 사용)**: 단일 래퍼 + purpose 라우팅. `PURPOSE_TIER`(`llm/types.ts`)가
purpose→tier(lite 분류 / flash 인터랙티브 / pro 추론). 북극성 종합 = 신규 purpose
`persona_synthesis`(v1 flash, §17-f) + `PERSONA_SYNTHESIS_SCHEMA`(구조화 출력) + 프롬프트빌더/
방어적파서 패턴 재사용. mock 모드로 Gemini 없이 full UX exercisable.

**RAG**: `sources`(8 kind) → `wiki_pages`(source/entity/concept) → `wiki_links`(`[[wikilink]]`
엣지). 세컨비는 `exportUserWiki` + `exportConstellationContext`(신규)로 RAG context 번들을 만들어
`callGemini(purpose='secondb_chat')` 에 주입.

**별 측정**: `brightness.ts`(L1~L5) · `domainConfidence`(신규 어댑터, 도메인 항목수→밴드) ·
`stars.ts`(`soulCoreBrightness` 도메인 입력 종합) · `load-star-levels.ts`(홈 마운트, LLM-free).
**레이어 B**: 도메인→구인 삼각측량 + `crossSourceAgreement`. **종합**: `persona_synthesis` →
`SelfModelProposal[]` → propose→ratify.

검증 게이트: `npm run verify` = lint + type-check + i18n + lexicon + legal-review + LLM
boundary + constraints + emdash + anti-anthro + mascot-voice + jest. push 전 필수.

---

## 13. 수익화 (Monetization v2 · 2026-06-10 확정)

- **Core 영구 무료** + local Markdown + 기본 reflection. 게이트는 *AI 사용 한도만*. "내 생각을
  저장하려면 매달 돈 내라" 금지. **어떤 티어도 더 좋은 답을 주지 않는다** — 답변 품질 전원 동일,
  티어는 횟수·기능·히스토리 보관 기간으로만 차등.
- **티어 / 일일 세컨비 한도**: Free 2 · Soma 30 · Cortex 80 · Brain 250 (SoT =
  `src/lib/chat/limits.ts`). 위기 라우팅 turn 미차감. 페르소나 비준(propose→ratify) 미차감.
- **가격**: 월 ₩4,900/9,900/19,900 · 연간 = 월×10(2개월 무료) · Soma 평생 ₩99,000. SoT =
  `src/lib/progression/pricing.ts`. `FORCE_TIER` off 전 결제 비활성.
- **오픈**: 별자리 방향에 맞춰 티어를 **별 테마 명칭**(별바라기 무료 · 항해자 · 북극성)으로
  개명할지 — 가격·명칭 확정은 Simon (§17).
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
  progressive disclosure. (도메인 별 점등 = 진척이되 streak/badge 가 아님.)

---

## 15. 마일스톤 · 로드맵 (→ 2026-08-17)

현재(2026-06-25) 라이브: Gemini 실연동(chat + clipper 분류, 2026-06-01 확인), 별자리 홈(실
밝기 연결 #564), RAG ingest + 세컨비(Analytic/Divergent), 밝기 측정 시스템, 14–17 자가동의
가입(prod 0028–0033), 수익화 v2 가격 정의. 별자리 3-레이어 설계 완료(`CONSTELLATION-DESIGN.md`).

| 단계 | 범위 | 상태 |
|---|---|---|
| **M-migrate** (이번 1순위) | **core→별자리 3-레이어 정합** — 마을 그래프·`/core-brain`·`/trinity` 폐기, 북극성 개명(Soul Core 라벨 제거), `DOMAIN_STARS` + `domainConfidence` 어댑터, `stars.ts` 레이어 B 재분류, `persona_synthesis` purpose, 캐릭터 보이스 처분, `CONCEPT.md`·`VISION.md`·`CLAUDE.md`(Visual Tier)·`constellation-home.ts` 라벨 갱신, v3 tesseract 아트 종료 | 설계 완료·코드 미착수 |
| M-now | 세 축 end-to-end(별자리 기준) + 강제 조항 green | 진행 |
| M-RAG | Phase1(요약 + 4 reflection Q + auto-tag) · Phase2(entity/concept 추출) | 진행 |
| M-stars | 도메인 별 점등(밝기 어댑터) + 레이어 B 삼각측량. '보여지는 나'·'될 수 있는 나' 구인은 자리만 두고 후순위 | 예정 |
| M-auth | OAuth Kakao/Naver Edge Functions | 예정 |
| M-pay | 결제 실활성화 (스토어 IAP/SBP/KR PG) — Simon 결정 후 | 미결 |
| M-submit | XPRIZE 제출 패키지 (에셋 공시 C12, 심사자 모드 C6, SLA C11, README) | 예정 |
| M-store | App Store / Play Store 제출 | 예정 |

---

## 16. 리스크 · 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **방향 전환 미반영** (코드가 구 core 모델 유지) | 에이전트·사람 혼선, 회귀 | M-migrate 1순위 + 이 PRD 가 새 정본(§0). 내부 키만 잔존, 표면 제거 |
| **레이어 A↔B 혼동** (도메인 별 ≠ 심리구인) | 설계 회귀, 7별 의미 충돌 재발 | 3-레이어 명시(§4) + `CONSTELLATION-DESIGN.md` SoT. 밝기 정직성 규칙 |
| 어휘 정책 위반(임상어 유입) | 카테고리 포지셔닝·심사 | `check:lexicon` CI 차단(docs 포함) + 단일 lexicon SoT |
| 안전 분류 우회 | 사용자 위해·치명 | C9 상시·우회불가, jest 호출순서 단언, Divergent·persona_synthesis 동일 경로 |
| 비-KR 연령 게이트 미비 | 컴플라이언스(US/EU) | KR 룰 전 사용자 게이트 + country 신호 후속 |
| Android 런타임 크래시 | 빌드·데모 실패 | `ANDROID_QA_GUIDELINES.md` 강제 |
| 별 메타포 한계(프로크루스테스 침대) | 자기이해 왜곡 | 도메인 7별은 고정 분류 아님(담아내기 catch-all), 레이어 B absent 구인은 빈 자리로 정직 노출 |
| 제3자 프라이버시(관계 별) | PIPA 위반 | 익명화·온디바이스·내-관점만(§11) |
| 결제 미결 | 수익화 시연 공백 | 가격·티어 확정, FORCE_TIER off 전 비활성(제출 무영향) |
| Gemini 비용/쿼터 | 운영비·$0/mo 약속 | 일일 한도(티어), mock 모드, 위기·비준 turn 미차감, 종합 게이트(매 turn 아님) |
| 솔로 빌드 시간(야간·주말) | 일정 | 엔진 단위 분해, worktree 격리, draft-PR + CI 자동화 |

---

## 17. 오픈 퀘스천

별자리 설계 결정(`CONSTELLATION-DESIGN.md` §7·§13). **CONFIRMED 2026-06-25 (Simon: 권장 기본값
일괄 수용). 정본 고정.**

| # | 결정 | 확정값 (2026-06-25 CONFIRMED) |
|---|---|---|
| a | 북극성 헤드라인 밝기 산식 | **도메인-평균** (정직·단순). 구인 신뢰도는 페르소나 주장 세기만 통제 |
| b | 페르소나(모자) 개수 상한 | 주 1 + 보조, **표시 캡 3** |
| c | 담아내기 자동 라우팅 | **propose-only** (민감 도메인 강제) |
| d | 도메인 밝기 임계 밴드 | `brightness.ts` 기존 밴드(1–4/5–14/≥15) 차용 |
| e | 7별 ↔ Big Dipper 좌표 매핑 | Phase 4서 `constellation-home.ts` 좌표 기준 확정 |
| f | `persona_synthesis` tier | **v1 flash** (저렴·$0 예산), 품질 이슈 시 pro 승격 |
| g | 페르소나 근거 저장 | **`wiki_links` `cite` relation 재사용** (스키마 무증설) |
| h | 도메인 단위 정규화(재정 항목 ↔ github 커밋) | Phase 4 도메인별 보정계수 |
| i | 담아내기 비준 = 이동 vs 복제 | **SourceRow 재태깅 이동** (이중계상 없음) |
| j | 캐릭터 보이스(아치·가디·루루·모모·루미) | **폐기/축소**, `systemHint`만 잔존 |

추가(Simon 단독): 티어 명칭 별테마 개명 + M3 결제 실계약 · 채널 예산·런치일 · country 신호 도입
시점 · 북극성 탭 1차 목적지(종합 vs 세컨비) · '보여지는 나'(360 peer) 출시 시점.

---

## 18. 부록 — 용어 · 매핑 · 폐기

- **별자리** = 북극성(Polaris, 7 도메인 종합 길잡이) + 북두칠성 7 도메인 별(레이어 A 입력) +
  cyan Pattern Link. SoT 자산 `constellation-home.ts`, 설계 SoT `CONSTELLATION-DESIGN.md`.
- **레이어 A (7 도메인)** = 커리어·재정·성장·관계·건강·휴식·담아내기 (신규 `DOMAIN_STARS`).
- **레이어 B (검증틀)** = Big Five·내러티브·애착·SDT/VIA·가능자아·순간변동 (`stars.ts`
  `SELF_UNDERSTANDING_STARS`, "별"→"검증 레이어"로 재분류).
- **레이어 C (북극성)** = `soulCoreBrightness`(내부 키 유지, 표시명 "북극성") + `persona_synthesis`
  종합 → 페르소나(역할/모자).
- **밝기 L1~L5** = `brightness.ts` (+ 신규 `domainConfidence` 어댑터). **propose→ratify** =
  AI 제안 → 사용자 승인만 쓰기 (`proposal.ts`).
- **내부 키 잔존(표면 금지)**: work/relation/knowledge/records/taste 는 데이터 태그로만 유지
  (레이어 A 도메인과 1:1 아님).
- **폐기 목록**: Soul Core 명칭 · 5 Pattern Core · Pattern Tesseract · 마을 그래프(`/graph`) ·
  `/core-brain` · Brain Trinity(`/trinity`) · v3 tesseract 아트 · Visual Tier 노드명 · 캐릭터
  보이스 (§4.8).
- **강제 조항 → 코드 맵**: `docs/ARCHITECTURE.md` "Hard Constraint to Code Map".
