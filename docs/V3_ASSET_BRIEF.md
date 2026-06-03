# v3 (Tesseract Worldview) — Asset Audit + GPT Image-Generation Brief

> Working doc, 2026-06-03. Untracked (not committed). Source of truth for the worldview is
> `docs/VISION.md` (v-final 5-layer model) + `DESIGN.md` (palette / locks). Pixel art is the
> GPT asset workstream's; this brief is the handoff so the regenerated set drops into the
> existing pipeline mechanically.

---

## Part 1 — Why the app still shows the old "island" look

Two independent reasons, both true right now:

1. **The v3 tesseract art is behind a flag that is OFF by default.** `EXPO_PUBLIC_USE_V3_ART`
   defaults to `false` in `src/lib/env.ts`, and it was never QA-approved / flipped on. So the
   live app (and the right side of the compare page) renders the **legacy premium PNG islands**
   (`2ndb-production-premium-v1`), not the v3 tesseracts.
2. **Even with the flag ON, only ~half the worldview is wired.** Only the Pattern Cores, mascot
   idles, and crew read from the v3 pack (`src/lib/assets/soulcore-v3.ts` → `V3_CORE_ART` /
   `V3_WORKER_ART` / `V3_CREW_ART`). **Tier 3 (Pattern Data), Tier 4 (Log), Pattern Link edges,
   and the overlays are NOT wired to anything** — the SVGs ship in the pack but no code imports
   them. Tier 3/4 still render via `TierIcon.tsx` (old paper/book/heart/compass icons); edges
   still render as plain mint `AnimatedLine`s in `NavGraph.tsx`, not the neural Pattern Link art.

So: turning the flag on alone would still not produce the tesseract worldview. New art **and**
wiring work are both required.

---

## Part 2 — Asset Audit (spec ↔ asset ↔ wiring)

Refined worldview (from your spec) vs what exists in `public/assets/cosmic-pixel-v3-soulcore/`:

| Layer / element | v3 asset present | Wired in code | Matches refined spec | Action |
|---|---|---|---|---|
| **Tier 1 — Soul Core** (나의 중심, formed from 5 cores) | `mobile-graph/graph/soul_core_hero.svg` | ✅ `V3_CORE_ART.core` → IslandArt (flag) | ⚠️ reads as a small figure, not "5 tesseracts converging into one core" | **Regenerate** |
| **Tier 2 — Bond Core** (관계와 사랑 / Relia) | `bond_core.svg` | ✅ wired | ✅ tesseract, amber | keep / minor refine |
| **Tier 2 — Wisdom Core** (배움과 지식 / Lumen) | `wisdom_core.svg` | ✅ wired | ✅ tesseract, mint | keep / minor refine |
| **Tier 2 — Narrative Core** (기록 보관소 / Foreman Momo) | `narrative_core.svg` | ✅ wired | ✅ tesseract, monochrome | keep / minor refine |
| **Tier 2 — Muse Core** (취향과 영감 / Iris) | `muse_core.svg` | ✅ wired | ✅ tesseract, pink | regenerate (full set) |
| **Tier 2 — Growth Core** (일과 성장 / Archon) | `growth_core.svg` | ✅ wired | ✅ tesseract, blue | keep / minor refine |
| **Tier 3 — Pattern Data** (카테고리) | `pattern_data_node.svg` | ❌ **NOT wired** (TierIcon = old icons) | ❌ off-concept live | **Wire + regenerate** |
| **Tier 4 — Log** (기록 그 자체) | `log_chip.svg` | ❌ **NOT wired** (old shard icons) | ❌ off-concept live | **Wire + regenerate** |
| **Pattern Link** (신호 통로, 4 depth states) | `mobile-graph/edges/pattern_link_{far,mid,current,near}_320.svg` | ❌ **NOT wired** (plain mint AnimatedLine) | ❌ off-concept live | **Wire + regenerate (neural)** |
| **Overlays** (pulse / focus glow) | `overlays/{pattern_connection_pulse,soul_focus_glow}.svg` | ❌ NOT wired | n/a | optional wire |
| **Mascots ×5** (idle) | `companions/sprites/{archon,relia,lumen,foreman_momo,iris}/...` | ✅ `V3_WORKER_ART` (static idle only) | ⚠️ no walk frames yet | regenerate idle + 6-frame walk strips |
| **Momo Crew** (mono mini-Momos, 7 moods) | `momo-crew/sprites/momo_crew_{working,idle_playing,slacking,achievement,annoyed,overworked,angry}.svg` | ✅ `V3_CREW_ART` + CrewLayer | ⚠️ should be HALF Foreman Momo size + clearly mini-Momo | refine size/likeness |

### Naming — resolved

- **Muse mascot = `Iris`** (decision 2026-06-03: keep canon, no rename). The earlier spec note
  "Lumi → Lumina" is superseded; `Iris` stays across `VISION.md`, `DESIGN.md`,
  `src/lib/characters.ts`, `src/lib/chat/personas.ts`, and the `companions/sprites/iris/` folder.
