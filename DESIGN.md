# Design System — 2nd-Brain

> Single source of truth for visual decisions. All code in `src/` must conform.
> Update via `/design-consultation` or PR; never silently deviate. See
> `src/lib/theme/tokens.ts` for the runtime token values referenced below.

---

## Product Context

- **What this is:** A daily journaling + life-audit + AI-curated self-knowledge platform. Users build a portable RAG knowledge base they can carry to any LLM.
- **Who it's for:** Power users of LLM memory features who want sovereignty over their self-model. Solo developers, builders, deep-thinkers in their 20s–40s. Expansion target: anyone serious about self-understanding.
- **Space/industry:** Personalized learning for self-understanding. **NOT** a wellness app, mental-health tool, or productivity tool. The vocabulary policy in `src/lib/safety/lexicon.ts` is the boundary.
- **Project type:** Mobile-first React Native app (iOS + Android via Expo) with a static web export (Vercel) acting as marketing landing + judge demo + light-use surface.
- **Memorable thing:** *"An AI that listens before it talks."* Every design decision must serve this — the product should feel like it's holding the page open, not filling it for you.

---

## Voice & Tone

The product is a companion. Not a coach. Not a therapist. Not a guru. A second brain that has read everything you've written and remembers.

| Surface | Korean (존댓말 default) | English (second-person) |
|---|---|---|
| Greeting | "다시 오셨네요. 오늘은 무엇을 떠올리고 계신가요?" | "Welcome back. What's on your mind today?" |
| Encouragement | "잠깐의 솔직함이 며칠치 흐름을 정리해줘요." | "A moment of honesty here saves a week of figuring it out later." |
| Empty state | "아직 기록이 없어요. 한 줄부터 시작해도 충분합니다." | "Nothing yet. One sentence is enough to start." |
| Inline error | "저장이 잠시 미뤄졌어요. 다시 시도해 주세요." | "Couldn't save just now. Try once more." |
| Crisis (red zone) | "지금 많이 힘드신 것 같아요. 혼자 견디지 마세요." | "It sounds like a lot right now. You don't have to carry it alone." |

**Never use** (also enforced by `scripts/check-forbidden-lexicon.ts`):

- mental health, therapy, counseling, diagnosis, treatment, healing, cure
- 정신건강, 심리치료, 심리상담, 치유

**Use instead**: self-understanding, growth, reflection, self-knowledge, 자기 이해, 성장, 들여다보다, 짚어보다.

**Tone calibration**: When in doubt, sound less like an app and more like a thoughtful older friend who took notes during the conversation.

---

## Color System

