// Interview drill stop rule (synthesis memo §3d). Replaces probe.ts's soft
// 50-turn cap with a confidence-based stop: keep probing a self-understanding
// axis until it reaches its target ladder level (default L4 교차검증), with a
// hard turn cap only as a safety net so a never-converging axis still ends.
// Pure + deterministic; the lean-confidence v1 (no IRT / CAT, per D3).

import type { LadderLevel } from "../persona/brightness";

export const DEFAULT_DRILL_TARGET: LadderLevel = 4;

export type DrillStopReason = "target_reached" | "hard_cap" | "continue";

export interface DrillStopInput {
  /** Current ladder level of the axis being drilled. */
  currentLevel: LadderLevel;
  /** Target level to reach before stopping (default L4). When peer (별3) is
   *  unavailable a self-only axis can pass a lower target (L3) per D6. */
  targetLevel?: LadderLevel;
  /** Turns spent on this axis so far. */
  turnsSpent?: number;
  /** Safety net: stop regardless once this many turns are spent. */
  hardTurnCap?: number;
}

export function drillStopReason(input: DrillStopInput): DrillStopReason {
  const target = input.targetLevel ?? DEFAULT_DRILL_TARGET;
  if (input.currentLevel >= target) return "target_reached";
  if (input.hardTurnCap != null && (input.turnsSpent ?? 0) >= input.hardTurnCap) return "hard_cap";
  return "continue";
}

export function shouldStopDrilling(input: DrillStopInput): boolean {
  return drillStopReason(input) !== "continue";
}
