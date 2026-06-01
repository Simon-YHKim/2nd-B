# Dream Surface Spec — "공상 → 구체화"

> 비전 §3 의 구현 spec. `docs/VISION.md` 의 세 번째 축을 채우는 첫 표면.

---

## 1. 무엇을 만드나

사용자가 떠올린 공상·아이디어·꿈을 입력하면, AI 가 **사용자 자신의 vibe** (페르소나·과거 records·이전 공상) 를 흡수해 함께 펼치고, 다음 한 걸음까지 떨어뜨려주는 도구.

핵심 명제 — *"AI 가 누구나 같은 답을 내는 시대, 나의 데이터로 작동하는 AI 만이 나에게 의미 있다."*

## 2. 라우트 + 라벨

| 항목 | 값 | 근거 |
|---|---|---|
| 라우트 | `/imagine` | 다른 라우트들이 영어 일관성 (`/audit`, `/persona`, `/jarvis` 등) |
| 사용자 라벨 (KO) | **공상 노트** | "공상" 은 사용자 진술의 원어, 어휘 정책 ✅ |
| 사용자 라벨 (EN) | **Imagine** | 영어 라벨은 동사형 (창의 agency 강조) |
| 별자리 위치 | Tier-2, "Wiki/세컨비" 사이 신규 노드 | NavGraph `MENU_NODES` 에 1줄 추가 |

## 3. UX — 한 화면, 좌측 입력 · 우측 응답

```
┌─────────────────────────────────────────────────────────┐
│  공상 노트                                                │
│                                                          │
│  ┌────────────────────────────────────────┐              │
│  │ 이런 거 떠올렸어요…                       │              │
│  │ [user types]                            │              │
│  └────────────────────────────────────────┘              │
│                                  [같이 그려볼까요 →]      │
│                                                          │
│  ─── 응답 카드 (4) ──────────────────────────              │
│  ① 펼친 묘사    — 사용자 vibe 로 발전된 한 단락             │
│  ② 비슷한 과거   — 이전 공상/records 연결 (0~2개)           │
│  ③ 다음 한 걸음 — 구체화 행동 1개                         │
│  ④ 가늠         — 난이도 · 예상 시간 · 첫 비용             │
│                                                          │
│              [이 공상 더 키워볼까요?]                       │
└─────────────────────────────────────────────────────────┘
```

- **입력 영역** 은 `journal` 의 Input 컴포넌트 재사용. 자유 한 줄 ~ 한 문단.
- **응답 카드** 는 `persona` 페이지의 카드 패턴 재사용 (darkSky tokens).
- **"더 키워볼까요?"** 버튼은 응답 ①을 새 입력으로 넣어 재귀 호출 — *공상의 사다리*.
- 결과는 자동 저장 → `/wiki` 와 다음 공상의 RAG 컨텍스트로 흡수.

## 4. 데이터 흐름

```
사용자 입력
    │
    ├─ ① classifyInput()                          ← C9
    │     └─ RED zone → 입력 거부 + crisis hint
    │
    ├─ ② RAG retrieve                             ← src/lib/knowledge
    │     • persona traits (top-5)
    │     • 최근 records (시기·도메인 가중)
    │     • 과거 imagine 노트 (vibe 매칭)
    │     limit 20
    │
    ├─ ③ rank → fuse → distill                    ← engines.ts 재사용
    │
    ├─ ④ Gemini Pro callAdvisor()                 ← C1/C2
    │     system: "사용자의 voice/패턴/가치관으로
    │              공상을 펼친다. 결과 4 카드."
    │     output: { expanded, related, nextStep, gauge }
    │
    ├─ ⑤ classifySafety(output) → output swap      ← C9 (advisor-output-swap 패턴)
    │
    ├─ ⑥ insertAiAuditLog                          ← C3
    │
    └─ ⑦ records INSERT (type='imagine')
          + memorize (engines.ts) → memorized_patterns
```

## 5. DB

**Option A (선택)** — 기존 `records` 테이블에 흡수:
- `records.type` enum 에 `'imagine'` 추가 (마이그레이션 0017)
- 별도 컬럼: `records.imagine_meta` (jsonb, nullable) — `{expanded, related_ids, next_step, gauge}`
- 이유: persona/insights/wiki 가 모두 records 위에서 작동 → 공상도 같은 흐름으로 합류

Option B (보류) — 별도 `imagine_notes` 테이블. records 와 너무 다른 schema 가 필요해지면 그때 분리.

## 6. 프롬프트 골격

`src/lib/imagine/prompts.ts` (NEW):

