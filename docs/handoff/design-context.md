# 2nd-Brain · Design Context (portable)

> Self-contained design source-of-truth. Paste into a Claude Project (or any Claude session) to continue design work **without the repo**. Distilled from `src/lib/theme/tokens.ts` + `DESIGN.md` (434 lines) + `docs/VISION.md` (worldview v-final).
> Catchphrase: **"AI 시대, 가장 가치있는 것은 나 자신 입니다."** · North star: *"An AI that listens before it talks."*

## 0. Product & boundary
- Daily journaling + life-audit + AI-curated self-knowledge. Users build a **portable RAG knowledge base** they carry to any LLM.
- **NOT** a wellness / clinical / productivity app. Voice = a thoughtful older friend who took notes, not a coach or guru.
- Mobile-first React Native (Expo, iOS+Android) + static web export (GitHub Pages / Vercel) as landing + judge demo.
- **Forbidden lexicon (CI-enforced via `src/lib/safety/lexicon.ts` + DESIGN.md):** all clinical / wellness vocabulary in EN+KO (the exact term list lives in those two files). Use instead: self-understanding, growth, reflection, self-knowledge / 자기 이해, 성장, 들여다보다, 짚어보다.

## 1. Worldview — 5-layer model (canonical for graph / nav / color / mascot)
Closer to center = closer to "me"; outward = raw log.

| Layer | Name | Mascot | internal key |
|---|---|---|---|
| 1 | **Soul Core** (나의 중심) | **SecondB** | `core` |
| 2 | **Pattern Core ×5** | (per core) | — |
| 3 | Pattern Data (categories from logs) | — | domain tags |
| 4 | Log (raw records) | — | `sources` · `records` |
| — | Pattern Link (graph edges) | — | edges |

**5 Pattern Cores** (display name · meaning · mascot · internal key · color):
- Growth Core · 일·성장 · **Archon** · `work` · `#4CC9F0`
- Bond Core · 관계 · **Relia** · `relation` · `#FFD166`
- Wisdom Core · 지식 · **Lumen** · `knowledge` · `#72F2C7`
- Muse Core · 취향·영감 · **Lumina** · `taste` · `#FF9FD6`
- Narrative Core · 기록 · **Foreman Momo** (+crew) · `records` · `#E8ECF8`/`#8D98B8` (monochrome)
- Soul Core · 나의 중심 · **SecondB** · `core` · `#A78BFA`

**Internal keys / slugs / DB keys never change** (regression risk). Only display labels / mascot names / layer concepts move. English user-facing labels use concrete words (My center, Work and growth, Relationships, Learning and knowledge, Record archive, Taste and inspiration), not "Core" suffixes.

**공상 = SecondB Divergent mode, not a place.** Pair = Analytic mode. Both route `C9 classifyInput → C3 ai_audit_log → src/lib/llm/gemini.ts`. Divergent accent = `soulViolet2 #7C5EE8`.

## 2. Color tokens (exact — `tokens.ts`)
**Brand = Electric Mint `#72F2C7`** (an active neural connection). 1 primary + 5 reserved signals; **each color is a coded meaning, not decoration**. Max 3 of the 6 on any one screen. No new hex in components — go through `semantic.*` / `cosmic.*` / `characters.*`.

**Signals**
| token | hex | meaning |
|---|---|---|
| `signalMint` / `semantic.brand` | `#72F2C7` | active connection · primary CTA · focus · Wisdom/Lumen |
| `signalBlue` | `#4CC9F0` | Growth/Archon · `info` · connection-found motion |
| `soulViolet` | `#A78BFA` | Soul Core/SecondB · AI presence · card wash |
| `soulViolet2` | `#7C5EE8` | SecondB Divergent mode |
| `pixelLamp` | `#FFD166` | Bond/Relia · new record/discovery · `zoneYellow`/`warning` (dual-context) |
| `dreamPink` | `#FF9FD6` | Muse/Lumina |
| `guardRose` | `#FF7A90` | safety/crisis — **system-only, no mascot** · `zoneRed`/`danger` |

**Surfaces / ink (dark, primary mode)**
| token | hex |
|---|---|
| `semantic.background` = `space950` | `#070A18` (deepest ink; pure black forbidden) |
| `space900` | `#0D1530` · `space800` (surface) | `#16213E` · `space700` | `#243056` |
| `semantic.border` = `lineDim` | `#2A345A` (hairline / inactive edge; never a fill) |
| `semantic.surface` | `rgba(167,139,250,0.07)` (soul-violet wash) |
| `semantic.surfaceAlt` | `rgba(114,242,199,0.06)` (mint wash, "active") |
| `semantic.text` = `moonWhite` | `#E8ECF8` (never pure white) |
| `semantic.textMuted` | `#C9D0E6` · `semantic.textSubtle` = `mistGray` | `#8D98B8` |
| `semantic.backdrop` | `rgba(0,0,0,0.6)` · `backdropStrong` | `rgba(2,4,10,0.78)` |

