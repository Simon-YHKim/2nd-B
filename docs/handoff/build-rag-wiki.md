# 2nd-Brain · Coding Handoff — Build the Knowledge Base as RAG/Wiki

> **Source of truth** for the knowledge-base build. The actual implementation in this repo follows
> the **Path A (Karpathy Wiki)** recommendation from §5, adapted to our existing `db/migrations/`
> structure (instead of `supabase/migrations/` as drafted).

This file is verbatim from the original handoff for posterity. Skip to `docs/research/CLAUDE.md`
for the schema, `docs/research/batches/crisis-detection.md` for the crisis rubric, and
`src/lib/knowledge/` for the runtime modules.

---

## 1. Your Role

You are a **senior full-stack engineer** for **2nd-Brain**, a personalized self-understanding app being built for the **XPRIZE Build with Gemini** hackathon. Solo developer (Simon), deadline **2026-08-17 06:00 KST**, $0 fixed operating cost.

Constraints:
- Shippable code in 10 weeks, not perfect architecture
- Safety-critical paths first (crisis routing must never break)
- Gemini API only (no OpenAI, no Anthropic SDK — enforced by ESLint)
- Supabase free tier as the only backend
- Bilingual (Korean + English) from day one

---

## 2. What this repo actually has (mapping to handoff §2 file list)

