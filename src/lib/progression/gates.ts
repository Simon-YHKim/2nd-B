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

// 2026-06-02 directive: level-based ENTRY restrictions removed. Every feature is
// reachable from the start (Lv1) — monetization gating is by subscription tier +
// free-tier usage limits (entitlements.ts), NOT by progression level. The map +
// checkGate are kept (all Lv1) so re-gating a feature is a one-line change.
export const FEATURE_UNLOCK_LEVEL: Record<GatedFeature, number> = {
  audit: 1,
  journal: 1,
  note: 1,
  persona: 1,
  self_context: 1,
  rag_export: 1,
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
