import { readFileSync } from "fs";
import { join } from "path";

describe("premium feedback state pixel contract", () => {
  const source = readFileSync(join(__dirname, "../feedback.tsx"), "utf8");

  test("uses a pixel loading glyph instead of the system spinner", () => {
    expect(source).not.toContain("ActivityIndicator");
    expect(source).toContain("PixelLoaderGlyph");
    expect(source).toContain("loaderFrame");
  });
});