Source: `src/lib/theme/tokens.ts`. The palette is the **Cosmic Pixel Graph Village** ("밤빛 조각마을") — a deep-space + neural-line + pixel-village tone (pivot #3, 2026-05-29). The `semantic.*` keys are stable; only their values moved, so every screen inherits the tone without per-screen edits. Dark is the primary mode. A light variant (`semanticLight` / `lightCosmic`) exists for secondary surfaces (settings, sign-in) — the main graph screen stays dark even in light mode.

### Surfaces (neutrals)

| Token | Hex | Use |
|---|---|---|
| `semantic.background` | `#070A18` (`cosmic.space950`) | App background. Deep Space Ink. Pure black is forbidden; this is the deepest ink. |
| `semantic.surface` | `rgba(167,139,250,0.07)` | Cards, modal bodies — soul-violet wash, like the village cards. |
| `semantic.surfaceAlt` | `rgba(114,242,199,0.06)` | Inputs, hover/pressed, nested cards — mint wash, the slightly "more active" surface. |
| `semantic.border` | `#2A345A` (`cosmic.lineDim`) | Hairline borders + inactive neural edges. Never a fill. |

Raw space tones for graph/canvas work live under `cosmic.*`: `space950` `space900` `space800` `space700` `lineDim`.

### Ink (typography)

| Token | Hex | Use |
|---|---|---|
| `semantic.text` | `#E8ECF8` (`cosmic.moonWhite`) | Body text and headings. Never pure white. |
| `semantic.textMuted` | `#C9D0E6` | Secondary text: labels, captions, helper copy. |
| `semantic.textSubtle` | `#8D98B8` (`cosmic.mistGray`) | Tertiary: timestamps, hint text, placeholders. |

### Brand & semantic accents — the cosmic signals

The brand pivoted from sky blue to **Electric Mint** (`#72F2C7`) — the color of an active neural connection. Mint is the single primary signal; the other accents are reserved per meaning, not decoration.

| Token | Hex | Meaning / use |
|---|---|---|
| `semantic.brand` / `cosmic.signalMint` | `#72F2C7` (mint) | Active connection. Primary CTAs, brand chip, focus rings, AI follow-up highlights, Wisdom Core / Lumen. |
| `cosmic.signalBlue` | `#4CC9F0` | Growth Core / Archon accent · `semantic.info` (judge / neutral notices). |
| `cosmic.soulViolet` | `#A78BFA` | Soul Core / SecondB / AI presence. Card surface wash. `soulViolet2` `#7C5EE8` = SecondB Divergent mode. |
| `cosmic.pixelLamp` | `#FFD166` | Bond Core / Relia accent · new record / discovery · `semantic.zoneYellow` / `warning` (dual-context, see Decisions Log). |
| `cosmic.dreamPink` | `#FF9FD6` | Muse Core / Lumina accent. |
| `cosmic.guardRose` | `#FF7A90` | Safety / crisis — system-only, no mascot · `semantic.zoneRed` / `danger`. |
| `semantic.zoneGreen` / `success` | `#72F2C7` (mint) | Successful save, normal-zone confirmation. |

### Accent budget (replaces the old 3-color rule)

The pre-cosmic system capped at 3 colors. The village needs more, because **each accent carries a fixed meaning** — it is a coded signal, not a palette flourish. The rule is now:

- **One primary** (mint) drives every CTA, focus ring, and "active" affordance.
- **Five reserved signals** (signalBlue / soulViolet / pixelLamp / dreamPink / guardRose) each map to a fixed concept (Growth/Archon, Soul/SecondB, Bond/Relia + discovery, Muse/Lumina, safety-system). Never use a signal color for anything but its meaning.
- **On any single screen, at most 3 of the six appear at once.** The full 6 only ever coexist on the graph itself, where each is a different character/tier.
- Saturated accents stay sparse — a bar, label, dot, or border, never a fill on > 30% of a screen.

### Safety-zone semantics

The `classifyInput()` result maps directly to UI affordance:

- **Green** → no chrome, default. The AI follow-up appears inline in a `surfaceAlt` card.
- **Yellow** → show the rephrase hint inside the follow-up card with a `zoneYellow` (pixelLamp) left border (3px). Never block.
- **Red** → block-modal via `<CrisisRouter />`. Hotline number rendered in `brand` mint (not `danger` — we want it warm, not alarming). Dismiss-only.

### Color rules

- Never introduce a hex literal in a component. Always go through `semantic.*`, `cosmic.*`, or `characters.*` from `tokens.ts`.
- No gradients. Not in CTAs, not in backgrounds, not as decorative fills. The product is text-first; gradients lie about depth. (The faint sky-drift overlay on the landing graph is the one documented exception — a 5%-opacity atmospheric wash, not a fill.)
- No translucent overlays except modal backdrops (`rgba(0,0,0,0.6)`) and the soul-violet / mint surface washes defined above.
- Saturated colors are sparse (see accent budget).

---

## Game Boy (Deep Space Game Boy)

O-9 adds a pixel hardware layer on top of the existing cosmic palette. Phase 1 is foundation only: tokens, bundled font assets, and aliases. Do not restyle components, screens, or graph nodes until the later O-9 phases.

Source: `src/lib/theme/gameboy-tokens.ts`.

| Token | Value | Use |
|---|---:|---|
| `gameboy.borderWidth` | `2` | Pixel border width for future controls and panels. |
| `gameboy.radius` | `0` | Sharp square corners. |
| `gameboy.pixelShadow` | `3px 3px 0` | Hard offset shadow with no blur. |
| `gameboy.scanlineOpacity` | `0.04` | LCD scanline overlay opacity. |
| `gameboy.grid` | `8` | Pixel spacing grid. |

Palette aliases preserve O-8 cosmic values:

| Alias | Maps to | Value |
|---|---|---|
| `gameboy.screen` | `cosmic.space950` | `#070A18` |
| `gameboy.ink` | `cosmic.moonWhite` | `#E8ECF8` |
| `gameboy.accent` | `cosmic.signalBlue` | `#4CC9F0` |
| `gameboy.power` | `cosmic.signalMint` | `#72F2C7` |
| `gameboy.amber` | `cosmic.pixelLamp` | `#FFD166` |
| `gameboy.border` | signal-blue alpha | `rgba(76,201,240,0.35)` |

Typography hierarchy:

| Surface | Font family |
|---|---|
| Screen titles, buttons, tabs, labels | `fontFamilies.pixelKo` for Korean-first UI, `fontFamilies.pixelEn` for English-only UI |
| Long body copy, journal text, chat, explanations | `fontFamilies.readable` |
| Existing pixel fallback | `fontFamilies.pixel` |

`fontFamilies.pixelKo` loads Galmuri11 from the bundled `galmuri` package because `@expo-google-fonts/galmuri11` is not published on npm. `fontFamilies.pixelEn` loads Press Start 2P from `@expo-google-fonts/press-start-2p`. Both web font stacks fall back to the existing NeoDunggeunmo pixel face.

---

## Typography

**Active font (user directive 2026-05-29): NeoDunggeunmo (둥근모꼴 / 네오둥근모) — applied app-wide.** A crisp Korean+Latin pixel bitmap face that matches the Cosmic Pixel Graph Village aesthetic. SIL OFL 1.1. <https://neodgm.dalgona.dev/>

Source: `src/theme/typography.ts:fontFamilies` (every face resolves to `NeoDunggeunmo`; `mono` → `NeoDunggeunmoCode`). Loaded via `expo-font` in `src/app/_layout.tsx`; applied through the shared `Text` / `Button` / `Input` components and a web base rule in `src/app/+html.tsx`. The earlier Fraunces / Geist / Pretendard recommendation below is superseded for the current build.

### Stack

| Role | Font | Notes |
|---|---|---|
| All UI text | **NeoDunggeunmo** | One pixel voice across the whole app. Single weight; `fontWeight` props degrade gracefully. |
| Numbers / code | **NeoDunggeunmoCode** | Fixed-width pixel variant for trait numbers, drill cells, badges. |

Decorative `<text>` baked into existing v2 SVG art still references its own font-family and is out of scope for this pass (those fall back to system as before).

### Scale (px, from `tokens.ts:typography.sizes`)

| Token | Size | Use |
|---|---|---|
| `display` | 40 | Landing hero. Once per screen, max. |
| `xxl` | 28 | Section openers ("페르소나 v1"). |
| `xl` | 22 | Screen headings (`variant="heading"` in `<Text />`). |
| `lg` | 18 | Card titles, prominent labels. |
| `md` | 15 | Body (`variant="body"`). Default for paragraphs. |
| `sm` | 13 | Captions (`variant="caption"`), small labels. |
| `xs` | 11 | Subtle metadata (`variant="subtle"`), timestamps. |

### Weight scale

`400 regular` (default) · `500 medium` (UI labels) · `600 semibold` (buttons, list-item titles) · `700 bold` (headings) · `800 extrabold` (display only).

Body copy stays at 400. Reserve 600+ for hierarchy, not emphasis. **Italic is forbidden** in UI — we use weight and size, never slant.

### Typography rules

- Line-height defaults to `1.5` for body, `1.2` for display.
- Never letter-space body copy. Headings may use `-0.01em` to tighten.
- Korean and English never use the same font weight at the same size — Korean rendering looks 10–15% heavier; drop one step when mixing within a line.
- Hyphens off. Soft wrap only.
- No em dashes anywhere in UI strings. Use a regular hyphen + space, or restructure.

---

## Spacing & Radii

Source: `src/lib/theme/tokens.ts:spacing,radii`. Base unit is **4px**. Comfortable density (not compact, not airy).

### Spacing scale

`xs (4)` · `sm (8)` · `md (12)` · `lg (16)` · `xl (24)` · `xxl (32)`

Use exactly these. Never `margin: 7`. If you reach for an in-between value, you're solving the wrong problem (probably a missing component boundary).

### Layout density

- Card internal padding: `spacing.lg` (16) on small, `spacing.xl` (24) on tablet/web.
- Section gap (between cards on `/journal`): `spacing.md` (12).
- Screen edge gutter: `spacing.lg` (16) — set by `<Screen />`.
- Composer textarea: `minHeight: 120`, `paddingTop: spacing.md`. Don't auto-grow infinitely on web.

### Radii scale

`sm (4)` · `md (8)` · `lg (12)` · `xl (16)`

- Inputs and buttons: `md` (8).
- Cards and modals: `lg` (12).
- Avatars / chips (judge badge, zone tags): `sm` (4) for sharp; never circular.
- **Never** `borderRadius: 9999`. We don't ship pill chrome.

---

## Components

`src/components/ui/` holds the primitives. Domain-specific composites live in `src/components/{auth,safety,consent}/`.

### `<Screen />`

- Wraps every route. Provides safe-area + edge gutter + background color.
- Children are rendered inside a flex column with `paddingHorizontal: lg, paddingVertical: xl`.
- Pair with `<ScrollView contentContainerStyle={{ gap: spacing.md }}>` for list pages.

### `<Text variant="..." />`

| Variant | Use |
|---|---|
| `display` | Landing hero only. Once per app. |
| `heading` | Screen title (e.g., "Welcome back", "Today's entry"). |
| `body` | Paragraph and form values. Default. |
| `caption` | Labels above inputs, section eyebrows. |
| `subtle` | Timestamps, metadata, helper text. |

`color` prop: `text` (default) · `textMuted` · `textSubtle` · `brand` · `danger`. Never pass a hex.

### `<Button variant="..." />`

| Variant | Use | Visual |
|---|---|---|
| `primary` | The single most important action on a screen. Save, sign in, continue. | `bg: brand`, `fg: #0B0E0C` (off-black). Sharp contrast. |
| `secondary` | Adjacent actions: cancel, back, skip. Multiple per screen OK. | `bg: surfaceAlt`, `fg: text`. |
| `danger` | Destructive, irreversible: delete account, end audit. Confirm in a separate sentence first. | `bg: zoneRed`, `fg: white`. |

**Disabled** = `opacity: 0.5`. **Loading** = text replaced with `"…"` (single character, low motion).

Touch target ≥ 44 × 44 pt always. The `paddingVertical: md (12) + lineHeight` math gets us there with `variant="body"` text.

### `<Input />`

- Single style. `surfaceAlt` background, `border` hairline, `text` color, `textSubtle` placeholder.
- Multi-line via `multiline + numberOfLines + style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: md }}`.
- Never style focus state with color alone — also lift the border to `brand`.

### Domain composites

- `<BirthDateField />` — C10 client guard. Live age check; error state in `danger` color, helper text in `textSubtle`. ISO `YYYY-MM-DD` only.
- `<JudgeBadge />` — C6 visual. `brand` background, off-black text. Sharp `radii.sm`. Header-right placement only.
- `<CrisisRouter />` — Red-zone modal. Slide-from-bottom on mobile, fade on web. Hotline number prominent in `brand`. Single dismiss button (`secondary`).
- `<ConsentDialog />` — C5 capture. Two `<Switch />` rows (share-with-judges, public). Submit only enabled when `consent_given_at` will be set on accept.

---

## Layout Patterns

### Mobile/landing screen

```
┌─────────────────┐
│  eyebrow (brand)│  ← variant="caption" color="brand"
│  Heading        │  ← variant="display" (landing) or "heading"
│  Subtitle       │  ← variant="body" color="textMuted"
│                 │
│  [flex spacer]  │
│                 │
│  Primary action │
│  Secondary      │  ← stacked on mobile, side-by-side on tablet+
└─────────────────┘
```

### List + composer (the `/journal` template)

```
┌─────────────────┐
│ Header + Sign out
├─────────────────┤
│ Nav chips (audit, persona)
├─────────────────┤
│ Composer card
│   label
│   [textarea]
│   [primary button]
│   [optional AI followup card, surfaceAlt]
├─────────────────┤
│ Recent entries (sorted desc)
│   card · card · card
└─────────────────┘
```

The composer is always above the list. Empty state in the list area, not the composer.

### Modal pattern

All modals use the same backdrop (`rgba(0,0,0,0.6)`), card (`surface`, `radii.lg`, `padding: xl`), and dismiss affordance (`secondary` button, never a top-right X). Max-width 420 (crisis) / 480 (consent).

---

## Motion

Calmness is the brand. Motion supports comprehension; it never performs.

- **Default**: no motion. Static appears instantly.
- **State transition** (modal open, screen push): 200ms, `ease-out` in, `ease-in` out.
- **Press feedback**: 80ms opacity drop to `0.8`. No scale, no spring.
- **AI follow-up card appearing**: 250ms opacity + 4px translate-up. Once per save.
- **No skeleton shimmer**. Use the `<ActivityIndicator color={brand} />` for loading.
- **No bouncy springs**, with one documented exception below.

### Bounce exception — the "뽁" overshoot

Bounce/elastic easing is forbidden everywhere *except* the village's signature "뽁" pop. This is a single sanctioned overshoot, calibrated so it reads as a cell settling, not a toy:

- **Cap 1.25×**, settle to 1.0 in **~400ms**, ease-out. Never larger, never longer.
- Origins: node spawn on the graph (PR #34) and the three signature moments below.

### Signature motion (the three village moments)

Three brand moments get a named motion. Each pairs a character accent with a single restrained gesture — they are the only motion the village performs:

| Moment | Trigger | Motion | Accent |
|---|---|---|---|
| **저장 / Save** ("뽁") | A record/capture saves | One "뽁" overshoot (1.25× / ~400ms) + optional `playPop()` on web | mint (`characters.lulu` = Wisdom / Lumen) |
| **연결 발견 / Connection** | A new edge/connection surfaces | A line illuminates dim→bright over ~500ms ease-out, then holds | signalBlue (`characters.archi` = Growth / Archon) |
| **공상 / Divergent** | SecondB Divergent mode opens a turn | A soft violet pulse (opacity 0.4→1→0.6, ~600ms, no scale beyond 1.05) | `soulViolet2` (Divergent). Legacy `/imagine` screen keeps its dreamPink pulse while vestigial. |

`prefers-reduced-motion` (web): zero out durations and translate distances; the pop becomes an instant state change, the line illuminates without transition, the pulse holds at full opacity.

---

## Accessibility

- Color contrast: every text+background pair tested AAA where possible, AA minimum (4.5:1). Okabe-Ito palette is already color-blind-safe.
- Touch targets: 44 × 44 pt minimum. Verified by component defaults.
- Dynamic type: respect the system text scale on iOS/Android. Never lock font sizes in pixels in components; always read from `typography.sizes`.
- VoiceOver/TalkBack: every `<Pressable />` needs an `accessibilityLabel`. Every input needs an `accessibilityHint` describing what changes when it's saved.
- Korean screen-reader: confirm `lang="ko"` is set on the root layout when locale is Korean.
- Crisis modal: when it opens, focus moves to the dismiss button. The hotline number is selectable for copy-paste on web.

---

## What we never do

- Gradients of any kind (except the documented 5%-opacity sky-drift overlay).
- Glassmorphism, blurs, frosted surfaces.
- Cute *cartoon* illustrations or hand-drawn icons. **Exception:** the pixel residents of the Graph Village — SecondB (Soul Core), Archon (Growth), Relia (Bond), Lumen (Wisdom), Foreman Momo (Narrative) + crew, Lumina (Muse); the retired Vela sprite stays dormant — are sanctioned low-fidelity pixel sprites tied to fixed accents and meanings (internal keys in `src/lib/characters.ts` / `WorkerSprite`), not decorative mascots. No character outside that roster.
- Emojis as decoration in UI strings. (Crisis hotline messages may use language icons, but not 🌱✨💫.)
- Em dashes in any user-visible string.
- Lottie / animated background loops.
- "Cards within cards within cards" — max two levels of `surface` nesting.
- Pill-shaped chips with `borderRadius: 9999`.
- Centered everything. Default-align text left (or right for RTL when we add it).
- "Built for X" / "Designed for Y" landing copy.
- Drop shadows on dark surfaces — they read as smudges.
- `Inter`, `Roboto`, `Space Grotesk`, `Poppins`, `Montserrat` as primary fonts. The active face is **NeoDunggeunmo** (numbers: NeoDunggeunmoCode); the earlier Geist + Fraunces pairing is superseded (2026-05-29, see Typography).

---

## Decisions Log

> 2026-06-07: English graph UI uses concrete labels instead of Core suffixes.
> Internal worldview terms remain Soul Core / Pattern Core, but user-facing English mirrors the concrete Korean labels: My center, Work and growth, Relationships, Learning and knowledge, Record archive, Taste and inspiration.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-25 | Initial design system created | Formalize what's already in `src/lib/theme/tokens.ts` + add typography, motion, accessibility, voice. Source: `/design-consultation`. |
| 2026-05-25 | Dark mode only in v1 | Journaling is an evening activity; dark surfaces don't compete with the text. Light mode is a v2 decision. |
| 2026-05-25 | Brand color = sky blue (`#7DD3FC`) | Single warm signal in a cool palette. Conveys clarity without claiming authority. (Superseded 2026-05-29.) |
| 2026-05-29 | Palette pivot #3 → Cosmic Pixel Graph Village | Deep-space + neural-line + pixel-village tone. The nav is a living graph of "조각"; the palette had to read as night sky with lit connections, not a flat dark UI. `semantic.*` keys unchanged so screens inherit it. |
| 2026-05-29 | Brand color = Electric Mint (`#72F2C7`) | Mint = an active neural connection — the product's core metaphor (your pieces lighting up as they link). Sky blue became Archi's reserved accent (`signalBlue`). Confirmed by Simon 2026-05-28. |
| 2026-05-29 | 3-color rule → cosmic accent budget (1 primary + 5 reserved signals) | Each accent now encodes a fixed meaning (character / concept), so a hard 3-color cap was wrong. Replaced with a meaning-locked budget + a per-screen max of 3. |
| 2026-05-29 | Six pixel residents sanctioned despite the no-mascots rule | They are coded pixel sprites (one accent + one role each), the navigational cast of the graph — not decorative cartoon mascots. Roster is closed to `src/lib/characters.ts`. |
| 2026-05-29 | "뽁" overshoot + 3 signature motions as the only bounce | Calmness is still the brand; the single 1.25×/400ms overshoot is the one sanctioned exception, reused across save / connection / imagine moments. |
| 2026-05-29 | Light mode promoted from "deferred" to planned (`lightCosmic`) | Secondary surfaces (settings, sign-in) benefit from light; the graph stays dark. Palette work tracked as queue item G. |
| 2026-05-25 | Fraunces (display) + Geist Sans (body) | Serif display says "this is writing." Geist body keeps UI chrome unobtrusive. Korean fallback via Pretendard. **(Superseded 2026-05-29 → NeoDunggeunmo app-wide; see Typography section.)** |
| 2026-05-25 | No gradients, no glass, no pills | Anti-slop. The category is full of meditation-app sameness; we look like a writing tool, not a wellness pillow. |
| 2026-05-25 | Crisis hotline rendered in `brand` not `danger` | Crisis routing is care, not warning. Warm signal > alarm signal. |
| 2026-06-02 | Worldview v-final: 5-tier model (Soul Core → Pattern Core ×5 → Pattern Data → Log + Pattern Link) | Canonical spatial/graph model. Mascots renamed (display only): Gadi→Relia (Bond), Lulu→Lumen (Wisdom), Momo→Foreman Momo (Narrative), Lumi→Lumina (Muse), Archi→Archon (Growth); SecondB = Soul Core. Internal keys/asset filenames unchanged. See `docs/VISION.md`. |
| 2026-06-02 | Bond / Relia = `pixelLamp` amber, dual-context with `zoneYellow` / `warning` accepted | No-new-hex rule + `guardRose` reserved system-only leaves `pixelLamp` as the only free warm signal for Bond. Narrative / Momo freed it by moving to monochrome (`moonWhite` / `mistGray`). Safety yellow-zone (rephrase-hint 3px left border, rare) and the Bond mascot accent coexist by context. |
| 2026-06-02 | Safety color (`guardRose`) separated from mascots → system-only | Gadi (the old safety guard) became Relia / Bond. Crisis + safety surfaces use `guardRose` directly with no mascot, so a safety signal never reads as a character. |
| 2026-06-02 | 공상 = SecondB Divergent mode (not a place); Divergent accent = `soulViolet2` | The imagine Pattern-Core node is removed; Divergent is a SecondB chat mode using the soulViolet variant (dreamPink is now Muse / Lumina). Analytic + Divergent both route C9 → C3 → `gemini.ts`. |
