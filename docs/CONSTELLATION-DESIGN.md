# 별자리 모델 상세 설계 — Phase 1 (7별 스펙) + Phase 2 (북극성 산출로직)

> **이 문서는 무엇인가.** 2026-06-25 방향 전환(`docs/PRD.md` §0, core 폐기 → 별자리 단일
> 모델)의 **설계 디벨롭 산출물**이다. 핸드오프(`docs/HANDOFF.md`) "다음 작업 큐 A" = *정본화
> 전에 7별 스펙 + 북극성 산출로직을 설계로 단단히*. 정본화(Phase 0/B)가 이 문서를 PRD 본문으로
> 흡수한다. **코드 변경 없음** — 코드 이관은 Phase 4(별도 트랙).

| 항목 | 값 |
|---|---|
| Status | Design draft v1 (2026-06-25) |
| Owner | Simon Kim |
| 상위 정본 | `docs/PRD.md` (Draft v2) · `docs/system-checkup.html` (v4 시각화) |
| 선행 결정 | core 폐기 / 별자리 단일 비유 / 7별=입력 / 북극성=출력 / 밝기=DIKW 한 사다리 |
| 비유 | **별자리 하나만.** 다른 비유 도입 금지 |

> **Part I** (§1~9) = 모델 설계. **Part II** (§10~13) = 기존 시스템 차용 감사(10-에이전트
> 워크플로, 검증됨) + 모델 하네스·세컨비 심화 + Phase 4 키스톤 갭. 코드 이관 전 §10 차용 맵부터.

---

## 1. 핵심 재설계 — 2-레이어 모델 (이 문서의 뼈대)

방향 전환의 가장 큰 긴장은 "7별"의 두 정의가 충돌한다는 것이다:

- **PRD v2 / `src/lib/persona/stars.ts`** — 7별 = 심리구인 7축(now=Big Five, recall=내러티브,
  seen=타인평정, rhythm=순간변동, relational=애착, possible=가능자아, values=SDT/VIA). 별 =
  *측정 대상(증거축)*.
- **새 결정 모델 (`system-checkup.html` v4)** — 7별 = 삶의 도메인 7개(커리어·재정·성장·관계·
  건강·오락·담아내기). 별 = *입력 도메인(데이터 넣는 곳)*.

핸드오프가 정한 해소책: **심리구인을 버리지 않고 북극성 출력의 검증 레이어로 이동**한다. 이를
3-레이어로 못 박는다:

```
 ┌─────────────────────────────────────────────────────────────┐
 │  레이어 A — 입력: 7 도메인 별 (홈에서 보이는 별)               │
 │  커리어·재정·성장·관계·건강·오락·담아내기                      │
 │  사용자가 "쉬운 삶 데이터"를 넣는 곳. 각 별: 입력→출력+리스트업  │
 └───────────────┬─────────────────────────────────────────────┘
                 │ 도메인 데이터가 가로질러 흐른다 (N:M)
 ┌───────────────▼─────────────────────────────────────────────┐
 │  레이어 B — 검증: 심리구인 (홈에 안 보임. 추론·근거 레이어)     │
 │  Big Five · 내러티브 · 애착 · SDT/VIA · 가능자아 · 순간변동     │
 │  = stars.ts 의 기존 7축을 "별"에서 "검증틀"로 재분류            │
 │  도메인 데이터 + 검증된 측정도구(BFI-44/ECR-S)로 구인 추정      │
 └───────────────┬─────────────────────────────────────────────┘
                 │ 도메인 요약 + 구인 추정
 ┌───────────────▼─────────────────────────────────────────────┐
 │  레이어 C — 출력: 북극성 (종합. 직접 입력 안 받음)             │
 │  실시간 페르소나(들=역할/모자) + 성향·장단점·강점 요약·조언      │
 │  변경은 propose→ratify 로만. 밝기 = 7 도메인 별 종합            │
 └─────────────────────────────────────────────────────────────┘
```

**왜 3-레이어인가 (차별점).** 레이어 A만 있으면 "인생 대시보드"다(가계부·습관앱과 동급). 레이어
B(검증된 구인틀, C8 큐레이터)가 도메인 데이터를 *근거로 받쳐줘야* 레이어 C가 "그냥 요약"이 아닌
**검증된 나의 초상**이 된다. 이것이 `system-checkup.html` "짚을 점 — 검증 깊이" 의 정확한 구현이다.

**레이어 분리의 핵심 규칙 (밝기 정직성):**

| 양 | 정의 | 어디에 쓰나 |
|---|---|---|
| **도메인 별 밝기** | 그 도메인에 내가 얼마나 넣었나 (커버리지 주도) | 홈에서 보이는 별 빛. "내 삶이 얼마나 매핑됐나" |
| **구인 신뢰도** | 그 추론이 얼마나 검증됐나 (측정도구+행동 교차) | 북극성이 페르소나를 얼마나 강하게 주장할 수 있나 |
| **북극성 헤드라인 밝기** | 7 도메인 별 밝기의 평균 + 전별점등 보너스 | 종합 readout 한 숫자. **정직하게** "삶이 얼마나 매핑됐나" |

