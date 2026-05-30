// Deterministic star field for the cosmic background (premium pass). Pure +
// tested so the "subtle star grain" is stable across renders (no twinkle
// reflow) and reduced-motion safe. Returns a fixed set of stars sized to a
// viewport box; positions/size/opacity are seeded so a given box always
// produces the same field.

export interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

function seeded(i: number, salt: number): number {
  let h = (i + 1) * 374761393 + salt * 668265263;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h % 100000) / 100000;
}

/**
 * Generate `count` stars within a width×height box. Sizes skew small (more
 * grain than feature stars); a few brighter ones add depth.
 */
export function starField(width: number, height: number, count = 60): Star[] {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const big = seeded(i, 7) > 0.86; // ~14% brighter, larger stars
    stars.push({
      x: Math.round(seeded(i, 1) * w),
      y: Math.round(seeded(i, 2) * h),
      r: big ? 1.2 + seeded(i, 3) * 0.8 : 0.5 + seeded(i, 4) * 0.6,
      opacity: big ? 0.5 + seeded(i, 5) * 0.35 : 0.12 + seeded(i, 6) * 0.28,
    });
  }
  return stars;
}
