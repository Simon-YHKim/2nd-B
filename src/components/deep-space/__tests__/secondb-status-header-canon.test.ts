import fs from "node:fs";
import path from "node:path";

/**
 * Canon guard for <SecondbStatusHeader />.
 *
 * The per-screen status bar used to have TWO live, visually divergent
 * implementations sharing one export name — components/deep-space/ (deepSpace.*
 * tokens, from design/prototype.dc.html) and components/deepspace/ (legacy-token
 * copy, brighter/dimmer TIP, headroom logic). A one-character import-path typo
 * (deep-space vs deepspace) silently picked the wrong one with no type error.
 *
 * They are now consolidated onto the deep-space canon: the deepspace barrel
 * re-exports it, so there is ONE implementation. This locks that in. fs
 * source-discipline idiom (no RN render mocks), same as the sibling canon tests.
 */
const SRC = path.resolve(__dirname, "../../..");
const canon = fs.readFileSync(path.join(SRC, "components", "deep-space", "SecondbStatusHeader.tsx"), "utf8");
const barrel = fs.readFileSync(path.join(SRC, "components", "deepspace", "index.ts"), "utf8");
const legacyCopyPath = path.join(SRC, "components", "deepspace", "SecondbStatusHeader.tsx");

describe("SecondbStatusHeader canon", () => {
  test("there is a single implementation (the legacy-token copy is gone)", () => {
    expect(fs.existsSync(legacyCopyPath)).toBe(false);
  });

  test("the deepspace barrel re-exports the deep-space canon, not a local copy", () => {
    expect(barrel).toMatch(
      /export \{[^}]*SecondbStatusHeader[^}]*\} from "@\/components\/deep-space\/SecondbStatusHeader"/,
    );
  });

  test("the canon reserves BackArrow headroom on sub-screens", () => {
    // Merged from the former legacy copy so screens mounted outside
    // DeepSpaceScreen keep their floating-back-chip clearance.
    expect(canon).toMatch(/backArrowVisible/);
    expect(canon).toMatch(/rowHeadroom/);
  });

  test("uses deepSpace.* tokens for colours (no hex literals)", () => {
    expect(canon).toMatch(/deepSpace\./);
    expect(canon).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