> 홈의 별 빛 = "내가 얼마나 넣었나"(정직). 페르소나 주장의 세기 = 구인 신뢰도(숨은 레이어).
> 이 둘을 섞지 않는 것이 설계의 핵심 — 데이터 적은데 북극성만 밝게 빛나면 거짓말이 된다.

---

## 2. Phase 1 — 7 도메인 별 스펙

각 별은 동일한 4-슬롯 계약을 갖는다: **입력**(어디서·어떻게) · **출력**(돌려주는 조언/요약) ·
**리스트업**(편집 가능 + 카테고리 + 태그 = 종합의 깊이가 나오는 substrate) · **검증 피드**(레이어
B 중 어떤 구인에 기여하나). 모든 입력은 PIPA·어휘정책 준수, 모든 LLM 출력은 C9→C3→`gemini.ts`.

| # | 별 (Big Dipper) | 입력(현실경로) | 기존 자산 (재사용) | 신규 | 검증 피드(레이어 B) |
|---|---|---|---|---|---|
| 1 | **커리어** | 프로젝트·이력·업무스타일 (수동 + GitHub) | `projects/github.ts` | 이력·스타일 폼 | 성실성, VIA 성취, SDT 유능감 |
| 2 | **재정** | 자산·현금흐름·목표 (수동 먼저) | `finance/ledger.ts`✅·`fx.ts` | (수동 유지) | 성실성, SDT 자율, 안정 vs 성장 가치 |
| 3 | **성장** (옛 회상) | 연령대별 패턴 deep drill (AI 인터뷰) | `interview/probe.ts` | 연령 타임라인 | 내러티브 정체성, 가능자아 궤적 |
| 4 | **관계** | 대상별 생각·지향 (수동 + 카톡/문자/연락처 import + Slack) | `import/kakao.ts`·`sms.ts` | peer2peer 폼 | 애착(불안/회피), 관계적 자기 |
| 5 | **건강** | 컨디션·생활습관 자기기록 (헬스 import + 수동) | `import/health-export.ts` | Kakao/Naver Places 안내 | SDT 신체 자율, 습관 성실성 |
| 6 | **오락** | 취미·독서·경험 기록 | `reading/books.ts` | 취미 폼 | 개방성, VIA 호기심·심미 |
| 7 | **담아내기** | catch-all: 6별 못 담은 것 + 계속 추가 메모 | `import/detect.ts`·capture/wiki | catch-all 라우팅 | 교차(태그가 가리키는 구인) |

### 2.1 별별 상세

**1. 커리어** — 입력: 진행중/완료 프로젝트·이력·업무 스타일. 출력: 추천 목표·프로젝트, 업무 방식
조언. 리스트업: 프로젝트 항목(역할·스킬 태그). GitHub은 import 보조(수동이 기본). 검증 피드:
프로젝트 완수 패턴 → 성실성 행동근거.

**2. 재정** — 입력: 자산·자본·현금흐름·재정 목표(전부 수동). 출력: 가계부·재정 트렌드·목표 조언.
리스트업: ledger 항목(`finance/ledger.ts`) + 통화환산(`fx.ts`). **계좌·카드 연동은 오픈뱅킹급
민감 → XPRIZE 이후.** 수동입력으로 시작. 검증 피드: 예산 규칙성 → 성실성·안정가치 행동근거.

**3. 성장** (옛 '회상') — 입력: 연령대별(유년기·10·20·30대) 패턴 AI deep drill. 출력: "그때의 나"
연령대별 요약. 리스트업: 시기별 기억(era 태그). `interview/probe.ts`의 drill-stop 규칙 + 50턴
하드캡 재사용. 검증 피드: 내러티브 정체성(McAdams), 가능자아 궤적.

**4. 관계** — 입력: 대상(가족·친구·동료)별 내 생각·지향, peer2peer. 수동 + 카톡/문자/연락처
import + Slack. 출력: 관계 정리·대상별 조언. **§5.2 프라이버시 계약 필수.** 검증 피드: 애착(내가
관계 맺는 방식), 관계적 자기. **단 — 추정은 "named 타인 프로파일링"이 아니라 "내 쪽 관계방식"만.**

**5. 건강** — 입력: 컨디션·생활습관 자기기록(헬스 import + 수동). 출력: 요약·트렌드·생활 조언 +
가까운 기관 **안내**(Kakao/Naver Places). 리스트업: 습관·컨디션 로그. **§5.3 의료선 계약 필수**
(검진결과 해석·병리 어휘 일체 범위 밖). 검증 피드: SDT 신체 자율, 습관 성실성.

**6. 오락** — 입력: 취미·경험 기록(독서 = `reading/books.ts`). 출력: 취미 성장 조언·취미 추천.
리스트업: 취미/경험 항목. 검증 피드: 개방성(Big Five), VIA 호기심·심미.

**7. 담아내기** (§5.1 에서 동작 완전 정의) — catch-all 라우팅 별. 자기 밝기보다 **나머지 6별을
먹이는 메타 역할**이 본질.

### 2.2 레이어 B — 도메인 → 구인 검증 매핑 (차별점의 엔진)

레이어 A(도메인 입력)를 레이어 C(검증된 초상)로 바꾸는 변환기. 각 구인은 (1) **검증 측정도구
1개**(고신뢰 직접 측정)와 (2) **복수 도메인의 행동 보강**(저신뢰 교차근거)으로 추정된다. 둘이
일치하면 `crossSourceAgreement` → 한 tier 상승(`brightness.ts` 그대로).

