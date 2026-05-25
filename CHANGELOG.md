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