**Light mode** (secondary surfaces only — graph stays dark): `lightCosmic.bg #F4F5FC` (Moon Haze) · `text #0D1530` · `brand #0A7A57` (deep mint, AA-safe) · `border #D6DAEC` · `surface rgba(124,94,232,.06)`.
**deep-space track** (eye-cyan monotone, ≤3 colors): `bg #0A0E1A` · `accent #46B6FF` · `text #5FD4FF`.

**Color rules:** no gradients (except landing 5% sky-drift), no translucent overlays except modal backdrop + the two surface washes, saturated accents sparse (bar/label/dot/border, never fill >30%).

## 3. Typography
- **Chrome** (titles/buttons/tabs/labels): pixel — **Galmuri11** (KO) / **Press Start 2P** (EN), fallback NeoDunggeunmo.
- **Body / chat / journal**: **Pretendard** (`fontFamilies.readable`) — pixel is hard to read at small body size.
- **Numbers / code**: NeoDunggeunmoCode.
- **Forbidden fonts:** Inter, Roboto, Space Grotesk, Poppins, Montserrat. **No italic. No em dash.**
- Scale (`typography.sizes`, px): display 39 · xxl 31 · xl 25 · lg 20 · md 16 · sm 14 · xs 12. (DESIGN.md narrative scale: display 40 / heading 22 / body 15 / caption 13 / subtle 11 — token values above are runtime truth.)
- Weights: 400 regular (body) · 500 medium (labels) · 600 semibold (buttons) · 700 bold (headings) · 800 extrabold (display only). Reserve 600+ for hierarchy, not emphasis.
- line-height 1.5 body / 1.2 display. KO renders ~10–15% heavier → drop one weight step when mixing KO+EN in a line. Hyphens off; soft wrap only; headings may tighten `-0.01em`, never letter-space body.

## 4. Spacing, radii, Game Boy layer
- **spacing (4px base):** xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32. Use exactly these (`margin:7` forbidden). Card padding lg/xl, section gap md, screen gutter lg.
- **radii:** sm 4 · md 8 · lg 12 · xl 16. Inputs/buttons md, cards/modals lg, chips/badges sm (never circular). **`borderRadius:9999` forbidden (no pills).**
- **Game Boy (Deep Space Game Boy) layer** — `gameboy.*`: borderWidth 2 · radius 0 (sharp pixel corners) · pixelShadow `3px 3px 0` (no blur) · grid 8 · scanlineOpacity 0.04. Aliases: screen `#070A18` · ink `#E8ECF8` · accent `#4CC9F0` · power `#72F2C7` · amber `#FFD166`. Pixel chrome on PremiumButton/Card/Input/tab-bar (radius 0, 2px border, pixel shadow, pressed block-translate).