| 구인 (레이어 B) | 1차 측정도구 | 보강 도메인 → 신호 |
|---|---|---|
| 성실성 (Big Five C) | BFI-44 | 커리어(완수율)·재정(예산 규칙성)·건강(습관 지속)·담아내기(정리율) |
| 개방성 (Big Five O) | BFI-44 | 오락(취미 다양성)·담아내기(탐색 범위)·성장(서사 개방) |
| 외향성 (Big Five E) | BFI-44 | 관계(상호작용 빈도·폭)·오락(사회적 취미) |
| 우호성 (Big Five A) | BFI-44 | 관계(관계 유지 방식)·peer 항목 톤 |
| 정서 반응성 (Big Five) | BFI-44 | 리듬(도메인 항목 감정 톤 변동) |
| 애착 (불안/회피) | ECR-S | 관계(내 관계방식) — **도메인 앵커** |
| 내러티브 정체성 | 인터뷰 코딩 | 성장(연령대 drill 주제 일관성) — **도메인 앵커** |
| SDT 자율·유능·관계 | 간이 척도 | 커리어(유능)·재정(자율)·관계(관계성) |
| VIA 강점 | 강점 태깅 | 전역(`sdt:*`/`via:*` 태그 + 도메인 활동) |
| 가능자아 | 서술 | 성장(궤적) + 북극성 Divergent |

**설계 통찰**: 성실성은 **3~4개 도메인이 동시에 보강**한다 — 한 도메인 측정보다 훨씬 강건. 이것이
2-레이어가 per-star 심리측정보다 나은 이유: **여러 삶 도메인에 걸친 행동이 구인을 삼각측량**한다.
애착·내러티브만 단일 도메인 앵커(자연스러움).

**신뢰도 게이트 (페르소나 주장에 직결)**: 구인의 레이어-B 레벨이 페르소나 주장 세기를 통제한다.
- 측정도구만 → L4 · 행동 보강만 → L2~L3(관측건수 밴드) · 측정도구+행동 일치 → +1 tier(L5는
  ratify로만).
- 페르소나 claim "신중한 계획가(성실성)"는 성실성 ≥ L3에서만 표면화, < L3이면 "잠정" 라벨.

---

## 3. Phase 2 — 북극성 산출 알고리즘

북극성은 **출력**이다. 직접 입력을 받지 않고, 7 도메인 별을 종합한다. 4단계 파이프라인:

```
[1] 도메인 요약        7별 각각 → 결정론적 요약 (건수·트렌드·상위 태그). LLM-free.
        │
[2] 구인 추정 (레이어 B)  도메인 데이터 → 심리구인 매핑.
        │              · 검증 측정도구(BFI-44·ECR-S 설문) = 고신뢰 직접 측정
        │              · 도메인 행동데이터 = 저신뢰 보강 측정
        │              · 둘이 일치 → crossSourceAgreement → 한 단계 상승 (brightness.ts)
        │              각 구인 → TraitConfidence → ladderLevel()
        │
[3] 페르소나 종합       callGemini(purpose=persona_synthesis)  ← C9→C3 경유
        │              입력: 도메인 요약 + 구인 추정 + 신뢰도
        │              출력: SelfModelProposal = 페르소나(들=역할/모자)
        │                    + 성향·장단점·강점 요약 + 조언
        │              ※ 절대 자동 적용 안 함. 제안일 뿐.
        │
[4] propose → ratify    사용자 승인 → 해당 축 L5 확정 (proposal.ts::applyRatify)
                        승인 전까지 페르소나는 "제안" 라벨로만 표시.
```

### 3.1 페르소나 = 역할/모자 (여럿)

종합 결과는 단일 라벨이 아니라 **복수 페르소나(역할/모자)**다 — 예: "만드는 사람(빌더)" · "신중한
계획가" · "연결하는 사람". 각 페르소나는 **어떤 도메인 + 어떤 구인이 받치는지** 근거를 달고 나온다
(예: 빌더 = 커리어 도메인 완수패턴 + 개방성·유능감 구인). 이 근거 표시가 C8(검증된 자료로 종합)의
표면 구현이다.

### 3.2 북극성 밝기 정의 (재사용 + 재해석)

`src/lib/persona/stars.ts::soulCoreBrightness(levels)` 를 **그대로 재사용**하되 입력 의미를 바꾼다:

- **현재**: `levels` = 7 *구인* 별의 L1~L5.
- **전환 후**: `levels` = 7 *도메인* 별의 L1~L5. (홈에서 보이는 별과 일치 → 정직.)
- 공식 불변: 평균 + 전별점등 보너스(+0.05). 너비(7개를 조금씩) > 한 별 deep spike.
- 내부 키 `soulCoreBrightness` **유지**(회귀 위험), 표시명 "북극성". (PRD §4.3 합치.)

> **Simon 결정 대기 (§7-a)**: 헤드라인 밝기를 도메인-평균(권장: 정직·단순)으로 둘지, 구인
> 신뢰도까지 가중할지. 권장 = 도메인-평균. 구인 신뢰도는 *페르소나 주장 세기*만 통제하고 헤드라인
> 숫자는 건드리지 않는다.

