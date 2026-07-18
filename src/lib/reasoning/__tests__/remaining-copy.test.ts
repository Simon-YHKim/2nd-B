// Split remaining display (spec 결정 5 + 계약 13): weekly base and monthly
// reward render as SEPARATE lines with separate reset instants.

import {
  formatRewardRemaining,
  formatWeeklyRemaining,
  monthLabelFor,
  weeklyBaseRemaining,
} from "../remaining-copy";

describe("weeklyBaseRemaining", () => {
  test("base remainder excludes reward credits and clamps at zero", () => {
    expect(weeklyBaseRemaining("free", 0)).toBe(2);
    expect(weeklyBaseRemaining("free", 1)).toBe(1);
    expect(weeklyBaseRemaining("free", 5)).toBe(0);
    expect(weeklyBaseRemaining("cortex", 3)).toBe(4);
    expect(weeklyBaseRemaining("soma", 7)).toBe(0);
  });

  test("unlimited tier returns null", () => {
    expect(weeklyBaseRemaining("brain", 99)).toBeNull();
  });
});

describe("formatWeeklyRemaining", () => {
  test("spec 결정 5 format: 이번 주 N회 중 M회 남음 · 월요일 초기화", () => {
    expect(formatWeeklyRemaining(true, 2, 1)).toBe("이번 주 2회 중 1회 남음 · 월요일 초기화");
    expect(formatWeeklyRemaining(false, 2, 1)).toBe("1 of 2 runs left this week · resets Monday");
    expect(formatWeeklyRemaining(true, 7, 9)).toBe("이번 주 7회 중 0회 남음 · 월요일 초기화");
  });
});

describe("formatRewardRemaining", () => {
  test("reward line carries the MONTH boundary, never Monday", () => {
    const ko = formatRewardRemaining(true, 4, "2026-07");
    expect(ko).toBe("보상 4회 남음 · 7월 말까지");
    expect(ko).not.toContain("월요일");
    const en = formatRewardRemaining(false, 6, "2026-07");
    expect(en).toBe("6 reward runs left · through the end of July");
  });
});

describe("monthLabelFor", () => {
  test("localizes the month name from a KST bucket", () => {
    expect(monthLabelFor("ko", "2026-07")).toBe("7월");
    expect(monthLabelFor("en", "2026-12")).toBe("December");
  });

  test("falls back safely on a malformed bucket", () => {
    expect(monthLabelFor("en", "garbage")).toBe("garbage");
    expect(monthLabelFor("ko", "2026-99")).toBe("2026-99");
  });
});