| Handoff path | Actual path in this repo |
|---|---|
| `/CLAUDE.md` | `/CLAUDE.md` ✓ |
| `/docs/research/CLAUDE.md` | `/docs/research/CLAUDE.md` ✓ |
| `/docs/research/batches/{slug}.md` | `/docs/research/batches/{slug}.md` ✓ |
| `/docs/research/psychology-handoff.md` | `/docs/handoff/psychology-handoff.md` (this file's predecessor) |
| `/supabase/migrations/20260525000000_create_knowledge_sources.sql` | `/db/migrations/0007_knowledge_sources.sql` (already applied) |
| `/supabase/seed/{slug}.sql` | `/supabase/seed/{slug}.sql` ✓ |
| `/supabase/migrations/20260525001000_create_crisis_events.sql` | `/db/migrations/0012_crisis_events.sql` |

---

## 3. Architecture Context

2nd-Brain has 7 engines per the Master Blueprint. The knowledge base powers:
- **Engine 3 (Memory/RAG)** — portable knowledge base
- **Engine 4 (Advisor)** — grounded guidance
- **Engine 6 (Curator)** — human-in-the-loop pipeline for new batches
- **Engine 7 (Safety Classifier)** — green/yellow/red zone routing

**Engine 7 runs BEFORE every Advisor call.** Bypass impossible by design. Anchored on C-SSRS evidence in `crisis-detection.md`.

**Engine 4** grounds responses in `knowledge_sources` rows + batch sections. No "hallucinated psychology."

---

## 4. Hard Safety Rules (NON-NEGOTIABLE)

1. **Crisis content routes to fixed crisis-response strings BEFORE Advisor call.** Never let Gemini generate freeform crisis responses. Templates in `crisis-detection.md`.
2. **Safety Classifier must be bypass-impossible.** Wrapper around all Advisor calls in `src/lib/llm/gemini.ts`. ESLint forbids direct `@google/genai` imports elsewhere.
3. **Crisis events log to a separate restricted-access table.** Minimal-info logging — never raw plaintext crisis content.
4. **Never infer protected categories** (sexual orientation, religion, ethnicity, political views) from journal text.
5. **No diagnosis / treatment claims.** All persona-card outputs disclose "not a diagnosis."
6. **Korean RED-zone hotlines (1393, 1577-0199) and English (988) routed by user locale.**
7. **The Safety Classifier prompt must be tested with real Korean crisis text BEFORE wiring into the app.**

---

## 5. Path A — Karpathy Wiki style (chosen)

- Load `docs/research/CLAUDE.md` as system context for every Advisor LLM call (~14KB).
- When the routing table identifies relevant batches, load those markdown files inline (~3–8KB each).
- No embeddings, no vector DB. Pure markdown + Gemini context window.
- For lookups, simple keyword matching against `framework` / `summary_ko` / `summary_en` columns.

Pros: ships in days, $0 cost, zero new infrastructure, easy to debug, matches Karpathy's verified pattern at ~100-page scale. Cons: doesn't scale past ~1000 rows.

Path B (pgvector) is deferred to v2 after baseline product is in beta.

---

## 6. Required Deliverables (mapped to actual repo)

- **6.1 Migration**: `db/migrations/0007_knowledge_sources.sql` already applied. Add `0012_crisis_events.sql` + seed in `supabase/seed/`. Idempotent via `ON CONFLICT (doi) DO NOTHING`.
- **6.2 Loader module**: `src/lib/knowledge/loader.ts` with `loadSchema()`, `loadBatch(slug)`, `queryRows(filters)`.
- **6.3 Retrieval module**: `src/lib/knowledge/retrieve.ts` with `retrieveEvidence(input)` returning `{ matchedBatches, rows, schemaContext, assembledPrompt }`.
- **6.4 Safety Classifier**: `src/lib/llm/safety.ts` with `classifySafety(userMessage, locale)` → `{ zone, triggers, confidence, cssrsLevel }`. Gemini Flash call grounded in C-SSRS + Suicide CARE 2.0.
- **6.5 Gemini Wrapper**: extend `src/lib/llm/gemini.ts::callGemini` with mandatory safety pre-pass + RED-zone short-circuit to fixed templates + YELLOW-zone listening prompt + GREEN-zone grounded Advisor call.
- **6.6 Crisis events migration**: `db/migrations/0012_crisis_events.sql`. RLS enabled, no general policies. Service role only.
- **6.7 Test suite**: Korean RED/YELLOW/GREEN corpus (≥20 each). 0 false negatives on RED. Retrieval tests for routing table.
- **6.8 Documentation**: `docs/handoff/build-rag-wiki-OUTPUTS.md`.

---

## 7. Prompt Assembly Template (Advisor)

```
SYSTEM:
You are 2nd-Brain's Advisor. Ground every response in the curated research below.
Never make unsupported claims. Never diagnose or claim therapeutic outcomes.

=== HARD SAFETY RULES (from docs/research/CLAUDE.md §0) ===
{paste verbatim}

=== USER CONTEXT ===
Locale: {ko|en}
Age range: {if known}
Recent themes: {brief summary}

=== RELEVANT EVIDENCE ===
{batch name + DOI references + "Application to 2nd-Brain" section + 2–3 specific rows}

=== INTERVIEW PROMPT EXAMPLES (inspiration only) ===
{locale-filtered}

=== USER MESSAGE ===
{userMessage}

=== YOUR RESPONSE ===
- Respond in {locale}.
- Reference the user's own words.
- Cite at most ONE evidence-based observation, framed as pattern not verdict.
- End with ONE reflective question, not advice.
- YELLOW zone: prioritize listening over reframing.
- Maximum 4 sentences.
```

---

## 8. Sprint Sequencing

| Day | Goal |
|---|---|
| 1 | Read & verify. Smoke test Supabase. |
| 2 | Schema + ingestion. Verify seed row counts. |
| 3 | Loader module. |
| 4–5 | **Safety classifier first** + Korean test corpus. FP < 10%, FN = 0. |
| 6 | Crisis migration + event logging. |
| 7 | Gemini Wrapper with safety pre-pass. |
| 8 | Retrieval module. |
| 9 | Prompt template + Advisor MVP (end-to-end GREEN). |
| 10 | Tests + OUTPUTS.md. |

---

## 9. Things NOT to do

- Do not modify curated files in `docs/research/batches/` or `supabase/seed/` without an explicit research-batch update.
- Do not modify the Hard Safety Rules (§0) without explicit user approval.
- Do not let Gemini generate freeform crisis responses. Use fixed templates.
- Do not log raw user text on crisis events. Categorical features only.
- Do not import `@google/genai` outside `src/lib/llm/gemini.ts`.
- Do not skip the Korean safety test corpus.
- Do not infer protected categories.
- Do not promise efficacy claims.
- Do not build the Curator UI (Engine 6) yet.
- Do not build vector embeddings (Path B) for v1.

---

## 10. Acceptance Criteria

- [ ] Migration applied. `select count(*) from public.knowledge_sources` returns the seeded number (15+ for v1).
- [ ] `crisis_events` migration applied. RLS confirmed.
- [ ] `loadSchema()`, `loadBatch()`, `queryRows()` working end-to-end.
- [ ] `classifySafety()` tested on ≥20 Korean crisis prompts: **0 FN**, ≤2 FP.
- [ ] `classifySafety()` tested on ≥20 Korean non-crisis prompts: ≤2 FP.
- [ ] `callGemini()` wrapped, ESLint rule active, safety pre-pass mandatory.
- [ ] One end-to-end GREEN-zone Advisor call works.
- [ ] One end-to-end RED-zone test returns fixed template, logs to `crisis_events`.
- [ ] `safety-corpus.test.ts` and `retrieval.test.ts` pass.
- [ ] `docs/handoff/build-rag-wiki-OUTPUTS.md` written.
- [ ] Commit + push.
