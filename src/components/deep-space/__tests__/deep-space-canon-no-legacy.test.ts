import fs from "node:fs";
import path from "node:path";

/**
 * Canon guard for the deep-space conversion (design/FIX_TASKS.md).
 *
 * The deep-space CANON surfaces — the shell (`src/components/deep-space`) and the
 * reference screens (`src/screens/deepspace`) that every legacy "engine screen"
 * conversion is told to CLONE — must never import the legacy gameboy/village
 * components. As the ~25 legacy screens under `src/app` are converted to canon by
 * multiple agents, this keeps the already-canon foundation from regressing: if the
 * pattern source itself picked up a legacy import, every future conversion would
 * inherit it.
 *
 * Forbidden list mirrors FIX_TASKS.md / DESIGN_AUDIT.md. fs source-discipline
 * idiom (no React Native render mocks), same as the sibling deep-space tests, so
 * it stays robust across the churn.
 */
const SRC = path.resolve(__dirname, "../../..");
const CANON_DIRS = [
  path.join(SRC, "components", "deep-space"),
  path.join(SRC, "screens", "deepspace"),
];
const FORBIDDEN = /\b(gameboy-tokens|IslandArt|NavGraph|SecondBSprite|VillageScene|PremiumAppShell)\b/;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("deep-space canon surfaces stay free of legacy imports", () => {
  const files = CANON_DIRS.flatMap(walk).filter((f) => !/__tests__/.test(f));

  test("the canon dirs contain source files (the guard is actually scanning)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("no canon file imports a gameboy/village legacy component", () => {
    const offenders = files
      .filter((f) => FORBIDDEN.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
