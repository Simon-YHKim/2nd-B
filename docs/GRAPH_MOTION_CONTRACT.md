# Graph Motion Contract

This file locks the P11 graph feel after the 2026-06-13 AG native QA pass. It is intentionally short and test-oriented.

## Motion Rules

- Default graph mode is light/progressive: show the calm tree first, then reveal
  labels, data leaves, and ornate detail only after touch, zoom, or explicit
  opt-in settings.
- Use calm cubic easing for graph entry and drilldown sheets.
- Do not use bounce, elastic, or spring motion for graph transitions.
- Node spawn reveals by tier and should not replay on every return in the same session.
- Ambient drift must be continuous at loop wrap, with no visible snap.
- Drift amplitude stays tiered: Soul Core near-still, Pattern Cores steady, Pattern Data leaves most active.
- Reduced-motion and lite-mode users get a settled graph without ambient drift.
- Backgrounded app state stops running drift loops.
- SVG line animation remains JS-driven unless device profiling proves a different
  renderer is needed. Skia remains deferred and measure-gated.

## Ownership Copy

The graph should emphasize "only what I connected myself":

- sheet counts must count user-owned data pieces, not structural core links
- empty states must say saved/written pieces grow the graph
- do not imply imported, inferred, or template data appears before the user saves it

## Narrative Core Retint

The Records / Narrative Core is the Foreman Momo area. Its identity is monochrome:

- primary accent: `cosmic.moonWhite`
- secondary visual family: `cosmic.mistGray`
- worker: `momo`

Do not retint Narrative Core with Muse pink, Soul violet, or guard rose. Guard rose is reserved for safety and error states.

## QA Matrix

Run the focused graph QA when changing layout, motion, or graph art:

- Records/Narrative Core drilldown.
- 0, 1, 18, and more than 18 data nodes under one core.
- Reduced motion before graph entry.
- Reduced motion toggled while the graph is mounted.
- Rapid taps across Work, Records, and Taste.
- Android hardware back from drilldown.
- 390px mobile width and a tall Android device.

Pass means no card overlap, no clipped two-card drilldown text, no missing primary action, no abrupt snap outside reduced-motion mode, and receded nodes still provide context without competing for attention.
