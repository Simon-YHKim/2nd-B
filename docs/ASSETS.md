# Bundled Assets and Licenses

## HustleK portrait expressions (2026-10-08)

`assets/hustlek/` contains 48 transparent 362×362 PNG portraits supplied by Simon
in `hustlek-expressions-app-assets.zip`. Simon identified the portrait as his face
and explicitly requested its use as HustleK throughout the app on 2026-10-08.
The supplied image bytes are unchanged; `manifest.json` records their SHA-256.
Five identical files are mirrored in `public/proto/assets/hustlek/` and its
`design/proto_rev2/reference-app/assets/hustlek/` source for the published
prototype. These are user-supplied project character artwork, not a
third-party sprite pack. This integration adds no separate image service or font.

## HustleK approved opening (2026-10-02)

`assets/opening/hustlek-approved-261002/` contains the approved avatar opening: 17 character poses, the field/night-sky background, telescope, three native Polaris sizes, and four WAV files. The 22 PNG and four WAV files preserve the approved source bytes. `approved-settings.json` preserves the submitted settings; `manifest.json` stores the effective timeline, source paths and SHA-256 hashes. `validation.json`, `source-parity.json`, and `CREDITS.md` record file verification, comparison with the approved review and licenses.

Grass A/B are from Kenney Impact Sounds (CC0); the ratchet is the same bundled `observatory-ratchet.wav` already used by the app (CC0, romulofs); the approved high Polaris ping is project-generated. Character/background/telescope art is the user's approved generated artwork. Existing Polaris artwork is reused. `scripts/build-hustlek-approved-opening.cjs --verify-only` verifies the shipped files without requiring the local review folder.

> **Why this file exists.** The fonts we ship are SIL OFL 1.1, which requires
> the copyright notice and the Reserved Font Name to travel with the font.
> This file is the only place in the repository that records them, so deleting
> it would put the build out of compliance. Beyond the fonts, it accounts for
> every image the build ships, so a reader can reconcile the repository's art
> from this file alone.
>
> `scripts/check-constraints.ts` enforces this as **`AssetLicenseDisclosure`**:
> it walks `assets/` and `public/` and fails if any pack found on disk is not
> named here. That check is not a formality — until 2026-08-06 it was a single
> grep for the README heading and reported PASS while 226 committed images
> across 8 packs went entirely unlisted.
>
> ⚠ **2026-09-08 정정 — 이 문서는 대회 서류가 아니다.** 원래 머리말은 이랬다:
>
> > ~~XPRIZE rulebook §04 requires disclosure of code, designs, content, and
> > other materials that existed before the competition window began.
> > … Listing it is a transparency choice, not a §04 obligation.~~
>
> 그 규정집은 적용되지 않는다. XPRIZE 는 2026-08-15 에 종료됐고 C12 는
> 2026-09-06 에 폐지됐다(Simon 결정 Q-260905-02). **폐지된 것은 번호지 의무가
> 아니다** — `docs/CONSTRAINTS.md` 가 그 문단을 따로 써서 이 의무를 규정집과
> 무관하게 지켰고, 검사도 `AssetLicenseDisclosure` 라는 번호 없는 이름으로
> 살아남았다. README 도 "Bundled assets and licenses" 로 옮겨왔다.
> **이 문서만 따라오지 않아서, 여기만 읽은 사람은 대회 서류로 보고 지워도 된다는
> 결론에 이른다** — CONSTRAINTS.md 가 막으려던 바로 그 결론이다.

## Status

