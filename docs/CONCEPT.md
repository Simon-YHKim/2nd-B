# CONCEPT.md — 2nd-Brain canonical concept & direction

> Read this before any concept, IA, or visual decision. It names what is canonical
> and what is legacy, so a session is never polluted by a superseded model.

## Canonical (use this)

- **Direction: deep-space.** A character-led home shell is the single canonical app
  body (the `EXPO_PUBLIC_UI` default). The home hero is the Soul Core brightness
  progress; the graph / village is one skin of that home, not a parallel nav.
- **Concept memo (source of truth):** `2ndb-thought-organization-synthesis.html` at
  the repo root. The model:
  - 북극성 (Soul Core) = the philosophy / aggregate readout, always brightest.
  - 북두칠성 7별 = seven self-understanding lenses (지금의 나 / 회상 / 보여지는 나 /
    리듬 / 관계의 나 / 될 수 있는 나 / 가치의 나), each with its own engine + brightness.
  - L1~L5 brightness ladder = one ordinal scale that doubles as quality, confidence,
    and the interview drill-stop level.
  - propose -> ratify: the AI proposes self-model diffs; the user approves before any write.
- **Living references:** `docs/VISION.md` (3축 vision), `docs/ARCHITECTURE.md`,
  `docs/CONSTRAINTS.md` (C1~C12), `docs/deep-space-nav-contract.md` (IA / route map),
  the `deepSpace.*` tokens in `src/lib/theme/tokens.ts`, and `DESIGN.md` for the
  cross-cutting visual discipline (tokens only, anti-slop, no em dash).

## Legacy (do NOT use as the reference for new work)

Kept only as a rollback skin (`EXPO_PUBLIC_UI=legacy`) or as history:

- The **gameboy** UI track and the **Cosmic Pixel Graph Village** system.
- **Phytoncide** tokens (`src/theme/tokens.ts`, marked `@deprecated`).
- **Brain Trinity** naming, and the fixed village node-names in the Visual Tier
  System (Soul Core / Pattern Core x5 / snowflake / crystal). The tier *principle*
  (one dominant root, sub-nodes recede) carries over; the *names* do not.
- Superseded concept docs (old `DESIGN.md`, `DESIGN_TOKENS.md`, dated handoffs, the
  pre-v-final `gemini-app-overview.md`, and the Cosmic Pixel session report) were
  removed in the legacy cleanup; they remain in git history if a rollback reference
  is needed.

## Why this file exists

The repo carried two overlapping worldviews (the old gameboy / Cosmic Pixel village
and the current deep-space). Mixing them confuses humans and agents alike. This file
is the one place that says which is which; CLAUDE.md and AGENTS.md point here.
