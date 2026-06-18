// Token contract tests. These lock the deep-space design tokens so an
// accidental edit (wrong canonical value, dropped key) fails CI.

import { colors, spacing, radius, fontSize } from "../tokens";
import { fontFamilies, fontWeights } from "../typography";

describe("colors", () => {
  const required = [
    "bgDeep", "bgMid", "bgGlow",
    "cyan", "cyanBright", "cyanSoft", "cyanDim",
    "textHi", "textMid", "textLo", "textTitle",
    "soul", "soulDeep", "soulLine", "mint",
    "border", "borderHi", "cardBg",
    "paper", "paper2", "paper3", "mist", "rule", "ruleSoft",
    "ink", "ink2", "ink3",
    "pine", "pineDeep", "pineSoft", "pineTint",
    "leaf", "leafSoft", "sun", "earth", "sky", "skyDeep",
    "sage", "amber", "clay",
  ];

  it("has every required color token", () => {
    for (const key of required) {
      expect(colors).toHaveProperty(key);
    }
  });

  it("locks the brand-critical deep-space values", () => {
    expect(colors.bgDeep).toBe("#070A13");
    expect(colors.bgMid).toBe("#0B2142");
    expect(colors.cyan).toBe("#46B6FF");
    expect(colors.cyanBright).toBe("#5FD4FF");
    expect(colors.cyanSoft).toBe("#9FE4FF");
    expect(colors.textTitle).toBe("#CCFAFF");
    expect(colors.soul).toBe("#C8B6FF");
    expect(colors.mint).toBe("#5FF0C0");
  });

  it("keeps legacy aliases pointed at deep-space values", () => {
    expect(colors.paper).toBe(colors.bgDeep);
    expect(colors.paper2).toBe(colors.bgMid);
    expect(colors.pine).toBe(colors.cyan);
    expect(colors.leaf).toBe(colors.mint);
    expect(colors.ink).toBe(colors.textHi);
  });

  it("uses explicit hex or rgba color strings", () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^(#[0-9A-F]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},(?:0|1|0?\.\d+)\))$/i);
    }
  });
});

describe("spacing", () => {
  it("has the expected scale keys", () => {
    for (const key of ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
      expect(spacing).toHaveProperty(key);
    }
  });

  it("keeps the canonical deep-space spacing values", () => {
    expect(spacing.xs).toBe(6);
    expect(spacing.sm).toBe(10);
    expect(spacing.md).toBe(14);
    expect(spacing.lg).toBe(18);
    expect(spacing.xl).toBe(24);
  });
});

describe("radius", () => {
  it("has the expected keys", () => {
    for (const key of ["sm", "md", "lg", "pill", "phone", "xl", "2xl", "full"]) {
      expect(radius).toHaveProperty(key);
    }
  });

  it("keeps the canonical deep-space radius values", () => {
    expect(radius.sm).toBe(9);
    expect(radius.md).toBe(13);
    expect(radius.lg).toBe(18);
    expect(radius.pill).toBe(999);
    expect(radius.phone).toBe(38);
    expect(radius.full).toBeGreaterThanOrEqual(9999);
  });
});

describe("fontSize", () => {
  it("has the type scale keys", () => {
    for (const key of ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
      expect(fontSize).toHaveProperty(key);
    }
  });
});

describe("typography", () => {
  it("uses the deep-space font stack", () => {
    expect(fontFamilies.serifKo).toContain("Galmuri11");
    expect(fontFamilies.serifEn).toContain("PressStart2P");
    expect(fontFamilies.sans).toContain("Pretendard");
    expect(fontFamilies.pixel).toContain("Galmuri11");
    expect(fontFamilies.pixelKo).toContain("Galmuri11");
    expect(fontFamilies.pixelEn).toContain("PressStart2P");
    expect(fontFamilies.mono).toContain("PressStart2P");
  });

  it("exposes the standard font weights", () => {
    expect(fontWeights.regular).toBe("400");
    expect(fontWeights.semibold).toBe("600");
    expect(fontWeights.bold).toBe("700");
    expect(fontWeights.extrabold).toBe("800");
  });
});