No pre-existing first-party assets are bundled into 2nd-Brain. The
codebase was initialized from a clean Expo template on 2026-05-25, and
every bundled image first appeared in the repository after that date —
see [Bundled generated art](#bundled-generated-art-ai-generated-in-window).

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
- Development tooling: TypeScript, ESLint, Prettier, Jest, tsx —
  MIT / Apache-2.0

## Bundled fonts (assets/fonts/)

- `Galmuri11-subset.*`, `Galmuri11Bold-subset.*`, `Galmuri14-subset.*`,
  `Galmuri9-subset.*`, `GalmuriMono11-subset.*` (`.ttf` native + `.woff2` web) —
  Galmuri (c) 2019–2025 Lee Minseo (quiple), Reserved Font Name "Galmuri",
  **SIL OFL 1.1**; subsets derived from the `galmuri` npm package (^2.40.3,
  a devDependency since 2026-09-05: only the subset script reads it, the app
  ships these vendored files).
  Rebuild with `python scripts/build-font-subsets.py` — that script carries the
  character-set recipe and the reason for every range it keeps. Galmuri11 was
  vendored in #282 (2026-06-08); the other four were added for PIXEL-CLAY
  stage 2 (2026-08-20), when Galmuri became the body face rather than a title
  face. Galmuri11 is the only face upstream ships a Bold for.
- `Pretendard-Regular.otf` (native) + `Pretendard-subset.woff2` (web) —
  Pretendard (c) Kil Hyung-jin, **SIL OFL 1.1**. The reading face behind the
  옵션 readable-font preference and the screens not yet on Galmuri. The web
  subset was added 2026-09-06 (Simon decision Q-260905-06): the OTF gzips to
  1,046 KB over the wire and was the largest single asset on the first-paint
  path, while the subset is 613 KB and ships already compressed. Native keeps
  the OTF because expo-font loads ttf/otf there and cannot use woff2. Rebuild
  both with `python scripts/build-font-subsets.py`, which uses the same
  character-set recipe as Galmuri.
- Press Start 2P — SIL OFL, loaded via
  `@expo-google-fonts/press-start-2p` (^0.4.1)
- Roboto (400 / 500 / 700) and Roboto Mono — **removed 2026-09-05.** They were
  the Material 3 rev2 chrome/label and numeric faces (`@expo-google-fonts/roboto`,
  `@expo-google-fonts/roboto-mono`); after PIXEL-CLAY stage 2 moved `m3.font.*`
  to Galmuri they had no `fontFamily` consumer in either UI mode, so the packages
  and their `fontAssets` entries were dropped. Not bundled any more.

## Bundled dither tiles (assets/dither/)

Nine tiny PNGs (78-82 bytes each), generated by
`scripts/build-font-subsets.py`'s sibling `scripts/build-dither-tiles.py` from
plain arithmetic in this repository. Not drawn by a person, not AI-generated,
not taken from anywhere: each file is a 2x2 checkerboard of a single palette
colour written out byte by byte with `zlib` + `struct`.

They exist because PIXEL-CLAY bans blur and static opacity (absolute rules 3 and
4), so every translucent surface has to be a hard-edged dither instead. Three
coverages (25 / 50 / 75 percent) x three densities (1x / 2x / 3x) - the density
variants are what keep the checker from being bilinearly smeared on a 2x or 3x
screen.

Rebuild: `python scripts/build-dither-tiles.py`.

## Bundled audio (assets/audio/)

- `observatory-ratchet.wav`, `observatory-focus-lock.wav`, `observatory-shutter.wav`:
  active observatory camera sounds since 2026-09-26, edited from **actual CC0
  recordings**, not synthesized. Ratchet: [Ratchet.wav by romulofs](https://freesound.org/people/romulofs/sounds/127533/).
  Focus double beep and mechanical shutter: [Nice Canon Beep & Shutter Click by amoyssiadis](https://freesound.org/people/amoyssiadis/sounds/851925/).
  Both source pages declare [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  Sources are their openly published HQ MP3 previews, not the login-only original
  downloads. Derivatives are mono 22.05 kHz PCM WAV: 160/200/290 ms,
  7,100/8,864/12,834 bytes. One softened ratchet click plus silence loops at
  160 ms per cycle during pan/tilt, zoom settling and automatic aim/zoom/return.
  A focus-lock double beep plays at completion; shutter plays on exposure.
  Filtering, short fades and level normalization preserve the recorded timbre.
  Exact source URLs, hashes and edit recipes: `assets/audio/RECORDED-SOURCES.json`;
  processing script: `scripts/prepare-recorded-camera-sfx.cjs`.

- `jrpg-text-blip.mp3` — 75ms mono UI blip used by the constellation home's
  typewriter dialogue. It is a trimmed, filtered, and volume-reduced derivative
  of the `click.mp3` sound bundled with Codex `media-use`; the source is from
  Pixabay and is used under the
  [Pixabay Content License](https://pixabay.com/service/license-summary/).
  The shipped file is 1,010 bytes at 22.05kHz; SHA-256
  `e3bf89d81485cc20014ca8396d0fcc5a152e608d625a57ee65ef947a0499ee57`.

### Generated sound effects (agent-audio, 2026-10-06)

Sound effects generated locally with [agent-audio](https://github.com/AIEGOBOT/agent-audio)
from **Stable Audio 3 small-sfx** (`stabilityai/stable-audio-3-optimized`, revision
`da6edc54`), then picked by Simon from two listening reports (Q-261006-01..07, 12, 13; other picks reuse these files). The opening ambience bed (Q-261006-07) plays beside the approved opening, never inside its package. These are
**generated, not recorded**, so they are not in `RECORDED-SOURCES.json`; their prompts,
seeds, model file hashes, raw-output hashes and edit recipe are in
`assets/audio/GENERATED-SOURCES.json`, and a test checks every file against it.

- **License**: Stability AI Community License. Commercial use is registered (2026-10-06
  00:35 KST) and free under US$1M annual revenue. Section 3(c)(iii) gives the licensee
  ownership of outputs, and outputs are excluded from "Derivative Works", so the app ships
  sounds, not the model. We still record the attribution here: **Powered by Stability AI**.
- **Format**: mono 22.05 kHz 16-bit PCM WAV, peak -3.1 dBFS (the opening ping's peak).

| File | Use | Decision | Length | Bytes | SHA-256 |
|---|---|---|---|---:|---|
| `star-ratify-l5.wav` | A ratify that first takes a life-period star to L5 | Q-261006-01 | 2200 ms | 97,064 | `be5b9aee3669daef…` |
| `star-brighten.wav` | A star brightening L1-L4 (wired in a later change) | Q-261006-02 | 1000 ms | 44,144 | `f09f222542ec73ff…` |
| `record-save.wav` | A record the user saved (memo, capture, interview keep, manual SecondB keep) | Q-261006-03 | 68 ms | 3,038 | `2803ca096ce510b7…` |
| `secondb-reply.wav` | A normal SecondB reply | Q-261006-04 | 300 ms | 13,274 | `08b8b50bbe0550fd…` |
| `pocket-phone.wav` | Raising or lowering the pocket phone by hand | Q-261006-05 | 59 ms | 2,660 | `1fb5b1d1a8547d86…` |
| `onboarding-welcome.wav` | Finishing onboarding (wired in a later change) | Q-261006-06 | 2200 ms | 97,064 | `ff3ca5b113b958b3…` |
| `plan-purchase.wav` | A paid plan the store confirmed | Q-261006-12 | 1464 ms | 64,604 | `0c421a8991417ff6…` |
| `reward-credit.wav` | A rewarded-ad credit the client actually granted | Q-261006-13 | 200 ms | 8,866 | `948c2b1852df263c…` |
| `opening-ambience.wav` | Opening ambience bed under the approved opening (native app only, separate player) | Q-261006-07 | 10120 ms | 446,336 | `f06d5e48f840c073…` |

### Retired camera audio (moved out of the repo on 2026-10-04)

These four files were superseded by the recorded `observatory-*.wav` cues on
2026-09-26 and were never required by the shipped camera. On 2026-10-04 they
and their generator left the repo for the read-only archive
`E:/Legacy/2ndB/assets/audio/` and `E:/Legacy/2ndB/scripts/build-camera-sfx.cjs`
(rows in `E:/Legacy/2ndB/MANIFEST.jsonl`, restore from git history per its README, source commit
`ba7afdfd`). The provenance record stays here:

- `camera-aim.mp3`, `camera-focus.mp3`, `camera-shutter.mp3`: original procedural
  camera servo, focus adjustment, and shutter cues created locally with
  `scripts/build-camera-sfx.cjs` (deterministic sine/noise synthesis, then ffmpeg
  MP3 encoding). No recordings, external samples, paid API or third-party audio
  licenses. Mono 22.05 kHz, 64 kbps; source lengths 420/360/280 ms.

- `telescope-zoom.mp3`: legacy 0.57s camera-motion sweep. Unmodified
  `whoosh-short.mp3` from the installed `media-use` SFX bundle. Its
  bundled `CREDITS.md` identifies Pixabay and the
  [Pixabay Content License](https://pixabay.com/service/license-summary/).
  18,390 bytes; SHA-256
  `c2efd9d902a59bf9ec5019035d7deadd17762136896b6e3cb6dd99ea50997a30`.

## Bundled generated art (AI-generated, in-window)

**How it was made.** Every image below except the 2026-09-28 phone mini-app pack was produced with OpenAI GPT
image generation (ChatGPT / `gpt-image`) from prompts written for this
project. No image was commissioned, purchased, scraped, or taken from a
stock library. The style bible used for the tesseract/v3 line is
committed in this repository at
[`docs/V3_GPT_IMAGE_PROMPT.md`](./V3_GPT_IMAGE_PROMPT.md), so the
generation inputs are auditable, not just the outputs.

The phone mini-app pack was supplied by Simon as
`2ndB_phone_app_assets_260928.zip` on 2026-09-28. It includes generation
prompts and a README, but does not identify the image generator or include an
independent rights statement. **Simon confirmed on 2026-09-28 (21:4x KST,
"이상무") that the pack may ship in the app.** The pack still does not name the
image generator, so its prompts and README remain the provenance record; do
not infer that the pack has the same provenance as the older artwork.

**When.** Dates below are the day each set first appeared in git. The
repository's initial commit is 2026-05-25, so no set predates the
repository itself. Generation happened on or shortly before the listed
date.

**Rights.** Simon Kim generated and owns these outputs, and uses them
under the image tool's terms for generated content. The generated art
carries no third-party license obligation.

The three `assets/legacy-art/` packs lived under `public/assets/` until 2026-09-05.
They are consumed only through Metro `require()`, so `public/` made every web
export ship them twice (verbatim copy + hashed copy). Same files, same history;
only the path moved.

| Path | Files | First in git | Contents |
|------|-------|--------------|----------|
| `assets/legacy-art/cosmic-pixel-v3-soulcore/` | 2 SVG | 2026-06-02 | Legacy "cosmic pixel" skin. Only the Pattern Data node and the Log chip remain (the premium feedback empty / error glyphs). The six 256px pattern cores left with the `EXPO_PUBLIC_UI=legacy` lever on 2026-10-05 (batch `qa261004-lever`), the five companion idle poses (`archon`, `iris`, `lumen`, `relia`, `foreman_momo`) and seven momo-crew moods with the legacy characters on 2026-10-05 (batch `qa261004-chars`), and the other 122 images (soul-core tiers, data / log / link PNGs, per-state companion poses, sprite sheets, mobile-graph cores, edges and overlays) on 2026-10-04 (batch `qa261004-art`), all to `E:/Legacy/2ndB` |
| `assets/legacy-art/2ndb-production-premium-v1/` | 18 PNG | 2026-05-30 | 13 tier icons and 5 shards. The 15 graph-island PNGs, the clean auth hero and the two Vela worker PNGs moved to `E:/Legacy/2ndB` on 2026-10-04 (batch `qa261004-art`); the three wiki card thumbs on 2026-10-05 (batch `qa261004-lever`); the ten worker redraws of the five legacy characters on 2026-10-05 (batch `qa261004-chars`); and the last two worker redraws, SecondB's idle pose and walk strip, on 2026-10-05 (batch `qa261005-secondb-sprite`) once nothing drew them |
| `assets/legacy-art/tesseract-v10/` | 1 PNG | 2026-06-04 | Tesseract worldview set generated from `docs/V3_GPT_IMAGE_PROMPT.md`. Only `soul_core.png` remains (the /core-brain empty and load-error art); the six pattern-core PNGs moved to `E:/Legacy/2ndB` on 2026-10-04 |
| `public/proto/` | 7 PNG | 2026-07-04 | Deep-space prototype screens |
| `public/icons/` | 2 PNG | 2026-06-11 | PWA icons (192 / 512), derived from the app icon. Since 2026-09-30 both are rasterised by `scripts/build-app-icons.ts` from the Polaris pixel star (first-party code, no third-party pixels) |
| `assets/deepspace/` | 2 PNG | 2026-06-19 | SecondB canonical head pair (`secondb-head-front.png`, `secondb-head-blank.png`). The 11 Nebori style-comparison working images added while the deep-space look was being settled moved to `E:/Legacy/2ndB` on 2026-10-05 with their four `docs/nebori-*` reports (batch `qa261004-batch2`) |
| `assets/opening/` | 1 PNG | 2026-08-27 | HustleK opening sprite sheet (48 frames, 8x6 grid, 320x180 cells) built by `scripts/build-opening-strip.py` from the approved atlas. No new art: the builder refuses to run unless the atlas RGBA hash matches the approved value. |
| `assets/images/` | 9 PNG | 2026-05-25 | App icon, adaptive-icon layers, splash, favicon, and three SecondB phone assets. The home phone and the blank-screen dashboard frame are Simon-provided ChatGPT art (2026-09-26); the earlier silver phone is retained for rollback. Seeded from the Expo template at initialisation (MIT) and replaced in-window with generated art. Since 2026-09-30 the app icon, adaptive foreground and monochrome layers, and favicon are rasterised by `scripts/build-app-icons.ts` from the Polaris pixel star the sign-in screen draws (`pixel-star.ts` geometry, `m3.ts` colours; first-party code, no third-party pixels). The adaptive background and the splash are unchanged |
| `assets/images/phone-app/` | 28 PNG | 2026-09-28 | Simon-supplied mini-app display pack: 12 app icons, 5 internal dock icons, 9 UI icons, and 1 night-village banner; plus 1 locally drawn avatar-palette app icon on a 4 px grid. Only pixels are bundled; labels, dates, unread counts, and state are rendered by the app. Release rights confirmed by Simon on 2026-09-28; the pack does not name its image generator. The three unused UI icons (`badge_3`, `sparkle_gold`, `calendar`) moved to `E:/Legacy/2ndB` on 2026-10-05 (batch `qa261004-batch2`). Since 2026-10-08 the active launcher uses code-drawn `PhoneAppIcon` tiles and canonical pixel glyphs; the supplied pack remains available. |
| `src/lib/dashboard/phone-frame-cells.json`, `phone-pixel-art.ts`, `phone-wallpaper.ts` | Code artwork | 2026-10-08 | First-party integer-cell drawing approved by Simon in the uniform-grid HTML preview. The frame stores a lossless 230×408 palette map, resampled into exact 2px cells and compressed into rectangles for one expo-image per frame. The night wallpaper redraws the constellation and horizon visible on the Simon-supplied home handset; it contains no embedded raster or third-party symbols. The old dashboard PNG remains available but is no longer rendered. |

Current checked inventory: **102 bundled image files** (2026-10-06, after the `qa261006-landing` move; counted as tracked PNG / JPG / GIF / WebP / SVG files under `assets/` and `public/`, the same rule that gave 103 after `qa261005-secondb-sprite` and 137 after `qa261004-batch2`). That move took the whole `public/landing/` pack (the standalone landing structure study and its one head-art PNG, `assets/head-angle-v2/`, first in git 2026-06-15) to `E:/Legacy/2ndB` under Simon decision Q-261005-06 A; its background-concept board (`bg-concepts/`, 7 HTML pages and 6 screenshots) had already gone there on 2026-10-05 (batch `qa261004-batch2`). `scripts/check-constraints.ts` (`AssetLicenseDisclosure`)
fails if any of these paths stops being mentioned in this file, so a new
art pack cannot ship undisclosed.

The production opening reads
`assets/deepspace/hustlek-opening-v2.json`, a deterministic 51,608-byte
integer-rectangle atlas derived from the approved v1 pixels: 12 full-body walk
cells, six turn/contact cells, and one fixed telescope cell. It contains no
independently generated or third-party pixels. Every rectangle has integer
coordinates, binary alpha, and one of 16 source-derived colour bands.
`scripts/build-hustlek-opening-v2.py` verifies the immutable v1 PNG and
decoded-pixel hashes, exact silhouettes and floor anchors, canonical bytes, and
the committed JSON SHA-256
`b599f379db85305b0a2aa82db3f87d7682bc70e59369186bcdcac7c65a79664f`.
The runtime renders the JSON as SVG rectangles and decodes no opening bitmap.
`src/components/ui/LoadingScreen.tsx` owns that renderer, and
`src/app/_layout.tsx` runs it as the cold-start boot gate before either the
sign-in landing or an authenticated route. Authentication, encrypted-storage
recovery, and the first profile probe continue while the opening plays; a
signed-out-to-signed-in transition in the same runtime does not replay it.

**In the repository but not in the build.** Working images also live under
`docs/` (clone-audit captures, flow thumbnails, QA evidence) and `design/`
(prototype renders, reference boards, app screenshots, and reproducible art
packs). These paths are not packaged into the app or web export, and `src/`
contains no image files, so the shipped set remains within the image files
listed above. The working-material count is intentionally not hard-coded so
that adding review evidence does not make this registry stale.

- `design/hustlek-opening-v1/` — added 2026-08-14. Contains the lossless
  canonical atlas and a review GIF for the 165-frame “HustleK and opening”
  sequence. The character, field, telescope, and Polaris art were generated
  for this project from project-specific direction, normalized
  and composed locally with Pillow, and approved through iterative visual QA.
  No third-party game sprite or asset pack is included. The user-provided
  portrait reference is not stored in the repository. Pixy was not used.
  Reproduction instructions and AI handoff rules are in
  [`HUSTLEK-OPENING.md`](./HUSTLEK-OPENING.md); the deterministic builder is
  [`scripts/build-hustlek-opening.py`](../scripts/build-hustlek-opening.py).

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
Museum moments never use SVG or video (no native `Image` URI support for those);
the SVGs counted above belong to the bundled sprite sets, not the museum.

## Pre-existing materials owned by Simon

- Google Play developer account (existing, used for app submission)
- LinkedIn / X / personal blog (used for distribution; out of scope)

## Provenance of everything in this repository

All app code under `src/app/`, `src/components/`, `src/lib/`, all database
migrations under `db/`, all CI workflows under `.github/`, all
documentation under `docs/`, all design working material under `design/`,
and all bundled art listed above were **created from scratch starting
2026-05-25** — the date the repository was initialized from a clean Expo
template. Nothing here predates that date, which is why the "Status"
section above can say no pre-existing first-party assets are bundled.

> ⚠ **2026-09-08 정정.** 이 절의 제목은 ~~"What is in scope for the
> competition"~~ 이었고, 기간을 *"2026-05-25 부터 **the submission deadline of
> 2026-08-17** 까지"* 로 닫고 있었다. 대회도 마감도 없다(루트 `CLAUDE.md`).
> 시작일 2026-05-25 는 저장소 초기화일이라 **그대로 유효하다** — 이 절이 실제로
> 증명하는 것은 제출 범위가 아니라 **출처**이고, 그건 마감과 무관하게 참이다.