```ts
export function buildImaginePrompt(input: {
  userThought: string;
  persona: PersonaSnapshot;
  recentRecords: RecordSlice[];
  pastImagines: ImagineSlice[];
}): string {
  // 1) PERSONA: voice/values/strengths summary (3-5 lines)
  // 2) RECENT CONTEXT: 최근 records 의 추출문 (UNTRUSTED fence)
  // 3) PAST IMAGINES: 비슷한 vibe 의 과거 공상 (UNTRUSTED fence)
  // 4) USER THOUGHT: 이번 입력 (UNTRUSTED fence)
  // 5) INSTRUCTION:
  //    - 사용자의 어투/관점/가치관으로 *발전된 묘사* (한 단락)
  //    - 위 PAST IMAGINES / RECENT CONTEXT 중 의미 있는 연결 (0~2)
  //    - 다음 한 걸음 (구체적, 24시간 안에 시작 가능한 행동 1개)
  //    - 가늠: 난이도(1-5) · 예상시간 · 첫 비용(KRW 추정)
  //    - 결과는 JSON: { expanded, related, nextStep, gauge }
}
```

UNTRUSTED fence + INJECTION GUARD rubric — `retrieve.ts` 의 패턴과 동일.

## 7. 검증

**단위 (jest):**
- `prompts.test.ts` — buildImaginePrompt 의 snapshot + UNTRUSTED fence 존재 검증
- `vibe-match.test.ts` — past imagine vibe scoring pure 함수

**통합 (jest + mock):**
- mock Gemini 응답으로 full flow (classify → RAG → prompt → output swap → audit log → record insert)

**E2E:** 라이브 (라이브에선 사용자가 직접 확인)

## 8. Constraints — C1~C12 매핑

| Constraint | 만족 방식 |
|---|---|
| C1 (LLM 단일 경로) | callAdvisor 만 사용 |
| C2 (Vertex 분기) | wrapper 가 처리, 추가 작업 없음 |
| C3 (audit log) | insertAiAuditLog 호출 |
| C4 (revenue) | 무관 |
| C5 (testimonials) | 무관 |
| C6 (judge mode) | 무관 |
| C7 (i18n parity) | EN/KO 키 추가 — `imagine.json` |
| C8 (knowledge sources) | 무관 (사용자 데이터만 RAG) |
| C9 (safety classify) | input + output swap 양쪽 |
| C10 (age 14+) | AuthContext 가드 재사용 |
| C11 (SLA) | 무관 |
| C12 (pre-existing assets) | README 갱신 — Gemini Pro 사용 명시 |

## 9. 어휘 정책 (VISION.md §어휘)

❌ 금지 어휘 (clinical) 가 화면 어디에도 나와선 안 됨. 응답 카드의 모든 문구 sweep — `i18n/imagine.json` 작성 시 `human-voice-guard` 통과 필수.

권장 톤 ("creative agency"):

| ❌ 피함 | ✅ 사용 |
|---|---|
| "분석해보면" | "같이 그려보면" |
| "당신의 패턴" | "이 결로 가면" |
| "추천 행동" | "다음 한 걸음" |
| "심리적으로" | (불필요) |

## 10. PR 분할 — 작업 순서

| # | 작업 | 크기 | PR |
|---|---|---|---|
| 1 | DB 마이그 0017 (records.type enum + imagine_meta) | small | 분리 가능 |
| 2 | `src/lib/imagine/` 모듈 (prompt + types) + 단위 테스트 | medium | 본 PR |
| 3 | `/imagine` 화면 + i18n + AppNav 통합 | medium | 본 PR |
| 4 | NavGraph 의 Tier-2 노드 추가 | small | 별도 (UI tweak) |
| 5 | 캐치프레이즈 landing surface | small | 별도 (비전 PR series) |

## 11. Out of scope (첫 구현에서 뺀다)

- 음성 입력 (Web Speech API) — 다음 sprint
- 이미지 첨부 (Gemini multimodal) — capture v2 가 이미 처리, 필요 시 share
- 협업 모드 (다른 사용자의 공상 보기) — never (사적 도구)
- 공상 공유 (URL) — 결정 보류 (개인정보 우려)

## 12. Open questions (사용자 결정 필요)

| Q | 옵션 | 기본값 |
|---|---|---|
| Q1 | 라우트 이름 `/imagine` 확정? `/dream` 대안? | `/imagine` |
| Q2 | 사용자 라벨 KO "공상 노트" 확정? "구상", "꿈터" 대안? | "공상 노트" |
| Q3 | NavGraph 위치 — Tier-2 신규 vs Tier-3 wiki 자식? | Tier-2 신규 (새 축이라 표면 격) |
| Q4 | "더 키워볼까요?" 재귀 호출 무한 vs 한도 (예: 3회)? | 한도 3회 (chat_usage 와 같은 패턴) |
| Q5 | DB Option A (records 흡수) vs B (별도 테이블)? | A |

## 13. 라이브 / 산출물

- Web preview: <https://simon-yhkim.github.io/2nd-B/imagine> (구현 후)
- 별자리에서 Tier-2 노드로 surface
- `docs/HANDOFF.md` 의 작업 큐에 추가
