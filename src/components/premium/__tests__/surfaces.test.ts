import { readFileSync } from "fs";
import { join } from "path";

describe("premium surface pixel contract", () => {
  const source = readFileSync(join(__dirname, "../surfaces.tsx"), "utf8");

  test("uses a pixel button loading glyph instead of the system spinner", () => {
    expect(source).not.toContain("ActivityIndicator");
    expect(source).toContain("BUTTON_LOADING_CELLS");
    expect(source).toContain("btnLoader");
    expect(source).toContain("btnLoaderCellActive");
  });
});
