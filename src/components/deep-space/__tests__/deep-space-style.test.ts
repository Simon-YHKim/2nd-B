import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const COMPONENT_FILES = ["DeepSpaceShell.tsx", "DeepSpaceLinks.tsx"];

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("deep-space component style discipline", () => {
  test("keeps translucent colors in theme tokens", () => {
    for (const file of COMPONENT_FILES) {
      expect(read(file)).not.toMatch(/rgba\(/);
    }
  });

  test("does not use expanded letter spacing in compact labels", () => {
    for (const file of COMPONENT_FILES) {
      expect(read(file)).not.toMatch(/letterSpacing:\s*(?!0\b)[0-9.]+/);
    }
  });
});
