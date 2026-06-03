# GPT Image-Generation Prompt — 2nd-Brain "Tesseract Worldview" asset set

> 사용법: 아래 코드블록 전체를 GPT(이미지 생성)에 붙여넣으세요. **STYLE BIBLE**는 모든 이미지에
> 공통 적용되고, **ASSET LIST**의 항목을 한 장씩 생성하라고 지시합니다. 한 번에 다 못 만들면
> "generate the next asset"로 이어가면 됩니다. 벡터(SVG) 출력이 가능하면 SVG, 아니면 투명 PNG 4x.

```
ROLE
You are a pixel-art asset generator. Produce a single, cohesive icon/sprite set for "2nd-Brain",
a deep-space self-knowledge app whose navigation is a living graph: a person's records become
data, data crystallizes into pattern-cores, and five pattern-cores converge into one "Soul Core"
(the self). Read the STYLE BIBLE, then generate EACH item in the ASSET LIST as its own image.
Apply the STYLE BIBLE to every image. Keep pixel scale, line weight, and construction identical
across the whole set so they read as one family. One subject per image, nothing else in frame.

========================== STYLE BIBLE (applies to every asset) ==========================
LOOK: low-fidelity PIXEL ART, "cosmic night-village" aesthetic. Hard pixel edges, NO
anti-aliasing blur. A tight 1-2 px glowing pixel halo is allowed; no soft bloom.
FORBIDDEN: gradients, glassmorphism, frosted/blur, drop shadows, outlines in black, text/letters,
UI frames, realistic shading. Calm and precise, not busy.
BACKGROUND: fully transparent. Subject centered with even padding. Must read clearly at 20-96 px.

PALETTE — use ONLY these colors:
  space (bg/structure): #070A18  #0D1530  #16213E  #243056      line: #2A345A
  ink:                  #E8ECF8 (moonWhite)   #8D98B8 (mistGray)
  signal accents:       mint #72F2C7 · blue #4CC9F0 · violet #A78BFA (+ deep violet #7C5EE8)
                        · amber #FFD166 · pink #FF9FD6
  NEVER use red #FF7A90 (reserved for system safety, never in art).

SHAPE VOCABULARY:
  "Pattern Tesseract" = a glowing hypercube: a cube-inside-a-cube (4D projection) drawn with thin
   pixel lines and lit vertices, like a crystallized data-core floating in space.
  "Pattern Link" = a neural / electric SIGNAL CONDUIT: a glowing line carrying a small traveling
   pulse, like a synapse firing. Closer = thicker, brighter, more saturated.
  Hierarchy of size/complexity: Soul Core (biggest, richest) > Pattern Core > Pattern Data > Log.

DEPTH CUE: when an element is meant to read as "far / background", make it SMALLER + DESATURATED
+ LOWER OPACITY. Never use blur for depth.

========================== ASSET LIST (generate each as its own image) ==========================

-- TIER 1: SOUL CORE (the self) --
1) soul_core_hero — THE Soul Core. The grandest, most detailed core of the set. Five small
   Pattern Tesseract facets converging inward and fusing into ONE radiant central hypercube.
   Color: violet #A78BFA core with faint mint/amber facet highlights. Reads as "all my patterns
   becoming one self." Box ~320x320.

-- TIER 2: the five PATTERN CORES (identical tesseract construction + scale, only accent differs) --
2) bond_core      — Pattern Tesseract, theme "relationships & love". Warm AMBER #FFD166.
3) wisdom_core    — Pattern Tesseract, theme "learning & knowledge". MINT #72F2C7, clear/sharp.
4) narrative_core — Pattern Tesseract, theme "the record archive". MONOCHROME #E8ECF8/#8D98B8.
5) muse_core      — Pattern Tesseract, theme "taste & inspiration". PINK #FF9FD6, airy/playful.
6) growth_core    — Pattern Tesseract, theme "work & growth". BLUE #4CC9F0, upward/forward.
   (each ~256x256)

-- TIER 3 & 4 --
7) pattern_data_node — a Pattern DATA node: a SMALLER, simpler tesseract cluster (2-3 small linked
   cubes), the mid-unit between a Core and a Log. Neutral mint+amber tint so it can be recolored.
   ~128x128.
8) log_chip — a LOG: the smallest unit, a single raw record. One tiny glowing pixel cube/chip,
   mint #72F2C7 with an amber #FFD166 spark. ~64x64.

-- PATTERN LINK: edge conduits, horizontal connector tiles ~320x64, glowing neural signal w/ pulse --
9)  pattern_link_current — ACTIVE/focused link. VIOLET #7C5EE8, brightest, visible traveling pulse, thickest.
10) pattern_link_near    — near link. MINT #72F2C7, thick + bright, faint current.
11) pattern_link_mid     — mid link. BLUE #4CC9F0, medium thickness, dimmer.
12) pattern_link_far     — far link. DESATURATED slate #243056, thin + low opacity (depth).

-- OVERLAYS --
13) pattern_connection_pulse — mint #72F2C7 + violet #A78BFA concentric ripple/pulse for a
    "new connection discovered" moment. Transparent center.
14) soul_focus_glow — a soft violet #A78BFA focus RING/halo to sit behind the Soul Core. 1-2 px
    pixel ring, no soft bloom.

-- MASCOTS: 5 pixel characters. For EACH: (a) a 128x128 idle pose, (b) a 768x128 six-frame walk
   strip (6 frames of 128x128). Same body proportions + pixel scale for all five. --
15) Archon (Growth, blue #4CC9F0) — a career/growth guide. Surveyor-architect vibe: holds a
    measuring/level tool, looks forward, purposeful, analytical.
16) Relia (Bond, amber #FFD166) — a WARM GUIDE (NOT a counselor/therapist). Gentle, attentive,
    open listening posture, soft amber glow. Steady, reassuring.
17) Lumen (Wisdom, mint #72F2C7) — a sage in the Socrates/Confucius mold. Holds a small lamp or
    scroll, contemplative, calm. Teaches life-applied wisdom.
18) Foreman Momo (Narrative, monochrome #E8ECF8/#8D98B8) — a friendly hard-working crew FOREMAN:
    hard hat + clipboard. Sorts/files records into categories. Simple, cheerful, blue-collar.
19) Iris (Muse, pink #FF9FD6) — a curator + personal-trainer hybrid: energetic, encouraging,
    holds a palette/compass. Promotes healthy life-balance, hobbies, inspiration.

-- MOMO CREW: decorative ambient workers. IDENTICAL design to Foreman Momo (#18) but MONOCHROME
   (#E8ECF8/#8D98B8) and HALF the size. 7 mood variants, same body, only pose/expression change. --
20) momo_crew_working      — busy, hauling/building, focused.
21) momo_crew_achievement  — proud, arms up, small triumph.
22) momo_crew_annoyed      — grumbling, irritated.
23) momo_crew_angry        — full tantrum, steam.
24) momo_crew_idle_playing — goofing off, not working, relaxed.
25) momo_crew_slacking     — lazy / leaning / avoiding work.
26) momo_crew_overworked   — exhausted, dragging, totally overworked.

========================== OUTPUT RULES ==========================
- One image per asset, transparent background, named exactly as the id above.
- Prefer SVG (clean viewBox, transparent). If raster only: transparent PNG at 4x the listed box
  size, nearest-neighbor scaling (no smoothing / no JPEG artifacts).
- Consistency across the set: same pixel grid, same line weight, same tesseract construction, same
  character body proportions. The five Pattern Cores must look like siblings; the crew must look
  like mini Foreman Momos.
- Self-check before finishing each image: only palette colors used? no gradient/glass/blur/shadow?
  transparent bg? readable small? correct accent color for that entity?
```
