import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const readShell = () => fs.readFileSync(path.join(ROOT, "components/deep-space/DeepSpaceScreen.tsx"), "utf8");

describe("deep-space shell accessibility labels", () => {
  test("keeps the character accessibility label locale-aware", () => {
    const shell = readShell();

    expect(shell).toMatch(/const characterLabel = isKo \? /);
    expect(shell).toContain("accessibilityLabel={characterLabel}");
    expect(shell).not.toMatch(/accessibilityLabel="[^"]*[^\x00-\x7F]/);
  });
});
