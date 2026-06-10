# Pre-existing Assets Registry

> XPRIZE rulebook §04 requires disclosure of code, designs, content, and
> other materials that existed before the competition window began.

## Status at Sprint 0

No pre-existing first-party assets are bundled into 2nd-Brain. The
codebase was initialized from a clean Expo template on 2026-05-25.

## Third-party dependencies (free-tier OSS)

The dependencies listed in `package.json` are public open-source
libraries used under their respective licenses. The full list:

- Expo SDK 56 and the official Expo ecosystem (`expo`, `expo-router`,
  `expo-localization`, etc.) — MIT
- React 19, React Native 0.85 — MIT
- `@google/genai` — Apache-2.0 (Gemini SDK)
- `@supabase/supabase-js` — MIT
- `i18next`, `react-i18next` — MIT
- `zod` — MIT
- `dayjs` — MIT
- Development tooling: TypeScript, ESLint, Prettier, Jest, tsx, globby —
  MIT / Apache-2.0

## Bundled fonts (assets/fonts/)

- `NeoDunggeunmo-Regular.ttf`, `NeoDunggeunmoCode-Regular.ttf` —
  Neo둥근모 (Neo Dunggeunmo), SIL OFL 1.1
- `Galmuri11-subset.ttf`, `Galmuri11-subset.woff2` — Galmuri11,
  SIL OFL 1.1; subset derived from the `galmuri` npm package (^2.40.3)
- Press Start 2P — SIL OFL, loaded via
  `@expo-google-fonts/press-start-2p` (^0.4.1)

## Pre-existing materials owned by Simon

- Google Play developer account (existing, used for app submission)
- LinkedIn / X / personal blog (used for distribution; out of scope)

## What is in scope for the competition

All app code under `src/app/`, `src/components/`, `src/lib/`, all database
migrations under `db/`, all CI workflows under `.github/`, and all
documentation under `docs/` were written between 2026-05-25 and the
submission deadline of 2026-08-17.
