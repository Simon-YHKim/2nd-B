# Changelog

All notable changes to 2nd-Brain are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project follows
Conventional Commits.

## [Unreleased]

### Added
- Phytoncide design tokens (pine/birch/mist palette + spring leaf accents)
- Serif typography pairing (Nanum Myeongjo + Source Serif 4 + Pretendard)
- NativeWind/Tailwind integration wired to the design tokens
- i18n font fallback keys (ko/en)
- Branded loading screen (logo + spinner) shown while fonts and auth
  resolve, replacing blank/`null` frames on web

### Changed
- Landing page redesigned on the phytoncide theme — serif display hero,
  app logo, and accent-coloured pillar cards; migrated off the legacy
  token shim (`@/lib/theme`) to `@/theme`.

### Fixed
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
