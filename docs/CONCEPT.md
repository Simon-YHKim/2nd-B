# CONCEPT.md — 2nd-Brain canonical concept & direction

> Read this before any concept, IA, or visual decision. It names what is canonical
> and what is legacy, so a session is never polluted by a superseded model.

## Canonical (use this)

- **Concept SoT = `docs/PRD.md` (Draft v3).** Detailed model spec = `docs/CONSTELLATION-DESIGN.md`.
  This file just names canonical vs legacy.
- **Direction: deep-space constellation.** A character-led home shell (the `EXPO_PUBLIC_UI`
  default). The constellation is the **single home / navigation**; tap a star → its domain,
  tap 북극성 → the aggregate + 세컨비. No 4-tab shell, no village graph.
- **Canonical model = 3-layer 별자리** (PRD §4):
  - **Layer A — input: 7 DOMAIN stars** (북두칠성). 커리어 · 재정 · 성장 · 관계 · 건강 · 오락 ·
    담아내기. Each = 입력 → 출력 + 리스트업(편집 가능 + 카테고리 + 태그). These are the *visible*
    home stars.
  - **Layer B — validation: psychological constructs** (`src/lib/persona/stars.ts`
    `SELF_UNDERSTANDING_STARS` — Big Five / 내러티브 / 애착 / SDT·VIA / 가능자아 / 순간변동).
    These are **NOT home stars**; they are the hidden inference layer that grounds the output
    (domain data triangulates each construct). This is what makes the output a *validated portrait*,
    not a life dashboard (C8).
  - **Layer C — output: 북극성 (Polaris)** = aggregate of the 7 domain stars → real-time
    persona(s) (역할/모자) + 성향·강점 요약. Always brightest; takes no direct input; changes only
    via propose→ratify. (Drop the "Soul Core" name — internal key `soulCoreBrightness` is kept for
    regression safety, display name is "북극성".)
  - **Brightness honesty rule:** home star light = how much you put in (domain coverage); construct
    confidence governs only the *strength of a persona claim*, never the headline number.
  - **L1~L5 brightness ladder** (DIKW) = one ordinal scale = quality = confidence = interview
    drill-stop level (`src/lib/persona/brightness.ts`).
  - **propose → ratify:** the AI proposes self-model diffs; the user approves (per persona) before
    any write.
- **Living references:** `docs/PRD.md` (v3 concept SoT), `docs/CONSTELLATION-DESIGN.md` (model +
  reuse audit), `docs/VISION.md` (3축 vision), `docs/ARCHITECTURE.md`, `docs/CONSTRAINTS.md`
  (C1~C12), `docs/deep-space-nav-contract.md` (IA / route map), the `deepSpace.*` tokens in
  `src/lib/theme/tokens.ts`, and `DESIGN.md` for the cross-cutting visual discipline (tokens only,
  anti-slop, no em dash).

## Legacy (do NOT use as the reference for new work)

Kept only as a rollback skin (`EXPO_PUBLIC_UI=legacy`) or as history:

- The **gameboy** UI track and the **Cosmic Pixel Graph Village** system.
- **Phytoncide** tokens (`src/theme/tokens.ts`, marked `@deprecated`).
- **"Soul Core" name · 5 Pattern Core layer + Pattern Tesseract · village graph (`/graph`) ·
  `/core-brain` · Brain Trinity (`/trinity`) · v3 tesseract art · character voices
  (아치/가디/루루/모모/루미) · the 4-tier Visual Tier node-names** (Soul Core / Pattern Core x5 /
  snowflake / crystal). The tier *principle* (one dominant root, sub-nodes recede) carries over to
  the 3-layer hierarchy; the *names* do not.
- ⚠️ **7별 = 심리구인** framing (the OLD reading where the 7 home stars WERE the psychological
  constructs). Under the new model the 7 home stars are DOMAINS; the constructs moved to the hidden
  layer B. Do not present `stars.ts`'s 7 axes as the home stars.
- Superseded concept docs (old `DESIGN.md`, `DESIGN_TOKENS.md`, dated handoffs, the pre-v-final
  `gemini-app-overview.md`, the Cosmic Pixel session report) were removed in the legacy cleanup;
  they remain in git history if a rollback reference is needed.

## Why this file exists

The repo carried overlapping worldviews (old gameboy / Cosmic Pixel village, the deep-space
core model, and now the canonical deep-space **constellation 3-layer**). Mixing them confuses
humans and agents alike. This file is the one place that says which is which; CLAUDE.md and
AGENTS.md point here. On any conflict, **`docs/PRD.md` (v3) wins.**
