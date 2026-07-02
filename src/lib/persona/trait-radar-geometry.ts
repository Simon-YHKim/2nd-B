// Pure geometry for the Big Five trait radar (rev2 P3a, 북극성 deck).
// Values are the PersonaCard traits (0-1); the pentagon starts at 12 o'clock
// and goes clockwise in RADAR_TRAIT_KEYS order. Pure + tested — the SVG
// component only renders what this returns.

export const RADAR_TRAIT_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;
export type RadarTraitKey = (typeof RADAR_TRAIT_KEYS)[number];

/** Same wording as the assessment-summary labels (record detail screen). */
export const RADAR_TRAIT_LABEL: Record<"en" | "ko", Record<RadarTraitKey, string>> = {
  ko: { openness: "개방성", conscientiousness: "성실성", extraversion: "외향성", agreeableness: "우호성", neuroticism: "신경성" },
  en: { openness: "Openness", conscientiousness: "Conscientiousness", extraversion: "Extraversion", agreeableness: "Agreeableness", neuroticism: "Neuroticism" },
};

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Point on axis `index` (of `count`) at `value` (0-1) of radius r around (cx, cy). */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const radius = r * clamp01(value);
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/** SVG polygon `points` string for one ring of values (0-1 each). */
export function radarPolygonPoints(values: number[], cx: number, cy: number, r: number): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, values.length, v, cx, cy, r);
      return `${round2(p.x)},${round2(p.y)}`;
    })
    .join(" ");
}

/** Axis endpoints at full radius — grid spokes + label anchors. */
export function radarAxisPoints(count: number, cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => radarPoint(i, count, 1, cx, cy, r));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
