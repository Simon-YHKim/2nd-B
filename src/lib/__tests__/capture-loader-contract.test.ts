import { readFileSync } from "fs";
import { join } from "path";

describe("capture loading glyph contract", () => {
  const source = readFileSync(join(__dirname, "../../app/capture.tsx"), "utf8");

  test("uses the shared pixel glyph for journal progression loading", () => {
    expect(source).not.toContain("ActivityIndicator");
    expect(source).toContain("PixelLoaderGlyph");
    expect(source).toContain("progression.loading");
  });
});