- **Scope = full set regeneration** (all layers incl. the Tier-2 cores, for total consistency).
- Internal route/DB keys stay (`work / relation / knowledge / records / taste`) — only the art
  changes (regression-safe, per VISION.md).

---

## Part 3 — GPT image-generation brief (copy-paste)

> Image models generate one subject per image and can't perfectly hit exact hex or transparent
> backgrounds. Use the **STYLE PREAMBLE** verbatim in front of **each** per-asset line below, and
> generate assets one at a time for a consistent set. Prefer a tool that can output SVG/vector; if
> raster only, render at 4× with nearest-neighbor (no smoothing) on transparent background.

### STYLE PREAMBLE (prepend to every asset prompt)

```
Pixel art icon, "cosmic night-village" aesthetic for a deep-space self-knowledge app.
Low-fidelity crisp pixel sprite, hard pixel edges, NO anti-aliasing blur, NO gradients,
NO glassmorphism, NO drop shadow. Transparent background. Subject centered with padding,
readable at 20-96 px. A tight 1-2 px glowing pixel halo is allowed; no soft bloom.
Use ONLY this palette:
  deep space:  #070A18 #0D1530 #16213E #243056   line: #2A345A
  ink:         #E8ECF8 (moonWhite)  #8D98B8 (mistGray)
  signals:     mint #72F2C7 · blue #4CC9F0 · violet #A78BFA / #7C5EE8 · amber #FFD166 · pink #FF9FD6
(do NOT use red #FF7A90 — reserved for system safety, never art.)
Depth cue when an element is "far": smaller + DESATURATED + lower opacity. Never blur.
Shape vocabulary:
  "Pattern Tesseract" = a glowing hypercube (nested/overlapping cube projection) built from
  thin pixel lines + lit vertices — a crystallized data-core.
  "Pattern Link" = a neural/electric signal conduit: a glowing line carrying a traveling pulse,
  like a synapse firing. Closer = thicker + brighter + more saturated.
No text, no letters, no UI frame.
```

### Tier 1 — Soul Core  → `mobile-graph/graph/soul_core_hero.svg`
```
Subject: the SOUL CORE — the player's innermost "me" core, formed when 5 Pattern Tesseracts
converge into one greater radiant hypercube. Central, the grandest and most detailed core of
the set, glowing violet #A78BFA with faint mint/amber facet highlights. Five small tesseract
facets visible merging inward into one luminous central tesseract. Reads as assembly /
convergence, a sense of "all my patterns becoming one self." 320x320 box.
```

### Tier 2 — the 5 Pattern Cores (each a distinct Pattern Tesseract)  → `mobile-graph/graph/*.svg`
```
bond_core.svg     — Pattern Tesseract for "relationships & love" (Bond Core). Warm AMBER #FFD166
                    glowing hypercube, gentle.
wisdom_core.svg   — Pattern Tesseract for "learning & knowledge" (Wisdom Core). MINT #72F2C7
                    glowing hypercube, clear/sharp.
narrative_core.svg— Pattern Tesseract for "the record archive" (Narrative Core). MONOCHROME
                    #E8ECF8 / #8D98B8 glowing hypercube, neutral/structured.
muse_core.svg     — Pattern Tesseract for "taste & inspiration" (Muse Core). PINK #FF9FD6
                    glowing hypercube, playful/airy.
growth_core.svg   — Pattern Tesseract for "work & growth" (Growth Core). BLUE #4CC9F0
                    glowing hypercube, upward/forward.
(All five: same tesseract construction + scale, only the accent color differs. ~256x256 box.)
```

### Tier 3 — Pattern Data  → `mobile-graph/graph/pattern_data_node.svg`
```
Subject: a PATTERN DATA node — a category formed from logs. A SMALLER, simpler tesseract
cluster (2-3 small linked cubes) than a Pattern Core. Neutral tint mint+amber so it can be
recolored per domain. The "mid" unit between a Core and a Log. ~128x128 box.
```

### Tier 4 — Log  → `mobile-graph/graph/log_chip.svg`
```
Subject: a LOG chip — the smallest unit, a single raw user record. One tiny glowing pixel
cube / data chip, mint #72F2C7 with an amber #FFD166 spark. Simple, lowest in the hierarchy.
~64x64 box.
```

### Pattern Link — 4 depth states (horizontal connector tiles, 320x64)  → `mobile-graph/edges/pattern_link_{state}_320.svg`
```
pattern_link_current_320.svg — ACTIVE/focused link. VIOLET #7C5EE8, brightest, a visible
                                traveling pulse mid-line. Thickest.
pattern_link_near_320.svg    — near link. MINT #72F2C7, thick + bright, faint current.
pattern_link_mid_320.svg     — mid link. BLUE #4CC9F0, medium thickness, dimmer.
pattern_link_far_320.svg     — far link. DESATURATED slate #243056, thin + low opacity (depth).
(All: a glowing neural/electric signal conduit, horizontal, carrying a synapse-like pulse.)
```

