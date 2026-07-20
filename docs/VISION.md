# 2nd-Brain · 비전

> **AI 시대, 가장 가치있는 것은 나 자신 입니다.**

이 문서는 제품의 방향성을 영구화한다. 모든 새 기능 / PR / 화면은 아래
세 축 중 하나에 명시적으로 속해야 한다.

---

## 캐치프레이즈

> AI 시대, 가장 가치있는 것은 나 자신 입니다.

함의:

- AI 가 누구에게나 같은 답을 내는 시대의 차별화 자산 = **나의 데이터·취향·패턴**
- 이 앱은 그 자산을 **축적** 하고 **개인 비서로 키우는** 도구
- "정신건강 앱" 이 아니다 — *나라는 자산을 만드는 도구* 다

---

## 세 축

### 1. 알아가기 — 자기 데이터 축적

정량 평가 + 시기 회고 + 일상 입력 + LLM 인터뷰로 *나에 대한 데이터* 를 모은다.

| 표면 | 라우트 | 도구 종류 |
|---|---|---|
| Big Five (BFI-44) | `/big-five` | 검증된 정량 |
| MBTI 32-item (참고용) | `/mbti` | 참고·비검증 (Big Five 우선) |
| Attachment (ECR-S) | `/attachment` | 검증된 정량 |
| 과거의 나 | `/audit` | 시기 회고 |
| 심층 인터뷰 | `/interview` | LLM drill-down 5×5 |
| 일상 기록 | `/capture`(일기 모드) | 자유 입력 + streak (구 `/journal` redirect) |
| 자재 반입 | `/capture` | 5-mode (memo/link/clip/OCR/file) · 담아내기 별 착지점 |
| 사용자 위키 | `/wiki` | 축적 read side |

> ⚠️ 위 표면은 **레이어 A(도메인 입력) + 레이어 B(검증 측정도구)** 진입점으로 재배치된다.
> `/big-five`·`/attachment`·`/esm`은 홈의 별이 아니라 북극성 검증틀(레이어 B)의 측정도구다.

### 2. 개인 비서 기반 — RAG 위 vibe

축적된 데이터 위에서 *나에게 맞춰* 작동하는 AI.

| 표면 | 라우트 | 역할 |
|---|---|---|
| 세컨비 (2ndB) | `/secondb` | RAG-backed chat, wiki + 별자리 맥락 위에서 응답 (Analytic/Divergent) |
| 페르소나 카드 | `/persona` | 패턴 surface, 역할/모자 |
| insights | `/insights` | "요즘 뭘 적었는가" 종합 |
| 북극성 종합 | (폴라리스 탭) | 7 도메인 종합 + 페르소나 — 구 Brain Trinity `/trinity` 폐기 |
| 참조 문헌 | `/research` | RAG 가 ground 하는 검증된 출처 (C8) |

### 3. 공상 → 구체화 — 미래의 나

떠오른 아이디어·꿈·욕망을 *나와 같은 결* 로 함께 펼치고 다음 단계로 떨어뜨리는 도구.

- 실현: SecondB 대화의 **Divergent 모드** — 장소(마을 노드)가 아니라 대화 모드다 (세계관 v-final).
- 짝: **Analytic 모드** (사용자 data 기반 분석/조언). Divergent 는 data 기반이되 전혀 다른 관점.
- 안전: 두 모드 모두 C9(classifyInput) → C3(ai_audit_log) → `gemini.ts` 경로. 공상이 안전 분류를 우회하지 않는다.
- 상세 spec 은 세계관 v-final 기준으로 추후 재작성 (구 `dream-surface-spec.md` 는 레거시 정리에서 제거, git history 보존).

---

## 세계관 — 별자리 3-레이어 (정본 = `docs/PRD.md` v3 · `docs/CONSTELLATION-DESIGN.md`)

> ⚠️ 구 "5계층 모델"(Soul Core + 5 Pattern Core + Pattern Tesseract + 마을 그래프)은 **폐기**
> (2026-06-25 방향 전환). 정본은 **별자리 3-레이어**. 그래프 / 네비게이션 / 색은 이 모델을 따른다.

| 레이어 | 정체 | 역할 |
|---|---|---|
| **A 입력** | 북두칠성 7 도메인 별 (커리어·재정·성장·관계·건강·휴식·담아내기) | 쉬운 삶 데이터를 넣는 곳. 각 별: 입력 → 출력 + 리스트업. 홈에서 보이는 별 |
| **B 검증** | 심리구인 (Big Five·내러티브·애착·SDT/VIA·가능자아·순간변동, `stars.ts`) | 홈에 안 보이는 추론·근거 레이어. 도메인 데이터가 구인을 삼각측량 → 검증된 초상(C8) |
| **C 출력** | 북극성 (Polaris) | 7 도메인 종합 → 실시간 페르소나(역할/모자) + 강점. 직접 입력 X, propose→ratify로만 변경. "Soul Core" 명칭 폐기 |
| 공통 | cyan Pattern Link | Big Dipper 형태 + 2별 포인터 → 북극성. 전부 cyan, 후퇴 |

