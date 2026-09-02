# Soul Core v3 Animation State Machine

Timing assumes 64×64 companion frames and 32×32 crew frames. Implementation is owned by the app workflow; this file is an asset motion contract only.

## Global frame timing

- Idle loop: 900–1400 ms per frame-equivalent hold; tiny antenna/dot blink every 2–4 loops.
- Thinking / curate: 420 ms thought-pixel cadence, 3-dot loop.
- Link / highlight / illuminate: 240–320 ms pulse cadence, sync with Pattern Link overlays.
- Walk / carry: 160 ms alternating step if expanded by implementation; current static frame is the key pose.
- Achievement: 700 ms hold with one pixel sparkle pulse.

## Companions

### Archon — Growth Core

`idle` → `thinking` → `linking` → `measure` → `build` → `highlight` → `idle`

Use `linking` when Pattern Link edges are being created; use `measure` when distance/relatedness is recalculated.

### Relia — Bond Core

`idle` → `listening` → `guide` → `linking` → `carry` → `idle`

Keep motion slow and warm. No clinical or medical iconography.

### Lumen — Wisdom Core

`idle` → `thinking` → `read` → `illuminate` → `highlight` → `idle`

Star/lamp pixels pulse in `illuminate`; never use text labels.

### Foreman Momo — Narrative Core

`idle` → `clipboard` → `walk` → `carry` → `achievement` → `idle`

Crew coordination reads as friendly project management, not labor coercion.

### Iris — Muse Core

`idle` → `curate` → `color_scan` → `train` → `highlight` → `idle`

Use discrete color pixels only; no gradient rainbow bands.

## Momo Crew

`idle_playing` is the default decorative state.

Allowed transient states: `working`, `achievement`, `annoyed`, `angry`, `slacking`, `overworked`. These are affectionate Inside Out-style moods. Do not sequence them as punishment or forced labor.

## Pattern Link overlays

- Near: `pattern_link_near_320.svg`, opacity 0.9+, stroke 6 px.
- Mid: `pattern_link_mid_320.svg`, opacity ~0.72, stroke 4 px.
- Far: `pattern_link_far_320.svg`, opacity ~0.38, stroke 2 px.
- Current: `pattern_link_current_320.svg`, soulViolet with pixelLamp endpoint sparks.
- Pulse: overlay `pattern_connection_pulse.svg` for 480 ms, then fade by opacity only.
