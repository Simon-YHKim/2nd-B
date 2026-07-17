# 2nd-Brain active design contract

Status: canonical for implementation and review

Owner: Simon Kim

Last ratified: 2026-07-18 KST

Applies to: React Native, Android, iOS, and web

This file contains only the active deep-space design contract. The former
Cosmic Pixel, Game Boy, village, Soul Core, Pattern Core, character-voice, and
old visual-tier systems are legacy rollback material. They remain available in
git history and behind `EXPO_PUBLIC_UI=legacy`, but they are never references
for new work.

## 1. Source of truth and conflict order

Use this order when two artifacts disagree:

1. A dated decision explicitly approved by Simon
2. `docs/PRD.md`, `docs/CONCEPT.md`, `docs/CONSTELLATION-DESIGN.md`, and
   `docs/CONSTRAINTS.md`
3. The active contracts in this file
4. A version-pinned base prototype's executable reference source
5. A feature patch, only inside the scope it explicitly names
6. Reference captures generated from that same pinned source
7. Current code

Current code is evidence, not design authority. File timestamps do not establish
priority. A feature patch must be applied as a scoped three-way change; its
shared shell, routes, or unrelated snapshots must never replace the base app.

### Pinned prototype register

| Artifact | SHA-256 | Authority |
|---|---|---|
| `design/2ndB proto_rev2 (Copy).zip` | `321C46A02708C111643E71BF4E8C98A0EE4E1BA7D4113BC3DFF5CF69F5145FC6` | Base rev2 composition and executable reference |
| `design/2ndB proto_reasoning&patch.zip` | `84D615B87C265FA3D896F92A1A7F6FE00FA61866C1189C144CA1B84508B4B152` | Reasoning and notices only |

The reasoning patch may change `/reasoning`, `/notices`, their settings entries,
the home SecondB proposal, and the capture auto-run hook. Its `sb-app.jsx` and
unrelated route snapshots are context only. In particular, they may not restore
removed `exhibit`, `triage`, `research`, or `journal` routes.

Some captures inside the base archive do not match its later executable source.
The known stale captures are `10-me`, `11-star`, and `34-museum`. Do not rebuild
production from those PNGs alone. Verify the route in the executable reference,
then capture a new golden under the same version.

## 2. Product model and visual hierarchy

The canonical model has three layers:

- Layer A, input: seven life domains, `career`, `finance`, `growth`, `relation`,
  `health`, `recreation`, and `collect`.
- Layer B, validation: psychological constructs used for triangulation. This
  layer is hidden and must never render as home or Polaris stars.
- Layer C, output: Polaris, the aggregate persona synthesis.

Polaris is always the largest, brightest, and most luminous node. No domain star
may match it in size, bloom, opacity, motion amplitude, or visual weight.
Brightness L1 to L5 means how much the user has actually established about that
domain. AI output is a proposal and cannot brighten a star before user
ratification.

All links are subtle cyan. Focused drilldown promotes the selected domain near
Polaris while the other domains recede through scale, saturation, opacity, and
motion. It must not turn the selected domain into a second Polaris.

### Open home-slot conflict

The product model and project constraints name `collect` as the seventh domain.
The rev2 executable home currently uses a Museum portal in that visual slot.
No agent may silently swap these interpretations. Until Simon records a dated
decision, preserve the shipping home topology being changed, treat Museum as a
navigation portal with no domain brightness, and never include Museum in Polaris
synthesis. A PR that changes this slot must update the PRD, constellation spec,
this contract, route registry, and goldens together.

## 3. Screen identity registry

One prototype identity has one production route and one canonical renderer.
Aliases redirect; they do not maintain a second rendering implementation.

| Identity | Production route | Canonical renderer | Layout | Notes |
|---|---|---|---|---|
| Home constellation | `/` | `DeepSpaceShell` → `ConstellationHome` | immersive | Only production home |
| Domain star | `/star/[domain]` | `DomainStarLens` | museum-like | A distinct lens for every domain |
| Polaris | `/core-brain` | `PolarisDeck` composition | windowed | Layer B never appears as visible stars |
| Records root tab | `/records` | `DeepSpaceRecordsScreen` | immersive | Dock label remains Wiki |
| Wiki detail | `/wiki`, `/record/[id]` | wiki/detail renderers | route-specific | Never the fourth root-tab destination |
| Museum | `/museum` | `MuseumTimelineScreen` | museum-like | Timeline source is current; old room-list capture is stale |
| Settings | `/settings` | `Settings` | windowed | Root dock destination |
| Reasoning | `/reasoning` | `ReasoningScreen` | windowed | Must use the shared shell |
| Notices | `/notices` | `NoticesScreen` | windowed | Must use the shared shell |

`/deepspace-home` is preview-only. `/persona` is a compatibility surface and
must not be linked as a second Polaris implementation. New navigation must use
the production routes above.

The primary dock is fixed:

1. Constellation → `/`
2. Capture → `/capture`
3. SecondB → `/secondb`
4. Wiki → `/records`
5. Settings → `/settings`

## 4. Shared shell contract

Every production deep-space route uses `DeepSpaceScreen` or an explicitly
approved primitive extracted from it. A route may not reproduce the shell with
its own `SafeAreaView`, local starfield, top bar, surface window, or bottom dock.

Layouts:

- immersive: full-bleed content over the shared seeded sky
- windowed: sky margin `12 / 12 / 14`, radius 24 surface, one-token rim, shared
  elevation, and top app bar inside the window
- museum-like: full-bleed cosmic surface with one top scrim and one app bar

The companion header belongs only to Capture, SecondB, and the floating Records
surface. Home owns its single large SecondB head and speech bubble. Other
windowed screens use `header="none"`.

