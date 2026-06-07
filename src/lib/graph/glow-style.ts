import { cosmic } from "@/lib/theme/tokens";

export interface GlowStyle {
  color: string;
  radius: number;
  opacity: number;
  haloScale: number;
}

export type GlowTier = 1 | 2 | 3 | 4;

const TIER_1_GLOW: Omit<GlowStyle, "color"> = {
  radius: 28,
  opacity: 0.7,
  haloScale: 1.9,
};

const TIER_4_GLOW: Omit<GlowStyle, "color"> = {
  radius: 9,
  opacity: 0.3,
  haloScale: 1.3,
};

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function glowForTier(tier: GlowTier): GlowStyle {
  const depth = (tier - 1) / 3;
  return {
    color: cosmic.signalBlue,
    radius: lerp(TIER_1_GLOW.radius, TIER_4_GLOW.radius, depth),
    opacity: lerp(TIER_1_GLOW.opacity, TIER_4_GLOW.opacity, depth),
    haloScale: lerp(TIER_1_GLOW.haloScale, TIER_4_GLOW.haloScale, depth),
  };
}
