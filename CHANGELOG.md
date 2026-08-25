# Changelog

All notable changes to 2nd-Brain are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project follows
Conventional Commits.

## [Unreleased]

## [0.3.0] - 2026-08-26

The Big Dipper becomes one set of seven, the interview learns what "I don't
know" means, and every screen that had quietly lost its bottom tab bar gets it
back.

### Added
- The seven stars are now one thing: places where you get to know yourself
  (profile, infancy, school years, twenties, thirties onward, work, now). The
  six life domains moved off the home constellation and into the SecondB
  dashboard, reached by tapping SecondB's head. Tapping a star opens its
  summary first instead of dropping you straight into an interview.
- Brightness can now reach L5. When you have opened at least two layers of a
  period, SecondB proposes a "who I was then" summary built from that period's
  own interview transcript, and ratifying it in /review records the lift.
- The interview shows a 5xN progress matrix after a conversation ends, so the
  layers you actually opened are visible rather than inferred.
- Peers now answer five questions instead of three, and the "how others see me"
  screen draws what actually arrived instead of only the three traits the
  original model claimed were externally visible.
- Microsoft Clarity runs on native builds, off by default and behind the same
  analytics consent as the web.
- A developer screen line reports the live Clarity state (consent, flags,
  project, route, module, session) so a broken link in that chain is visible in
  the app instead of only in a dashboard.

### Changed
- The visual surface moved to the PIXEL-CLAY midnight palette. Panels are solid
  navy from the canonical ramp instead of a translucent cyan wash over near
  black, so cards read as distinct surfaces. Measured against the reference
  frames, canonical-ramp coverage went from 34% to 74% (reference 76%).
- The privacy policy now names Google Analytics 4 and Microsoft Clarity as
  processors and states the cross-border transfer under PIPA article 28-8(1)1,
  with a revision history section.
- Positioning copy across onboarding and the store surfaces matches the wording
  Simon settled on.

### Fixed
- Sixteen screens had lost the bottom tab bar and were navigation dead ends
  reachable only by the back control. They render the shared shell again.
  /onboarding deliberately keeps no tab bar.
- The reason the capture save button is disabled was only in the screen-reader
  hint. Sighted users saw a grey button with no explanation; the sentence is
  now on screen.
- PDF text extraction on the web actually works. The worker handler was never
  registered, so every PDF import silently produced nothing.
- The home speech bubble printed raw translation keys for the six domains.
- "I don't know" no longer counts as an answer that fills a cell. It keeps the
  same layer open and offers a foothold instead.
- Two ledger screens leaked the internal seven-star prefix into their labels.

## [0.2.0] - 2026-08-23

First versioned release built for distribution: the APK is attached to the
GitHub release rather than living behind an Expo login.

### Added
- Multi-vendor LLM routing. Four switches now cover every prompt purpose -
  reasoning seats, chat, the two binary-carrying purposes (OCR + voice), and
  the nine backbone purposes that previously had no switch at all. Grok (xAI)
  joins Gemini, Claude and OpenAI as a routable vendor; nothing routes there
  by default.
- Roles (`admin` / `developer` / `support`) with a JWT claim and an immediate
  revocation path, kept separate from the billing tier so a payment event can
  never overwrite an operator role.
- Cancelling a subscription now offers the refund in the same step for anyone
  inside the window, and checkout states the renewal cycle, the amount and how
  to stop it before taking payment.

### Fixed
- A signed-in user could read anyone's credit balance. The two readers are
  replaced by an argument-less `credit_summary_self()`, so the parameter that
  made it possible no longer exists.
- The leaked-password check ran only on sign-up. It now sits on the shared
  password-update path, so changing or resetting a password is covered too.
- The sign-up screen was missing one of its required legal consent rows.
- `judge_mode` (the retired contest comp flag) could be set by a crafted
  client on both the insert and the update path.
- Refunds treated credit-pack purchases as subscriptions.
- An empty env string in `eas.json` made every EAS build and OTA publish fail
  before starting.

### Removed
- The XPRIZE judge auto-flag, the flow-debugger tooling and its generated maps.


### Added
- Ops recommendations consolidated into a once-per-day brief (D-26 A17).
  The first ops visit of the day builds ONE brief covering all life domains
  in a single LLM call (cached per KST day in ops_daily_brief); every later
  passive visit/tab-flip serves its domain from the cache at zero LLM cost.
  The explicit "run again" button keeps its rich, per-domain, adherence-
  tailored call. Opted-out/minor users build nothing (engine-level privacy
  gate); domains the brief covers with no suggestion serve empty without a
  re-call, and only genuinely missing domains fall back to an on-demand call.
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
- Major-update notice pipeline (`docs/RELEASE-PROCESS.md`): semver decides
  whether a release owes users a popup (major only; minor and patch stay
  silent), `npm run notice:release` drafts the publish SQL from app.json +
  CHANGELOG and stops so a human publishes it, and the notice dialog now
  branches its copy on `min_app_version` - readers who already have the
  release see the feature introduction, readers who do not get an update
  prompt (store on native, reload on web).

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