Back appears in exactly one place per screen. One tap must simplify the current
screen. Node taps transition to a screen or bottom sheet; they never stack a
modal on a node. Long-running work may continue in the background, and Back
must remain available.

## 5. Visual language

- Material 3 structure on a deep-space background
- Azure is primary; violet is tertiary; use no more than three semantic colors
  on one screen
- Use `semantic.*`, `deepSpace.*`, or `m3.*` tokens. Hex literals in components
  are prohibited
- Pretendard for Korean, Roboto for readable Latin text, and Roboto Mono for
  numbers, codes, timestamps, and technical labels
- Use the M3 type scale and shared spacing/shape tokens
- No glassmorphism, gradients, pill chips, decorative emoji, or decorative
  em-dash copy
- No bounce or elastic easing. Respect reduced motion
- One core message and one supporting graphic per screen. Reveal detail only
  after a tap

Material icons use the approved rounded symbol geometry. New one-off SVGs need a
clear functional reason and must follow the Android SVG limits.

## 6. Reasoning contract

Reasoning is an explicit deep run over selected captured material. It is not a
chat message and must never share Chat's daily counter.

- Chat free allowance: 5 sends per day, enforced by the chat counter
- Reasoning free allowance: 2 runs per calendar week
- Reset: Monday 00:00 KST
- Automatic runs reserve at least one run for manual use
- Minor default: Automatic OFF; no rewarded-ad action
- All manual entry points call the same command and show the same limit surface
- Cancelled or failed analysis does not consume a run
- A successful run produces proposals
- Domain tags, brightness, Polaris, and persona output change only after the user
  ratifies the relevant proposal
- Pending proposals are user-scoped and survive navigation and relaunch

Required states:

`idle → empty/selected → running → background → completed → review → ratified`

Alternative terminal states are `error`, `cancelled`, and `depleted`. Completed
copy must say that proposals are ready, never that analysis is still running.
Running work remains visible through the global task status when the user leaves
the screen.

The result screen presents each proposed domain connection as selected or not
selected. The primary action applies only selected proposals. Unselected
proposals keep the existing state. The same-quality rule is absolute:

> 더 비싸도 더 나은 나를 주지 않는다.

Plans differ only by quantity, features, and retention, never by the claimed
quality of self-understanding.

## 7. Notices contract

The notices list is one grouped M3 card inside the shared windowed shell. A row
opens the shared notice dialog. Dialog structure stays stable across patch,
developer, and maintenance types; only the semantic icon and tone change.

The latest unread notice may appear once after authentication and coachmarks.
Confirm closes the dialog without changing the underlying route. List opens
history. Notice data and UI copy must have Korean and English parity.

## 8. Android implementation discipline

`ANDROID_QA_GUIDELINES.md` is mandatory before structural or visual work.

- Avoid unbounded children in `ScrollView`; use bounded data or virtualized lists
- Keep SVG node counts bounded and avoid animated SVG filters
- Use `expo-image` for large raster assets
- Clean up animations, listeners, timers, and BackHandler subscriptions
- Do not put large payloads in AsyncStorage; pending UI state must remain small
- Test Korean clipping, font padding, dock clearance, elevation, overflow, and
  hardware Back on a real Android renderer

## 9. Visual regression and review gate

Flow-debugger thumbnails document what current code renders. They are not design
goldens and may never approve a visual change by themselves.

For every changed route:

1. Resolve the route through the screen identity registry
2. Capture the pinned reference at 390 × 820
3. Capture the production route at Android 390 × 844 or the device-equivalent
4. Compare target, before, and after
5. Verify default, empty, loading, completed, error, depleted, and minor states
   that apply
6. Run `npm run verify`

The mandatory route set for shared-shell or navigation changes is:

`/`, `/core-brain`, every `/star/[domain]`, `/records`, `/museum`, `/capture`,
`/settings`, `/reasoning`, and `/notices`.

The capture harness must visit those production routes. It may not substitute
`/deepspace-home` for `/`, `/persona` for `/core-brain`, or omit domain routes.
A golden changes only in a separately reviewed design update. CI must fail on a
capture or comparison error; `|| true` is not acceptable for the golden gate.

## 10. Change and delivery checklist

Before implementation:

- Identify the prototype version and verify its hash
- State the exact patch scope
- Confirm the production route and renderer
- Check the screen against the one-message, one-graphic rule
- Check whether the change touches Layer A, B, or C

Before merge:

- Confirm no hidden Layer B construct renders as a star
- Confirm Polaris remains dominant
- Confirm no local shell clone was introduced
- Confirm Chat and Reasoning counters are separate
- Confirm AI results remain proposals until ratification
- Confirm minor surfaces contain no rewarded-ad action
- Confirm Korean and English copy parity
- Run Android route captures and `npm run verify`

Before OTA:

- Merge and verify the complete dependent screen set first
- Publish the exact verified merge source tree
- Record the source SHA and EAS Update group
- Do not treat a preview-only OTA as completion
- Do not validate OTA delivery with a debuggable APK; Expo development builds do
  not represent release-channel update behavior

## 11. Legacy boundary

Legacy exists only for explicit rollback through `EXPO_PUBLIC_UI=legacy`.
Do not copy its components, names, fonts, palette, motion, route structure, or
visual tiers into deep-space work. If rollback behavior must change, isolate it
in a legacy-only change and do not edit this active contract to make the legacy
skin look canonical.

The compatibility identifier `Muse/Lumina` may remain only where old persisted
data or a migration contract requires it. It is not a visible home star, a
Polaris peer, or a reference for new deep-space navigation.