> **밝기 정직성**: 홈의 별 빛 = "내가 얼마나 넣었나"(도메인 커버리지). 페르소나 주장 세기 =
> "얼마나 검증됐나"(숨은 구인 신뢰도). 둘을 섞지 않는다.

> **내부 키 잔존(표면 금지)**: 옛 도메인 키(work / relation / knowledge / records / taste)는 회귀
> 위험 때문에 데이터 태그로만 유지 — 새 7 도메인과 1:1 아님. 캐릭터 보이스(아치/가디/루루/모모/루미,
> `src/lib/chat/personas.ts`)는 폐기/축소(PRD §17-j).

### 공상 = 장소가 아니라 SecondB 대화 모드

"공상 작업실"은 그래프의 장소(Pattern Core 노드)에서 제거되고, SecondB 대화의 두 모드로 전환된다:

- **Analytic 모드** — 사용자 data 기반 분석 / 조언.
- **Divergent 모드** — data 기반이되 전혀 다른 관점에서 새로운 가능성 탐색. UI에 "새로운 관점 / 가정" 라벨 노출.

두 모드 모두 예외 없이 **C9(classifyInput) → C3(ai_audit_log) → `src/lib/llm/gemini.ts`** 경로를 탄다.
공상이 안전 분류를 우회하는 통로가 되어선 안 된다.

(구 `/imagine` 라우트 · 스크린 · 탭 · LLM purpose · 에셋 키는 회귀 위험 최소화를 위해 내부적으로
보존하되, 그래프의 진입점은 제거되어 vestigial 상태가 된다. Vela 마스코트는 신 로스터에서 은퇴 —
이름을 바꾸지 않고 노드만 제거하며, 그 역할은 SecondB 의 Divergent 모드가 대신한다.)

### 색 매핑 (정본)

> ⚠️ 아래 Soul Core / Pattern Core / 마스코트 **라벨은 폐기**(§별자리 3-레이어). 토큰 값은 코드에
> 잔존하므로 참조용으로만 둔다 — 새 작업은 `deepSpace.*` + `DESIGN.md` 기준.

`src/lib/theme/tokens.ts` 의 **기존 토큰만** 사용한다 (신규 hex 금지). `semantic.*` 키는 유지하고 값만 이동.

| 대상 | 토큰 | hex |
|---|---|---|
| Soul Core / SecondB | `soulViolet` | #A78BFA |
| Growth Core / Archon | `signalBlue` | #4CC9F0 |
| Wisdom Core / Lumen | `signalMint` | #72F2C7 |
| Muse Core / Lumina | `dreamPink` | #FF9FD6 |
| Bond Core / Relia | `pixelLamp` (amber) | #FFD166 |
| Narrative Core / Foreman Momo + 크루 | monochrome `moonWhite` / `mistGray` | #E8ECF8 / #8D98B8 |
| 안전 / 위기 (시스템 전용, 마스코트와 분리) | `guardRose` | #FF7A90 |
| Divergent 모드 | `soulViolet2` (soulViolet 변형) | #7C5EE8 |

**충돌 해결 기록**:

- amber(`pixelLamp`)는 안전 YELLOW-zone(`zoneYellow` / `warning`)과 hex 를 공유한다. 신규 hex 금지 +
  `guardRose` 시스템 전용 원칙 때문에 Bond 에 쓸 수 있는 따뜻한 신호색이 `pixelLamp` 하나뿐이라
  불가피하다. 두 용도는 맥락으로 구분된다 — Bond 는 마스코트 / 코어 accent, yellow-zone 은 rephrase
  힌트 카드의 좌측 3px 보더(드물게 등장). `DESIGN.md` 결정 로그 참조.
- Divergent 모드는 SecondB(soulViolet)의 변형 모드이므로 기존 `soulViolet2` 를 쓴다 (dreamPink 는
  Muse 전용이라 회피).

### 어휘 정책 (하드)

`src/lib/safety/lexicon.ts` 의 금지어(정신건강 / 심리치료 / 심리상담 / 치유 등)는 절대 쓰지 않는다.

