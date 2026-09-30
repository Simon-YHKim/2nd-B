// Phone glare (눈부심) — the one dazzle when the phone is swiped up into the night sky.
//
// Why it exists (Simon, 2026-09-30): the home is a night sky where you have been
// looking at Polaris. Swiping the pocket phone up means looking at something
// bright with dark-adapted eyes, so for a moment the display is blinding, light
// spreads out around the phone, and then it steps down as the eyes adjust.
//
// ⚠ Where it plays — Simon corrected this twice on the same day:
//   1. Not when the dashboard opens (#1946 did that): "핸드폰을 스와이프로 위로
//      올렸을때는 말하는거야."
//   2. Only the SWIPE that raises the pocket phone. Tap-to-raise, the ArrowUp
//      key and the accessibility expand action raise it without glare, and the
//      bell/dashboard never glares: "눈부심은 핸드폰을 위로 올리는 동작(스와이프)
//      에만 적용해야해. 그리고 스마트폰 주변으로 눈부심이 펴져야해."
//   So the halo spreads around the phone (about one phone-width), and it is drawn
//   over the whole home, not inside the phone's or the sky's clip.
//
// This module is the whole decision, schedule and geometry, kept free of React
// Native so jest can import it (render tests are blocked in this repo). The
// renderer is `src/components/deep-space/PhoneGlare.tsx`.
//
// PIXEL-CLAY rules this follows
// ------------------------------
// * Rule 4 (no alpha): brightness is DITHER DENSITY, never opacity. A level is
//   the number of lit cells in the 4x4 Bayer tile (0..16) that
//   `src/components/pixel/pixel-dither-cells.ts` draws. Bayer levels nest (the
//   cells lit at n are a subset of those lit at n+1), which is why the nested
//   halo rects below can simply be painted on top of each other.
// * Rule 5 (steps only): nothing interpolates. The level changes at fixed
//   boundaries that sit on the 40 ms pixel frame (`PIXEL_STEP_MS`).
// * Rule 1 (integer rects): every layer is an integer rect.
//
// WCAG 2.3.1 (three flashes or below): this is ONE flash. Luminance rises once,
// at the first frame, and never rises again; every later step only lowers it.
// A second glare is also refused while the eyes are still "adjusted to the
// phone" (`PHONE_GLARE_READAPT_MS` after the phone was lowered again), so a
// quick down-and-up cannot make a second flash inside the same second.

/** Cells in the 4x4 Bayer tile. A level of 16 is solid. */
export const PHONE_GLARE_FULL = 16;

/** The dither cell edge in dp. PIXEL-CLAY `--u` (= `m3.spacing.s1`, decision D1). */
export const PHONE_GLARE_CELL_DP = 2;

/**
 * The schedule, as step boundaries. The glare is strongest for the first
 * 120 ms (solid white display), then steps down with holds that lengthen as the
 * eyes adjust: 120 -> 120 -> 160 -> 160 -> 240 ms.
 */
export const PHONE_GLARE_STEPS: readonly { readonly atMs: number; readonly level: number }[] = [
  { atMs: 0, level: 16 },
  { atMs: 120, level: 12 },
  { atMs: 240, level: 8 },
  { atMs: 400, level: 4 },
  { atMs: 560, level: 2 },
];

/** When the last step ends and the glare is gone. */
export const PHONE_GLARE_TOTAL_MS = 800;

/**
 * How long after the phone is lowered again the eyes still count as adjusted to
 * it. Inside this window a swipe-up plays no glare. It must stay above one
 * second so two glares can never land in the same one-second window.
 */
export const PHONE_GLARE_READAPT_MS = 2000;

/**
 * The halo: lit cells per ring at full glare, from the phone frame outward.
 * Strongest at the frame and thinning with distance, so it reads as light
 * spreading from the phone, not as a border. The rings go AROUND the phone
 * (each has a hole where the phone is), so the phone itself stays visible as
 * the light source: a white display in a dark bezel inside its own glow.
 */
export const PHONE_GLARE_HALO_PROFILE: readonly number[] = [6, 5, 4, 3, 2, 1];
/** How far each ring reaches past the one inside it (dp). */
export const PHONE_GLARE_RING_DP = 16;
/** How far the halo reaches past the phone frame: 6 x 16 = 96 dp, about one pocket phone width (104). */
export const PHONE_GLARE_SPREAD = PHONE_GLARE_HALO_PROFILE.length * PHONE_GLARE_RING_DP;

/** The display level at `elapsedMs` after the glare started. 0 = no glare. */
export function phoneGlareLevelAt(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= PHONE_GLARE_TOTAL_MS) return 0;
  let level = 0;
  for (const step of PHONE_GLARE_STEPS) {
    if (elapsedMs >= step.atMs) level = step.level;
  }
  return level;
}

/**
 * Halo levels for a display level, frame ring first. The profile is scaled by
 * the display level, so the halo decays on the display's own steps and never
 * outshines it.
 */
export function phoneGlareHaloLevels(level: number): number[] {
  const lit = clampLevel(level);
  return PHONE_GLARE_HALO_PROFILE.map((peak) => Math.floor((peak * lit) / PHONE_GLARE_FULL));
}

export interface PhoneGlareDecision {
  reducedMotion: boolean;
  nowMs: number;
  /** When the phone was last lowered again, or null if it has not been this session. */
  lastStowedAtMs: number | null;
}

