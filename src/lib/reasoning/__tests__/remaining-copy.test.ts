// Split remaining display (spec 결정 5 + 계약 13): weekly base and monthly
// reward render as SEPARATE lines with separate reset instants.

// The two lines' words moved to the deepspace bundle (QA 261006 tr3); their ko/en
// text and the es/pt/id translations are checked in i18n/__tests__/tr3-locale-copy.
import { monthLabelFor, weeklyBaseRemaining } from "../remaining-copy";

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
