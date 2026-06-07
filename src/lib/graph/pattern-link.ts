// Pattern Link styling (worldview v-final — "Pattern Link / Graph Network").
// Pure proximity → edge-style mapping: edges closer to the camera/focus read
// thicker, brighter, and more saturated; far edges read thin, dim, desaturated.
//
// The textured edge sprite is GPT-owned; src/components/graph/PatternLink.tsx
// renders a base SVG line from this style until the art lands. Keeping the math
// here (pure + tested) lets the parallax component stay a thin skeleton.

export interface PatternLinkStyle {
  /** Stroke width in px. */
  strokeWidth: number;
  /** 0..1 line opacity. */
  opacity: number;
  /** 0..1 saturation multiplier (1 = full color, 0 = grayscale/desaturated). */
  saturation: number;
}

export interface PatternLinkStyleOpts {
  minWidth?: number;
  maxWidth?: number;
  minOpacity?: number;
  maxOpacity?: number;
  minSaturation?: number;
  maxSaturation?: number;
}

/**
 * Map proximity (0 = far, 1 = closest to the camera/focus) to an edge style.
 * Closer ⇒ thicker + brighter + more saturated. Input is clamped to 0..1 and
 * non-finite values fall back to 0 (far). Pure → unit-tested.
 */
export function patternLinkStyle(proximity: number, opts: PatternLinkStyleOpts = {}): PatternLinkStyle {
  const p = Math.max(0, Math.min(1, Number.isFinite(proximity) ? proximity : 0));
  const minW = opts.minWidth ?? 2;
  const maxW = opts.maxWidth ?? 5;
  const minO = opts.minOpacity ?? 0.45;
  const maxO = opts.maxOpacity ?? 1;
  const minS = opts.minSaturation ?? 0.5;
  const maxS = opts.maxSaturation ?? 1;
  const lerp = (a: number, b: number): number => a + (b - a) * p;
  return {
    strokeWidth: lerp(minW, maxW),
    opacity: lerp(minO, maxO),
    saturation: lerp(minS, maxS),
  };
}
