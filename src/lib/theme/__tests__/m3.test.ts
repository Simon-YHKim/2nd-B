// Fidelity guard for the M3 token foundation (P1). Pins the key values
// transcribed from the rev2 prototype `m3-theme.css` (cyan dark palette) so a
// future edit can't silently drift the migration target.

import { m3, m3ColorDark, m3Type, m3Shape, m3Elevation, m3State, m3Persona } from "../m3";

describe("m3 token foundation (cyan dark, rev2 PRD v2.0)", () => {
  test("core color roles match the prototype cyan-dark palette", () => {
    expect(m3ColorDark.primary).toBe("#86CFFF"); // azure
    expect(m3ColorDark.tertiary).toBe("#D4BBFF"); // 세컨비 head violet
    expect(m3ColorDark.background).toBe("#0B0F14"); // deep-space dark
    expect(m3ColorDark.surface).toBe("#0B0F14");
    expect(m3ColorDark.surfaceContainer).toBe("#171D25");
    expect(m3ColorDark.outline).toBe("#8B9298");
  });

  test("deep-space accents are the palette-independent constellation colors", () => {
    expect(m3.accent.starCore).toBe("#46B6FF");
    expect(m3.accent.polaris).toBe("#C8B6FF");
    expect(m3.accent.spaceBody).toBe("#05070B");
    // moods drive the head expression mouth/orb
    expect(m3.accent.moodPositive).toBe("#5FF0C0");
    expect(m3.accent.moodNeutral).toBe("#A78BFA");
    expect(m3.accent.moodNegative).toBe("#FF7A90");
  });

  test("세컨비 has exactly three personas with distinct accents", () => {
    expect(Object.keys(m3Persona).sort()).toEqual(["meta", "secondb", "twi"]);
    expect(m3Persona.secondb.accent).toBe("#A78BFA"); // 2nd-B violet
    expect(m3Persona.meta.accent).toBe("#46B6FF"); // Meta-B cyan
    expect(m3Persona.twi.accent).toBe("#CFC4E8"); // Twi-B lavender
    const accents = new Set(Object.values(m3Persona).map((p) => p.accent));
    expect(accents.size).toBe(3); // no two personas share an accent
  });

  test("M3 type scale is complete (15 roles) with faithful metrics", () => {
    expect(Object.keys(m3Type)).toHaveLength(15);
    expect(m3Type.displayLarge).toEqual({ size: 57, line: 64, tracking: -0.25, weight: "400" });
    expect(m3Type.bodyLarge).toEqual({ size: 16, line: 24, tracking: 0.5, weight: "400" });
    expect(m3Type.labelSmall).toEqual({ size: 11, line: 16, tracking: 0.5, weight: "500" });
  });

  test("shape scale + full pill", () => {
    expect(m3Shape.medium).toBe(12);
    expect(m3Shape.extraLarge).toBe(28);
    expect(m3Shape.full).toBe(9999);
  });

  test("elevation levels 0..5 are RN shadow props with matching Android elevation", () => {
    expect(Object.keys(m3Elevation)).toEqual(["level0", "level1", "level2", "level3", "level4", "level5"]);
    expect(m3Elevation.level0.shadowOpacity).toBe(0);
    expect(m3Elevation.level1.elevation).toBe(1);
    expect(m3Elevation.level5.shadowRadius).toBe(12);
  });

  test("state-layer opacities match M3 spec", () => {
    expect(m3State.hover).toBe(0.08);
    expect(m3State.pressed).toBe(0.1);
  });

  test("fonts: Pretendard body + Roboto/Roboto Mono chrome (no pixel fonts)", () => {
    expect(m3.font.brand).toBe("Pretendard");
    expect(m3.font.mono).toBe("RobotoMono");
    expect(m3.font.chrome).toBe("Roboto");
  });
});
