import { readFileSync } from "node:fs";
import path from "node:path";

describe("Core Brain minor gate", () => {
  test("persona build waits for resolved profile and minor status before Gemini egress", () => {
    const root = path.resolve(__dirname, "../../..");
    const screen = readFileSync(path.join(root, "src/app/core-brain.tsx"), "utf8");

    const effectIdx = screen.indexOf("buildPersona() calls Gemini");
    const guardIdx = screen.indexOf(
      "if (loading || !userId || hasProfile !== true || isMinor === null) return;",
      effectIdx,
    );
    const buildIdx = screen.indexOf("await buildPersona(userId, locale, isMinor === true)", effectIdx);

    expect(effectIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(effectIdx);
    expect(buildIdx).toBeGreaterThan(guardIdx);
    expect(screen).toContain("}, [loading, userId, hasProfile, isMinor, locale, fireCompanion, reloadKey]);");
  });
});
