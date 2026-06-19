# Personal Assistant — Integration Roadmap

> Axis **(2) 개인 비서 기반**. How each of the 14 ops life-areas gets *real data*,
> at the lowest cost, with correctness guaranteed. Companion to `docs/CONCEPT.md`.
> Status as of 2026-06-19.

## 0. Standing principle — harness-first (per-feature best-in-class)

**When a feature needs AI or a non-trivial algorithm, do NOT roll our own and do
NOT call a raw model blindly. First scan GitHub for the category-leading,
proven harness / library / method and use that.** AI is the *last* resort, never
the default.

Reconciled with the hard constraints:

- **C1 (all LLM through `src/lib/llm/gemini.ts`; ESLint blocks other LLM SDKs).**
  So a third-party harness that ships its *own* model SDK is NOT allowed. The
  harness-first rule applies to the **non-LLM** parts (algorithms, parsers, data
  clients) freely, and to the **LLM** parts as *proven patterns* (structured
  output, map-reduce summarize, few-shot classify) routed **through the C1
  gateway** — not as a competing SDK.
- **C9** classify before every LLM call; **C3** audit every call. A harness never
  bypasses these.
- **$0/mo**: prefer MIT/Apache, zero-cost APIs, on-device compute.

Build-time checklist for any AI/algorithmic feature:
1. Is there a deterministic / free-API way? If yes, AI is not needed.
2. If an algorithm is needed, pick the GitHub category leader (stars + recency +
   maintenance), MIT/Apache, types included.
3. If the LLM is genuinely needed, use the proven prompt/validation pattern,
   route through `gemini.ts`, clamp + schema-validate the output, cache + cap.

## 1. Integration mechanisms (cost + correctness order)

| Mechanism | What | Correctness | Cost |
|---|---|---|---|
| 🟢 Sensor auto-complete | deterministic event → `ops_routine_logs` tick | perfect (deterministic) | $0 |
| 🔵 Free public API | fetch real data (= ground truth), display/feed | source = truth | $0 |
| 🟡 Manual structured input | user logs → tracked | user = truth | $0 |
| ⚪ AI suggest | LLM proposes from wiki (capped + cached) | clamp + ratify | free-tier |
| 🔴 OAuth / heavy | auth + infra required | — | gated (later) |

## 2. Correctness model (why AI output is never trusted raw)

Already encoded in the codebase; every AI feature reuses it:

- **Clamp / schema-validate** — `parseOpsRecommendations` (src/lib/ops/recommend.ts)
  is the template: the model proposes, deterministic code validates lengths,
  ISO dates, enums, and drops malformed output.
- **propose → ratify** — AI proposes, the *user ratifies* before anything becomes
  "truth" (wiki canon, src/lib/wiki, shipped #464).
- **Fact vs interpretation** — objective data (steps, transactions, calendar,
  fetched article text) comes from deterministic sources; AI only summarizes /
  suggests over fenced `<UNTRUSTED>` data, never invents the underlying fact.
- **Provenance** — sources carry a URL / id (wiki C8 pattern), so a claim is
  traceable.

## 3. The 14 areas — cheapest viable source

> 🇰🇷 **data.go.kr (공공데이터포털)** is the $0 goldmine for a Korea-first app:
> 환율, 도서관, 식품영양, 날씨, 미세먼지 — all free public APIs.

| Area | Cheapest source | Mech | AI? | $0 | Proven harness / method (GitHub) | ops hook |
|---|---|:--:|:--:|:--:|---|---|
| 👟 운동 / 🧘 건강 | Health Connect · HealthKit | 🟢 | ✗ | ✓ | `react-native-health-connect`, `@kingstinct/react-native-healthkit` | auto-complete **(Slice 1 shipped, Slice 2 draft)** |
| ✅ 일일 집중 | **Pomodoro timer** (on-device) | 🟢 | ✗ | ✓ | deterministic; `expo-notifications` for interval alarms | session done → auto-complete |
| 🗣️ 언어 연습 | SRS flashcards (on-device) | 🟢🟡 | ✗ | ✓ | **FSRS** algorithm (`ts-fsrs`, MIT — the modern category leader, post-SM-2) | review due → auto-complete |
| 🧹 집 정리 | checklist (already present) | 🟡 | ✗ | ✓ | deterministic | item check → complete |
| 📰 뉴스 요약 | RSS (연합/네이버) + 1 cached AI summary | 🔵⚪ | △ | ✓ | `rss-parser` (parse); map-reduce summarize **through gemini.ts** | feed + suggest |
| 💰 재정 점검 | manual ledger + FX API | 🟡🔵 | ✗ | ✓ | 한국수출입은행 OpenAPI (free); deterministic ledger | record → track |
| 📚 독서 목록 | Google Books / 국립중앙도서관 API | 🔵🟡 | ✗ | ✓ | Google Books REST (free, no key for search); 도서관정보나루 | progress → track |
| 🥗 식단 / 🥣 간단식사 | 식약처 식품영양 API + AI suggest | 🔵⚪ | △ | ✓ | data.go.kr 식품영양성분 DB; suggest through gemini.ts | plan + suggest |
| 📒 학습 목표 / 🧗 커리어 | manual milestones + periodic AI check | 🟡⚪ | △ | ✓ | deterministic milestones; reflection prompt through gemini.ts | progress → track |
| 💪 운동 아이디어 | AI suggest only (already) | ⚪ | ✓ | ✓ | existing `recommendForDomain` (C1 gateway) | suggest |
| 🎨 사이드 프로젝트 | GitHub API (public, free) or manual | 🔵🟡 | ✗ | ✓ | `octokit` (official) for commit activity | commit → progress |

## 4. Build order (4 waves)

- **Wave 1 — 🟢 deterministic · no-AI · no-native · reuses the health auto-complete
  pattern**: **Pomodoro (daily_focus)** → language SRS (ts-fsrs) → home_reset
  checklist formalization. *All headless-verifiable, immediate.*
- **Wave 2 — 🔵 Korea free public APIs (AI optional)**: news RSS + cached summary →
  FX (money_check) → Google Books (reading_list).
- **Wave 3 — 🟡 manual structured + light AI**: meal planner → finance ledger →
  learning / career reflection.
- **Wave 4 — 🔴 OAuth / native gates**: Notion connector · GitHub (side_project) ·
  오픈뱅킹 · ship Health Slice 2 after on-device QA.

## 5. Current status

- **Manage layer (suggest · save · alarm · calendar · completion tracking) —
  all 14 areas** (Phase A, `src/lib/ops/routines.ts`, domain-agnostic). Shipped.
- **External data source** — exercise/activity only so far (Phase B health:
  Slice 1 shipped, Slice 2 native draft #473). Every other area has the manage
  layer but no dedicated source yet — this roadmap closes that, Wave by Wave.

> Next: Wave 1 — Pomodoro for `daily_focus`, the deterministic / $0 / no-AI
> exemplar of the sensor-auto-complete pattern.