### Overlays  → `mobile-graph/overlays/*.svg`
```
pattern_connection_pulse.svg — a mint #72F2C7 + violet #A78BFA concentric ripple/pulse for the
                                "new connection discovered" moment. Transparent center.
soul_focus_glow.svg          — a soft violet #A78BFA focus ring/halo to sit behind the Soul Core
                                when focused. 1-2 px pixel ring, no soft bloom.
```

### Mascots ×5 — pixel character sprites (idle pose + 6-frame walk strip)
> Per character: a single 128×128 idle SVG, plus a 768×128 6-frame walk strip (6 × 128). Each
> tied to its accent color. Same body proportions / pixel scale across all five.
```
Archon  (Growth,  blue  #4CC9F0) → companions/sprites/archon/archon_idle.svg (+ archon_walk strip)
   A career/growth guide. Surveyor-architect vibe: holds a measuring/level tool, looks forward,
   purposeful. Confident, analytical.
Relia   (Bond,    amber #FFD166) → companions/sprites/relia/relia_idle.svg (+ walk)
   A WARM GUIDE (not a counselor). Gentle, attentive, an open listening posture, soft amber glow.
   Steady and reassuring.
Lumen   (Wisdom,  mint  #72F2C7) → companions/sprites/lumen/lumen_idle.svg (+ walk)
   A sage in the Socrates/Confucius mold. Holds a small lamp or scroll, contemplative, calm.
   Teaches life-applied wisdom, not trivia.
Foreman Momo (Narrative, monochrome #E8ECF8/#8D98B8) → companions/sprites/foreman_momo/foreman_momo_idle.svg (+ walk)
   A friendly hard-working crew FOREMAN: hard hat + clipboard. Sorts/files records into categories.
   Simple, cheerful, blue-collar. Monochrome (this is the "boss" of the crew below).
Iris    (Muse,    pink  #FF9FD6) → companions/sprites/iris/iris_idle.svg (+ walk)
   A curator + personal-trainer hybrid: energetic, encouraging, holds a palette/compass. Promotes
   healthy life-balance, hobbies, and inspiration.
```

### Momo Crew — decorative mini-foremen (7 mood variants)  → `momo-crew/sprites/momo_crew_{mood}.svg`
```
IDENTICAL design to Foreman Momo, but MONOCHROME (#E8ECF8 / #8D98B8) and HALF the size. These are
ambient background workers swarming the Core/Data/Log/Link layers; count scales with node count;
no real function, just life. 7 moods, same body, only pose/expression changes:
  momo_crew_working.svg      — busy, hauling/building, focused.
  momo_crew_achievement.svg  — proud, arms up, a little triumph.
  momo_crew_annoyed.svg      — grumbling, irritated.
  momo_crew_angry.svg        — full tantrum, steam.
  momo_crew_idle_playing.svg — goofing off, not working, relaxed.
  momo_crew_slacking.svg     — lazy / unfaithful, leaning, avoiding work.
  momo_crew_overworked.svg   — exhausted, dragging, "뺑이치는" overworked.
```

### Technical output requirements
- Format: **SVG** preferred (clean `viewBox`, transparent bg, an accessibility `<title>`). If the
  tool is raster-only: transparent PNG, 4× the box size, nearest-neighbor (no smoothing).
- One subject per file. Consistent pixel grid / scale across the whole set.
- File paths exactly as listed (mirror the existing `cosmic-pixel-v3-soulcore/` tree) so wiring is
  mechanical.
- No baked text (the app font NeoDunggeunmo handles labels in code).

### Consistency checklist (verify the returned set)
- [ ] Palette: only the listed hex; no red #FF7A90 in art; no off-palette colors.
- [ ] No gradients / glass / blur / soft bloom / drop shadow.
- [ ] Cores read as tesseracts; Soul Core reads as 5→1 convergence; Data < Core, Log < Data in size/complexity.
- [ ] Pattern Link reads as a glowing neural conduit with a pulse; far state is desaturated + faint (not blurred).
- [ ] Crew are unmistakably mini monochrome Foreman Momos at half size.
- [ ] Each mascot tied to its accent (Iris = Muse); Relia reads as a warm guide (no clinical cues).
- [ ] Transparent backgrounds; crisp pixels at small sizes.

---

## Part 4 — Code wiring needed after the art lands (separate from generation)

So the new art actually shows in the graph:
1. `src/lib/assets/soulcore-v3.ts` — add `V3_DATA_ART` (pattern_data_node), `V3_LOG_ART` (log_chip),
   `V3_EDGE_ART` (4 pattern_link states), `V3_OVERLAY_ART` (pulse, focus glow).
2. `src/components/art/TierIcon.tsx` — when flag ON, render `pattern_data_node` (Tier 3) / `log_chip`
   (Tier 4) instead of the legacy metaphor icons.
3. `src/components/graph/NavGraph.tsx` — when flag ON, render Pattern Link edge art (depth-bucketed
   via `patternLinkStyle` proximity) instead of plain `AnimatedLine`; optionally mount the overlays.
4. Depth handling: apply **scale + desaturation + opacity** (no blur) by tier distance from center.
5. Naming: keep **Iris** (Muse) — no rename needed.
6. After device QA: flip `EXPO_PUBLIC_USE_V3_ART` default to `true` (queue B).
