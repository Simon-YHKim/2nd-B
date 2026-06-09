# Final candidate set — app wiring

How this set is consumed by the app. The original delivery nested the runtime
PNGs under `app-ready/<tier>/`; they were **flattened** into this folder so the
tier dirs sit directly here (`tier1_soul_core/`, `tier2_pattern_cores/`,
`tier3_pattern_data/`, `tier4_logs/`, `pattern_links/`). The `qa/` and
`source-selection/` folders from the original delivery were not copied (runtime
PNGs only). See `README.md` for provenance and `integrated_asset_manifest.json`
for the full source manifest.

All of these render **only when `EXPO_PUBLIC_USE_V3_ART=true`** (default off). The
flag-off path is unchanged (legacy premium PNGs / TierIcon metaphor icons). No
existing app asset was deleted; the legacy SVG `V3_*_ART` maps still exist as a
fallback for surfaces not yet migrated.

## Bindings — `src/lib/assets/soulcore-v3.ts`

| Export | Keyed by | File(s) |
|---|---|---|
| `V3_CORE_PNG` | IslandArt id | `tier1_soul_core/soul_core_256.png` (core) · `tier2_pattern_cores/{bond,wisdom,narrative,muse,growth}_core_128.png` |
| `V3_DATA_PNG` | domain (parentId) | `tier3_pattern_data/{bond,wisdom,narrative,muse,growth}_pattern_data_96.png` |
| `V3_DATA_PNG_DEFAULT` | — | `tier3_pattern_data/narrative_pattern_data_96.png` |
| `V3_LOG_PNG` | domain | `tier4_logs/{work,knowledge,relationship,hobby}_log_96x72.png` |
| `V3_LOG_PNG_DEFAULT` | — | `tier4_logs/knowledge_log_96x72.png` |
| `V3_EDGE_PNG` | depth | `pattern_links/pattern_link_{current,near,mid,far}_320x64.png` |

### IslandArt id → core mapping (worldview v-final)

`core → Soul Core` · `relationship → Bond` · `knowledge → Wisdom` ·
`records → Narrative` · `inspiration → Muse` · `work_growth → Growth`.
`imagine` was retired (no v3 core) and falls back to the legacy PNG.

### domain → Pattern Data / Log tint

`relation → bond` · `knowledge → wisdom` · `records → narrative` ·
`taste → muse` · `work → growth`. Log uses the nearest life-category sprite.

## Renderers

- `src/components/art/IslandArt.tsx` — cores. Renders `V3_CORE_PNG[id]` via
  `<Image resizeMode="contain">` + `image-rendering: pixelated`. No blur / opacity
  / filter.
- `src/components/graph/NavGraph.tsx` — Tier-3 Pattern Data nodes render
  `V3_DATA_PNG[parentId] ?? V3_DATA_PNG_DEFAULT`; Tier-4 Log shards render
  `V3_LOG_PNG_DEFAULT`. Same `<Image>` + pixelated treatment.

## Not yet mounted

- **Pattern Link** (`V3_EDGE_PNG`): bound and ready, but the graph still draws
  edges as color-tinted animated lines (`v3EdgeColor`). Rotating a 320x64 tile
  along an animated edge is a separate change; the binding exists so that pass
  can drop in without re-importing.
- Per-category Tier-4 Log art (`V3_LOG_PNG`) is exported but Tier-4 currently
  uses the single default chip; per-shard domain resolution is a later refinement.
