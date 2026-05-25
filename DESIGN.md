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

Source: `src/lib/theme/tokens.ts`. Palette is **Okabe-Ito color-blind-safe**. Dark mode is the only mode in v1; a light mode is deferred until we have a real reason.

### Surfaces (neutrals)

| Token | Hex | Use |
|---|---|---|
| `semantic.background` | `#0B0E0C` | App background. Off-black, slight green undertone so pure-white text doesn't vibrate. |
| `semantic.surface` | `#11161A` | Cards, modal bodies, list items. |
| `semantic.surfaceAlt` | `#161B20` | Inputs, hover/pressed states, nested cards. |
| `semantic.border` | `#222B33` | Hairline borders. Never a fill. |

### Ink (typography)

| Token | Hex | Use |
|---|---|---|
| `semantic.text` | `#E8ECEF` | Body text and headings. Never pure white. |
| `semantic.textMuted` | `#A8B2BC` | Secondary text: labels, captions, helper copy. |
| `semantic.textSubtle` | `#6B7680` | Tertiary: timestamps, hint text, placeholders. |

### Brand & semantic accents

| Token | Hex | Use |
|---|---|---|
| `semantic.brand` | `#7DD3FC` (sky blue) | Primary CTAs, brand chip, focus rings, AI follow-up highlights. The single warm signal in the palette. |
| `semantic.zoneGreen` / `semantic.success` | `#009E73` | Successful save, normal-zone confirmation. |
| `semantic.zoneYellow` / `semantic.warning` | `#F0E442` | Forbidden-lexicon downgrade hint, rephrase prompts, mock-mode badge. |
| `semantic.zoneRed` / `semantic.danger` | `#D55E00` | Crisis modal, destructive actions, age-gate error. Never used decoratively. |
| `semantic.info` | `#56B4E9` | Judge-mode badge, neutral informational notices. |

### Safety-zone semantics

The `classifyInput()` result maps directly to UI affordance:

- **Green** → no chrome, default. The AI follow-up appears inline in a `surfaceAlt` card.
- **Yellow** → show the rephrase hint inside the follow-up card with a `zoneYellow` left border (3px). Never block.
- **Red** → block-modal via `<CrisisRouter />`. Hotline number rendered in `brand` (not `danger` — we want it warm, not alarming). Dismiss-only.

### Color rules

- Never introduce a hex literal in a component. Always go through `semantic.*` or `palette.*` from `tokens.ts`.
- No gradients. Not in CTAs, not in backgrounds, not as decorative fills. The product is text-first; gradients lie about depth.
- No translucent overlays except modal backdrops (`rgba(0,0,0,0.6)`).
- Saturated colors (`brand`, `zone*`) are sparse — a single bar, label, or border, never a fill on > 30% of a screen.

---

## Typography

Source: `src/lib/theme/tokens.ts:typography`. `fontFamily` is currently `"System"` to defer the font decision. The decision is below; load when Sprint 1.5 lands the font pipeline.

### Recommended stack (to load via `expo-font`)

| Role | Font | Reason |
|---|---|---|
| Display (`xxl`, `display`) | **Fraunces** | Serif. Warm without being precious. Variable axes give us weight + optical size at one file. Signals "this is writing, not chrome." |
| Body, UI (`xs`–`xl`) | **Geist Sans** | Pragmatic, neutral, tabular-nums available. Excellent Korean fallback (pairs well with Pretendard). |
| Korean fallback for body | **Pretendard** | Variable, designed for Korean web/app text. Apply via fontFamily fallback chain. |
| Tabular / Data | **Geist Mono** | Same family as body. `tabular-nums` enabled by default for timestamps, persona scores. |

Until fonts are loaded, the system font (`fontFamily: "System"`) is acceptable — it ships SF Pro on iOS and Roboto on Android, both of which respect the scale below.

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
- **No bouncy springs**. The product is for thinking; bounce signals toy.

`prefers-reduced-motion` (web): zero out durations and translate distances.

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

- Gradients of any kind.
- Glassmorphism, blurs, frosted surfaces.
- Cute illustrations, mascots, hand-drawn icons.
- Emojis as decoration in UI strings. (Crisis hotline messages may use language icons, but not 🌱✨💫.)
- Em dashes in any user-visible string.
- Lottie / animated background loops.
- "Cards within cards within cards" — max two levels of `surface` nesting.
- Pill-shaped chips with `borderRadius: 9999`.
- Centered everything. Default-align text left (or right for RTL when we add it).
- "Built for X" / "Designed for Y" landing copy.
- Drop shadows on dark surfaces — they read as smudges.
- `Inter`, `Roboto`, `Space Grotesk`, `Poppins`, `Montserrat` as primary fonts. Geist + Fraunces or nothing.

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-25 | Initial design system created | Formalize what's already in `src/lib/theme/tokens.ts` + add typography, motion, accessibility, voice. Source: `/design-consultation`. |
| 2026-05-25 | Dark mode only in v1 | Journaling is an evening activity; dark surfaces don't compete with the text. Light mode is a v2 decision. |
| 2026-05-25 | Brand color = sky blue (`#7DD3FC`) | Single warm signal in a cool palette. Conveys clarity without claiming authority. |
| 2026-05-25 | Fraunces (display) + Geist Sans (body) | Serif display says "this is writing." Geist body keeps UI chrome unobtrusive. Korean fallback via Pretendard. |
| 2026-05-25 | No gradients, no glass, no pills | Anti-slop. The category is full of meditation-app sameness; we look like a writing tool, not a wellness pillow. |
| 2026-05-25 | Crisis hotline rendered in `brand` not `danger` | Crisis routing is care, not warning. Warm signal > alarm signal. |
