# 2nd-Brain — Gemini 컨설팅 컨텍스트

> Gemini (또는 다른 LLM) 에게 우리 앱의 세계관·UI·메타포를 컨설팅 받기 위해
> 첨부하는 prompt-ready 문서. 우리 앱의 정체성, 화면 구성, 도구 13종, 안전·어휘 정책을
> 한 자리에 정리.
>
> Gemini 첫 라운드 산출물 ("마음 조립 공장 — Soul Cell Project") 에 대한 우리 평가도
> 마지막 섹션에 첨부 — 다음 라운드의 정렬을 위해.

---

## §0. 한 줄 요약

> **AI 시대, 가장 가치있는 것은 나 자신 입니다.**

이 앱은 *나에 대한 데이터* 를 모으고 → *나에게 맞춰 작동하는 AI* 로 키우고 → *나와 같은 결로 공상을 함께 펼치는* 도구. Build with Gemini XPRIZE 출품작 (Education & Human Potential, 마감 2026-08-17).

---

## §1. 세 축 (Three Pillars)

| # | 축 | 의미 | 비고 |
|---|---|---|---|
| 1 | **알아가기** | 정량 평가 + 시기 회고 + 일상 입력 + LLM 인터뷰로 *나에 대한 데이터* 축적 | 13 도구 중 8개 |
| 2 | **개인 비서 기반** | 그 데이터 위에서 *나에게 맞춰* 작동하는 RAG 기반 AI | 13 도구 중 5개 |
| 3 | **공상 → 구체화** | 떠오른 아이디어를 *나와 같은 결로* 함께 펼치고 다음 한 걸음까지 떨어뜨림 | 미구현, `/imagine` (가칭) |

모든 새 기능은 어느 축에 속하는지 PR 설명에 명시. 어떤 축에도 속하지 않으면 우리 앱이 아님.

---

## §2. 화면 구성 — 별자리 네비 (NavGraph)

### Tier 구조

```
                    Tier 1 (중심, 1 노드)
                          ●  Core Brain  ← 사용자의 종합 프로필
                          │
              ┌───────────┼───────────┐
              │           │           │
              ●           ●           ●  Tier 2 (영역, 3 노드)
           영역A        영역B        영역C
              │           │           │
        ┌─────┴─┐       ┌─┴─┐     ┌──┴──┐
        ●       ●       ●   ●     ●     ●  Tier 3 (가면, 7+ 노드)
        │       │       │   │     │     │
        ●●●●  ●●●●●  ●●●  ●●●●  ●●●  ●●●●●  Tier 4 (실제 데이터 점)
```

- **Tier 1 — Core Brain** (북극성): 사용자의 종합 프로필. 모든 데이터의 종착지.
- **Tier 2 — 영역**: 사용자 인생을 구성하는 큰 영역들.
- **Tier 3 — 가면**: 영역 안에서 사용자가 쓰는 페르소나/역할들. 탭하면 *who / for whom / goal / do / fuel* 5필드 카드.
- **Tier 4 — 데이터 점**: 실제 wiki 페이지·records.

