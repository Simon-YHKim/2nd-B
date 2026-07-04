# Changelog

All notable changes to 2nd-Brain are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project follows
Conventional Commits.

## [Unreleased]

### Added
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
