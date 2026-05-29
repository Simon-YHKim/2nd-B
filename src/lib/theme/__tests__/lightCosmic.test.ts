// Locks the cosmic-light palette (queue item G). semanticLight is what
// useThemePalette() returns in light mode; it must keep the exact same
// key shape as the dark `semantic` palette (so screens swap one for the
// other) and carry the mint/violet cosmic identity rather than sky-blue.

import { semantic, semanticLight, lightCosmic } from "../tokens";

describe("cosmic-light palette (semanticLight)", () => {
  test("has the exact same keys as the dark semantic palette", () => {
    expect(Object.keys(semanticLight).sort()).toEqual(Object.keys(semantic).sort());
  });

  test("every value is a non-empty color string", () => {
    for (const v of Object.values(semanticLight)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  test("background is a light, tinted neutral (not pure white, not dark)", () => {
    // Off-white haze with a faint tint — never #FFFFFF, never the dark bg.
    expect(lightCosmic.bg.toUpperCase()).not.toBe("#FFFFFF");
    expect(semanticLight.background).toBe(lightCosmic.bg);
    expect(semanticLight.background).not.toBe(semantic.background);
  });

  test("brand is the cosmic mint family, darkened from the dark-mode mint", () => {
    // Dark mode brand is the bright Electric Mint; light mode must darken it
    // (lower luminance) so it clears AA contrast on the light background.
    expect(semanticLight.brand).toBe(lightCosmic.brand);
    expect(semanticLight.brand).not.toBe(semantic.brand);
  });

  test("does not regress to the legacy sky-blue brand", () => {
    expect(semanticLight.brand).not.toBe("#1E70C8");
    expect(semanticLight.brand).not.toBe("#2F97FC");
  });

  test("success and zoneGreen share the deep-mint brand", () => {
    expect(semanticLight.success).toBe(lightCosmic.brand);
    expect(semanticLight.zoneGreen).toBe(lightCosmic.brand);
  });
});
