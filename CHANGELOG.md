# Changelog

All notable changes to 2nd-Brain are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project follows
Conventional Commits.

## [Unreleased]

### Added
- SecondB chat: query-relevant retrieval (RAG) + conversation history
  (D-26 A1). Each turn now embeds the message and pulls the top-8
  semantically relevant wiki pages via pgvector kNN instead of shipping the
  whole 50-page snapshot — better grounded and ~10x smaller per-turn prompt.
  On any miss (no index, embed failure, red-zone query) it falls back to the
  legacy whole-wiki snapshot, so chat never breaks on RAG. The last 6 turns
  ride the prompt as fenced, sanitized history; C9 re-classifies each and
  DROPS any red-zone turn so a prior crisis message can't re-egress through
  the system channel.
- D-26 P0 lane: embeddings revived — `text-embedding-004` (shut down
  2026-01-14) replaced by `gemini-embedding-2` @768 MRL; gemini-proxy gains a
  spend-capped `op:'embed'` route so the keyless web build can embed at all;
  backfill batches 50 serial calls into one (with per-page fallback isolation);
  the Research screen's find-proposals button now builds the index first
  (migration 0068 nulls the dead 004-space vectors, trigger-safe).
- gemini-proxy model allowlist now includes flash-lite + the 3.x generation
  (fixes the silent 400 on every edge-routed lite classify) with a
  `GEMINI_MODELS_ALLOWED` env extension; the sub-brain cost pin now matches
  pro-class models by family pattern, not a literal id.
- Persona narrative summary is cached in `personas.patterns` keyed by a
  staleness signature (skips the 3-screen mount re-summarize storm) and its
  input is windowed (interview transcripts excluded, newest rows under a row +
  char budget sized to the proxy's 8000-char cap).
- Ops recommendations get an in-session TTL cache (stops OpsHomeScreen's
  unmetered per-tab-flip LLM refires); explicit run buttons bypass it via
  `forceFresh` so quota is never billed for a cached answer.
- D-26 Phase 2 vendor routing (Simon GO 2026-07-04): `openai-proxy` edge
  function (gpt-5.4 seat, shared spend counter + crisis gate), upgraded
  `claude-proxy` (claude-sonnet-5 default, per-purpose opus-4-8 seats,
  adaptive thinking + effort, structured-output passthrough, refusal guard),
  shared `_shared/llm-proxy-common.ts`, and client `src/lib/llm/routing.ts`
  gated by `EXPO_PUBLIC_LLM_PHASE=2` (default Phase 1 = all-Gemini, zero
  behavior change). `capture_ocr`/`capture_voice` are Gemini-pinned by owner
  directive; image-bearing calls always route Gemini.
- persona_chat 3-way taxonomy split: `persona_narrative` / `gap_synthesize` /
  `self_model_propose` (per-situation routing + honest audit attribution).
- `docs/LLM-ROUTING.md` — purpose-키 LLM 라우팅 정본 (D-26): Phase 1
  Gemini-only / Phase 2 3-vendor 매트릭스, 26-purpose 택소노미, 구조 최적화
  백로그, P0 결함 목록 (embedding 모델 셧다운, proxy lite allowlist 400,
  prod 시맨틱 안전분류 무음 강등).
- `audit_qa` follow-up now ships a bilingual system prompt (one warm
  follow-up question, anti-clinical, injection-fenced) — previously the raw
  audit answer went to the model with no instruction at all.
- Material 3 primitive kit (`src/components/m3/`): MdButton / SegBtn / MdCard /
  MdChip / Field / MdNavBar / ProgressLinear on the `m3.*` token foundation, plus
  Roboto / Roboto Mono chrome fonts (rev2 P1b).
- 세컨비 persona-capable head (`SecondbHead` `persona` prop — secondb / meta / twi
  accent tint; unset keeps the deep-space cyan) (rev2 P2).
- Phytoncide design tokens (pine/birch/mist palette + spring leaf accents)
- Serif typography pairing (Nanum Myeongjo + Source Serif 4 + Pretendard)
- NativeWind/Tailwind integration wired to the design tokens
- i18n font fallback keys (ko/en)
- Branded loading screen (logo + spinner) shown while fonts and auth
  resolve, replacing blank/`null` frames on web

### Changed
- LLM routing (D-26): `interview_probe` demoted pro→flash (depth-layer choice
  is deterministic; the model only drafts one question), `northstar_propose` /
  `axis_estimate` pinned explicitly in `PURPOSE_TIER`, and `capture_ocr`
  direct-path calls disable dynamic thinking (verbatim transcription gains
  nothing from thinking tokens).
- Deep-space dock migrated to the Material 3 `MdNavBar`; 5-tab reconcile to
  별자리홈 · 담기 · 세컨비 · 위키 · 비서 (account moves out of the dock, still reachable
  via profile / settings) (rev2 P2).
- Landing page redesigned on the phytoncide theme — serif display hero,
  app logo, and accent-coloured pillar cards; migrated off the legacy
  token shim (`@/lib/theme`) to `@/theme`.

### Fixed
- OTA / native bundle: a `node:fs` source-discipline test under `src/app` was
  pulled into the app bundle by expo-router's `require.context` and broke the
  Hermes / EAS Update export — so OTA silently never published (gate-skip) since
  the test landed. Moved it out of the router root and excluded `__tests__` /
  `*.test.*` from the Metro bundle.
- Live web root URL (`/2nd-B/`) resolved to the app's not-found screen.
  Set `expo.experiments.baseUrl` to `/2nd-B` so expo-router is base-path
  aware, and removed the manual `sed` asset path-patching (plus the
  redundant `EXPO_BASE_URL` env var) from the GitHub Pages deploy workflow.
- i18n key-parity check (`check:i18n`) now runs on Windows — it split file
  paths on `/` only, so every namespace mismatched on `\` separators and
  `npm run verify` always failed locally.

## [0.0.3] - 2026-06-23

### Fixed
- The in-app loading screen and the home hero still showed the legacy Soul Core
  orb (`core_center_premium_hq.png`). Both now render the SecondB character head
  (`LoadingScreen.tsx`, `app/index.tsx`), matching the new app icon — so the
  load -> home dolly-zoom handoff stays the character, not the orb. The Soul Core
  orb is unchanged where it belongs: the graph's core node (`IslandArt`).

## [0.0.2] - 2026-06-23

### Added
- iOS build profiles in `eas.json` (preview ad-hoc + existing simulator) so an
  iOS build can run once an Apple Developer account is connected.

### Changed
- App icon, splash, adaptive icon (foreground + monochrome), favicon, and the
  iOS icon now render the SecondB character head, replacing the legacy orb art.
- The big SecondB head turns to face the touch point (perspective look-at)
  instead of only tilting sideways.
- Android release artifacts build `arm64-v8a` only, plus ProGuard and resource
  shrinking, to cut the universal APK size.

### Fixed
- Native builds connect to the real Supabase project instead of the
  `demo.invalid` placeholder (`eas.json` env and the android-release workflow).

### Removed
- Unused demo assets (react-logo, expo-logo/badge, tutorial-web), a
  byte-identical duplicate head image, and the legacy iOS icon set.