### 3.3 종합 계약 · 안정성 (페르소나가 매 세션 안 바뀌게)

**입력 계약**: `{ domainSummaries[7], constructEstimates[], confidences[], priorPersonas[], ratifications[] }`

**출력 계약** (`SelfModelProposal`): `personas[]`, 각 =
`{ id, label(역할/모자), evidence:{domains[], constructs[]}, claimStrength(= min 근거구인 신뢰도), summary, 강점, 조언 }` + prior 대비 diff.

**안정성 규칙 (핵심)**: 종합은 매번 새 페르소나 집합을 만들지 않는다. prior 페르소나를 입력으로
받아 **diff(추가·강화·약화·은퇴)만 제안**한다.
- 신규 페르소나 = 근거가 임계를 넘을 때만 제안.
- 은퇴 = 근거가 **N회 연속** floor 미만일 때만.
- → "매 세션 다른 나" 방지. 페르소나는 천천히 진화한다.

**근거 강제 (C8)**: 모든 페르소나 claim은 ≥1 도메인 + ≥1 구인을 근거로 인용해야 한다. 근거 못
대면 드롭 — ungrounded claim 금지.

**ratify 통합**: 종합 출력 = 제안. 사용자는 **페르소나별로** 승인(전부-아니면-전무 아님). 승인된
페르소나 → L5 + `priorPersonas` 편입(안정). 미승인 → "제안" 라벨 + 근거 표시, 미보강 시 decay.

### 3.4 종합 케이던스 (언제 LLM이 도나)

- **결정론적 도메인 요약(1단계)**: 항목 변경 시 라이브 갱신. LLM-free.
- **LLM 페르소나 종합(3단계)**: 비싼 단계 → **게이트.** 트리거 = (a) 북극성 탭 on-demand, (b)
  도메인이 밝기 tier를 넘었을 때(실질적 새 근거). 매 turn 아님(비용 + 불안정).
- **비용·안전**: 종합 = run당 `callGemini` 1회, 자체 purpose(`persona_synthesis`) + quota 정책.
  예외 없이 C9→C3→`gemini.ts`. 위기 라우팅 turn 미차감 규칙 동일.
- **페르소나 개수(§7-b)**: 주(主) 1(최광 교차근거) + 보조, 표시 캡 3.

---

## 4. 밝기 / DIKW 산정식 (오픈 질문 ③)

하나의 서수 척도가 밝기 = 데이터 품질 = 출처 신뢰 = 드릴 정지레벨을 동시에 의미한다. 4 신호로
산정: **①커버리지 ②내적일관성 ③교차검증 ④최신성**. **v1 = ①②만**(③은 brightness.ts에 이미
있어 거의 공짜, ④는 v1.1).

| 레벨 | DIKW | 의미 | v1 판정 (①커버리지 + ②일관성) |
|---|---|---|---|
| **L1** | 꺼짐 | 데이터 없음 | 커버리지 0 (default) |
| **L2** | Data | 원시 항목 존재 | 항목 1–4개 (낮음) |
| **L3** | Information | 정리·태깅돼 형태 있음 | 항목 5–14개 + 카테고리 구조 |
| **L4** | Knowledge | 패턴이 일관되게 유지 | 항목 ≥15 (높음) **또는** 검증 측정도구 |
| **L5** | Wisdom | 승인 + 교차검증, 행동가능·소유 | **ratify만** (+ 교차검증 시 한 단계 상승) |

**구현 — `brightness.ts` 가 이미 v1 기계를 제공한다:**

- `baseLevelFor(confidence)` 의 관측건수 밴드(default→L1, 1–4→L2, 5–14→L3, ≥15→L4, 검증
  설문→L4)가 **곧 도메인 커버리지 밴드**다. 도메인 항목수 → `TraitConfidence` 밴드 → 같은 함수.
- ③교차검증 = `crossSourceAgreement` (+1 tier, 5 캡) — 이미 구현.
- L5 = `ratified` only — 이미 구현.
- ④최신성(v1.1) = stale 도메인을 한 tier 강등하는 decay. v1 미포함.

→ Phase 4 코드작업은 "도메인 항목수 → TraitConfidence 밴드" 어댑터 하나(`domainConfidence(entries)`)
만 새로 쓰면 `ladderLevel()`·`brightnessFraction()`·`soulCoreBrightness()` 전부 그대로 붙는다.

> **②내적일관성 v1 정의**: "반복 질문/항목 간 모순 없음". 도메인 내 태그·카테고리가 서로
> 충돌하지 않고 누적되면 밴드 내 상위로. v1은 단순히 "정리된 항목 비율"로 근사(미정리 raw가 많으면
> L3 미만). 정밀 일관성 점수는 v1.1.

---

## 5. 오픈 질문 해소

### 5.1 담아내기(catch-all) 동작 정의 (오픈 질문 ①)

담아내기 = 라우팅 별. 세 가지 일을 한다:

1. **무차별 흡수 (intake)**: 어느 도메인에 속하는지 불명확한 모든 입력은 여기 raw로 먼저 떨어진다.
   "담기"(`/capture`)의 기본 착지점.
