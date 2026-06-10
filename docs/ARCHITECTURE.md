# Architecture

> Snapshot at Sprint 0. Evolves with each sprint.

## 세계관 (v-final) — 5계층 그래프 모델

정본은 `docs/VISION.md` "세계관 (v-final)". 코드 / 그래프 / 마스코트 / 색은 모두 이 모델을 따른다.

- **Tier 1 Soul Core** ("나의 중심", 마스코트 SecondB) — 5개 Pattern Core 가 모여 형성. 내부 키 `core`.
- **Tier 2 Pattern Core** (Pattern Tesseract) — 5개:
  Bond(관계·`relation`)/Relia, Wisdom(지식·`knowledge`)/Lumen, Narrative(기록·`records`)/Foreman Momo,
  Muse(취향·`taste`)/Lumina, Growth(일·성장·`work`)/Archon.
- **Tier 3 Pattern Data** — Log 로 만들어진 카테고리 (도메인 태그 분류, `src/lib/graph/relatedness.ts`).
- **Tier 4 Log** — 사용자 기록 그 자체 (`sources` / `records`).
- **Pattern Link** (Graph Network) — 전 계층을 잇는 그래프 엣지.

내부 route / slug / DB 키(work / relation / knowledge / records / taste)는 유지하고, 표시명 · 개념 ·
마스코트 이름만 표시 레이어에서 바뀐다 (`src/lib/chat/personas.ts`, `src/lib/characters.ts`,
`src/lib/graph/relatedness.ts::VILLAGE_LABEL`).

**공상 작업실**은 장소(Pattern Core 노드)에서 제거되고 SecondB 대화 모드로 전환된다:
**Analytic**(data 기반 분석) · **Divergent**(data 기반 + 전혀 다른 관점). 두 모드 모두
C9 → C3 → `gemini.ts` 경로를 타며 안전 분류를 우회하지 않는다(C9 유지). 구 `/imagine` 라우트 ·
스크린 · LLM purpose · 에셋 키는 vestigial 로 보존한다(회귀 위험 최소화).

## Seven Engines

| # | Engine | Responsibility | Sprint |
|---|--------|----------------|--------|
| 1 | Capture | Journal, free-form notes, life-audit Q&A. | S2 |
| 2 | Inference | Extract traits / values / decision patterns. Synthesize persona cards. | S3 |
| 3 | Memory (RAG) | Portable Markdown + JSON exports for Claude/ChatGPT. | S3 |
| 4 | Advisor | Toggle-mode guidance grounded in validated psychology. | S4 |
| 5 | Planner | Personality-calibrated action plans + reminders. | v1.1 |
| 6 | Curator | AI-curated psychology references with human verification. | S4 |
| 7 | Safety Classifier | Green/yellow/red zone routing. Always-on, bypass-impossible. | S0 |

## Hard Constraint to Code Map

| ID | Enforced at | Files |
|----|-------------|-------|
| C1 | ESLint + boundary script | `eslint.config.mjs`, `scripts/check-llm-import-boundary.ts`, `src/lib/llm/gemini.ts` |
| C2 | Env validation + wrapper branching | `src/lib/env.ts`, `src/lib/llm/gemini.ts`, `db/migrations/0004_ai_audit_log.sql` (vertex_backend col) |
| C3 | Wrapper auto-insert + import boundary | `src/lib/llm/gemini.ts`, `src/lib/supabase/audit.ts`, `db/migrations/0004_ai_audit_log.sql` |
| C4 | DB schema + column presence script | `db/migrations/0005_revenue_events.sql`, `scripts/check-constraints.ts` |
| C5 | DB NOT NULL + UI consent | `db/migrations/0006_testimonials.sql`, `src/components/consent/ConsentDialog.tsx` |
| C6 | Client whitelist + DB trigger | `src/lib/judge/domains.ts`, `db/migrations/0010_triggers.sql`, `src/components/auth/JudgeBadge.tsx` |
| C7 | i18n setup + CI script | `src/lib/i18n/*`, `locales/{en,ko}/*`, `scripts/check-i18n-keys.ts` |
| C8 | DB CHECK constraints | `db/migrations/0007_knowledge_sources.sql` |
| C9 | Wrapper pre-call classification | `src/lib/llm/gemini.ts`, `src/lib/safety/classifier.ts`, jest assertion |
| C10 | UI + client guard + DB CHECK | `src/components/auth/BirthDateField.tsx`, `src/lib/supabase/auth.ts`, `db/migrations/0002_users.sql` |
| C11 | README SLA + GitHub workflow skeleton | `README.md`, `.github/workflows/issue-sla.yml` |
| C12 | README section | `README.md`, `docs/ASSETS.md` |

## Data flow (Sprint 0 surface area)

```
User input
  → src/lib/llm/gemini.ts::callGemini()
      → classifyInput()       # C9
      → red ?  return routeCrisis()
      → getClient()           # C2 (Vertex when configured)
      → client.models.generateContent()
      → classifyInput(output) # output zone
      → insertAiAuditLog()    # C3 (best-effort)
  ← GeminiResult { text, safety, audit }
```

## What is NOT in Sprint 0

- Real EAS build, OTA deploy, App Store / Play Store submission
- Live Supabase project, Gemini API key, real LLM calls
- C11 auto-responder (only label skeleton present)
- Sentry / PostHog wiring (Sprint 1)
- RevenueCat / Toss / Stripe (Sprint 5)
- Android widget (Sprint 2)
- All engines except #7 (Safety Classifier scaffolded)

## RAG ingest + Jarvis (post-Sprint-0)

