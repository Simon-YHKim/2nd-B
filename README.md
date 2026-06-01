# 2nd-Brain

> **Not a note vault — an AI that learns you.** Journal daily to build
> your self-knowledge base, get personalized guidance grounded in
> validated psychology, and carry your data anywhere.

A personalized learning platform for self-understanding, submitted to
the **Build with Gemini XPRIZE** in the *Education & Human Potential*
category. Solo build; deadline 2026-08-17 06:00 KST.

[Master Blueprint](./docs/ARCHITECTURE.md) ·
[Constraints](./docs/CONSTRAINTS.md) ·
[Pre-existing assets used](./docs/ASSETS.md)

---

## What it does

1. **Capture** — Daily journaling, free-form notes, and life-audit
   interviews (20 questions per life period).
2. **Inference** — Synthesize a self-model: traits, values, decision
   patterns, character strengths.
3. **Memory (RAG)** — Export a portable Markdown / JSON knowledge base
   that works with Claude, ChatGPT, or any LLM you prefer.
4. **Advisor** — Toggle-mode guidance on career, learning, and habits,
   grounded in validated psychology (Big Five, SDT, Attachment, VIA).
5. **Planner** — Personality-calibrated action plans (v1.1).
6. **Curator** — AI-curated psychology references, verified by a human
   before inclusion.
7. **Safety Classifier** — Every input is classified into a
   green/yellow/red zone before any LLM call. Red-zone content is routed
   to professional resources (Korea 109, US 988), never to AI.

## Sprint 0 scope

This commit scaffolds the project with all 12 hard constraints enforced
at code, schema, and CI level. External integrations (live EAS build,
remote Supabase, real Gemini API calls) are deferred to Sprint 1.

| Layer | Status |
|-------|--------|
| Expo + TypeScript strict | done |
| Single Gemini wrapper (C1/C2/C3/C9) | done |
| 3-zone Safety Classifier (C9) | done |
| Supabase migrations 0001–0010 | done |
| ESLint + LLM import boundary | done |
| i18n EN/KO with CI parity check (C7) | done |
| Forbidden lexicon CI scan | done |
| Aggregated constraints self-check | done |
| Auth flow with birth-date age gate (C10) | done |
| Judge mode auto-detect (C6) | done |
| Pre-existing assets section (C12) | done |
| Support SLA section (C11) | done (auto-responder Sprint 1) |

## Quick start

```bash
cp .env.example .env   # fill in values
npm ci --legacy-peer-deps
npm run verify         # lint + tsc + i18n + lexicon + boundary + constraints + tests
npm run start          # Expo dev server
```

For Supabase migrations dry-run, see `db/README.md`.

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). The 7 engines and
12 constraints map to specific files and CI checks; the architecture
doc is the routing table.

## Design system

UI color, spacing, radius, type scale and font pairing come from the
phytoncide design tokens in `src/theme/` (Option C). Never hardcode hex
literals in components. See [`docs/DESIGN_TOKENS.md`](./docs/DESIGN_TOKENS.md).

## Verification

```bash
npm run lint               # ESLint (C1: blocks foreign LLM SDKs)
npm run type-check         # tsc --noEmit
npm run check:i18n         # C7 EN/KO key parity
npm run check:lexicon      # forbidden vocabulary scan
npm run check:llm-boundary # @google/genai stays in gemini.ts
npm run check:constraints  # C1~C12 aggregate
npm test                   # jest (C9 ordering, C3 audit insertion)
```

## Pre-existing assets used

Per XPRIZE rulebook §04: see [`docs/ASSETS.md`](./docs/ASSETS.md) for
the full registry. Summary: the codebase was initialized from a clean
Expo template on 2026-05-25 with no proprietary pre-existing code
imported. All third-party dependencies are public OSS used under their
licenses.

## Support SLA

We commit to responding to questions and bug reports within **2 business
days (KST)**. Channels:

- GitHub Issues (preferred): auto-labelled `needs-triage` /
  `sla:2-business-days` on creation.
- Devpost project page comments.
- `support@` email (auto-responder enabled from Sprint 1).

If you are an XPRIZE judge: emails from `@xprize.org`, `@devpost.com`,
or `@hacker.fund` are auto-recognized as judge accounts on sign-up and
receive unlimited free access (C6).

## License

MIT for the application code in this repository. Third-party assets
remain under their original licenses.
