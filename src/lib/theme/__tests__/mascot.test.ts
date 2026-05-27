// Guards for the Brain Stack v1.1 mascot palette in src/lib/theme/tokens.ts.
//
// The palette is the visual identity contract — getting any of the 9 colors
// wrong cascades through 22 screens. We enforce:
//   1. Exactly 9 mascots exist (no silent additions).
//   2. Every color is a valid 7-char hex (parsable by React Native).
//   3. The Augment indigo fix (Q1 of the compatibility diagnostic)
//      stays in place — regressing to #7a9bc4 would re-introduce the
//      collision with darkSky.brand/accent.
//   4. No mascot color duplicates another (each character is unique).

import { mascot, type MascotName } from "@/lib/theme/tokens";

describe("mascot palette", () => {
  const expected: readonly MascotName[] = [
    "core",
    "self",
    "field",
    "augment",
    "engram",
    "signal",
    "mirror",
    "trinity",
    "audit",
  ];

  test("has exactly the 9 v1.1 characters", () => {
    expect(Object.keys(mascot).sort()).toEqual([...expected].sort());
  });

  test.each(expected)("color for %s is a 7-char hex", (n) => {
    expect(mascot[n]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test("Augment Brain is indigo #5A6FB4 (compatibility diagnostic Q1)", () => {
    // If this test fails the cool-blue collision with darkSky.brand
    // (#2F97FC) and darkSky.accent (#7FB3F4) returns. Do not revert
    // without re-running the diagnostic.
    expect(mascot.augment).toBe("#5A6FB4");
  });

  test("every mascot color is unique", () => {
    const colors = Object.values(mascot).map((c) => c.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });
});
