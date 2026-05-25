// Token contract tests. These lock the phytoncide design tokens so an
// accidental edit (wrong hex, dropped key) fails CI.

import { colors, spacing, radius, fontSize } from "../tokens";
import { fontFamilies, fontWeights } from "../typography";

describe("colors", () => {
  const required = [
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

  it("locks the brand-critical hex values (phytoncide / Option C)", () => {
    expect(colors.pine).toBe("#2D4A3A");
    expect(colors.paper).toBe("#F2EFE5");
    expect(colors.sky).toBe("#C5D5DC");
    expect(colors.leaf).toBe("#8FAA5E");
    expect(colors.ink).toBe("#2A2418");
  });

  it("every color is a 6-digit hex string", () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("spacing", () => {
  it("has the expected scale keys", () => {
    for (const key of ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
      expect(spacing).toHaveProperty(key);
    }
  });

  it("is a strictly increasing positive scale", () => {
    const values = Object.values(spacing);
    expect(values[0]).toBeGreaterThan(0);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

describe("radius", () => {
  it("has the expected keys", () => {
    for (const key of ["sm", "md", "lg", "xl", "2xl", "full"]) {
      expect(radius).toHaveProperty(key);
    }
  });

  it("full is a pill-scale value", () => {
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
  it("fontFamilies resolves platform-specific values (ios in the test env)", () => {
    expect(fontFamilies.serifKo).toBe("NanumMyeongjo-Regular");
    expect(fontFamilies.serifEn).toBe("SourceSerif4-Regular");
    expect(fontFamilies.sans).toBe("Pretendard");
    expect(fontFamilies.mono).toBe("Menlo");
  });

  it("exposes the standard font weights", () => {
    expect(fontWeights.regular).toBe("400");
    expect(fontWeights.semibold).toBe("600");
    expect(fontWeights.bold).toBe("700");
    expect(fontWeights.extrabold).toBe("800");
  });
});
