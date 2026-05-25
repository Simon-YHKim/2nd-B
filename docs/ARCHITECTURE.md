# Architecture

> Snapshot at Sprint 0. Evolves with each sprint.

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
| C1 | ESLint + boundary script | `eslint.config.js`, `scripts/check-llm-import-boundary.ts`, `src/lib/llm/gemini.ts` |
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
