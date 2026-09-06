# v2 Style Audit — Soul Core v3 Baseline

Audited before generation:

- `public/assets/cosmic-pixel-v2/companions/docs/next_image_prompts.md`
- `public/assets/cosmic-pixel-v2/companions/docs/animation_state_machine.md`
- `public/assets/cosmic-pixel-v2/companions/sprites/{archi,gadi,lulu,momo,vela}/*.svg`
- `public/assets/cosmic-pixel-v2/companions/sprite_sheets/*_sprite_sheet.svg`
- `public/assets/cosmic-pixel-v2/secondb/sprites/*.svg`
- `public/assets/cosmic-pixel-v2/mobile-graph/{graph,edges,overlays}/*.svg`
- `public/assets/cosmic-pixel-v2/mobile-graph/manifest.json`

## Extracted style fingerprint

- Palette: 4–6 colors per asset. Base body is deep space ink/navy (`space950`, `space900`, `space800`, `space700`), with one role accent (`pixelLamp`, `signalMint`, `moonWhite`/`mistGray`, `dreamPink`, `signalBlue`, `soulViolet`) plus `moonWhite` eye/highlight pixels. `guardRose` is not used in characters.
- Line / dot treatment: rectangular pixel silhouettes, square linecaps, integer coordinates, no anti-aliased painterly strokes. Eyes are 3×4 moonWhite blocks with 1×1 accent pupils. Glow dots are tiny 2–6 px rects.
- Silhouette ratio: companions use the v2 robot villager block: 64×64 viewBox, 34 px wide body, head/torso stack, 5 px arms, 5 px feet, soft 28×4 shadow. Momo Crew uses the same silhouette at half scale in a 32×32 viewBox.
- Canvas rules: companions 64×64, crew 32×32, Soul Core 128×128, Pattern Core 96×96, Pattern Data 48×48, Log chip 64×40, Pattern Link edges 320×64, focus overlay 220×220, mobile mockup 390×844.
- Transparent background: all production sprites/nodes/edges are transparent; only the parallax mockup uses a `space950` screen backing for composition.
- SVG geometry: `shape-rendering="crispEdges"`; rect-first geometry; limited path use for node tesseracts and graph curves; named token classes make recolor cheap.

Locked baseline: Game Boy inspired 2D pixel art, deep navy body, limited 4–6 color palette, transparent background, crisp pixel edges, SVG-friendly geometry, no text, no speech bubble, NOT childish, NOT farm game, NOT biological cell.
