// Map interview Coverage (probe.ts: 25 cells = 5 periods x 5 layers) to the
// star2 (회상 / narrative) ladder level, so the confidence-based drill-stop rule
// can consume a level for the narrative axis. Mirrors the CONTEXT.md value
// ladder as a data-quality signal: more covered cells => a higher level. Pure,
// lean v1 (no IRT, per D3); L5 is never auto-derived from coverage
// (ratification is the only path to L5, per the propose -> ratify loop).

import type { LadderLevel } from "../persona/brightness";
import { type Coverage, cellsCovered } from "./probe";

export function narrativeStarLevel(coverage: Coverage): LadderLevel {
  const cells = cellsCovered(coverage); // 0..25
  if (cells <= 0) return 1; // L1: nothing gathered yet
  if (cells >= 12) return 4; // L4: broad cross-period / cross-layer coverage
  if (cells >= 5) return 3; // L3: connected across several cells
  return 2; // L2: a few tagged answers
}