2. **자동 라우팅 (route)**: `import/detect.ts` 가 분류 → **확신**이면 해당 도메인 별로 이동을
   *제안*(propose→ratify). **민감·모호**면 담아내기에 남아 사용자가 태그. 절대 조용한 자동이동
   금지(특히 관계·건강·재정).
3. **보강 (supplement)**: 여기서 태깅·분류된 항목은 해당 도메인의 **밝기 커버리지에 보조 증거로
   기여**한다. (= "종합의 깊이가 여기서 나온다"의 메커니즘.)

밝기: 담아내기 자신의 밝기 = 담아 정리한 항목량(커버리지). 하지만 진짜 가치는 6별을 먹이는 것 →
헤드라인 평균에는 7번째 별로 동등 참여하되, 라우팅된 항목은 목적지 도메인에서 **이중계상하지 않는다**
(원본은 담아내기 떠나 도메인으로 이동, 미라우팅 raw만 담아내기 커버리지).

> **Simon 결정 대기 (§7-c)**: 자동 라우팅을 항상 propose-only(권장)로 둘지, 비민감 카테고리는
> 조용한 자동이동 허용할지.

### 5.2 관계 별 — peer2peer 프라이버시 (오픈 질문 ④)

제3자(가족·친구) 실명 데이터 = PIPA 제3자 개인정보. 계약:

- **실명은 사용자 수동입력 또는 import만.** 추론·스크랩으로 타인 신원 생성 금지.
- 제3자 항목은 **온디바이스 보관.** named-3rd-party 콘텐츠를 서버/Gemini로 그대로 보내지 않는다.
- RAG/세컨비가 관계 맥락이 필요하면 **익명화**(이름 → 토큰) 후 `callGemini`.
- 구인 추정은 **"내가 관계 맺는 방식"(애착)만** — named 타인을 프로파일링하지 않는다. "이 사람은
  이렇다"가 아니라 "나는 이 관계에서 이렇게 한다".
- 데이터 최소화 + 내-관점-한정 프레이밍을 관계 별 UI 카피에 명시.

### 5.3 건강 별 — 의료선 (오픈 질문 ⑤)

- **생활습관·컨디션 자기기록까지만.** 검진결과 해석·진단·의료성 조언 = 범위 밖.
- 병리·임상 어휘 일체 금지(`src/lib/safety/lexicon.ts` CI 강제, docs 포함).
- 가까운 기관 추천 = Kakao/Naver Places **위치·발견 기능**("가까운 전문가/기관 안내")으로만 —
  의료 자문이 아닌 **길안내** 프레이밍. 비임상.
- C9 위기 라우팅은 건강 별 입력에도 동일 적용(red-zone → 핫라인, LLM 미호출).

### 5.4 기초입력 / 철학 seed (4W1H)

북극성 하위의 가벼운 **시작 seed** — who/what/when/where/why + 개인 철학 한 줄. 도메인이 채워지기
전 북극성이 첫 종합을 할 최소 토대. 나중에 AI가 도메인 누적분으로 재종합해 채울 수 있다(propose→
ratify). 온보딩에 배치, 강제 아님(skip 가능, absent 상태 정직 노출).

---

## 6. 코드 이관 함의 (Phase 4 스펙 — 지금 코드 변경 없음)

이 설계가 Phase 4(코드 이관, 별도 트랙)에 요구하는 것. **본 세션에서는 구현하지 않는다.**

- `stars.ts`: 기존 `SELF_UNDERSTANDING_STARS`(구인 7축)는 **삭제하지 않고** "레이어 B 검증틀"로
  주석·역할 재분류. 신규 `DOMAIN_STARS`(7 도메인) 추가 = 홈/입력 레이어.
- `soulCoreBrightness(levels)`: 시그니처 유지, 호출부가 *도메인* 레벨을 넘기도록 전환. 내부 키명
  유지(회귀 안전), 표시명 "북극성".
- 신규 `domainConfidence(entries)` 어댑터 → 기존 `brightness.ts` 체인 재사용.
- `import/detect.ts` → 담아내기 라우팅 규칙(§5.1) 연결.
- 홈 자산 `src/lib/assets/constellation-home.ts`: 별 라벨을 7 도메인으로, "Soul Core" 잔존 라벨
  제거(PRD §15 M-migrate와 합류).
- 페르소나 종합 = `propose-self-model.ts` + `proposal.ts` 경로 재사용(신규 purpose 추가).

---

## 7. Simon 결정 — CONFIRMED 2026-06-25 (권장 기본값 일괄 수용)

| # | 결정 | 권장 |
|---|---|---|
| a | 북극성 헤드라인 밝기 = 도메인-평균 vs 구인-가중 | **도메인-평균** (정직·단순). 구인은 페르소나 주장 세기만 통제 |
| b | 페르소나(모자) 개수 상한 | 1 주(主) + 보조 N, 표시 캡 3 제안 |
| c | 담아내기 자동 라우팅 = propose-only vs 비민감 조용한 이동 | **propose-only** (신뢰 일관) |
| d | 도메인별 밝기 임계(항목수 밴드) 튜닝값 | brightness.ts 기존 밴드(1–4 / 5–14 / ≥15) 차용, 운영 보정 |
| e | 7별 순서 ↔ Big Dipper 7성 좌표 고정 매핑 | constellation-home.ts 좌표 기준 Phase 4에서 확정 |

