import fs from "node:fs";
import path from "node:path";

/**
 * Locks the load-bearing flag resolution in src/lib/ui-mode.ts. Both flags are
 * read once from the environment at module load and drive the whole-app track
 * (deep-space vs legacy) and the D-23 character render strategy, so an accidental
 * edit to a default or to the input normalization is a high-blast-radius
 * regression (e.g. silently flipping the canonical track back to legacy, or
 * letting an untrimmed/cased value miss the legacy/fallback rollback path).
 *
 * Mirrors the source-discipline idiom of deep-space-style.test.ts /
 * deep-space-shell-a11y.test.ts (read the source, assert the invariant) so it
 * needs no React Native render mocks and stays robust across the deep-space churn.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "../ui-mode.ts"), "utf8");

describe("ui-mode flag resolution discipline", () => {
  test("UI track defaults to deep-space; only an explicit legacy opts out", () => {
    expect(SRC).toMatch(/uiRaw === "legacy"\s*\?\s*"legacy"\s*:\s*"deep-space"/);
  });

  test("character render defaults to 3d; only an explicit fallback opts out", () => {
    expect(SRC).toMatch(/charRaw === "fallback"\s*\?\s*"fallback"\s*:\s*"3d"/);
  });

  test("both flags are trimmed and lowercased before comparison", () => {
    expect(SRC).toMatch(/EXPO_PUBLIC_UI\s*\?\?\s*""\)\.trim\(\)\.toLowerCase\(\)/);
    expect(SRC).toMatch(/EXPO_PUBLIC_CHARACTER\s*\?\?\s*""\)\.trim\(\)\.toLowerCase\(\)/);
  });

  test("the track/character predicates stay exported", () => {
    expect(SRC).toMatch(/export function isDeepSpaceUI\(\)/);
    expect(SRC).toMatch(/export function isLegacyUI\(\)/);
    expect(SRC).toMatch(/export function isCharacterFallback\(\)/);
  });
});
