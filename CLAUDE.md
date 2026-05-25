# 2nd-Brain — Repo CLAUDE.md (Root Pointer)

This is a minimal pointer file for AI agents at the repo root.

## What this repo is

Psychology research curation and Supabase scaffold for the **2nd-Brain** application (XPRIZE Build with Gemini submission). The repo currently contains:

- `docs/research/` — **DOI-verified psychology framework knowledge base** (21 batches, 95 rows)
- `supabase/migrations/` — `knowledge_sources` table schema
- `supabase/seed/` — per-batch INSERT statements for the knowledge base
- `docs/research/psychology-handoff.md` — master prompt for adding new batches

The 2nd-Brain application itself (Next.js + Expo + Supabase + Gemini) per `docs/research/(Master Blueprint)` is **not yet scaffolded** in this repo — Sprint 0 starts 6/8.

## How to use the knowledge base as an AI agent

→ Read [`docs/research/CLAUDE.md`](docs/research/CLAUDE.md) first.

That file contains:
- Hard safety rules (crisis routing, no-diagnosis policy, no protected-category inference)
- Query → batch routing table
- Evidence tier rules (A/B/C/D)
- Cross-reference density expectations
- Update / lint operations
- Failure modes to watch for

## How to add a new research batch

→ Read [`docs/research/README.md`](docs/research/README.md) for the human-facing workflow.

→ Use [`docs/research/psychology-handoff.md`](docs/research/psychology-handoff.md) as the first message to a Deep Research tool (Gemini / Claude / ChatGPT) and request one framework at a time.

## Repo branch policy

Development branch: `claude/loving-davinci-QpZyJ`. All work pushed here. PR #1 is the open draft.

---

*Repo schema pointer · 2026-05-25 KST*
