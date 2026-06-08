import { readFileSync } from "fs";
import { join } from "path";

describe("InlineLoader pixel contract", () => {
  const source = readFileSync(join(__dirname, "../InlineLoader.tsx"), "utf8");

  test("uses a native pixel indicator instead of the system spinner", () => {
    expect(source).not.toContain("ActivityIndicator");
    expect(source).toContain("PixelLoaderGlyph");
    expect(source).toContain("pixelFrame");
  });
});
