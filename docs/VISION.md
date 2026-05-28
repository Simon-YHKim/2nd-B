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

- 라우트 미정 (가칭 `/dream`, `/구상`)
- 상세 spec: **`docs/dream-surface-spec.md`**
- 현재 상태: **미구현** — 다음 분기 작업
- 자리: 현재 13개 분석 도구 중 *어디에도 없는* 새 영역

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
