# Handoff — Worldview v-final landed (2026-06-02)

Status snapshot so parallel agents (Claude + Codex) and future sessions don't
re-implement work that's already in `main`.

## What is DONE in `main`

| PR | Lands | Notes |
|---|---|---|
| #170 | test-unlock paywall, 첫 조각 card fix, village zoom/crossfade | merged |
| #171 | worldview v-final **logic**: 5-tier model, mascot rename, Analytic/Divergent modes, Pattern Link + crew skeletons | merged |
| #172 (Codex) | **Soul Core v3 asset pack** (`public/assets/cosmic-pixel-v3-soulcore/`) | merged, reconciled to nets-to-assets-only (logic already in #171) |
| #173 | retire 공상-as-place + Vela mascot, catchphrase, Divergent pulse, live Pattern Link edge weight, CONTEXT.md, naming guard | this PR |

The 5-tier model (Soul Core → 5 Pattern Cores → Pattern Data → Log + Pattern
Link), the mascot rename (Lulu→Lumen, Archi→Archon, Gadi→Relia, Momo→Foreman
Momo, Lumi→Iris; SecondB = Soul Core), and 공상 → SecondB Divergent mode are the
canon. Do NOT re-implement these — extend them. Canon lives in `docs/VISION.md`
("세계관 v-final"), tokens/decisions in `DESIGN.md`, vocabulary in `CONTEXT.md`.

## The ONE remaining step: wire the v3 art into rendering

`public/assets/cosmic-pixel-v3-soulcore/` (63 SVGs + 2 manifests + 4 docs) is in
the repo but **not yet referenced by any `src/` code** — the app still renders
the older `2ndb-production-premium-v1` PNG art. Wiring it needs, and should NOT
be done blind:

1. **SVG transformer / build setup** — the art is SVG; current art components
   (`IslandArt`, `WorkerSprite`, `ShardArt`, `TierIcon`) use `require('*.png')` +
   `<Image>`. Consuming SVG as components needs `react-native-svg-transformer`
   (+ metro config) or an SVG→PNG sprite-sheet step. Confirm the $0/free-tier +
   web/native parity before adding a dep.
2. **Render slots already exist** for the new systems: `PatternLink` has a
   `renderEdge` slot (v3 `mobile-graph/edges/pattern_link_{far,mid,current,near}_320.svg`);
   `CrewLayer` has a `renderCrew` slot (v3 `momo-crew/sprites/*`). The mascot +
   core art maps are in `cosmic-pixel-v3-soulcore/docs/asset_mapping.md`.
3. **On-device QA** — sprite frame animation, parallax depth (see
   `docs/parallax_depth_guide.md`: scale + desaturation + opacity, no blur), and
   the graph transitions can't be visually verified in the remote container.

Until then the v3 pack is the design source-of-truth; the wiring is a deliberate
follow-up, not missing work.