---

## 8. 검증

```bash
npm run check:lexicon   # 이 문서 포함 docs 스캔 — 임상·병리 금지어 0 확인
npm run verify          # 코드 변경 시 전체 게이트 (이번 산출물은 docs-only)
```

## 9. 다음 단계

1. 본 설계의 §7 결정들을 Simon이 확정.
2. Phase 0/B 정본화: 이 문서를 `docs/PRD.md` §4(개념 모델)·§8(기능)으로 흡수, `CONCEPT.md`·
   `VISION.md`·`CLAUDE.md`(Visual Tier) 갱신, 메모리 반영.
3. Phase 3 연동맵(Kakao/Naver Places 키 등) + Cowork 프롬프트.
4. Phase 4 코드 이관(§6) — 별도 트랙·여러 세션.

---

# Part II — 기존 시스템 차용 감사 (10-에이전트 워크플로, 2026-06-25)

> 8개 서브시스템을 병렬 매핑 → 종합 → 인용 정확성 **적대적 검증**. 결과: 차용 주장 18개 중
> **15 confirmed · 0 wrong · 3 unverifiable**. 결론 — **새 모델은 greenfield가 아니다.** 핵심
> 기계(LLM 하네스·밝기 사다리·propose→ratify·RAG·세컨비 루프)가 이미 있고, 키스톤 어댑터
> 하나(`domainConfidence`)만 새로 쓰면 대부분 그대로 붙는다.

## 10. 차용 맵 (검증됨)

| 기존 구조 (file:line) | 새 모델 용도 | 문서 § | 검증 |
|---|---|---|---|
| `callGemini<T>` 단일 래퍼 (`llm/gemini.ts`, C9~L414·C3~L649) | 북극성 종합이 `purpose:'persona_synthesis'`로 그대로 경유. C9/C3/Vertex/edge/mock 무상 상속 | §3[3]·§3.4 | ✅ |
| `PURPOSE_TIER` + `PromptPurpose` (`llm/types.ts:11-26,133-152`) | `persona_synthesis` 추가(2줄). 미매핑 purpose는 flash 폴백 — pro 권장 | §3[3]·§6 | ✅ 부재 확인 |
| `brightness.ts` 체인 `baseLevelFor→ladderLevel→brightnessFraction` (`:26-48`) | **그대로 재사용.** 관측밴드(1-4→L2/5-14→L3/≥15→L4) + crossSourceAgreement(+1) + ratified→L5 = 설계 그대로 | §4·§2.2 | ✅ verbatim |
| `soulCoreBrightness(levels)` (`stars.ts:54-59`) | **그대로**, 입력 의미만 구인축→도메인축. 공식·내부키 불변, 표시명 북극성 | §3.2·§7-a | ✅ |
| propose→ratify (`proposal.ts` applyRatify`:61-64`, `propose-self-model.ts:22-95`) | 페르소나 비준에 재사용. `ProposalTarget`에 `{kind:'persona'}` 추가, 별별→페르소나별 ratify | §3[4]·§3.3 | ✅ |
| C9 `classifyInput` + C3 outbox (`gemini.ts`·`audit-write-outbox.ts`) | persona_synthesis 자동 감사, red-zone 도메인입력 단락. 신규 세이프티 코드 0 | §2·§3.4 | ✅ |
| `exportUserWiki`/`composeWikiExport` (`wiki/export.ts:1-80`) + `[[slug]]` 인용 (`chat/sources.ts:14-40`) | 세컨비가 별자리 맥락 읽도록 확장. 페르소나 claim이 `[[도메인]]`/`[[구인]]` 인용 | §3.1(C8)·§2 | ✅ |
| `sendChatMessage` + 쿼터 (`chat/conversation.ts`·`limits.ts:12-17`·`usage.ts:52-62`) | 세컨비 턴 루프 불변. 시스템 프롬프트에 별자리 블록 주입. 비준=쿼터 미차감 | §3·§3.4 | ✅ |
| `detectImportKind` (`import/detect.ts:18-36`) + `classifyIngestClipping` (`ingest-policy.ts:52-80`) | 담아내기 catch-all 라우팅. `confidence` 필드 추가로 게이트. 위기클립 격리(핫라인 아님) | §5.1 | ✅ |
| `deriveStarLevels`/`load-star-levels.ts` + `build.ts` `traitConfidenceFor:47-52` | 입력을 PersonaCard 신호→{도메인요약,구인추정}로 retarget. 홈 렌더 LLM-free 유지 | §3.2·§6 | ✅ |
| 도메인 lib: `finance/ledger·fx`·`projects/github`·`reading/books`·`interview/probe`(5×5,50캡) | 각 = 레이어 A 결정론적 요약기 → domainConfidence + 구인 삼각측량. probe = 성장 서사 앵커 | §2·§2.2 | ✅ |
| `audit/questions.ts` 프레임워크 태그(`big_five:*`/`sdt:*`/`via:*`/`attachment:*`) | **도메인→구인 다리.** 태그 매치로 3-4 도메인이 구인 삼각측량(하드코딩 없음) | §2.2 | ✅ |
| anthro 가드(`safety/anthro.ts`) + forbidden-lexicon(`classifier.ts`) | 모든 persona_synthesis **출력**이 표시 전 anthro+lexicon 통과. YELLOW 도메인입력 저장하되 미인용 | §3.3·§5.3 | ✅ |
| wiki inferred→ratified 엣지(`wiki/queries.ts` `:391·446·474`, `confidence`/`relation_type`) | 페르소나 근거 엣지 + ratify-worklist 쿼리 모양 재사용 | §3.3·§3.1 | ✅ |
| `distillContext`/`fuseFrameworks`/`mergeEvidence` (`knowledge/engines.ts`·`persona/evidence.ts`) | 도메인요약+구인근거+prior 병합/토큰예산. **미검증 — Phase 4서 확인** | §3.3 | ⚠ |
| `slug.ts`·`frontmatter.ts`·`wikilinks.ts` | 7 도메인 + 북극성 인용 앵커(career/finance/.../polaris). **미검증** | §3.1·§6 | ⚠ |
| Mock `MOCK_RESPONSES` + `PHASE1_SCHEMA` 패턴(`wiki/phase1.ts:52-121`) | persona_synthesis mock 항목 + `PERSONA_SYNTHESIS_SCHEMA` → $0 오프라인 E2E. **mock 위치 미검증** | §3.4·§3.3 | ⚠ |

