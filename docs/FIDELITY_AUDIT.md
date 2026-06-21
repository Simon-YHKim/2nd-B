# 2nd-Brain - Fidelity Audit (deep-space branch vs design/*.dc.html canon)

> Ground-truth, grep+read-based audit that REPLACES the stale `DESIGN_AUDIT.md`.
> Generated 2026-06-21 from a 22-agent per-screen comparison (one read-only agent
> per engine screen, comparing the deep-space render path to the `.dc.html` canon).

## Why DESIGN_AUDIT.md / FIX_TASKS.md were stale

Their premise ("the ~25 engine screens are still legacy gameboy/village, with no
`isDeepSpaceUI()` branch -> rewrite / strip legacy") is **false on current main**.
21/22 screens already branch on `isDeepSpaceUI()` and render a deep-space view; the
legacy markers (`gameboy-tokens`/`signalMint`/`borderStart*`/`PremiumAppShell`) are
confined to the intentionally-preserved `*Legacy` fallback (the `EXPO_PUBLIC_UI=legacy`
rollback skin; `check:constraints` string-scans those bodies). **Stripping legacy per
FIX_TASKS would break the rollback skin + CI.** The real work is **fidelity**: replacing
generic placeholder views with the canon-specific designs.

## Key findings

- **Only `/attachment` leaks legacy into the deep-space render path** (the single real "remove legacy" case). Everywhere else legacy is fallback-only (expected).
- Nearly all deep-space views live in **one shared file** `src/components/deep-space/DeepSpaceViews.tsx` (LensView / CaptureView / ChatView / RecallLensView / RelationalLensView / ...). Sequence wiring PRs to avoid conflicts there.
- The ORDERS fleet lane is wiring the **7 self-understanding lenses** (big-five done #509; attachment -> esm -> audit -> persona/interview/imagine queued, each replicating #509). This doc **also** covers `core-brain`, `capture`, `secondb`, `trinity`, `growth` + 13 PARTIALs that are NOT in that plan.
- `/ttfv` is FAITHFUL (shipped #505) - leave it.

**Totals (22 screens):** GENERIC_PLACEHOLDER 7 · PARTIAL 13 · MISSING 1 · FAITHFUL 1

Priority key: P1 = blocker view (>=2 blockers or MISSING), P2 = generic/missing (1 blocker), P3 = PARTIAL polish.

## Priority table

| Pri | Route | Status | Effort | legacyOnlyInFallback | blk/maj | Recommendation |
|---|---|---|---|---|---|---|
| P1 | `/growth` | MISSING | M | True | 1/2 | Create design/weekly-growth.dc.html canon file matching the implementation (hero-star display + constellation SVG + metrics chips + observat |
| P1 | `/core-brain` | GENERIC_PLACEHOLDER | L | True | 5/3 | Create a star-aware router: (1) Modify DeepSpaceScreen or add a LensScreenWrapper that accepts a starId parameter (0=북극성, 1=지금의나, 2=회상, etc. |
| P1 | `/interview` | GENERIC_PLACEHOLDER | L | True | 4/1 | Implement a DeepSpaceInterview component that wraps RecallLensView (period picker) + a new DrillDownLensView component for the Q&A flow. Rec |
| P1 | `/attachment` | GENERIC_PLACEHOLDER | L | False | 3/1 | Create a new DeepSpaceAttachmentView component that renders the ECR-S questionnaire in deep-space style (QuantPager + LikertChoiceGroup wrap |
| P1 | `/capture` | GENERIC_PLACEHOLDER | L | True | 2/3 | Replace CaptureView with a port of the core capture form UI from CaptureLegacy into deep-space tokens. Essential: (1) render 5 mode tabs (jo |
| P1 | `/secondb` | GENERIC_PLACEHOLDER | L | True | 2/2 | Replace ChatView stub with a real implementation that mirrors the legacy chat UI pattern (from src/app/secondb.tsx SecondBChatLegacy, lines  |
| P2 | `/big-five` | GENERIC_PLACEHOLDER | L | True | 1/5 | Replace the generic LensView rendered at big-five.tsx:242-247 with a dedicated BigFiveLensView component (create in src/components/deep-spac |
| P2 | `/trinity` | GENERIC_PLACEHOLDER | M | True | 1/3 | Replace DeepSpaceDomainsScreen with a trinity-specific implementation: (1) Port computeStats logic from TrinityLegacy (lines 76-117) to deep |
| P3 | `/focus` | PARTIAL | M | True | 1/2 | Create design/focus-timer.dc.html canvas (or add /focus frame to an existing ops-focused file like ops-wiki.dc.html or screen-design.dc.html |
| P3 | `/persona` | PARTIAL | M | True | 0/1 | Wire the SeenLensView component to consume actual persona peer-review data (src/lib/persona) instead of hardcoded dummy values. Replace line |
| P3 | `/esm` | PARTIAL | M | True | 0/1 | Update deepSpaceGradients to include a distinct peak/ctaGlow variant with brighter start color (#CCFAFF), and modify RhythmLensView to apply |
| P3 | `/imagine` | PARTIAL | S | True | 0/0 | Update ghostBtnFlex borderColor on line 820 from deepSpace.cardLine to deepSpace.cardLineStrong (which is rgba(70,182,255,0.30)), or define  |
| P3 | `/audit` | PARTIAL | S | True | 0/3 | Update the three hardcoded demo values in DeepSpaceViews.tsx lines 566-568 to match canon percentages: 100→78, 69→64, 26→34. These are clear |
| P3 | `/iden` | PARTIAL | M | True | 0/2 | Add ATTACHMENT and SOURCE sections to IdenView before the action buttons. Each should use the same left-border accent row pattern as NORTH_S |
| P3 | `/records` | PARTIAL | M | True | 0/3 | Merge records + sources data using similar pattern to legacy mergeEvidence() and update RECORD_KIND_FILTERS to match 5 canonical types (全/글/ |
| P3 | `/record/[id]` | PARTIAL | M | True | 0/4 | Add Edit and Move button actions to the ctaRow (line 1978); replace generic conclusion card with Secondb relationship card that queries ai_f |
| P3 | `/inbox` | PARTIAL | M | True | 0/2 | Add progress bar above triageCard showing (pending - queue.length) / total. Extract body preview from current source and render 2-3 lines of |
| P3 | `/insights` | PARTIAL | M | True | 0/2 | Replace the compareRow text-only layout with a visual bar chart using React Native <View> elements styled with height percentage calculation |
| P3 | `/import-hub` | PARTIAL | S | True | 0/2 | Add tier-based styling to sourceRow in renderHub. Modify the map function (line 240-256) to conditionally apply backgroundColor and borderCo |
| P3 | `/ops` | PARTIAL | M | True | 0/6 | Restore the canonical section order (Groups → Domains → Recommendations at top), move the Today section below recommendations, restore the S |
| P3 | `/wiki` | PARTIAL | M | True | 0/2 | Adjust wikiPageOpen border to rgba(70,182,255,.3) and create a distinct wikiPageRowCompact style for non-expanded rows with border rgba(70,1 |
| - | `/ttfv` | FAITHFUL | S | True | 0/0 | Ship as-is. Implementation is complete, pixel-faithful to intended design (no legacy design canvas exists for /ttfv; the component IS the ca |

## Per-screen detail

### `/growth` - MISSING (effort M, P1)
- impl: `E:\2ndB\src\screens\deepspace\growth\WeeklyGrowthScreen.tsx`
- legacy only in fallback: True
- recommendation: Create design/weekly-growth.dc.html canon file matching the implementation (hero-star display + constellation SVG + metrics chips + observation card + dream-to-step row), or audit the implementation against the design handoff HTML if a separate design artifact exists. Then update src/app/growth.tsx to include isDeepSpaceUI() branching with a legacy fallback component for consistency with the rollback pattern.
- gaps:
  - **[blocker]** Canon design file weekly-growth.dc.html does not exist in design/. Referenced in WeeklyGrowthScreen.tsx line 1 but no pixel-truth to validate against.
    - canon: design/weekly-growth.dc.html (MISSING)
    - current: No design file found; implementation in WeeklyGrowthScreen.tsx proceeds without design reference
  - **[major]** No isDeepSpaceUI() branch detected. Unlike other converted screens (e.g., growth.tsx at line 7), WeeklyGrowthScreen renders directly without a legacy fallback path. This breaks the established pattern where deep-space and legacy coexist.
    - canon: Expected: export default function Growth() { if (isDeepSpaceUI()) return <WeeklyGrowthScreen />; return <GrowthLegacy/>; }
    - current: Actual: export default function Growth() { return <WeeklyGrowthScreen />; } (no fallback)
  - **[major]** /growth route not listed in docs/deep-space-nav-contract.md IA table. The screen appears reachable from home (index.tsx line 818) but is not part of the documented deep-space navigation structure or second-tier menus.
    - canon: All routes documented in deep-space-nav-contract.md §3 IA table or explicitly noted as out-of-scope
    - current: /growth exists at src/app/growth.tsx, referenced in home, but undocumented in nav-contract

### `/core-brain` - GENERIC_PLACEHOLDER (effort L, P1)
- impl: `src/app/core-brain.tsx (deep-space branch line 84-90); child component: src/components/deep-space/DeepSpaceViews.tsx LensView() line 234-282`
- deep-space view: `LensView (generic one-size-fits-all Big Five inspector with state toggle; renders identical trait bars + insight card + buttons for all star contexts)`
- canon: `design/lens.dc.html`
- legacy only in fallback: True
- recommendation: Create a star-aware router: (1) Modify DeepSpaceScreen or add a LensScreenWrapper that accepts a starId parameter (0=북극성, 1=지금의나, 2=회상, etc.). (2) Update the dock tap handler and router to pass ?star=N to /core-brain. (3) Implement a dispatch switch in the wrapper that renders the correct lens component (RecallLensView for star 2, SeenLensView for star 3, RhythmLensView for star 4, etc.) instead of always returning LensView. (4) Render a dedicated 북극성Screen component with the soul orb + 7 brightness-meter bars when starId=0. (5) Wire each lens to use the correct canon data (Big Five scores for star 1, life periods for star 2, self-vs-other comparison for star 3, ESM bar chart for star 4, aspirations for star 5, domain rows for star 6, and relations chips for star 7). Start with the routing scaffold; wire real data from src/lib/persona/* as a second phase.
- gaps:
  - **[blocker]** Generic single LensView for all 7 stars — canon specifies 8 distinct screens (북극성, 지금의나, 회상, 보여지는나, 리듬, 미래의나, 일·성장, 관계·지식), each with unique layout, title, tag, message, and content. Implementation renders the same Big Five trait inspector regardless of which star opened it.
    - canon: Each star opens a screen-specific view with its own heading (e.g., 별1 지금의나 with tag BFI-44), subtitle, SecondB tip, and content structure (trait bars, narrative grid, comparison chart, ESM bar graph, dashed cards, domain rows, or chips — NOT all Big Five)
    - current: LensView renders Big Five trait bars (label, value, progress bar, ●●●○○ L-level) + insight card + buttons. State toggle switches between empty/error/filled, but all three render the same dummy data (openness:72, conscientiousness:58, extraversion:41, agreeableness:67, neuroticism:39)
  - **[blocker]** No star-context routing — core-brain.tsx line 84-90 renders LensView() with no parameter indicating which star was tapped. DeepSpaceScreen dock maps to fixed route /core-brain, not /core-brain?star=1 or similar. Cannot distinguish 'user tapped 지금의나' from 'user tapped 회상' from 'user tapped 리듬'.
    - canon: Each frame in design/lens.dc.html is labeled with a distinct star identifier (별1 ·지금의나, 별2 ·회상, 별3 ·보여지는나, 별4 ·리듬, 별5 ·미래의나, 별 ·일·성장, 별 ·관계·지식, 북극성 ·소울 코어). The app must route to the correct view based on which star was tapped.
    - current: Fixed route; no star context. All 7 tabs hit the same LensView component.
  - **[blocker]** Missing screen-specific sections — canon shows each star has a unique main section. 지금의나 renders 5 trait bars + 한 문장 summary; 회상 renders 8 period cards in 2×4 grid with age ranges + dot-meter per period; 리듬 renders 7-day bar chart + insight; etc. Implementation only renders the Big Five trait structure.
    - canon: 별1 지금의나 (line 66-101): 5 Big Five bars + insight + buttons. 별2 회상 (line 104-137): 8 period cards in grid. 별3 보여지는나 (line 140-169): legend + 3 compare rows (self vs other bars). 별4 리듬 (line 172-205): 7-day mood chart. 별5 미래의나 (line 208-235): 3 dashed aspiration cards. 별 일·성장 (line 238-264): 3 domain rows (커리어, 배움·성장, 재정). 별 관계·지식 (line 267-292): person chips + knowledge topics + bars. 북극성 (line 28-62): north-star orb (pulse animation) + 7 brightness-meter rows (지금의나, 회상, 보여지는나, etc.).
    - current: LensView renders only the Big Five trait-bar layout (TraitBar component, line 269-274). No grid cards, no bar charts, no dashed cards, no domain rows, no person chips, no orb, no compare rows.
  - **[blocker]** Missing north-star core-brain screen in deep-space path — the canon's first screen (소울코어, line 28-62) is the aggregate 북극성 view with the pulsing soul-violet orb (line 45-48, radial-gradient animation) + 7 brightness-meter bars for each star, + SecondB hero message. This is the default view when the user taps the home-screen orb. Deep-space LensView does not include this north-star layout at all.
    - canon: Frame 북극성 · 소울 코어 (line 28-62): hero orb with pulsing animation (#C8B6FF soul-violet radial to #6D5BC0, animation lens-pulse 5s), north-star label inside, 7 brightness meters below (each showing a star name + cyan progress bar at different %: 88%, 72%, 54%, 63%, 80%, 46%, and unlabeled). This is the context view that shows all 7 stars' aggregate brightness.
    - current: LensView is only a filled/empty/error toggle for Big Five. No orb, no 7-meter layout, no north-star concept.
  - **[major]** Missing SecondB header context — canon shows each screen has a SecondB header bubble (line 71-77 pattern, repeating in all frames) with a contextual message (e.g., '이번 주 외향성이 한 칸 밝아졌어요' for 지금의나), a TIP label (with varied color: #A78BFA soul-violet, #5FF0C0 mint, #FF8FA0 danger/rose, #5FD4FF cyan), and contextual tip text. Implementation's SecondbStatusHeader renders a generic fixed text from i18n ('이번 주 외향성이 한 칸 밝아졌어요' hard-coded for 'lens' context), not screen-specific per star.
    - canon: 지금의나 TIP: #5FF0C0 mint + '변화한 축을 누르면 근거 기록이 보여요.' 회상 TIP: #5FD4FF cyan + '옅은 시기부터 채우면 정합성이 올라가요.' 보여지는나 TIP: #FF8FA0 rose + '차이가 큰 축부터 살펴보세요.' 리듬 TIP: #5FF0C0 mint + '지금 기분도 한 번 남겨볼까요?'
    - current: DeepSpaceScreen line 70 + SecondbStatusHeader render i18n('ds.head.lens.text') + i18n('ds.head.lens.tip') — a single fixed pair, not dynamic per the 7 stars.
  - **[major]** Missing title/tag/subtitle pattern — canon each frame has a title (e.g., '지금의 나'), a tag label (e.g., 'BFI-44'), an eyebrow/subtitle (e.g., '지금의 나를 한 문장씩 또렷하게'). Implementation uses the generic LensHead component (line 317-327) but renders dummy titles for non-Recall/Seen/Rhythm/etc. lenses, not canon-aligned per star.
    - canon: 별1 지금의나: tag 'BFI-44', subtitle '지금의 나를 한 문장씩 또렷하게'. 별2 회상: tag 'NARRATIVE', subtitle '어느 시기가 지금의 나를 만들었나'. 별3 보여지는나: tag 'SELF·OTHER', subtitle '남이 보는 나는 내가 보는 나와 얼마나 같은가'. etc.
    - current: FilledHead renders t('ds.lens.filledTitle') + t('ds.lens.level'). No per-star tags, no per-star subtitles.
  - **[blocker]** Missing Recall/Seen/Rhythm/Possible/Values/Relational lens views — canon defines 8 complete screens. Implementation has placeholder lenses (RecallLensView line 342, SeenLensView line 397, RhythmLensView line 435, PossibleLensView line 475, ValuesLensView line 559, RelationalLensView line 514) in DeepSpaceViews.tsx but they are NOT wired into core-brain.tsx. Tapping any star always returns the same generic LensView, never routes to RecallLensView, SeenLensView, etc.
    - canon: Each of the 7 stars has its own view component with unique layout (grid, chart, dashed cards, domain rows, chip list). These must be routable and distinguishable by star ID.
    - current: RecallLensView (line 342), SeenLensView (line 397), etc. exist but are never exported or called from core-brain.tsx. Only LensView (the generic Big Five) is used.
  - **[major]** Soul core / north-star orb missing — canon north-star screen (line 45-48) has a large pulsing radial-gradient orb with 'NORTH STAR' label + center text '묻고 쌓으며 더 나다워지기' animating at 5s pulse cycle. This visual is the signature of the 북극성 / soul-core screen and is not rendered anywhere in the deep-space implementation.
    - canon: Orb: radial-gradient(circle at 50% 42%, #FFFFFF 0%, #D6C4FF 26%, #A78BFA 56%, #6D5BC0 78%, #2a2150 100%), box-shadow 0 0 36px rgba(167,139,250,.6), animation lens-pulse 5s ease-in-out infinite. Inner text: 'NORTH STAR' (7px Press Start 2P) + body text '묻고 쌓으며 더 나다워지기' (13px, 600 weight). Width 168px, height 168px, centered.
    - current: No orb rendered. LensView renders only trait bars and an insight card.

### `/interview` - GENERIC_PLACEHOLDER (effort L, P1)
- impl: `src/app/interview.tsx`
- deep-space view: `RecallLensView (src/components/deep-space/DeepSpaceViews.tsx:342-376)`
- canon: `design/lens.dc.html`
- legacy only in fallback: True
- recommendation: Implement a DeepSpaceInterview component that wraps RecallLensView (period picker) + a new DrillDownLensView component for the Q&A flow. RecallLensView period cards should have onPress={(period) => setDrillingPeriod(period)}; when drillingPeriod is set, render the interview Q&A interface (styled with deepSpace tokens, mirroring InterviewLegacy's UI structure but using deep-space palette). Wire the drill state (coverage, turns, pendingLayer) and probe logic into the deep-space path. Estimated scope: extract the interview state machine and UI components from InterviewLegacy, re-style with deepSpace tokens, and integrate into a new DeepSpaceInterview wrapper.
- gaps:
  - **[blocker]** RecallLensView renders only the period-picker grid entry screen; the full drill-down interview flow (Q&A conversation, layer labels, progress matrix, sufficient-depth signal) is missing. When a user taps a period in the canon design, it should drill down into an interview conversation with interviewer/user Q&A bubbles, layer tags, and turn tracking (src/app/interview.tsx:64-482 in Legacy has this, but deep-space path has no equivalent).
    - canon: Full interview flow with Q&A chat bubbles, layer labels (●●●○○ as row headers), turn counter, progress matrix, and depth-reached signal (design/lens.dc.html line 121: '시기를 누르면 drill-down 질문')
    - current: Static period-picker grid only; no Q&A flow, no interaction handlers on period buttons, no layer/turn tracking interface
  - **[blocker]** RecallLensView period cards are non-interactive — no onPress handler or navigation. The grid buttons render but don't respond to taps or navigate into the interview (src/components/deep-space/DeepSpaceViews.tsx:365, styles.gridCard has no onPress attached in the deep-space path)
    - canon: Button-style cards that trigger drill-down interview (design/lens.dc.html line 122: 'button' elements with click handlers)
    - current: Pressable elements with styling but no onPress logic; no router.push() or startInterview() equivalent
  - **[blocker]** Missing interactive UI elements from the interview flow: Input composer (multiline text input), Send/Stop buttons, completion banner ('충분한 깊이 도달'), layer tags in Q&A bubbles, turn counter ('답변 N턴'), and depth-reached signal. These are present in InterviewLegacy but absent from the deep-space path (src/app/interview.tsx:64-482).
    - canon: Interactive composer, Send/Stop buttons, layer labels per turn, turn counter, completion banner with 'Wrap up'/'Keep going' options, progress matrix visualization (25 cells for 5 layers × 5 periods)
    - current: Only static period-grid cards; no composer, no buttons, no progress matrix, no completion signal
  - **[major]** RecallLensView uses a generic template structure (LensHead + grid + footer) reused across all 7 lens views. It does not implement the *interview-specific* drill-down state machine (coverage tracking, layer-specific questioning, sufficient-depth check via narrativeStarLevel()). The interview logic (src/lib/interview/probe.ts, narrative-level.ts) is not wired to the deep-space view.
    - canon: Interview-specific drill-down flow with coverage state (5 layers × 5 periods = 25 cells), layer-by-layer questioning strategy, and narrative-level calculation to determine when to suggest wrap-up (design/lens.dc.html line 121 comment + src/lib/interview/narrative-level.ts logic)
    - current: Generic lens view with static demo data (hardcoded dots array, no state mutations, no probe/coverage logic)
  - **[minor]** Palette: RecallLensView correctly uses deepSpace tokens (accent, text, soul) in the grid cards, but the full interview flow UI (if it were implemented) would need semantic tokens for the Q&A bubbles, progress matrix, and footer. No off-palette colors detected in the grid view itself, but the missing interview flow has undefined palette treatment.
    - canon: Q&A bubbles styled with deepSpace tones (accent for interviewer, accentSoft/soul for AI); progress matrix using cyan gradients (design/lens.dc.html line 121-135 shows the grid structure in cyan/mint tones)
    - current: RecallLensView grid uses deepSpace tokens correctly; interview flow (missing) has no palette spec
  - **[blocker]** No drill-down navigation path. The RecallLensView does not implement state transitions to show a drill-down interview when a period is selected. The Legacy version has startInterview(period) that triggers the full flow; deep-space has no equivalent routing or state lift.
    - canon: Tapping a period should navigate to/show the interview drill-down UI for that period (design/lens.dc.html line 122: '시기를 누르면 drill-down 질문')
    - current: No navigation, no state management for drill-down mode, grid is terminal (no onPress handlers)

### `/attachment` - GENERIC_PLACEHOLDER (effort L, P1)
- impl: `E:\2ndB\src\app\attachment.tsx (line 265-271)`
- legacy only in fallback: False
- recommendation: Create a new DeepSpaceAttachmentView component that renders the ECR-S questionnaire in deep-space style (QuantPager + LikertChoiceGroup wrapped in deep-space theming, using deepSpace.cyan/soul/mint tokens, pixelKo typography, gradient CTA buttons). Replace RelationalLensView call with this new component. Set active tab appropriately (likely 'capture' to show it as full-screen assessment, or add 'assessment' as custom active state).
- gaps:
  - **[blocker]** Deep-space branch renders RelationalLensView (results/display view) instead of ECR-S assessment input interface; /attachment is an assessment route, not a results view. attachment.tsx:265-271 calls <RelationalLensView /> which is semantically wrong.
    - canon: ECR-S 애착 평가 (12-item Likert assessment for 4 attachment styles) — assessment input flow matching legacy AttachmentLegacy behavior but in deep-space visual style
    - current: RelationalLensView rendering generic relationship/knowledge chips and progress bars (meant for /wiki or results display, not assessment)
  - **[major]** DeepSpaceScreen active prop is set to 'lens' but RelationalLensView should not use the standard dock tab styling; /attachment is a full-screen assessment, not a dock item. Should be active='capture' or a custom state.
    - canon: Full-screen assessment input with dock nav (like capture/chat tabs in dock)
    - current: active='lens' (incorrect tab designation)
  - **[blocker]** RelationalLensView has no assessment semantics (no Likert scale, no ECR items, no attachment style results). It displays placeholder chips and knowledge bars completely unrelated to ECR-S (Experiences in Close Relationships - Short form).
    - canon: ECR-S questionnaire with 12 items, 7-point Likert scale, 2 subscales (anxiety + avoidance), 4 attachment styles (secure, anxious-preoccupied, dismissive-avoidant, fearful-avoidant)
    - current: Generic relational knowledge view with person chips and topic progress bars — zero ECR assessment logic
  - **[blocker]** No deep-space styled ECR assessment implementation exists. Should render QuantPager + LikertChoiceGroup in deep-space design (cyan/soul palette, deep-space typography, gradient buttons) instead of PremiumAppShell.
    - canon: ECR-S assessment UI in deep-space visual language (deepSpace token colors, fontFamilies.pixelKo/readable, no legacy gameboy/borderStart/signalMint markers in the assessment flow itself)
    - current: No deep-space ECR UI exists; RelationalLensView is unrelated placeholder

### `/capture` - GENERIC_PLACEHOLDER (effort L, P1)
- impl: `src/components/deep-space/DeepSpaceViews.tsx (CaptureView, lines 94-177)`
- deep-space view: `CaptureView (src/components/deep-space/DeepSpaceViews.tsx:94-177): Renders a simplified onboarding-style first-piece input form with a TextInput, 3 hardcoded chips, and a gradient button. It is NOT the full multi-mode capture interface shown in the canon (hub.dc.html /capture frame). The legacy CaptureLegacy (src/app/capture.tsx:206-1802) implements the actual 5-mode capture UI with all features, but uses legacy theme tokens.`
- canon: `design/hub.dc.html (담기 frame, lines 23-58)`
- legacy only in fallback: True
- recommendation: Replace CaptureView with a port of the core capture form UI from CaptureLegacy into deep-space tokens. Essential: (1) render 5 mode tabs (journal/memo/linkclip/ocr/file), (2) add Recent pieces section wired to real user data, (3) show AI auto-tagging chips, (4) float submit button at bottom with gradient, (5) swap semantic/gameboy tokens for deepSpace/deepSpaceGradients, (6) port mode-specific input boxes using deep-space tokens.
- gaps:
  - **[blocker]** CaptureView renders a simplified first-piece-only form, not the full 5-mode capture UI from canon. Canon shows tabs for 글/사진/링크/음성/할 일 (5 modes); implementation shows 3 hardcoded chips + single TextInput (lines 131-150 in DeepSpaceViews.tsx)
    - canon: 5 selectable mode tabs (글, 사진, 링크, 음성, 할 일) with active state styling
    - current: 3 hardcoded Chip labels (text, link, voice) with no tab/mode switching logic
  - **[major]** Missing 'Recent captures' section entirely. Canon shows '최근에 담은 것' with 2+ recent pieces, each with mode icon (✎, 🔗), title, relative time (lines 51-56 in hub.dc.html)
    - canon: Recent captures list showing ✎ 읽은 책에서... (2시간), 🔗 디자인 레퍼런스... (어제)
    - current: No recent captures rendered
  - **[major]** Missing AI auto-tagging section. Canon shows 'AI 자동 태그' label with example hashtag chips (#아이디어, etc.) (line 49-50 in hub.dc.html)
    - canon: AI auto-tagging UI with label and editable hashtag chips
    - current: No tagging section or AI auto-tag label
  - **[blocker]** CaptureView only saves to records with kind=note + hardcoded first-piece tag. Canon is entry point for mixed-mode inbound (all 5 modes). Implementation is read-only for deep-space; not functional (creates dummy note kind, not memo/ocr/linkclip/file/journal from legacy CaptureLegacy)
    - canon: Multi-mode input handler routing to correct capture path based on selected mode
    - current: Single-mode form (journal-style) saving to records.kind=note only
  - **[minor]** Subtitle text missing. Canon shows '무엇이든 한 곳으로 담는다' (Everything in one place) prominently; implementation uses i18n 'ds.capture.title' + placeholder only. No explanatory subtitle layout
    - canon: 무엇이든 한 곳으로 담는다
    - current: i18n-driven text, structure differs from canon
  - **[minor]** Hero header layout differs. Canon shows back arrow (‹) + title '담기' + right-aligned '5 MODE' label; implementation shows simple pixelTitle without chrome/context labels
    - canon: ‹ 담기 [5 MODE] header layout with icon chrome
    - current: Simple title only, no navigation context
  - **[major]** No fixed submit button at bottom. Canon shows primary gradient button '담기' floated at absolute bottom (line 57 in hub.dc.html). Implementation has GradientButton but no fixed positioning or save affordance
    - canon: Fixed bottom button '담기' with cyan→light-cyan gradient linear-gradient(90deg, #46B6FF, #5FD4FF)
    - current: GradientButton with demo text, no fixed positioning or save logic

### `/secondb` - GENERIC_PLACEHOLDER (effort L, P1)
- impl: `src/app/secondb.tsx (lines 93-101); src/components/deep-space/DeepSpaceViews.tsx (lines 182-203, ChatView function)`
- legacy only in fallback: True
- recommendation: Replace ChatView stub with a real implementation that mirrors the legacy chat UI pattern (from src/app/secondb.tsx SecondBChatLegacy, lines 104-689). Wire to sendChatMessage(), parseSourceCitations(), and the chat turn state. Render: (1) status header with SecondB sprite + title + mode badge, (2) scrollable turns list, (3) evidence chips with tap-to-reference-drawer, (4) input composer with send button, (5) mode toggle above composer. Use deep-space token colors (deepSpace.cyan, deepSpace.soul, deepSpace.mint) instead of legacy gameboy tokens.
- gaps:
  - **[blocker]** Missing input composer at bottom. Canon (design/hub.dc.html:85) shows flex row with input + gradient send button. ChatView has no Input component or button.
    - canon: Input field + gradient CTA button (bottom, rounded pill style)
    - current: Empty space below demo chips
  - **[blocker]** Missing screen header. Canon (design/hub.dc.html:75) shows back button, SecondB sprite (30x30), title 'セコンビ', and mode badge '공상'. ChatView renders only ScrollView with chat bubbles.
    - canon: Back button + sprite + title + badge, aligned horizontally at top
    - current: No header component
  - **[major]** No mode toggle visible. Canon and legacy code show Analytic/Divergent mode selector, but ChatView does not render any toggle UI.
    - canon: Two-button toggle (analytic/divergent) with divergent pulse indicator
    - current: Not rendered in deep-space ChatView
  - **[major]** Demo content only, no real wiring. Line 186 TODO comment: 'wire to the real SecondB chat (src/lib/chat → gemini.ts, C9→C3)'. ChatView uses hardcoded i18n keys (ds.chat.user, ds.chat.ai, etc.) instead of real turns.
    - canon: Real conversation turns with user messages, AI responses, source citations
    - current: Hardcoded single user/AI bubble pair
  - **[minor]** Reference chip row (evidence) shown but isolated. Canon shows evidence chips appear after AI response with interactive tap behavior (opens reference drawer per legacy code). Deep-space version shows chips but no interaction or context.
    - canon: Evidence chips with tap-to-expand reference drawer (per src/app/secondb.tsx:523-549)
    - current: Static chip display with no handler

### `/big-five` - GENERIC_PLACEHOLDER (effort L, P2)
- impl: `src/app/big-five.tsx (routes to LensView in src/components/deep-space/DeepSpaceViews.tsx)`
- legacy only in fallback: True
- recommendation: Replace the generic LensView rendered at big-five.tsx:242-247 with a dedicated BigFiveLensView component (create in src/components/deep-space/BigFiveLensView.tsx). Implement the canvas-specific layout: summary sentence, 5 trait bars with brightness level badges (●●●●○ L4 format), BFI-44 label, and the two action buttons. Wire to persona/bfi.ts scoring results. Verify trait values, narrative generation, and level badge calculation match the canon mockup exactly.
- gaps:
  - **[blocker]** LensView is a generic one-size-fits-all lens component, not Big-Five-specific. The /big-five route should render a dedicated Big Five trait display that matches design/lens.dc.html lines 65-101 (지금의 나 card). Instead it renders the reusable LensView, which is intended for multiple assessment types.
    - canon: Dedicated Big Five card with: title '지금의 나', summary narrative sentence, 5 trait bars, brightness level indicators (L4/L3 format), BFI-44 label, two action buttons.
    - current: Generic LensView with optional empty/error state, filled state showing only 5 trait bars + insight text, hardcoded dummy data, no Big-Five-specific metadata.
  - **[major]** Missing brightness level indicators (●●●●○ L4 format). Canon shows each trait with filled/empty dots + letter level; LensView only shows percentage value.
    - canon: Each trait bar has a level badge below: e.g., '●●●●○ L4' (4 of 5 dots filled + L4 designation)
    - current: Only percentage number displayed; no dot meter or level badge
  - **[major]** Missing summary narrative sentence. Canon shows one sentence describing the user's trait profile in human language (e.g., '호기심이 많고 계획적이며...'). LensView only shows a generic insight.
    - canon: Single summary sentence in a card (line 83 of lens.dc.html): highlights key traits in a prose format.
    - current: Generic insight text from i18n (ds.lens.insight) with no Big-Five-specific narrative.
  - **[major]** Missing action buttons. Canon shows two buttons at bottom: '다시 검사' (Retake) and '측정 이어가기' (Continue measuring). LensView has no buttons.
    - canon: Two buttons in styles.bottom: 다시 검사 (secondary), 측정 이어가기 (primary gradient)
    - current: No buttons present in the filled state
  - **[minor]** Missing BFI-44 label/tag. Canon shows 'BFI-44' label in the header (line 79). LensView uses generic 'L4' level text instead.
    - canon: Header shows '지금의 나' title with 'BFI-44' tag top-right
    - current: Pixel title + level='L4', no BFI-44 reference
  - **[major]** Trait names and values are dummy/hardcoded. LensView shows demo values (72, 58, 41, 67, 39) with no connection to actual BFI scoring or user data. No TODO comment suggests wiring is incomplete.
    - canon: Real trait scores from persona/bfi.ts, scores properly serialized and displayed.
    - current: Hardcoded demo values; no data source integration visible.
  - **[major]** No state management for Big Five results. The legacy BigFiveLegacy component saves results via createRecord, but the deep-space LensView is a pure display component with no connection to BFI assessment or persistence.
    - canon: Results tied to Big Five assessment completion and saved to user record.
    - current: Stateless demo view with no assessment context.

### `/trinity` - GENERIC_PLACEHOLDER (effort M, P2)
- impl: `E:\2ndB/src/screens/deepspace/DeepSpaceDesignScreens.tsx (DeepSpaceDomainsScreen, lines 2397-2464) via E:\2ndB/src/app/trinity.tsx line 367`
- legacy only in fallback: True
- recommendation: Replace DeepSpaceDomainsScreen with a trinity-specific implementation: (1) Port computeStats logic from TrinityLegacy (lines 76-117) to deep-space; (2) Load records + sources (not wiki pages) and classify via classifyDomain; (3) Render 2x2 grid of trinity cards with DOMAIN_ACCENT colors + domain-specific counts/dates/conclusions; (4) Add SecondbStatusHeader with trinity messaging; (5) Include topConclusions rows + tag guide. Reuse formatGrid/domainCard styles but bind data to trinity domain model, not wiki graph.
- gaps:
  - **[blocker]** Data source mismatch: DeepSpaceDomainsScreen uses buildDomainsView() which operates on wiki pages + tags, NOT records with trinity domain classification. Canon requires aggregating records/sources tagged with health/app/brain/finance (per DOMAIN_TAGS in trinity.tsx:32-37). Current code ignores the entire Trinity domain classification logic.
    - canon: 4 hardcoded domains: 건강(86), 앱(54), 뇌(41), 재정(7) with counts, last entry dates, and domain-specific conclusions
    - current: Arbitrary wiki tags sorted by page count; no trinity domain logic applied
  - **[major]** Missing SecondbStatusHeader with trinity-specific messaging. Canon shows: main text '네 영역이 이렇게 쌓이고 있어요' + TIP mint badge '비어 있는 영역을 더 담아볼까요?'. Implementation has no SecondbStatusHeader component rendered.
    - canon: SecondbStatusHeader with t('domains.headerHas')/t('domains.headerEmpty') + t('domains.tip')
    - current: Uses generic Shell title only; missing avatar/speech bubble component
  - **[major]** Missing domain-specific accent colors. Canon shows: 건강=#46B6FF (cyan primary), 앱=#9fe4ff (cyan lighter), 뇌=#9fe4ff, 재정=dimmed. Trinity.tsx defines DOMAIN_ACCENT map (health→zoneGreen, app→brand, brain→info, finance→warning) but implementation ignores it entirely.
    - canon: Domain cards with accent-colored borders/text per DOMAIN_ACCENT[domain]
    - current: domainCard uses generic colors; domainNum color is cyanSoft (not accent-mapped)
  - **[major]** Missing top conclusions section. Canon shows '건강 · 핵심 주제' label + 2 topic rows with colored dots. Implementation renders only topTopics (page titles), not conclusions extracted from records. Canon data: '아침 산책이 기분과 가장 강하게 연결됨' + '수면 시간이 다음날 집중을 좌우함'.
    - canon: View includes topConclusions from stats (trinity.tsx:106-109 logic): top 3 most recent conclusions per domain
    - current: Only topTopics rendered; no topConclusions extracted or displayed
  - **[minor]** Missing tag guide section. Canon shows 'RECOGNIZED TAGS' footer with all domain tags (건강: #health #건강 #fitness #sleep... etc). Trinity.tsx includes DOMAIN_TAGS and TrinityLegacy renders tagGuide at lines 290-299. Deep-space has no equivalent.
    - canon: tagGuide section listing recognized tags per domain (DOMAIN_TAGS map)
    - current: No tag guide rendered
  - **[minor]** Missing empty state handling specific to trinity. Canon empty state likely shows different message than generic wiki graph. Trinity legacy (lines 214-235) shows: '이 4개 태그... 기록이 없어요' with domain-specific guidance. Deep-space uses generic graph empty state (t('domains.empty')).
    - canon: Trinity-specific empty message + guidance to add records with domain tags
    - current: Generic wiki empty state from buildDomainsView

### `/focus` - PARTIAL (effort M, P3)
- impl: `src/screens/deepspace/DeepSpaceDesignScreens.tsx (lines 2555-2799, DeepSpaceFocusScreen export)`
- deep-space view: `DeepSpaceFocusScreen: SVG progress ring (cyan/cyanDim/mint state-toned), Secondb head (mood-aware), session timer (MM:SS, Galmuri11), dots row (session progress tracker), play/pause button (74x74 px, cyan for focus / ghost for break), completion celebration screen with choice buttons (break / focus-again), settings sheet (focus/break duration steppers with +/-), all using deep-space tokens exclusively`
- canon: `MISSING - focus-timer.dc.html does not exist in design/ directory`
- legacy only in fallback: True
- recommendation: Create design/focus-timer.dc.html canvas (or add /focus frame to an existing ops-focused file like ops-wiki.dc.html or screen-design.dc.html) showing the four screen states: idle → focus → break → complete. Include ring animation keyframes, typography (label, clock, submessage), button states (play/pause glyphs, disabled break button), dots indicator, and settings sheet layout. Once canon exists, cross-check: ring glow intensity, Secondb mood triggers, initial prompt/onboarding copy, and empty-state messaging.
- gaps:
  - **[blocker]** Design canon file missing: focus-timer.dc.html is referenced in code comment (line 2477) but not present in design/ directory. Cannot validate visual layout, spacing, typography, or component arrangement against pixel-truth.
  - **[major]** No empty state design present: comment states timer 'reuses ops_routine_logs via logRoutineCompletion' but no pre-session guidance, error states, or tutorial flow visible. Lone button with no context on first visit may confuse users.
  - **[major]** Secondb head mood logic (line 2656: isBreak && !showComplete ? 'neutral' : 'positive') may not match canon intent. If canon specifies mood per phase or session state, this mapping could diverge.
  - **[minor]** Ring glow effect (line 2662: fillOpacity={0.1}) is hardcoded; canon may specify different bloom intensity per phase or animation state.
  - **[minor]** Font sizes hardcoded (eyebrow: 8px, time: 46px, ringSub: 11px) without explicit canvas reference; possible mismatch with canon typography scale.

### `/persona` - PARTIAL (effort M, P3)
- impl: `E:\2ndB\src\app\persona.tsx (routes to SeenLensView in E:\2ndB\src\components\deep-space\DeepSpaceViews.tsx:397-431)`
- deep-space view: `SeenLensView (export function at DeepSpaceViews.tsx:397)`
- canon: `design/lens.dc.html`
- legacy only in fallback: True
- recommendation: Wire the SeenLensView component to consume actual persona peer-review data (src/lib/persona) instead of hardcoded dummy values. Replace lines 414-416 with a map over dynamic trait data, preserving the current layout structure. All palette tokens are correct; only data wiring is needed.
- gaps:
  - **[minor]** Comparison trait count mismatch: canon shows 5 traits visible in the 7별 밝기 section, implementation renders only 3 traits (외향성, 성실성, 우호성) in CompareRow at lines 414-416
    - canon: 5 traits in canon lens.dc.html lines 54-60
    - current: 3 hardcoded CompareRow calls in SeenLensView
  - **[major]** All trait values hardcoded as dummy data (self={61,74,68}, other={79,78,61}) with no wiring to real persona.attachment or peer-review scores
    - canon: Dynamic data from real persona assessment results
    - current: Hardcoded values; TODO comment at line 401 confirms incomplete wiring
  - **[minor]** Palette: all tokens correctly mapped. deepSpace.accent (#46B6FF) for self/cyan, deepSpace.soulDeep (#8B7BD8) for other/soul-violet, no legacy leakage into deep-space render path
    - canon: #46B6FF self dots, #A78BFA other indicator in canon
    - current: deepSpace.accent and deepSpace.soulDeep used in legend (lines 786-787) and compare fills (lines 797-798)

### `/esm` - PARTIAL (effort M, P3)
- impl: `src/app/esm.tsx → src/components/deep-space/DeepSpaceViews.tsx:RhythmLensView (lines 435-471)`
- legacy only in fallback: True
- recommendation: Update deepSpaceGradients to include a distinct peak/ctaGlow variant with brighter start color (#CCFAFF), and modify RhythmLensView to apply this gradient + a shadow wrapper around peak bars (line 457). The progress gradient should also fade toward opacity 0.2 at the bottom to match the canvas. This requires both tokens.ts and the chart rendering logic updates.
- gaps:
  - **[major]** Peak bar (Saturday) gradient does not match canon — should use bright-to-medium-cyan gradient (#CCFAFF→#46B6FF) with glow effect, but currently uses same progress gradient as regular bars (DeepSpaceViews.tsx:457, should differentiate peak: true gradient)
    - canon: linear-gradient(180deg,#CCFAFF,#46B6FF) + box-shadow:0 0 12px rgba(70,182,255,.6)
    - current: deepSpaceGradients.cta ["#46B6FF", "#5FD4FF"] (same as regular bars)
  - **[minor]** Regular bar gradients are missing the fade-to-faint effect from canon — should darken toward the bottom (linear-gradient 180deg with fade to rgba), but both regular and peak use full-saturation two-stop gradients
    - canon: linear-gradient(180deg,#46B6FF,rgba(70,182,255,.2))
    - current: deepSpaceGradients.progress ["#46B6FF", "#5FD4FF"]
  - **[minor]** Peak bar missing drop-shadow glow effect from canon design — Saturday bar should have visual emphasis via shadow (box-shadow:0 0 12px rgba(70,182,255,.6)), but GradientFill SVG renders flat without shadow
    - canon: box-shadow:0 0 12px rgba(70,182,255,.6)
    - current: No shadow applied; GradientFill renders flat (DeepSpaceViews.tsx:456-457)

### `/imagine` - PARTIAL (effort S, P3)
- impl: `src/app/imagine.tsx (renders PossibleLensView from src/components/deep-space/DeepSpaceViews.tsx:475)`
- deep-space view: `PossibleLensView() — renders LensHead (title/tag/eyebrow), 3 dashed-border cards in a list, footer text, and 2-button row (ghost + gradient). Correct structure and layout.`
- canon: `design/lens.dc.html`
- legacy only in fallback: True
- recommendation: Update ghostBtnFlex borderColor on line 820 from deepSpace.cardLine to deepSpace.cardLineStrong (which is rgba(70,182,255,0.30)), or define a dedicated token. This brings the ghost button border to canon-exact opacity. Effort: S (single line change).
- gaps:
  - **[minor]** Ghost button border opacity mismatch (src/components/deep-space/DeepSpaceViews.tsx:820). Implementation uses deepSpace.cardLine (rgba(70,182,255,0.24)) but canon (design/lens.dc.html:231) specifies rgba(70,182,255,.3). Difference: 0.06 alpha — subtle but measurable.
    - canon: rgba(70,182,255,.3)
    - current: rgba(70,182,255,0.24)

### `/audit` - PARTIAL (effort S, P3)
- impl: `E:\2ndB\src\app\audit.tsx (renders ValuesLensView from src\components\deep-space\DeepSpaceViews.tsx line 559)`
- deep-space view: `ValuesLensView renders: LensHead (title "Work·growth" / tag "DOMAIN" / eyebrow), 3 DomainRow components (Career/Learning·growth/Finance with progress bars), insightCard with conclusion, and GradientButton (full width). Layout matches canon structure exactly; only demo fill percentages misaligned.`
- canon: `design\lens.dc.html (lines 237-264, the 일·성장 / Work·Growth DOMAIN star screen)`
- legacy only in fallback: True
- recommendation: Update the three hardcoded demo values in DeepSpaceViews.tsx lines 566-568 to match canon percentages: 100→78, 69→64, 26→34. These are clearly marked TODO (line 561: 'wire to domain piece counts') so this is just demo data alignment for fidelity testing.
- gaps:
  - **[major]** Demo data: Domain1 (Career) bar width 100% but canon shows 78% (design/lens.dc.html line 255, width:78%)
    - canon: 78%
    - current: 100% (DeepSpaceViews.tsx line 566: value={100})
  - **[major]** Demo data: Domain2 (Learning·growth) bar width 69% but canon shows 64% (design/lens.dc.html line 256, width:64%)
    - canon: 64%
    - current: 69% (DeepSpaceViews.tsx line 567: value={69})
  - **[major]** Demo data: Domain3 (Finance) bar width 26% but canon shows 34% (design/lens.dc.html line 257, width:34%)
    - canon: 34%
    - current: 26% (DeepSpaceViews.tsx line 568: value={26})

### `/iden` - PARTIAL (effort M, P3)
- impl: `src/app/iden.tsx (deepspace branch: lines 44-49) → src/components/deep-space/DeepSpaceViews.tsx (IdenView: lines 286-313)`
- legacy only in fallback: True
- recommendation: Add ATTACHMENT and SOURCE sections to IdenView before the action buttons. Each should use the same left-border accent row pattern as NORTH_STAR/BIG_FIVE. Wire ATTACHMENT to attachment.style + trust level from real IdenDoc; wire SOURCE to record/test/day counts from iden-export.ts result object. Add View raw button as secondary button in a two-button row (using ghostBtn style). Add emoji to file card center.
- gaps:
  - **[major]** ATTACHMENT section missing - canon shows "안정형 · 신뢰도 L4" card (design/iden.dc.html line 95). Implementation has no corresponding section.
    - canon: Attachment-type card with label + trust level
    - current: Not rendered
  - **[major]** SOURCE section missing - canon shows "기록 214건 · 검사 4종 · 142일" (record count, test count, days duration). Implementation has no section.
    - canon: Source metadata row with three data points
    - current: Not rendered
  - **[minor]** View raw button missing - canon shows "원문 보기" button alongside "AI에 전달" button (design/iden.dc.html lines 98-99). Implementation only has send button.
    - canon: Two-button row: secondary button (원문 보기) + primary button (AI에 전달)
    - current: Single primary button (AI에 전달)
  - **[minor]** File card emoji missing - canon shows 🪪 passport emoji in file card header (design/iden.dc.html line 86). Implementation renders text-only card.
    - canon: 30px emoji centered in card
    - current: Text-only filename display

### `/records` - PARTIAL (effort M, P3)
- impl: `src/screens/deepspace/DeepSpaceDesignScreens.tsx:985-1062`
- legacy only in fallback: True
- recommendation: Merge records + sources data using similar pattern to legacy mergeEvidence() and update RECORD_KIND_FILTERS to match 5 canonical types (全/글/링크/사진/할일). Add search Input component between SecondbStatusHeader and FilterChip row. Align UI component to canon chatbox pattern if time permits (M priority: data integration is critical, UI refinement is secondary).
- gaps:
  - **[major]** Filter type mismatch: Canon shows 5 capture/source types (글/링크/사진/할일) but code renders 4 record kinds (journal/note/audit). RECORD_KIND_FILTERS at line 970 defines wrong set.
    - canon: 전체·글·링크·사진·할 일 (evidence types from captures/sources)
    - current: all·journal·note·audit (record kinds only)
  - **[major]** Missing search box: Canon explicitly shows '기록 검색' input between hero and type chips, but DeepSpaceRecordsScreen has no search input component.
    - canon: <input placeholder='기록 검색'> with search icon
    - current: No Input component rendered
  - **[minor]** UI component mismatch: Canon uses Secondb chatbox (character + speech bubble) but code uses SecondbStatusHeader (text + tip). Different patterns.
    - canon: Secondb character chatbox component
    - current: SecondbStatusHeader at line 1024
  - **[major]** Data source mismatch: Canon merges records + sources (journal/capture/audit/interview/imagine/wiki types), but deep-space only uses TimelineRecord from records table (journal/note/audit_response kinds). Sources omitted.
    - canon: mergeEvidence([records, sources]) with 6 evidence types
    - current: listRecentRecords() alone, 3 record kinds

### `/record/[id]` - PARTIAL (effort M, P3)
- impl: `src/app/record/[id].tsx (deep-space component: src/screens/deepspace/DeepSpaceDesignScreens.tsx lines 1857-1994)`
- legacy only in fallback: True
- recommendation: Add Edit and Move button actions to the ctaRow (line 1978); replace generic conclusion card with Secondb relationship card that queries ai_followup or linked records to display specific connection info with proper icon/avatar; add TIP badge to SecondbStatusHeader when showing linked count; implement tag-edit UI if canon design intended interactive tag management.
- gaps:
  - **[major]** Bottom action buttons layout mismatch (file: src/screens/deepspace/DeepSpaceDesignScreens.tsx lines 1978-1991)
    - canon: Three buttons at bottom: 편집 (Edit), 이동 (Move), 🗑 (Delete) — each full-width, side by side
    - current: Two buttons only: 'New Record' (secondary, full-flex) and delete icon (46px fixed width) side by side
  - **[major]** Secondb advisory insight card content differs from canon (lines 1957-1961)
    - canon: Canon shows specific relationship: '이 기록은 <span style="color:#C8B6FF">미래의 나</span> 별과 이어져요' (This record is connected to 'Future Me' star) with 📎 button
    - current: Implementation renders generic `record.conclusion` field in insightViolet card with no context or navigation action
  - **[major]** Missing Secondb status message in header
    - canon: Canon includes chat bubble after header: '이 조각은 3개의 기록과 이어져 있어요.' (This piece is connected to 3 records.) with TIP badge in mint (#5FF0C0)
    - current: Implementation uses SecondbStatusHeader which displays the count/alone message without the chat-bubble UI or mint TIP badge
  - **[major]** Edit/Move buttons missing action handlers
    - canon: Edit button leads to edit form; Move button allows relocating record to different collection
    - current: No edit or move button functionality in deep-space implementation; only New Record and Delete
  - **[minor]** Insight card visual treatment incomplete
    - canon: Secondb head icon (24px) + message text + action button (📎 styled with cyan border/background)
    - current: Only text content; missing Secondb head avatar and action button
  - **[minor]** Tag count limit not specified in canon but hardcoded in implementation
    - canon: Canon shows 2 tags plus '+ 직접' (+ Custom) button for adding more
    - current: Hardcoded to show first 5 tags only (line 1952: slice(0, 5)) with no add-tag button

### `/inbox` - PARTIAL (effort M, P3)
- impl: `src/screens/deepspace/DeepSpaceDesignScreens.tsx (DeepSpaceInboxScreen, lines 1080-1272)`
- legacy only in fallback: True
- recommendation: Add progress bar above triageCard showing (pending - queue.length) / total. Extract body preview from current source and render 2-3 lines of bodyById content (if available) or a placeholder. Add a 'TRIAGE' badge next to the title. Implement a dashed-border FilterChip variant for custom tag input. The implementation has the right data model and state management; it just needs visual completeness to match the canon's focused triage flow.
- gaps:
  - **[major]** Progress bar missing — Canon shows '3 / 10' progress indicator above main card (records-archive.dc.html:91-92); implementation has no progress tracking UI.
    - canon: Progress bar with 30% fill and '3 / 10' label
    - current: No progress bar rendered
  - **[major]** Source preview layout incomplete — Canon shows icon (e.g. 🔗) + kind badge ("링크") + timestamp ("방금 담음") + full body text (records-archive.dc.html:96-97); implementation renders only icon + kind text + title, no body preview visible.
    - canon: Icon, kind badge, timestamp, and 2-3 lines of body text in triageBody style
    - current: Only icon, kind metadata label, and title (3 lines max)
  - **[minor]** Empty state for 'loading' hidden — When loading, canon design shows implicit wait state; implementation renders GraphLoading via Shell (line 1169) but no Shell title/subtitle provided for load state (compare to other screens where Shell has title).
    - canon: Shell presents consistent titled header during load
    - current: Shell without title during load phase
  - **[minor]** Suggested tags chips appearance — Canon uses dashed border for custom tag input ("+ 직접") (records-archive.dc.html:102); implementation uses solidborder. No mint-colored border distinction for suggested tags.
    - canon: Solid border #46B6FF for AI suggestions, dashed border #5FD4FF for custom entry
    - current: FilterChip components with solid borders, no dashed variant for custom input
  - **[minor]** Queue section labeling — Canon shows "다음 차례" header with small Press Start 2P label (records-archive.dc.html:111); implementation renders 'nextUp' text but uses tlLabel style (cyan/small) instead of the prominent section divider visual.
    - canon: Prominent section label '다음 차례' with TRIAGE/SORT badge above progress bar
    - current: "nextUp" label without badge and without visual hierarchy distinction
  - **[minor]** Empty/pending count not shown in subtitle — Canon has 'TRIAGE' badge and 'TRIAGE' status indicator (records-archive.dc.html:87); implementation uses 'headerPending' copy but no visual badge or mode indicator.
    - canon: Badge showing 'TRIAGE' mode; subtitle '남은 7개만 비우면 끝나요' (X pieces left to tidy)
    - current: Only text '{{count}} unsorted pieces are waiting' without TRIAGE badge
  - **[minor]** Archive button text mismatch — Canon shows '보관하기' (Archive/Store away); implementation uses t('inbox.archive') which translates to 'Archive' in en/deepspace.json but exact key mapping unclear.
    - canon: Korean: '보관하기' (archive/store); implies wiki promotion
    - current: Depends on deepspace.json inbox.archive key (not verified in locales dump)

### `/insights` - PARTIAL (effort M, P3)
- impl: `E:\2ndB\src\screens\deepspace\DeepSpaceDesignScreens.tsx:742-764`
- deep-space view: `DeepSpaceInsightsScreen (renders two Card components: weekly comparison + finding card)`
- canon: `E:\2ndB\design\hub.dc.html:147-174`
- legacy only in fallback: True
- recommendation: Replace the compareRow text-only layout with a visual bar chart using React Native <View> elements styled with height percentage calculations. Add explicit section header for '담은 조각 · 주간' above the bars. Populate the finding card with actual insight data (currently hardcoded examples in canon) and add highlight styling for the key topic name using colors.cyan (#46B6FF). Verify colors.mint matches #5FF0C0 in theme/tokens or update the delta text color explicitly. Effort: M (1-2 hours to implement bar chart + data binding + styling).
- gaps:
  - **[major]** Missing visual bar chart for weekly comparison. Canon shows bar chart with heights 46px (last week) and 84px (this week) with gradient fill; implementation shows only text numbers (18 → 31) with chevron separator.
    - canon: Bar chart with explicit heights, gradient (rgba(204,250,255) to #46B6FF), and box-shadow glow
    - current: Two compareCol Views with compareNum Text elements (30px font), no visual bars
  - **[minor]** Missing weekly caption bar label. Canon shows section label '담은 조각 · 주간' (Saved pieces · weekly) above the chart.
    - canon: Section label with 'Press Start 2P' font, 7px, color rgba(95,212,255,.55), margin-bottom 16px
    - current: Uses generic 'insights.weeklyCap' text but no visual separation as section header
  - **[minor]** Missing delta percentage color. Canon uses #5FF0C0 (mint green, TIP/positive color) for delta text; implementation uses colors.mint which may render but lacks canon-level specificity confirmation.
    - canon: #5FF0C0 mint color for '▲ 72% 더 많이 담았어요'
    - current: delta style uses colors.mint (verified as #5FD4FF in theme/tokens, not #5FF0C0)
  - **[major]** Second Card (finding section) is minimal and generic. Canon shows finding card with key insight text about '만드는 일' records; implementation only renders section header + lead text with no actual insight data or badge/highlight.
    - canon: Card with section '이번 주 핵심 발견:' (This week's key finding), lead text with highlight color (#46B6FF) on the topic name, example: '''만드는 일' 관련 기록이 절반을 넘었어요'
    - current: Card with just section title and lead text placeholder, no data-driven finding content
  - **[minor]** Missing SecondbStatusHeader text specificity. Canon hub.dc.html shows insights in context of full screen; deep-space implementation renders SecondbStatusHeader but no visible comparison to ensure mood/text match canon exactly.
    - canon: SecondbStatusHeader with status text aligned to insights context
    - current: SecondbStatusHeader rendered with mood='positive', relies on i18n 'insights.status' and 'insights.tip'

### `/import-hub` - PARTIAL (effort S, P3)
- impl: `src/screens/deepspace/import/ImportHubScreen.tsx`
- canon: `design/import-hub.dc.html`
- legacy only in fallback: True
- recommendation: Add tier-based styling to sourceRow in renderHub. Modify the map function (line 240-256) to conditionally apply backgroundColor and borderColor based on source.tier, using deepSpace palette equivalents of canon tier colors (critical: #FF8A8A tint, sensitive: #FFC478 tint, normal: #46B6FF tint) at 0.04-0.05 opacity for background and 0.22-0.28 for borders.
- gaps:
  - **[major]** Tier-specific row background colors missing — canon shows critical rows #FF8A8A 0.05, sensitive #FFC478 0.05, normal #46B6FF 0.05; implementation uses generic deepSpace.card without tier-specific fill
    - canon: sourceRow backgroundColor varies by tier: rgba(255,138,138,.05) critical, rgba(255,196,120,.05) sensitive, rgba(70,182,255,.05) normal
    - current: sourceRow uses deepSpace.card backgroundColor uniformly across all tiers in renderHub (line 481-484)
  - **[major]** Missing visual tier background differentiation in hub screen sections — canon uses row-level tinting to reinforce sensitivity hierarchy; implementation relies only on status chip badges
    - canon: Each tier section (critical/sensitive/normal) applies background tint to source rows via borderColor and backgroundColor with tier-specific rgba values
    - current: All SOURCES.filter(s => s.tier === tier) rows render with identical card styling regardless of tier membership (renderHub lines 240-256)
  - **[minor]** Tier label colors may not precisely match canon hues in deep-space palette mapping
    - canon: tier_critical #FF8A8A (rgba(255,138,138,.7)), tier_sensitive #FFC478 (rgba(255,196,120,.75)), tier_normal #95D4FF (rgba(95,212,255,.6))
    - current: TIER_COLOR map uses deepSpace.dangerText/deepSpace.warning/deepSpace.accent (line 70-74) — color values depend on token definitions, not verified against canon hex
  - **[minor]** Source row styling misses canon's subtle visual weight — canon shows borderColor varying by tier; implementation uses fixed deepSpace.cardLine
    - canon: sourceRow border-color per tier: rgba(255,138,138,.28) critical, rgba(255,196,120,.26) sensitive, rgba(70,182,255,.22) normal
    - current: sourceRow borderColor fixed to deepSpace.cardLine (line 483) regardless of tier

### `/ops` - PARTIAL (effort M, P3)
- impl: `src/screens/deepspace/DeepSpaceDesignScreens.tsx:2007-2317`
- deep-space view: `DeepSpaceOpsScreen`
- canon: `design/ops-wiki.dc.html`
- legacy only in fallback: True
- recommendation: Restore the canonical section order (Groups → Domains → Recommendations at top), move the Today section below recommendations, restore the Secondb chat bubble header with inline tip, and add record-count metadata chips to each recommendation card to match canvas exactly.
- gaps:
  - **[major]** Missing Secondb chat bubble header with tip — canon shows inline assistance bubble before domain picker; implementation uses generic SecondbStatusHeader
    - canon: Chat bubble with icon + tip text + cyan tail
    - current: SecondbStatusHeader (status bar style)
  - **[major]** Screen structure reordered — canonical design shows recommendation flow (groups → domains → recommendations); implementation front-loads 'today' section (completed routines with checkboxes) before recommendations
    - canon: Hero → Groups/Domains chips → Recommendations
    - current: Header → Today Routines → Reminders CTA → Groups/Domains → Recommendations
  - **[major]** Missing record metadata chips on recommendations — canon shows '📎 기록 4건' (record count) inline with each recommendation; implementation omits this grounding
    - canon: Record count badge + time badge on each rec
    - current: Only recurrence tag + adherence chip at top
  - **[major]** Action buttons restructured — canon shows 'Add to Calendar' primary button inline; implementation shows 'Share' + 'Add Calendar' + 'Save Routine' as separate ghost buttons
    - canon: Primary gradient button, secondary muted button
    - current: smallBtnGhost + smallBtn layout
  - **[major]** Missing bottom CTA button — canon includes full-width '받은 걸음 캘린더로 보내기' button; implementation omits this
    - canon: Full-width gradient button at bottom
    - current: No equivalent button present
  - **[major]** Domain picker behavior — canon shows all domains inline; implementation uses routing (opsRouteForDomain) to push dedicated domain screens
    - canon: Flat picker on /ops, recommendations shown below
    - current: Violet chips that route to /ops/[domain]
  - **[minor]** Added 'Today Routines' section — shows completed routines with checkboxes; not present in canon ops-wiki.dc.html
    - canon: No today section in canon
    - current: Full today section with streak chip + completed routine list
  - **[minor]** Added 'Save Routine' action — creates persistent routine from recommendation; canon only shows calendar hand-off
    - canon: Only calendar integration shown
    - current: saveRoutine() + createRoutineFromRecommendation() added
  - **[minor]** Added adherence grounding chip — shows compliance stats after recommendations; not in canon
    - canon: No adherence chip
    - current: adherenceChip displayed when recs loaded

### `/wiki` - PARTIAL (effort M, P3)
- impl: `src/app/wiki.tsx (legacy path) → src/screens/deepspace/DeepSpaceDesignScreens.tsx (line 2319 DeepSpaceWikiScreen)`
- deep-space view: `DeepSpaceWikiScreen renders a Shell with SecondbStatusHeader, stat boxes, tag filters, and pages list - layout structure matches canon but some visual styling details need refinement for exact fidelity`
- canon: `design/ops-wiki.dc.html (also ops-wiki-trinity.dc.html frame 2)`
- legacy only in fallback: True
- recommendation: Adjust wikiPageOpen border to rgba(70,182,255,.3) and create a distinct wikiPageRowCompact style for non-expanded rows with border rgba(70,182,255,.18) and background rgba(70,182,255,.04) to match canon's visual hierarchy. Verify FilterChip active visual state and ensure LIVING BRAIN eyebrow integrates into the stat row layout if the design requires it as a structural element (currently it may be rendered via SecondbStatusHeader text alone).
- gaps:
  - **[minor]** soulLine opacity mismatch in backlink badge: code uses rgba(167,139,250,0.50) but canon specifies rgba(167,139,250,.3) per design/ops-wiki.dc.html line 96
    - canon: rgba(167,139,250,.3)
    - current: soulLine: rgba(167,139,250,0.50) in src/theme/tokens.ts line 20
  - **[major]** First page opened card: Canon (ops-wiki.dc.html line 93) shows padding:14px 15px with light border rgba(70,182,255,.3), but wikiPageOpen uses standardized card styling with border rgba(70,182,255,.22) - visual density and border strength differs from canon
    - canon: padding:14px 15px; border:1px solid rgba(70,182,255,.3)
    - current: wikiPageOpen style: borderColor:colors.border (rgba(70,182,255,.22)); padding:spacing.md (14px)
  - **[major]** Collapsed page rows: Canon shows reduced visual prominence (line 98-99, padding:12px 15px, border rgba(70,182,255,.18), background rgba(70,182,255,.04)), but implementation uses same border/bg as expanded card - visual hierarchy breaks
    - canon: border:1px solid rgba(70,182,255,.18); background:rgba(70,182,255,.04); padding:12px 15px
    - current: wikiPageRow uses standard border/cardBg styling (rgba(70,182,255,.22) border, .06 background)
  - **[minor]** Living-brain stat boxes missing visual distinction per canon: Canon shows two same-style boxes (lines 81-82) with page count in white and link count in cyan; implementation renders both identically without the cyan highlight on second number being structural
    - canon: Second stat box number color: #46B6FF (cyan); first: #CCFAFF (white)
    - current: wikiStatNumCyan is applied conditionally, should be verified it's applied to the links (edgeCount) box
  - **[minor]** Missing search/filter state responsiveness: Canon design shows tag filters ('전체', '디자인', '자기이해', 'AI') but implementation doesn't show active filter visual state beyond activeTag logic; no evidence of visual highlight/badge for selected chip
    - canon: Active chip '전체' shows background:rgba(70,182,255,.16), inactive chips background:transparent
    - current: FilterChip component line 943-962 shows active && fchipActive styling but no visual comparison available
  - **[minor]** LIVING BRAIN label placement: Canon shows 'LIVING BRAIN' as right-aligned eyebrow in pixel font at top of stat row (ops-wiki.dc.html line 78), but implementation may not render this label - SecondbStatusHeader is separate from stats
    - canon: LIVING BRAIN eyebrow positioned right-aligned above stats, pixel font (Press Start 2P), size 7px
    - current: Implementation shows title in Shell header, not integrated into stat row - label structure differs

### `/ttfv` - FAITHFUL (effort S, -)
- impl: `E:\2ndB/src/screens/deepspace/onboarding/TTFVScreen.tsx`
- deep-space view: `TTFVScreen component renders two states (propose/ratify) with 北極星 Soul Core (violet) + 北斗七星 Big Dipper (7 cyan stars), animated constellation with progressive disclosure of evidence card post-ratify.`
- canon: `design/screen-design.dc.html (system design system reference only; no explicit /ttfv frame in canon, implementation IS the spec)`
- legacy only in fallback: True
- recommendation: Ship as-is. Implementation is complete, pixel-faithful to intended design (no legacy design canvas exists for /ttfv; the component IS the canon spec). All deepSpace.* tokens correctly applied, dual-state (propose/ratify) logic implemented, Tier system enforced (Soul Tier 1 dominant violet, lit star Tier 2 bright cyan, 6 receded stars Tier 3 dim). Progressive disclosure of reasoning card post-ratify working. No legacy leakage into deep-space path. Animation on ratify (bloom interpolation 420ms cubic easing) matches "Calmness is the brand" spec.
