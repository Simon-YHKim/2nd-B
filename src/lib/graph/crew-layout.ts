// Decorative momo-crew layout. Seeded, deterministic scatter of `count` crew
// within the viewport, biased to the lower / peripheral band so they read as
// ambient Narrative-Core residents without crowding the center hub or the top
// ribbon. Pure → unit-tested; the actual sprite comes from CrewLayer's
// renderCrew slot. No Math.random so positions are stable across renders.

export interface CrewSlot {
  /** Center x in viewport px. */
  x: number;
  /** Center y in viewport px. */
  y: number;
  /** Rendered sprite size in px. */
  size: number;
}

// Integer → [0,1) hash (xorshift-ish). Deterministic, well-spread.
function hash01(k: number): number {
  let h = (k * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function crewLayout(count: number, width: number, height: number): CrewSlot[] {
  const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const slots: CrewSlot[] = [];
  for (let i = 0; i < n; i++) {
    const hx = hash01(i * 2 + 1);
    const hy = hash01(i * 2 + 2);
    const hs = hash01(i * 7 + 3);
    slots.push({
      x: Math.round((0.08 + hx * 0.84) * w), // 8%..92% width
      y: Math.round((0.5 + hy * 0.42) * h), // 50%..92% height (lower band)
      size: 14 + Math.round(hs * 6), // 14..20 px
    });
  }
  return slots;
}
