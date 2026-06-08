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
- Pixel fonts: `galmuri` - SIL OFL 1.1, including repo-owned
  `Galmuri11-subset.ttf` / `Galmuri11-subset.woff2` generated from
  `node_modules/galmuri/dist/Galmuri11.ttf`; `@expo-google-fonts/press-start-2p`
  - OFL-1.1; NeoDunggeunmo font files under `assets/fonts/` - SIL OFL 1.1.
- Development tooling: TypeScript, ESLint, Prettier, Jest, tsx, globby —
  MIT / Apache-2.0

## Pre-existing materials owned by Simon

- Google Play developer account (existing, used for app submission)
- LinkedIn / X / personal blog (used for distribution; out of scope)

## What is in scope for the competition

All app code under `src/`, `app/`, `components/`, `lib/`, all database
migrations under `db/`, all CI workflows under `.github/`, and all
documentation under `docs/` were written between 2026-05-25 and the
submission deadline of 2026-08-17.