/**
 * Does this swipe-up play the glare? The caller asks only for a swipe that
 * raised a collapsed phone all the way. Reduced motion (OS setting or lite
 * mode) plays nothing at all.
 */
export function shouldPlayPhoneGlare({ reducedMotion, nowMs, lastStowedAtMs }: PhoneGlareDecision): boolean {
  if (reducedMotion) return false;
  if (lastStowedAtMs !== null && nowMs - lastStowedAtMs < PHONE_GLARE_READAPT_MS) return false;
  return true;
}

// The phone is "stowed" whenever the raised pocket phone goes back down: a
// swipe down, the tap that opens the dashboard (it lowers the pocket phone as
// the dashboard opens), or the home losing focus. One JS runtime has one pocket
// phone, so a module value is the right scope; a reload resets it.
let lastStowedAtMs: number | null = null;

export function markPhoneStowed(nowMs: number): void {
  lastStowedAtMs = nowMs;
}

export function phoneLastStowedAt(): number | null {
  return lastStowedAtMs;
}

/** A layout rect in the glare canvas's coordinates. */
export interface GlareScreen {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GlareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlareLayer extends GlareRect {
  /** Lit cells of 16. */
  level: number;
  /** `wash` is the display itself, `halo` the light around the phone. */
  tone: "wash" | "halo";
}

/**
 * The layers to paint for one step, in paint order (outermost halo first,
 * display wash last). Halo rings grow from the phone `frame` and leave the
 * frame itself unpainted (each ring is up to four bands around it); the wash
 * covers the `screen`. Every rect is integer and clipped to `bounds` (the
 * canvas); a layer with no lit cells or no area is dropped. Both rects are
 * rounded OUTWARD so no sliver of unlit screen shows at an edge.
 */
export function phoneGlareLayers(
  { frame, screen }: { frame: GlareScreen; screen: GlareScreen },
  bounds: { width: number; height: number },
  level: number,
): GlareLayer[] {
  const lit = clampLevel(level);
  if (lit === 0) return [];
  const maxW = Math.floor(bounds.width);
  const maxH = Math.floor(bounds.height);
  const clip = (l: number, t: number, r: number, b: number): GlareRect | null => {
    const x = Math.max(0, l);
    const y = Math.max(0, t);
    const w = Math.min(maxW, r) - x;
    const h = Math.min(maxH, b) - y;
    return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
  };
  const outward = (rect: GlareScreen) => ({
    left: Math.floor(rect.left),
    top: Math.floor(rect.top),
    right: Math.ceil(rect.left + rect.width),
    bottom: Math.ceil(rect.top + rect.height),
  });
  const f = outward(frame);
  const s = outward(screen);
  const layers: GlareLayer[] = [];
  const halo = phoneGlareHaloLevels(lit);
  let outerLevel = 0;
  for (let ring = halo.length; ring >= 1; ring -= 1) {
    const ringLevel = halo[ring - 1];
    // A ring as dim as the one around it is already painted by that ring.
    if (ringLevel === 0 || ringLevel === outerLevel) continue;
    outerLevel = ringLevel;
    const reach = PHONE_GLARE_RING_DP * ring;
    const [l, t, r, b] = [f.left - reach, f.top - reach, f.right + reach, f.bottom + reach];
    // Four bands around the phone: above, below, and the two sides between them.
    for (const band of [
      clip(l, t, r, f.top),
      clip(l, f.bottom, r, b),
      clip(l, f.top, f.left, f.bottom),
      clip(f.right, f.top, r, f.bottom),
    ]) {
      if (band) layers.push({ ...band, level: ringLevel, tone: "halo" });
    }
  }
  const wash = clip(s.left, s.top, s.right, s.bottom);
  if (wash) layers.push({ ...wash, level: lit, tone: "wash" });
  return layers;
}

// ── The pocket phone ─────────────────────────────────────────────────────────

/**
 * The night phone artwork as `PocketPhone` draws it.
 *
 * `drawn` is `PocketPhone`'s `styles.artwork` (a test holds the two together).
 * `screen` is the lit display panel measured on the PNG
 * (`assets/images/secondb-cellphone-night.png`, 1083x1452): x 297..751,
 * y 300..1163. The panel has a few pixels of perspective skew (its top edge
 * runs 301..306, its bottom 1153..1163), so the rect is the panel's outer
 * envelope — the wash may touch the bezel by a pixel but never leaves a strip
 * of dark screen.
 */
export const POCKET_PHONE_ART = {
  png: { width: 1083, height: 1452 },
  drawn: { left: -39, top: -25, width: 180, height: 240 },
  screen: { left: 297, top: 300, right: 751, bottom: 1163 },
} as const;

/** The display rect of a pocket phone whose frame (its 104x192 view) sits at `frame`. */
export function pocketPhoneScreen(frame: GlareScreen): GlareScreen {
  const { png, drawn, screen } = POCKET_PHONE_ART;
  const sx = drawn.width / png.width;
  const sy = drawn.height / png.height;
  return {
    left: frame.left + drawn.left + screen.left * sx,
    top: frame.top + drawn.top + screen.top * sy,
    width: (screen.right - screen.left) * sx,
    height: (screen.bottom - screen.top) * sy,
  };
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(PHONE_GLARE_FULL, Math.round(level)));
}
