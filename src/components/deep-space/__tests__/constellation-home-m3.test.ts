// P2-cont (B): the constellation home's color source of truth is m3.accent.*.
// Pins (1) the sky constants added to m3Accent carry the shipped deep-space
// values (zero visual delta on migration), and (2) ConstellationHome.tsx no
// longer reads the legacy deepSpace token bucket nor raw color literals.

import fs from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";
import { deepSpace, deepSpaceGradients } from "@/lib/theme/tokens";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "..", "ConstellationHome.tsx"),
  "utf8",
);

describe("constellation home m3.accent migration (P2-cont B)", () => {
  test("m3.accent sky constants equal the shipped deep-space values", () => {
    expect(m3.accent.star).toBe(deepSpace.accentBright);
    expect(m3.accent.starCore).toBe(deepSpace.accent);
    expect(m3.accent.starDim).toBe(deepSpace.accentDim);
    expect(m3.accent.skyText).toBe(deepSpace.text);
    expect(m3.accent.skyTextHi).toBe(deepSpace.textHi);
    expect(m3.accent.skySurface).toBe(deepSpace.bgMid);
    expect(m3.accent.polarisLine).toBe(deepSpace.soulLine);
    expect(m3.accent.polaris).toBe(deepSpaceGradients.soulCore[0]);
    expect(m3.accent.polarisEdge).toBe(deepSpaceGradients.soulCore[1]);
  });

  test("ConstellationHome reads colors from m3.accent only", () => {
    expect(SOURCE).not.toMatch(/deepSpace\./);
    expect(SOURCE).not.toMatch(/deepSpaceGradients/);
    expect(SOURCE).toMatch(/m3\.accent\./);
    // No raw color literals in the component (tokens own the values).
    expect(SOURCE).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(SOURCE).not.toMatch(/rgba\(/);
  });
});
