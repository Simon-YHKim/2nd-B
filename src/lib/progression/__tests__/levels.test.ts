import { levelForXp, levelProgress, LEVEL_THRESHOLDS, MAX_LEVEL } from "../levels";

describe("levelForXp", () => {
  it("starts at level 1 for zero / sub-threshold XP", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it("crosses each threshold exactly", () => {
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(199)).toBe(2);
    expect(levelForXp(200)).toBe(3); // onboarding quest anchor
    expect(levelForXp(349)).toBe(3);
    expect(levelForXp(350)).toBe(4);
    expect(levelForXp(799)).toBe(5);
    expect(levelForXp(800)).toBe(6); // multi-context self anchor
    expect(levelForXp(3000)).toBe(10);
  });

  it("clamps to MAX_LEVEL and to level 1", () => {
    expect(levelForXp(999999)).toBe(MAX_LEVEL);
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  it("20 audit answers (200 XP) reaches exactly Lv3", () => {
    expect(levelForXp(20 * 10)).toBe(3);
  });
});

describe("LEVEL_THRESHOLDS", () => {
  it("has one entry per level plus the index-0 placeholder", () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(MAX_LEVEL + 1);
  });
  it("is strictly increasing from Lv2 up", () => {
    for (let lv = 2; lv <= MAX_LEVEL; lv++) {
      expect(LEVEL_THRESHOLDS[lv]).toBeGreaterThan(LEVEL_THRESHOLDS[lv - 1]);
    }
  });
});

describe("levelProgress", () => {
  it("reports a fresh account at Lv1 with 0 progress", () => {
    const p = levelProgress(0);
    expect(p.level).toBe(1);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.progress).toBe(0);
    expect(p.isMaxLevel).toBe(false);
  });

  it("reports mid-level progress correctly", () => {
    const p = levelProgress(275); // Lv3 (200..350), 75 into a 150 span
    expect(p.level).toBe(3);
    expect(p.xpIntoLevel).toBe(75);
    expect(p.xpForLevelSpan).toBe(150);
    expect(p.xpToNextLevel).toBe(75);
    expect(p.progress).toBeCloseTo(0.5, 5);
  });

  it("saturates at max level", () => {
    const p = levelProgress(5000);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.isMaxLevel).toBe(true);
    expect(p.progress).toBe(1);
    expect(p.xpToNextLevel).toBe(0);
  });
});
