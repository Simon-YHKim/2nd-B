import fs from "node:fs";
import path from "node:path";

import { UI_MODE, isDeepSpaceUI, isLegacyUI, isCharacterFallback } from "@/lib/ui-mode";

/**
 * Locks the flag resolution in src/lib/ui-mode.ts. 2026-06-23: the legacy UI
 * track was removed, so UI_MODE is now a deep-space constant and isLegacyUI() is
 * permanently false. The D-23 character render strategy (3d default, explicit
 * fallback opt-out) still reads EXPO_PUBLIC_CHARACTER at module load. Asserting
 * the invariant from both the source and the resolved values keeps this robust
 * across deep-space churn without React Native render mocks.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "../ui-mode.ts"), "utf8");

describe("ui-mode flag resolution discipline", () => {
  test("the legacy track is gone: UI_MODE is the deep-space constant", () => {
    expect(UI_MODE).toBe("deep-space");
    expect(isDeepSpaceUI()).toBe(true);
    expect(isLegacyUI()).toBe(false);
    // The whole-app rollback flag is no longer read from the environment.
    expect(SRC).not.toMatch(/process\.env\.EXPO_PUBLIC_UI/);
    expect(SRC).not.toMatch(/uiRaw/);
  });

  test("character render defaults to 3d; only an explicit fallback opts out", () => {
    expect(SRC).toMatch(/charRaw === "fallback"\s*\?\s*"fallback"\s*:\s*"3d"/);
  });

  test("the character flag is trimmed and lowercased before comparison", () => {
    expect(SRC).toMatch(/EXPO_PUBLIC_CHARACTER\s*\?\?\s*""\)\.trim\(\)\.toLowerCase\(\)/);
  });

  test("the track/character predicates stay exported", () => {
    expect(SRC).toMatch(/export function isDeepSpaceUI\(\)/);
    expect(SRC).toMatch(/export function isLegacyUI\(\)/);
    expect(SRC).toMatch(/export function isCharacterFallback\(\)/);
    expect(typeof isCharacterFallback()).toBe("boolean");
  });
});
