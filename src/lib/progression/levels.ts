// XP -> level curve for the quest system.
// MUST stay in sync with db/migrations/0019_xp_and_levels.sql `level_for_xp()`.
// Anchor: 20 audit answers x 10 XP = 200 XP = exactly Lv3 (onboarding done).

export const MAX_LEVEL = 10;

// Cumulative total_xp required to REACH each level.
// Index = level number; index 0 is an unused placeholder.
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, // [0] unused
  0, // Lv 1
  100, // Lv 2
  200, // Lv 3  <- onboarding quest complete, journal unlocks
  350, // Lv 4
  550, // Lv 5
  800, // Lv 6  <- multi-context self unlocks
  1150, // Lv 7
  1600, // Lv 8
  2200, // Lv 9
  3000, // Lv 10
];

// The level a given total XP corresponds to. Clamps to [1, MAX_LEVEL].
export function levelForXp(totalXp: number): number {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let level = 1;
  for (let lv = 1; lv <= MAX_LEVEL; lv++) {
    if (xp >= LEVEL_THRESHOLDS[lv]) level = lv;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  xpIntoLevel: number; // XP earned past the current level's threshold
  xpForLevelSpan: number; // XP span between current and next level
  xpToNextLevel: number; // XP remaining to reach the next level
  progress: number; // 0..1 within the current level
  isMaxLevel: boolean;
}

// Full progress breakdown for the XP bar UI.
export function levelProgress(totalXp: number): LevelProgress {
  const xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const level = levelForXp(xp);
  const isMaxLevel = level >= MAX_LEVEL;
  const curThreshold = LEVEL_THRESHOLDS[level];
  const nextThreshold = isMaxLevel ? LEVEL_THRESHOLDS[MAX_LEVEL] : LEVEL_THRESHOLDS[level + 1];
  const xpIntoLevel = xp - curThreshold;
  const xpForLevelSpan = isMaxLevel ? 0 : nextThreshold - curThreshold;
  const xpToNextLevel = isMaxLevel ? 0 : Math.max(0, nextThreshold - xp);
  const progress = isMaxLevel || xpForLevelSpan === 0 ? 1 : xpIntoLevel / xpForLevelSpan;
  return { level, totalXp: xp, xpIntoLevel, xpForLevelSpan, xpToNextLevel, progress, isMaxLevel };
}
