import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

describe("profile hub chips", () => {
  // Legacy UI track removed 2026-06-23: the dense quick-hub chip grid (HubGlyph +
  // quickChipLabel/quickChipHint, the color-coded quickGrid touch targets) is gone.
  // src/app/profile.tsx is now a deep-space-only screen (deepSpaceMode is always true)
  // that renders progressive-disclosure tabs over DeepSpaceLinks instead of the legacy
  // grid, so the two legacy "quick hub chips" cases (glyph/label/hint hierarchy and
  // stable touch dimensions) have no surviving equivalent and are removed. The surviving
  // progressive-disclosure contract is kept below.

  test("deep-space profile uses progressive disclosure instead of the dense legacy hub", () => {
    const source = readRepoFile("src/app/profile.tsx");

    expect(source).toContain("type DeepSpaceProfileSection");
    expect(source).toContain("const [activeDeepSpaceSection, setActiveDeepSpaceSection]");
    // Legacy/deep-space toggle (`{deepSpaceMode ? null : (` and the legacy quickGrid
    // branch) was dropped when profile went deep-space-only; the disclosure tabs +
    // DeepSpaceLinks below are the active progressive-disclosure surface.
    expect(source).toContain("styles.deepSpaceTabs");
    expect(source).toContain("<DeepSpaceLinks groups={[activeDeepSpaceGroup]} />");
    expect(source).toContain("semantic.deepSpaceAccent");
    expect(source).not.toContain("deepSpaceMode ? <View style={styles.quickGrid}");
  });
});