## 11. 모델 사용 하네스 — 차용 + 심화

**현 구조 = 단일 래퍼 + purpose 라우팅.** 모든 LLM은 `callGemini` 하나로만 들어간다(C1, ESLint +
`check-llm-import-boundary.ts` 강제). purpose 문자열이 `PURPOSE_TIER`로 모델 tier를 고른다:

| tier | 모델 | 쓰임 | 기존 purpose |
|---|---|---|---|
| lite | gemini-2.5-flash-lite | 분류 | `*_classify`, `clipper_classify` |
| flash | gemini-2.5-flash | 인터랙티브(기본 폴백) | `secondb_chat`, `audit_qa`, `import_ingest`, `ops_recommend`, `capture_*` |
| pro | gemini-2.5-pro | 추론 | `advisor`, `journal_reflect`, `interview_probe`, `imagine` |

현 purpose 15개 카탈로그(검증): journal_reflect · audit_qa · knowledge_lookup · persona_chat ·
advisor · secondb_chat · interview_probe · capture_ocr · capture_voice · capture_classify ·
clipper_classify · clipper_template_propose · import_ingest · imagine · ops_recommend.
**`persona_synthesis` 는 없음(검증).**

**심화 — 북극성 종합을 하네스에 얹는 법:**

1. **purpose 1개 추가**: `PromptPurpose`에 `persona_synthesis`, `PURPOSE_TIER`에 `'pro'`(추론
   깊이) — 단 v1 예산 빡빡하면 `'flash'`(§13 오픈Q). 명시 model 인자는 항상 우선.
2. **프롬프트빌더 + 방어적파서 패턴 재사용**(전 LLM 호출의 관용구): 순수함수
   `buildPersonaSynthesisPrompt(domainSummaries, constructEstimates, confidences, locale)→{system,user}`
   + `parsePersonaSynthesisProposal(raw)→SelfModelProposal|null`(JSON 추출·절단·lexicon 가드).
   정확히 `propose-self-model.ts:22-78` / `wiki/phase1.ts` 패턴.
3. **구조화 출력 스키마**: `PHASE1_SCHEMA`(`phase1.ts:52-65`)처럼 `PERSONA_SYNTHESIS_SCHEMA`
   정의 → `callGemini({responseSchema})` 가 파싱 가능한 `personas[]{label,evidence:{domains[],
   constructs[]},claimStrength,summary,강점,조언}` 강제. 파서가 mock·live 둘 다 관용.
4. **RAG 주입 = `<UNTRUSTED>` 펜스 + `sanitizeUntrusted`**(`conversation.ts:73-92` INJECTION_GUARD):
   도메인 요약은 결정론적이지만 방어차원에서 펜스 안. 구인 추론 지침은 펜스 밖.
5. **effort 노브**: pro tier에서 `effortToConfig`(low/high/xhigh/max → thinking budget). 종합
   기본 `high`, 깊은 종합 `xhigh`. 스레딩 이미 완료 — 신규 코드 0.
6. **Mock**: `MOCK_RESPONSES`에 persona_synthesis 유효 JSON 1개 → Gemini 연결 없이 별자리 홈
   full E2E($0). C9/C3 mock에서도 실행.
7. **무상 상속**: C2 Vertex(`vertexai:true`), C3 감사 1행 자동(`modelUsed=gemini-2.5-pro`,
   `safetyZone`, `effort`), C9 pre/post 스왑 — 전부 callGemini 내부. **신규 세이프티/감사 코드 0.**

## 12. 세컨비(비서) — 차용 + 심화

**현 루프 (`sendChatMessage`, `conversation.ts:129`):** tier 쿼터 체크 → `exportUserWiki`(최대
50페이지·본문 600자, `<UNTRUSTED>`) → 원자적 usage bump(`bumpChatUsageIfUnderCap`) →
`callGemini(purpose:'secondb_chat', flash)` → `[[slug]]` 인용 파싱 → `{reply, used, limit}`.
모드 = Analytic/Divergent(`MODE_INSTRUCTION`, 둘 다 C9→C3, 품질차 없음·횟수만 차등).