## 5. Components (`src/components/`)
- `<Screen />` — every route wrapper: safe-area + gutter lg + bg. List pages pair with `ScrollView gap md`.
- `<Text variant color />` — variants: display / heading / body / caption / subtle. color: text / textMuted / textSubtle / brand / danger (never hex).
- `<Button variant />` — primary (bg mint, fg off-black `#0B0E0C`) · secondary (surfaceAlt) · danger (zoneRed, confirm in a separate sentence first) · ghost. disabled = opacity 0.5; loading = "…"; touch target ≥44×44.
- `<Input />` — surfaceAlt bg, hairline border, textSubtle placeholder; focus lifts border to `brand` (never color alone); multiline minHeight 120.
- **premium/**: SceneHero (village hero w/ island+worker+accent+speech), tab-bar (pixel), background (cosmic), feedback (PremiumModal `{visible,onClose,children}` + PremiumToast `{message,tone:info|success|danger}`), surfaces, PixelCorner, PowerOnOverlay.
- **domain:** BirthDateField (C10 age guard) · JudgeBadge (C6) · CrisisRouter (red-zone modal) · ConsentDialog (C5).
- **Modal pattern:** same backdrop `rgba(0,0,0,.6)` + surface card + lg radius + xl padding + secondary dismiss button (no top-right X). max-width 420 (crisis) / 480 (consent). Max two `surface` nesting levels.

## 6. Safety-zone → UI (classifyInput result)
- **Green** → no chrome; AI follow-up inline in a `surfaceAlt` card.
- **Yellow** → rephrase hint inside the follow-up card with a 3px `pixelLamp` left border. Never block.
- **Red** → CrisisRouter block-modal; hotline number in **`brand` mint** (warm, not `danger`); dismiss-only; focus moves to dismiss; hotline selectable on web.

## 7. Motion — "Calmness is the brand"
Default = no motion (instant). Transition 200ms ease-out/in. Press 80ms opacity→0.8 (no scale/spring). No skeleton shimmer (use `ActivityIndicator color={brand}`), no Lottie, no bouncy springs except the one "뽁". `prefers-reduced-motion` zeros everything.
**The one sanctioned bounce — "뽁" overshoot:** cap 1.25×, settle to 1.0 in ~400ms, ease-out. **3 signature village moments:**
| Moment | Trigger | Motion | Accent |
|---|---|---|---|
| 저장/Save "뽁" | record saves | 1.25×/~400ms overshoot (+web playPop) | mint (Lumen) |
| 연결 발견/Connection | new edge | line dim→bright ~500ms then hold | signalBlue (Archon) |
| 공상/Divergent | SecondB Divergent turn | violet pulse 0.4→1→0.6 ~600ms (scale ≤1.05) | soulViolet2 |

## 8. Interaction principles (O-R1, 8) & accessibility
1 Simple is best (one primary action/screen) · 2 Visual flow (single top-down column, CTA at scan end / thumb zone) · 3 Fitts (frequent = bigger+closer; destructive outside thumb zone + confirm) · 4 Hick (≤5 choices or group/split) · 5 Gestalt (spacing IS hierarchy) · 6 Consistency (same action = same component+position; **back lives in exactly one place**) · 7 State completeness (loading/empty/error/offline; an empty state that points nowhere is a dead end) · 8 Real-world use (one hand, bright light, flaky net, 1–3 min sessions).
A11y: contrast AA min 4.5:1 (AAA where possible) · touch 44×44 · respect dynamic type (read `typography.sizes`, never lock px) · every Pressable has accessibilityLabel, every input an accessibilityHint · `lang="ko"` on root when Korean.

## 9. What we NEVER do (anti-slop)
Gradients (except 5% sky-drift) · glassmorphism/blur/frosted · cartoon/hand-drawn illustration **(exception: the 6 closed-roster pixel residents)** · emoji decoration in UI strings · em dashes · italic · Lottie/animated background loops · skeleton shimmer · bouncy springs (except "뽁") · cards 3+ deep · pills (`borderRadius:9999`) · centered-everything (default left) · drop shadows on dark surfaces · "Built for X" copy · Inter/Roboto/Poppins/Montserrat · hex/rgba literals in components.

## 10. Screen catalog (39 routes; axis 1 알아가기 / 2 개인비서 / 3 공상)
**Primary tabs (always):** `/` (graph/home) · `/capture` · `/secondb` · `/profile`. `/settings` = profile child.
- **Axis 1:** `/` `/core-brain` `/records` `/record/[id]` `/wiki` `/capture` `/persona` `/big-five` `/attachment` `/audit` `/interview` `/import` `/formats` `/iden` `/data` · redirects `/journal→/capture` `/mbti→/persona`
- **Axis 2:** `/secondb` (Analytic+Divergent) `/insights` `/trinity` `/research` `/ops` `/esm` · redirect `/jarvis→/secondb`
- **Axis 3:** `/secondb?mode=divergent` · redirect `/imagine→/secondb?mode=divergent`
- **Common:** `/profile` `/settings` `/privacy` `/account` `/theme` `/plans` · auth `/sign-in /sign-up /complete-profile /reset-password /oauth-callback /onboarding` · `/permissions` `/manual` `/support`
- Known nav gaps to design around: orphans (`/insights` `/ops` `/esm` `/data` have no incoming links), dead-ends (`/interview` `/research` `/iden` etc. lack a "next step" CTA). Full graph: see `app-feature-map.html`.

## 11. Asset manifest (sources to continue from)
- Tokens: `src/lib/theme/tokens.ts` (+ `gameboy-tokens.ts`) · Motion: `src/lib/motion/pixel-physical.ts`
- Iconic art (SVG-as-React-component): `src/components/art/SoulcoreFinalArt.tsx` · `src/lib/assets/soulcore-v3.ts` · `SecondBSprite.tsx` · `WorkerSprite.tsx` (5 crew) · `CompanionSprite.tsx` · `IslandArt.tsx` · `TierIcon.tsx` · `WikiCardThumb.tsx`
- Fonts: `assets/fonts/Galmuri11-subset.ttf`, `NeoDunggeunmo(Code)-Regular.ttf`, `@expo-google-fonts/press-start-2p`, Pretendard (CDN)
- Raster: `assets/images/*` (app icon, splash, tab icons), `assets/deep-space/character-front.png`
- Canon docs: `DESIGN.md` · `docs/VISION.md` · `docs/CONSTRAINTS.md`
- NOTE: mascot/soul-core SVG markup is embedded as JSX inside the `.tsx` files. For pixel-exact art in this package, extract the raw SVG (v2 step).

## 12. IDEN export surface (newest, #396/#398)
A second portable artifact the product itself emits: `src/lib/iden/` renders a user's identity as a `.iden` file (AI-readable YAML machine block) + a one-page A4 CV sheet (HTML, inline SVG: radar/donut/node-graph). Colors from `lightCosmic`/`cosmic` tokens only (zero new hex). Screen at `/iden`. This is the human-facing sibling of the §6 Personal Context Pack.

---
*Generated by Claude Code from the live codebase. Update alongside `DESIGN.md` / `tokens.ts` when the system changes.*
