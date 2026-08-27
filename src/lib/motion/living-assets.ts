// Subtle ambient motion for graph assets. These numbers are intentionally
// small: the graph already sways as a system, so asset motion should add life
// without making the pixel art feel rubbery.

export type LivingAssetPreset = "soulCore" | "patternCore" | "patternData" | "log" | "patternLink" | "shard" | "crew";

export interface LivingAssetMotionSpec {
  durationMs: number;
  translateY: number;
  scale: number;
  delayMs: number;
}

export const LIVING_ASSET_MOTION: Record<LivingAssetPreset, LivingAssetMotionSpec> = {
  soulCore: {
    durationMs: 3600,
    translateY: -1.2,
    scale: 1.026,
    delayMs: 0,
  },
  patternCore: {
    durationMs: 4200,
    translateY: -1.8,
    scale: 1.018,
    delayMs: 120,
  },
  patternData: {
    durationMs: 3000,
    translateY: -1.1,
    scale: 1.028,
    delayMs: 80,
  },
  log: {
    durationMs: 2400,
    translateY: -0.8,
    scale: 1.035,
    delayMs: 40,
  },
  patternLink: {
    durationMs: 1800,
    translateY: 0,
    scale: 1.012,
    delayMs: 20,
  },
  shard: {
    durationMs: 2800,
    translateY: -1.0,
    scale: 1.026,
    delayMs: 60,
  },
  crew: {
    durationMs: 1900,
    translateY: -0.7,
    scale: 1.02,
    delayMs: 30,
  },
};

export function livingAssetPhase(id: string | number | undefined, preset: LivingAssetPreset): number {
  const raw = `${preset}:${id ?? "asset"}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}