### 인터랙션
- Tier 1~3 노드는 별자리처럼 천천히 떠다님 (drift), 살짝 호흡 (pulse), 진입 시 순차 "뽁!" 사운드와 함께 등장 (overshoot 1.25×).
- 노드 탭 → 말풍선 → "들어갈까요?" 확인 → 해당 라우트.
- 별자리 자체 pinch/2-finger pan/double-tap reset (구현 완료, PR #36).
- 페이지 자체 zoom 은 lock (메인 + 모든 페이지).

### 메인 화면의 추가 표면
- 우상단 **설정** 톱니 아이콘.
- 우하단 **세컨비 (2ndB)** 진입 floating 버튼.
- 상단 **Core Brain ribbon** 영역 (캐치프레이즈 또는 사용자 인사).

---

## §3. 도구 13종 — 카탈로그

### 축 1 · 알아가기 (8)

| 라우트 | 도구 | 분류 | 출력 |
|---|---|---|---|
| `/big-five` | Big Five (TIPI) | 검증된 정량 (Gosling et al. 2003) | O/C/E/A/N 5점수 |
| `/mbti` | MBTI-style 16-item | 정량 (요청형) | 4글자 + nickname |
| `/attachment` | Attachment (ECR-S) | 검증된 정량 (Wei et al. 2007) | 4 스타일 + anxiety/avoidance |
| `/audit` | 과거의 나 (시기 회고) | LLM-free 5문항 | 시기별 records |
| `/interview` | 심층 인터뷰 (5×5 drill-down) | LLM-driven probe | 25-cell matrix 진행 |
| `/journal` | 일상 자유 기록 | 자유 입력 + streak + XP | daily records |
| `/capture` | 자재 반입 (5-mode) | memo/link/clip/OCR/file | wiki sources |
| `/wiki` | 사용자 위키 브라우저 | 축적 read side | wiki_pages |

### 축 2 · 개인 비서 기반 (5)

| 라우트 | 도구 | 역할 |
|---|---|---|
| `/jarvis` | **세컨비** (2ndB) | RAG-backed chat. 사용자 wiki + persona 위에서 응답. 일일 limit. |
| `/persona` | 페르소나 카드 | 패턴 surface. Top-3 trait. (현재 heuristic, Sprint 3 LLM 전환 예정) |
| `/insights` | "요즘 뭘 적었나" 종합 | LLM 없이 records 위 derive |
| `/trinity → /core-brain` | **Core Brain** dashboard | 영역별 (북극성/영역/가면) 종합 (현재 4-domain trinity → Core Brain 으로 rename 중) |
| `/research` | 참조 문헌 브라우저 | Big Five/SDT/Attachment/CBT 등 검증 사료 (DOI/URL 검증쌍) |

### 축 3 · 공상 → 구체화 (1, 미구현)

| 라우트 | 도구 | 상태 |
|---|---|---|
| `/imagine` | 공상 노트 | spec only (`docs/dream-surface-spec.md`), 다음 sprint |

---

## §4. 데이터 흐름 — RAG 6 엔진

`src/lib/knowledge/` + `src/lib/llm/`.

```
사용자 입력 (모든 LLM 호출)
    │
    ├─ classify     ← C9 안전 분류 (red zone short-circuit)
    │                  lexicon (7EN+4KO forbidden, 12EN+19KO crisis) + Gemini Flash
    │
    ├─ retrieve     ← persona + recent records + wiki + 과거 imagine 노트
    │
    ├─ rank         ← pure 함수, 시기·도메인 가중치
    │
    ├─ fuse         ← 다중 framework round-robin
    │
    ├─ distill      ← first + last + packed middle
    │
    ├─ Gemini Pro   ← 단일 wrapper (C1), Vertex AI 분기 (C2)
    │
    ├─ output safety re-classify  ← C9 swap if RED
    │
    ├─ ai_audit_log INSERT        ← C3 (모든 호출 기록)
    │
    └─ memorize → memorized_patterns
                       └─ buildPersona() 가 histogram 읽어서 surface
```

---

## §5. C1~C12 Hard Constraints (CI 강제)

| # | 규칙 | 위치 |
|---|---|---|
| C1 | 모든 LLM 호출은 `src/lib/llm/gemini.ts` 단일 경로 | ESLint + boundary script |
| C2 | Vertex AI 분기 (`@google/genai` + `vertexai: true`) | wrapper getClient() |
| C3 | 모든 Gemini 호출에 `ai_audit_log` INSERT | wrapper |
| C4 | revenue_events 에 month_bucket + is_related_party + customer_relation_type | migration + trigger |
| C5 | testimonials.consent_given_at NOT NULL | migration |
| C6 | Judge mode 자동 플래그 (@xprize.org / @devpost.com / @hacker.fund) | trigger + lib |
| C7 | i18n EN↔KO 키 parity, EN canonical | check script |
| C8 | knowledge_sources 는 DOI/URL + 검증쌍 필수 | migration |
| C9 | classifyInput 이 모든 LLM 호출 전에 실행 | wrapper |
| C10 | 가입 시 birth_date ≥ 18 | UI + auth + DB CHECK |
| C11 | Support SLA = 2 business days (KST) | README |
| C12 | README "Pre-existing assets used" 섹션 | README |

---

## §6. 어휘 정책 (Vocabulary Policy)

이 앱은 **정신건강·심리치료 앱이 아님**. CI 가 다음 어휘를 차단:

| ❌ 금지 (CI 차단) | ✅ 사용 |
|---|---|
| mental health, therapy, counseling | self-understanding, growth |
| diagnosis, treatment, healing, cure | reflection, self-knowledge |
| 정신건강, 심리치료, 심리상담, 치유 | 자기 이해, 성장 |

톤: *clinical voice* 가 아니라 *creative agency* 의 voice. "분석" 보다 "같이 그려보면", "추천" 보다 "다음 한 걸음".

---

## §7. 디자인 시스템 (DESIGN.md 발췌)

- **다크 모드 기본** — 메인 화면은 라이트 모드에서도 검정 배경 (별자리가 빛나야 함).
- **라이트 모드 일반 페이지** — 스타벅스 팔레트 (그린 #006241 / 크림 #f7e9d8 / espresso #1e3932 / gold #cba258).
- **첫 모드 선택** — 시스템 `prefers-color-scheme` 따라감.
- **금지** — Inter 폰트 (AI slop), pure black, bounce/elastic easing (단 "뽁!" overshoot 만 예외), 4색+ 다채, em dash 가 UI 카피에 노출.
- **권장 폰트** — 한국어 Pretendard, 영문 SF/system.
- **컬러 토큰** — `src/lib/theme/tokens.ts` 의 `semantic.*` 만 사용. hex literal 금지.
- **(예정)** — Brain 완성도/사용 빈도에 따른 자연 컬러 팔레트 동적 변형.

---

## §8. 사용자의 명시 변경 요청 (2026-05-28)

UI/UX 큰 변경 — Gemini 가 다음 산출물에서 함께 고려:

1. **메인 화면**
   - 페이지 자체 zoom 시 흰 공간 보이는 문제 → 페이지 zoom 완전 lock, 별자리 그래프만 zoom 가능
   - 세컨비 진입 버튼 → 우하단 floating
   - 설정 진입 → 우상단 톱니 (페이지 하단 진입 삭제)
   - 라이트 모드여도 메인은 검은 배경
   - 터치-드래그 → 그래프 라이브 follow, 손 떼면 가운데 복귀

2. **Core Brain 화면 (Brain Trinity 명칭 → Core Brain 통일)**
   - 결과 카드 표기 순서: 북극성 → 영역 → 가면 (기존 "모자" → "가면" rename)
   - 가면 탭 → who / for whom / goal / do / fuel 상세
   - NavGraph 의 tier 구조와 동일 구조로 정렬

3. **공통**
   - 하단 "네비게이터로" 버튼 삭제, 좌상단 화살표만 유지 (라벨 텍스트도 삭제)
   - 첫 다크/라이트 = 시스템 설정 따라감
   - 라이트 모드 배경 = 스타벅스 팔레트
   - Brain 완성도/빈도에 따라 컬러 팔레트 자연 변형 (새벽→일출→낮→황혼→밤 같은 phase 추측)

---

## §9. Gemini 1차 산출물 평가 — "마음 조립 공장 (Soul Cell Project)"

Gemini 가 1차에 보낸 세계관 기획서에 대한 우리 측 평가:

### ✅ 잘 맞는 부분

- **나노 로봇이 호스트의 데이터로 영혼을 조립** — 비전 §1 (알아가기) + §2 (개인 비서 기반) 메타포 완벽 정렬
- **소울 코어 (The Soul Core)** — 우리 **Core Brain** 과 매핑 가능. "유저의 가치관과 취향이 쌓일수록 진화" 라는 묘사가 우리 의도와 정확히 일치
- **계층화된 공장** (관제탑 → 정제소 → 보관소) — 우리 NavGraph Tier 1~4 구조와 매핑 가능
- **소울 셀 캐릭터** (Ruta/Memo/Guard/Archi) — 우리 RAG 6 엔진을 anthropomorphize 한 형태로 활용 가능

### 🤔 디테일이 안 맞는 부분

- **"호스트의 멘탈이 다쳤을 때"**, **"위로 패치"** 등 표현 — 우리 어휘 정책 §6 위반. clinical voice 회피 필요. 대안: "호스트가 새 자극을 받았을 때", "공명 패치"
- **"마음 반창고 & 위로 렌치"** — 명칭이 *치료* 느낌. 대안: "공명 도구", "결 맞춤 렌치"
- **"분노 큐브 (붉은빛의 뜨거운)"** — 단순 감정 분류가 아니라 *사용자 패턴/관점* 데이터가 우리 모델의 본체 (Big Five trait, attachment style, 페르소나 voice). 큐브를 *감정 단위* 가 아니라 *통찰 단위* 로 재정의 필요
- **세 번째 축 부재** — Gemini 1차에는 *공상 → 구체화* 메타포가 없음. "Archi (설계팀 리더)" 가 가장 가깝지만, 사용자의 *미래의 자신* 을 함께 그리는 표면이 따로 필요

### 💡 매핑 후보 (다음 라운드 입력)

| 우리 도구 | Gemini 메타포 매핑 |
|---|---|
| Core Brain (Tier 1) | Soul Core |
| Tier 2 영역 | 공장의 부서 (감정 정제소 / 기억 보관소 / ...) |
| Tier 3 가면 | 부서의 전문 셀들 |
| RAG retrieve | Ruta (수집 배달팀) |
| RAG memorize | Memo (아카이브팀) |
| Safety classifier C9 | Guard (수리 방어팀) 가 더 적합 — "수리" 가 아니라 "방어" 강조 |
| persona builder | Archi (설계팀 리더) |
| 공상→구체화 `/imagine` | **신규 캐릭터 필요** — 사용자와 함께 *꿈을 펼치는* 셀. 가칭: **Vela** (별 이름) |

### 🎯 Gemini 다음 라운드에 부탁할 것

1. 우리 어휘 정책 §6 준수한 표현으로 전면 rewrite
2. "공상 → 구체화" 의 세계관 메타포 추가 (가칭 **Vela** 캐릭터)
3. UI 화면 mock — 메인 (별자리 + 우하단 세컨비 + 우상단 설정) + Core Brain (북극성-영역-가면) + 공상 노트
4. 라이트/다크 모드 양쪽 컬러 팔레트 — 다크는 우리 darkSky, 라이트는 스타벅스 톤
5. Brain 완성도에 따라 컬러가 *자연 단계* (예: 새벽→낮→황혼→밤) 로 변하는 시퀀스 제안

---

## §10. 라이브 / 산출물 링크

- Web preview: <https://simon-yhkim.github.io/2nd-B/>
- Source: <https://github.com/Simon-YHKim/2nd-B>
- 비전: `docs/VISION.md`
- 아키텍처: `docs/ARCHITECTURE.md`
- 제약: `docs/CONSTRAINTS.md`
- 디자인: `DESIGN.md`
- 핸드오프: `docs/HANDOFF.md`
- 공상 spec: `docs/dream-surface-spec.md`
- 분석 도구 카탈로그: `docs/analysis-tools-catalog.html`
