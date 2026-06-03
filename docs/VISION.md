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
| Big Five (TIPI) | `/big-five` | 검증된 정량 |
| MBTI 16-item | `/mbti` | 정량 (요청형) |
| Attachment (ECR-S) | `/attachment` | 검증된 정량 |
| 과거의 나 | `/audit` | 시기 회고 |
| 심층 인터뷰 | `/interview` | LLM drill-down 5×5 |
| 일상 기록 | `/journal` | 자유 입력 + streak |
| 자재 반입 | `/capture` | 5-mode (memo/link/clip/OCR/file) |
| 사용자 위키 | `/wiki` | 축적 read side |

### 2. 개인 비서 기반 — RAG 위 vibe

축적된 데이터 위에서 *나에게 맞춰* 작동하는 AI.

| 표면 | 라우트 | 역할 |
|---|---|---|
| 세컨비 (2ndB) | `/jarvis` | RAG-backed chat, 사용자 wiki 위에서 응답 |
| 페르소나 카드 | `/persona` | 패턴 surface, top-3 trait |
| insights | `/insights` | "요즘 뭘 적었는가" 종합 |
| Brain Trinity | `/trinity` | 건강 / 앱 / 뇌 / 재정 4영역 |
| 참조 문헌 | `/research` | RAG 가 ground 하는 검증된 출처 |

### 3. 공상 → 구체화 — 미래의 나

떠오른 아이디어·꿈·욕망을 *나와 같은 결* 로 함께 펼치고 다음 단계로 떨어뜨리는 도구.

- 실현: SecondB 대화의 **Divergent 모드** — 장소(마을 노드)가 아니라 대화 모드다 (세계관 v-final).
- 짝: **Analytic 모드** (사용자 data 기반 분석/조언). Divergent 는 data 기반이되 전혀 다른 관점.
- 안전: 두 모드 모두 C9(classifyInput) → C3(ai_audit_log) → `gemini.ts` 경로. 공상이 안전 분류를 우회하지 않는다.
- 상세 spec: **`docs/dream-surface-spec.md`** (장소 전제 부분은 v-final 기준으로 갱신 대상).

---

## 세계관 (v-final) — 5계층 모델

> 정본. 그래프 / 네비게이션 / 마스코트 / 색은 모두 이 모델을 따른다.
> 중심에 가까울수록 "나"에 가깝고, 바깥으로 갈수록 원자료(Log)에 가깝다.

| 계층 | 이름 | 정체 | 마스코트 | 내부 키 |
|---|---|---|---|---|
| 1st | **Soul Core** ("나의 중심") | 5개 Pattern Core가 모여 형성되는 나의 중심 | **SecondB** | `core` |
| 2nd | **Pattern Core** (Pattern Tesseract 형태) | 5개의 패턴 핵 (아래) | (코어별) | — |
| 3rd | **Pattern Data** | Log 들로 만들어진 카테고리 | — | (도메인 태그) |
| 4th | **Log** | 사용자 기록 그 자체 (일 / 관계 / 지식 / 취미 등) | — | `sources` · `records` |
| 공통 | **Pattern Link** (Graph Network) | 전 계층을 잇는 신호 통로 = 그래프 엣지 | — | edges |

### 5개 Pattern Core (2nd layer)

| Pattern Core | 의미 | 마스코트 (구 이름) | 내부 키 |
|---|---|---|---|
| **Bond Core** | 관계와 사랑 | **Relia** (구 Gadi) | `relation` |
| **Wisdom Core** | 배움과 지식 | **Lumen** (구 Lulu) | `knowledge` |
| **Narrative Core** | 기록 보관소 | **Foreman Momo** (구 Momo) | `records` |
| **Muse Core** | 취향과 영감 | **Iris** (구 Lumi) | `taste` |
| **Growth Core** | 일과 성장 | **Archon** (구 Archi) | `work` |

> 내부 route / slug / DB 키(work / relation / knowledge / records / taste)는 회귀 위험 때문에
> 유지하고, 바뀌는 것은 사용자 표기 라벨 · 계층 개념 · 마스코트 이름뿐이다 (표시명 매핑 레이어:
> `src/lib/chat/personas.ts`, `src/lib/characters.ts`, `src/lib/graph/relatedness.ts::VILLAGE_LABEL`).

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

`src/lib/theme/tokens.ts` 의 **기존 토큰만** 사용한다 (신규 hex 금지). `semantic.*` 키는 유지하고 값만 이동.

| 대상 | 토큰 | hex |
|---|---|---|
| Soul Core / SecondB | `soulViolet` | #A78BFA |
| Growth Core / Archon | `signalBlue` | #4CC9F0 |
| Wisdom Core / Lumen | `signalMint` | #72F2C7 |
| Muse Core / Iris | `dreamPink` | #FF9FD6 |
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
| 정신건강, 심리치료, 심리상담, 치유 | 자기 이해, 성장 |

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