Lands in stages on top of the Sprint-0 surface. The schema and pure
helpers are in `db/migrations/0022_wiki_rag.sql` + `src/lib/wiki/`; the
Jarvis chatbot is in `db/migrations/0023_chat_usage.sql` + `src/lib/chat/`.

### Tables

| Table | Purpose |
|---|---|
| `sources` | Raw captured content metadata. 8 `kind` values mirror Obsidian Web Clipper templates. `storage_path` points at the raw markdown in the `raw-clippings` Supabase Storage bucket. Append-mostly; `ingested` + `ingested_at` track Phase 2 promotion. |
| `wiki_pages` | `source` \| `entity` \| `concept` pages. `(user_id, slug)` unique. `body_md`, `frontmatter` jsonb, `tags text[]` (GIN). `source_id` non-null iff `kind='source'`. |
| `wiki_links` | Directed `[[wikilink]]` edges. Composite FKs against `wiki_pages (user_id, id)` so cross-user edges are schema-impossible. PK `(from_page, to_page)`, no self-edges, cascade on page delete. |
| `chat_usage` | Per-user, per-day Jarvis turn counter. Day is KST-anchored. `bump_chat_usage` RPC for atomic increment. |

All four are owner-only RLS. `users.id ON DELETE CASCADE` propagates.

### Pure helpers (`src/lib/wiki/`)

| Module | Surface |
|---|---|
| `slug.ts` | `toSlug` — Hangul-aware Obsidian-style slug. Idempotent. |
| `wikilinks.ts` | `parseWikilinks` / `extractWikilinkSlugs` — full Obsidian syntax incl. `\|alias`, `#heading`, `#^block`. Code-block aware. |
| `clipper-kind.ts` | `detectClipperKind(url) → SourceKind`. Curated host sets (academic, ai-tool, video, reddit, code) with `inbox` fallback. |
| `frontmatter.ts` | `splitFrontmatter` / `joinFrontmatter` via `yaml@2.9.0`; `extractCommonFields` typed view of the clipper workflow fields. |
| `ingest-helpers.ts` | `buildSourcePayload(rawMd, fallbackUrl?, kindOverride?)` — single composition entrypoint. |
| `link-diff.ts` | `diffWikiLinks` — pure delta function (add / remove / dangling). |
| `export.ts` | `composeWikiExport` / `exportUserWiki` — cross-LLM markdown bundle (RAG PR 6). |

### Data-access + composite operations

| Module | What |
|---|---|
| `queries.ts` | sources + wiki_pages + wiki_links CRUD + `syncWikiLinks` (extract → resolve → diff → delete + insert). |
| `storage.ts` | `raw-clippings` bucket helpers. Files at `<userId>/<slug>.md` so storage-level RLS can scope on `foldername(name)[1] = auth.uid()::text`. |
| `capture.ts` | `captureFromMarkdown` — single-call ingest entrypoint (buildSourcePayload + uploadRawClipping + createSource). |
| `phase2.ts` | `generateSourcePage(userId, sourceId)` — Phase 2 source-page generation (no-LLM stub). Promotes a source to a `wiki_pages` row, runs `syncWikiLinks`, marks the source ingested. |

### Jarvis (`src/lib/chat/`)

| Module | What |
|---|---|
| `limits.ts` | `CHAT_DAILY_LIMIT` per tier (free 2 · Soma 30 · Cortex 80 · Brain 250, monetization v2 2026-06-10) + `kstDateToday` + `checkChatLimit`. |
| `usage.ts` | `readChatUsage` + `bumpChatUsage` (calls the `bump_chat_usage` RPC). |
| `conversation.ts` | `sendChatMessage` — checks limit, builds RAG context bundle via `exportUserWiki`, calls `callGemini(purpose='jarvis_chat')`, bumps usage on success. Crisis-routed turns (C9 red-zone short-circuit) don't burn quota. |

C1/C3/C9 are enforced automatically because every Jarvis turn goes
through `callGemini`. The mock LLM mode returns a deterministic
jarvis_chat response so the full UX is exercisable end-to-end without
a Gemini connection.

### Routes

| Route | Screen |
|---|---|
| `/` | Landing (signed-out) → redirect to `/journal` (signed-in + profile) or `/complete-profile` (signed-in, no profile yet). |
| `/sign-in` | Email/password + "Continue with Google". |
| `/sign-up` | Email/password + birth_date (C10). |
| `/complete-profile` | Post-OAuth birth_date prompt (C10 second line of defense). |
| `/journal` | Existing capture surface; navRow now: Capture · Inbox · Wiki · Jarvis · Life audit · Persona v1. |
| `/capture` | URL + pasted markdown with live "Detected: \<kind\>" preview. |
| `/inbox` | Captured sources with per-row kind chip, ingested badge, "Generate wiki page" action for unpromoted rows. |
| `/wiki` | Wiki page browser. Tag filter chips, tap to expand body + backlinks. |
| `/jarvis` | SecondB chat. Daily usage meter at the top. **Analytic / Divergent** mode toggle (worldview v-final): Analytic = data-grounded analysis, Divergent = data-grounded but explores radically different angles. Both route through `callGemini` (C9 → C3). |

### What's still ahead

- **Phase 1** (summarize + 4 reflection questions + auto-tag suggestions) — needs Gemini real connection
- **Phase 2 entity/concept extraction** — needs Gemini; current Phase 2 stub only promotes source pages
- **Force-directed graph view** — react-native-svg + simple force simulation, or WebView + cytoscape
- **OAuth Kakao/Naver Edge Functions** — needs provider API specs
- **Force `types.gen.ts` regen** — owed once 0022 + 0023 land on the remote project