**심화 — 세컨비가 새 모델을 읽는 법:**

1. **별자리 맥락 익스포터 추가**: `exportConstellationContext(userId, locale)` = ① 7 도메인 별
   요약 + L1-L5, ② 레이어 B 구인 추정(Big Five·애착·내러티브·SDT/VIA), ③ 현재 북극성 밝기% +
   대기 중 제안. wiki 스냅샷 **뒤에** 같은 `<UNTRUSTED>` 펜스로 주입. 결정론적·LLM-free·<100ms.
   `formatPage`/`formatSource` 패턴 재사용.
2. **트렌드 제안 = propose→ratify**: 턴 응답이 제안 마커를 담으면 `proposeSelfModelChange`
   (`persona_chat`→`persona_synthesis`) → `SelfModelProposal` → `secondb.tsx`에 **페르소나별**
   비준 모달([동의 / 나중에]). 비준 = **쿼터 미차감**(동기 작업). 위기 턴은 제안 미생성.
3. **모드**: Analytic/Divergent 유지. (선택) 미래 **Speculative** = 별자리+레이어 B로 "이 구인이
   바뀌면" 임계돌파 시나리오. 동일 C9 경로.
4. **한도 불변**: `CHAT_DAILY_LIMIT` free 2·soma 30·cortex 80·brain 250(`limits.ts:12-17`),
   `kstDateToday` 리셋, 위기 비차감.
5. **⚠ 캐릭터 보이스 충돌(신규 발견)**: `chat/personas.ts`에 세컨비 + **아치(work)·가디(relation)·
   루루(knowledge)·모모(records)·루미(taste)** = 옛 5 내부 도메인 키에 묶인 캐릭터. 새 모델은
   북극성-중심 7 도메인 → **유지 vs 7도메인 재매핑 vs 폐기** 결정 필요(§13 오픈Q). `systemHint`는
   Divergent 컬러링에 재활용 가능.

## 13. Phase 4 키스톤 갭 + 신규 오픈질문

**키스톤 갭 (모든 서브시스템이 공통 지목 — 이거 하나가 대부분을 막는다):**

- **`domainConfidence(entries)→TraitConfidence` 어댑터 + `DomainEntry` 타입 + `DOMAIN_STARS`
  배열**(7 도메인, slug=career/finance/growth/relation/health/recreation/collect). 이게 도메인
  항목수 → 검증된 `brightness.ts` 체인을 잇는 **유일한 다리.** 나머지 차용은 전부 여기 붙는다.
- **레이어 B 구인 추정 모듈**: `bfi.ts`/`attachment.ts`는 단일 구인만 독립 계산 → §2.2 삼각측량
  테이블(성실성=3-4 도메인) 합산 + crossSourceAgreement + `ConstructEstimate[]` 출력 = 미구현.
- **`SelfModelProposal` 다중-페르소나화**: 현 단일-타깃 → `personas[]` + `ProposalTarget` 유니온
  `{kind:'persona'}` + 안정성(priorPersonas, N회-floor 은퇴) + `personas` 테이블.
- **`ImportProposal.confidence` + detect.ts per-kind 확신도** → 담아내기 라우팅 임계(§5.1).
- **도메인입력 classifyInput 게이트 + `safety_tags` 컬럼**(YELLOW 저장하되 미인용) + **제3자
  익명화 유틸**(이름→토큰, RAG/Gemini 전, §5.2).
- **`PERSONA_SYNTHESIS_SCHEMA` + mock 항목** — 구조화출력·$0 E2E 차단 중.
- **검증 설문(BFI-44/ECR-S) 저장 경로**(`assessment_response` kind) — L4 측정도구 앵커 + 교차검증
  +1 부스트가 이게 없으면 영영 발화 안 됨.
- **담아내기→도메인 비준 시 이중계상 방지 메커니즘**(SourceRow 재태깅 이동 vs 복제, §5.1).
- **Phase 4 전 읽을 미확인 파일**(결정 게이트): `finance/trend.ts`, `interview/narrative-level.ts`,
  `import/{history,ics,email,location}.ts`, `persona/{load-tier-shifts,tier-history,next-step}.ts`.

**신규 결정 — CONFIRMED 2026-06-25 (§7에 추가):**

| # | 결정 | 권장 |
|---|---|---|
| f | persona_synthesis tier = pro(추론 깊이·비용↑) vs flash(저렴·$0예산) | v1 **flash**, 품질 이슈 시 pro 승격 |
| g | 페르소나 근거 저장 = 신규 `evidence_links` 테이블 vs `wiki_links`에 `cite` relation 재사용 | **wiki_links 재사용**(스키마 무증설) |
| h | 도메인 단위 정규화 — 재정 항목 ↔ github 커밋이 같은 "1건"이 아님. 밴드 도메인별 튜닝? | Phase 4서 도메인별 보정계수 |
| i | 담아내기 비준 = SourceRow 재태깅 이동 vs 복제 | **재태깅 이동**(이중계상 없음) |
| j | 캐릭터 보이스(아치·가디·루루·모모·루미) = 유지 vs 7도메인 재매핑 vs 폐기 | 북극성-중심이면 **폐기/축소**, systemHint만 잔존 |
