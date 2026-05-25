// Level gates: which level unlocks which feature. Single source of truth for
// "what can I do". The other axis ("how much") lives in entitlements.ts.

import { levelForXp } from "./levels";

export type GatedFeature =
  | "audit" // onboarding quest, Lv1
  | "journal" // Lv3
  | "note" // Lv3
  | "persona" // Lv5
  | "self_context" // Lv6 - "me in other contexts"
  | "rag_export"; // Lv8

export const FEATURE_UNLOCK_LEVEL: Record<GatedFeature, number> = {
  audit: 1,
  journal: 3,
  note: 3,
  persona: 5,
  self_context: 6,
  rag_export: 8,
};

export interface GateResult {
  unlocked: boolean;
  requiredLevel: number;
  currentLevel: number;
}

// Is `feature` unlocked at the level implied by `totalXp`?
export function checkGate(feature: GatedFeature, totalXp: number): GateResult {
  const currentLevel = levelForXp(totalXp);
  const requiredLevel = FEATURE_UNLOCK_LEVEL[feature];
  return { unlocked: currentLevel >= requiredLevel, requiredLevel, currentLevel };
}
