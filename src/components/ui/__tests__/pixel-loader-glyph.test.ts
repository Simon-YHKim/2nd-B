import { readFileSync } from "fs";
import { join } from "path";

describe("PixelLoaderGlyph contract", () => {
  const source = readFileSync(join(__dirname, "../PixelLoaderGlyph.tsx"), "utf8");

  test("is a shared three-cell pixel glyph with no system spinner", () => {
    expect(source).not.toContain("ActivityIndicator");
    expect(source).toContain("PIXEL_LOADER_CELLS");
    expect(source).toContain("accessibilityElementsHidden");
    expect(source).toContain("importantForAccessibility");
  });
});
