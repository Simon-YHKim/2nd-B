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
- Roboto (400 / 500 / 700) — Apache-2.0, loaded via
  `@expo-google-fonts/roboto` (^0.4.3); Material 3 chrome/label face (rev2)
- Roboto Mono — Apache-2.0, loaded via
  `@expo-google-fonts/roboto-mono` (^0.4.2); M3 numeric face (rev2)

## Remote images (AI Museum, /museum)

The AI history museum (`src/screens/deepspace/museum/AiMuseumScreen.tsx`) shows
images by hotlinking Wikimedia Commons (`Special:FilePath`). No image is bundled
in the repo; each loads at runtime and falls back to a generated deep-space orb
if absent. Each file is used under its Commons license (Public Domain / CC-BY /
CC-BY-SA); the authoritative license + author is on each file's Commons page.
Attribution per moment (date · title — file, license, author):

- 1950 Turing Test — `Alan_Turing_Aged_16.jpg`, Public Domain Mark 1.0.
- 2017 The Transformer — `The-Transformer-model-architecture.png`, CC-BY-SA 3.0, Yuening Jia.
- 2014 GANs — `Ian_Goodfellow.jpg`, CC-BY-SA 4.0, Ian Goodfellow.
- 2015 DeepDream — `Google_Deep_Dream_Image_(19926204302).jpg`, CC-BY 2.0, Lorenzo Tlacaelel.
- 2021 DALL·E & CLIP — `DALL-E_2_artificial_intelligence_digital_image_generated_photo.jpg`, Public Domain (algorithm-generated).
- 2022 Diffusion Boom — `Demonstration_of_inpainting_and_outpainting_using_Stable_Diffusion_(step_1_of_4).png`, CC-BY-SA 4.0, Benlisquare.
- 1997 Deep Blue — `Deep_Blue.jpg`, CC-BY 2.0, Jim Gardner.
- 2016 AlphaGo — `Lee_Se-Dol_-_2016_(cropped).jpg`, CC-BY 2.0, LG Electronics.
- 2024 Humanoids — `Optimus_Tesla.jpg`, CC0 / Public Domain, Benjamin Ceci.
- 2006 CUDA — `NVidia_G71_GPU.jpg`, CC-BY 2.0, Diego3336.
- 2012 GPU Deep Learning — `Galaxy_NVIDIA_GeForce_GTX_460.JPG`, CC-BY-SA 3.0, Porsche 911GT2.
- 2022 H100 — `NVIDIA_H100_(Geekerwan)_025.png`, CC-BY 3.0, Geekerwan.
- 2024 Blackwell — `Jensen_Huang_-_RTX_Blackwell_-_Nvidia_Keynote_-_CES_2025_Las_Vegas_(3).jpg`, CC0 / Public Domain, Pronoia.
- 2023 EU AI Act & Safety Summit — `UK_Government_hosts_AI_Summit_at_Bletchley_Park_(53301734397).jpg`, CC-BY 2.0, Marcel Grabowski / UK Government.

Moments without a license-clean image intentionally keep the orb placeholder.
SVG/video files are intentionally not used (no native `Image` URI support).

## Pre-existing materials owned by Simon

- Google Play developer account (existing, used for app submission)
- LinkedIn / X / personal blog (used for distribution; out of scope)

## What is in scope for the competition

All app code under `src/app/`, `src/components/`, `src/lib/`, all database
migrations under `db/`, all CI workflows under `.github/`, and all
documentation under `docs/` were written between 2026-05-25 and the
submission deadline of 2026-08-17.
