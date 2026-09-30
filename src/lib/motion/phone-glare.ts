// Phone glare (눈부심) — the one dazzle when the phone is raised into the night sky.
//
// Why it exists (Simon, 2026-09-30): the home is a night sky where you have been
// looking at Polaris. Swiping the pocket phone up means looking at something
// bright with dark-adapted eyes, so for a moment the display is blinding, light
// spills over the bezel, and then it steps down as the eyes adjust.
//
// ⚠ Where it plays (Simon's correction, same day): **raising the home pocket
//   phone** (`PocketPhone.tsx`, collapsed -> raised), not opening the dashboard.
//   The first version (#1946) played it when `/dashboard` opened from the home;
//   Simon: "핸드폰을 스와이프로 위로 올렸을때는 말하는거야." The dashboard now
//   plays nothing, so the phone dazzles once per take-out, not twice.
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
 * it. Inside this window raising it plays no glare. It must stay above one
 * second so two glares can never land in the same one-second window.
 */
export const PHONE_GLARE_READAPT_MS = 2000;

/**
 * Halo rings around the display, and how far each one reaches out (dp). Sized
 * for the pocket phone (a 104x192 frame whose side bezel is ~8 dp): the first
 * ring lies on the bezel and the outer two spill onto the sky past both sides
 * of the frame, while the phone's outline stays readable inside its own glow.
 */
export const PHONE_GLARE_HALO_RINGS = 3;
export const PHONE_GLARE_RING_DP = 8;
/** A ring dimmer than this many lit cells is dropped (a lone dot per tile reads as noise, not light). */
export const PHONE_GLARE_HALO_MIN = 2;
/** Room the bloom needs around the display: the outermost ring's reach. */
export const PHONE_GLARE_MARGIN = PHONE_GLARE_HALO_RINGS * PHONE_GLARE_RING_DP;

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
 * Halo levels for a display level, inner ring first: each ring outward has half
 * the light of the one inside it (16 -> 8 / 4 / 2), and rings under
 * `PHONE_GLARE_HALO_MIN` are dropped, so the bloom contracts as it fades and is
 * gone before the display is.
 */
export function phoneGlareHaloLevels(level: number): number[] {
  const out: number[] = [];
  for (let ring = 1; ring <= PHONE_GLARE_HALO_RINGS; ring += 1) {
    const lit = Math.floor(clampLevel(level) / 2 ** ring);
    out.push(lit >= PHONE_GLARE_HALO_MIN ? lit : 0);
  }
  return out;
}

export interface PhoneGlareDecision {
  reducedMotion: boolean;
  nowMs: number;
  /** When the phone was last lowered again, or null if it has not been this session. */
  lastStowedAtMs: number | null;
}

/**
 * Does this raise play the glare? The caller asks only on a collapsed -> raised
 * transition that actually reached the top. Reduced motion (OS setting or lite
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

/** Same shape as a layout rect relative to the glare layer's own origin. */
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
  /** `wash` is the display itself, `halo` the bloom around it. */
  tone: "wash" | "halo";
}

/**
 * The layers to paint for one step, in paint order (outermost halo first,
 * display wash last). Every rect is integer and clipped to `bounds`; a layer
 * with no lit cells or no area is dropped.
 *
 * The display rect is rounded OUTWARD so no sliver of unlit screen shows at
 * its edge.
 */
export function phoneGlareLayers(
  screen: GlareScreen,
  bounds: { width: number; height: number },
  level: number,
): GlareLayer[] {
  const lit = clampLevel(level);
  if (lit === 0) return [];
  const left = Math.floor(screen.left);
  const top = Math.floor(screen.top);
  const right = Math.ceil(screen.left + screen.width);
  const bottom = Math.ceil(screen.top + screen.height);
  const maxW = Math.floor(bounds.width);
  const maxH = Math.floor(bounds.height);
  const clip = (l: number, t: number, r: number, b: number): GlareRect | null => {
    const x = Math.max(0, l);
    const y = Math.max(0, t);
    const w = Math.min(maxW, r) - x;
    const h = Math.min(maxH, b) - y;
    return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
  };
  const layers: GlareLayer[] = [];
  const halo = phoneGlareHaloLevels(lit);
  for (let ring = halo.length; ring >= 1; ring -= 1) {
    const ringLevel = halo[ring - 1];
    if (ringLevel === 0) continue;
    const reach = PHONE_GLARE_RING_DP * ring;
    const rect = clip(left - reach, top - reach, right + reach, bottom + reach);
    if (rect) layers.push({ ...rect, level: ringLevel, tone: "halo" });
  }
  const wash = clip(left, top, right, bottom);
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

/**
 * Where the pocket phone's glare layer sits and where the display is inside
 * it. The layer extends `PHONE_GLARE_MARGIN` past the phone frame on every side
 * so the bloom is not cut by the phone's own clip; `box` is relative to the
 * phone frame, `screen` relative to `box`.
 */
export function pocketPhoneGlareGeometry(frame: { width: number; height: number }) {
  const { png, drawn, screen } = POCKET_PHONE_ART;
  const sx = drawn.width / png.width;
  const sy = drawn.height / png.height;
  const m = PHONE_GLARE_MARGIN;
  return {
    box: { left: -m, top: -m, width: frame.width + 2 * m, height: frame.height + 2 * m },
    screen: {
      left: m + drawn.left + screen.left * sx,
      top: m + drawn.top + screen.top * sy,
      width: (screen.right - screen.left) * sx,
      height: (screen.bottom - screen.top) * sy,
    },
  };
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(PHONE_GLARE_FULL, Math.round(level)));
}