- Relia 컨셉 = "따뜻한 길잡이" (임상 라벨 X). "심리적 안정" → "마음이 편안해지고 / 정서적 안정".
- Lumen 컨셉 = "삶에 적용된 지식의 패턴을 돕는 현자" — 컨셉 유지, 표현만 lexicon 통과.

---

## 측정 시스템 (밝기 · 별 · 가치 사다리): 2026-06-17 구현 정본

> 합성 메모(`2ndb-thought-organization-synthesis.html`, 불변 정본)의 측정 하네스를 코드로 구현한 결과. 상세 어휘는 `CONTEXT.md`, 수치·공식은 아래 파일들.

- **단일 가치 사다리 L1~L5** = 밝기 = 데이터 품질 = 출처 신뢰도 = 드릴 정지레벨. `src/lib/persona/brightness.ts` (`ladderLevel` / `brightnessFraction`, 20~100%). 결정론·LLM-free.
- **검증 구인 (레이어 B)** (Big Five·내러티브·애착·SDT/VIA·가능자아·순간변동) = 북극성 출력의 숨은 추론·검증 레이어. `src/lib/persona/stars.ts` (`SELF_UNDERSTANDING_STARS`, "별"→"검증틀" 재분류). 도메인 데이터가 구인을 삼각측량. ⚠️ 더 이상 홈의 별이 아니다 — 홈의 7별은 도메인.
- **북극성 밝기 (레이어 C)** = 7 도메인 별 밝기의 종합 (평균 + 전별점등 보너스). `soulCoreBrightness`(내부 키 유지, 표시명 "북극성"; 입력 의미만 도메인축으로). "모든 별이 켜지면 북극성이 더 밝아진다." 신규 `domainConfidence` 어댑터가 도메인 항목수를 밝기 체인에 연결.
- **실데이터 도출**: `buildPersona`가 `starLevels` + `soulCoreBrightness` 산출(`star-levels.ts`); 홈은 Gemini 없는 `load-star-levels.ts`로 마운트 시 표시(도메인 별 입력으로 retarget).
- **렌더**: 별자리 홈(유일한 홈) · 북극성 종합 뷰(구 `/core-brain` 흡수) · `/persona`(밝기% + 켜진 도메인 별).
- **드릴 정지규칙** (메모 §3d): 인터뷰가 목표 L 도달 시 종료(`interview/drill-stop.ts` + `narrative-level.ts`), 50턴은 하드캡. 소프트캡-only 대체.
- **propose→ratify** (메모 §3f): AI는 자기모델을 직접 못 바꾼다. `SelfModelProposal` diff 제안(`propose-self-model.ts`, C9→C3→gemini) 후 사용자 승인만 L5(`proposal.ts::applyRatify`). 임상어휘 게이트 통과 제안만 표면화.

> 세 축 관계: **알아가기**(도메인 별 점등·밝기 상승) → **개인 비서**(밝기·도메인·검증틀 근거로 세컨비 응답) → **공상→구체화**(세컨비 Divergent + 북극성 propose→ratify 다음 한 걸음).

---

## XPRIZE 정렬

Build with Gemini XPRIZE — **Education & Human Potential** 트랙.

- "AI 시대 인간의 잠재력" = *자기 자신을 데이터로 가지는 것*
- 누구나 같은 답을 내는 시대의 차별화 = 나의 데이터·취향·패턴
- 이 앱은 그 자산을 *축적* 하고 *개인 비서로 키우는* 도구
- 마감: 2026-08-17 06:00 KST

---

## 어휘 정책 (재확인)

핸드오프의 vocabulary policy 와 정렬:

| ❌ 금지 | ✅ 사용 |
|---|---|
| mental health, therapy, counseling | self-understanding, growth |
| diagnosis, treatment, healing, cure | reflection, self-knowledge |
| 정신건강, 심리치료, 심리상담, 치유, 우울증 | 자기 이해, 성장 |

세 축의 voice 는 *clinical* 이 아니라 *creative agency* 다.

---

## 영구화 규칙

- 새 PR 의 설명에 *"이 작업이 어느 축에 속하는지"* 한 줄 명시
- 새 라우트 / 새 화면은 이 문서의 표에 한 줄 추가
- 캐치프레이즈는 landing 의 Core Brain ribbon 영역에 surface (별도 PR)
- 어휘 정책 위반은 `npm run check:lexicon` 이 CI 에서 차단

---

## 라이브

- Web preview: <https://simon-yhkim.github.io/2nd-B/>
- Source: <https://github.com/Simon-YHKim/2nd-B>
- Architecture: `docs/ARCHITECTURE.md`
- Hard constraints: `docs/CONSTRAINTS.md`
- Design: `DESIGN.md`
- Handoff: `docs/HANDOFF.md`
