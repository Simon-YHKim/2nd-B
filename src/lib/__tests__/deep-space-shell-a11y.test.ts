import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const readShell = () => fs.readFileSync(path.join(ROOT, "components/deep-space/DeepSpaceScreen.tsx"), "utf8");

describe("deep-space shell accessibility labels", () => {
  test("keeps icon and character accessibility labels locale-aware", () => {
    const shell = readShell();

    expect(shell).toMatch(/const profileLabel = isKo \? /);
    expect(shell).toMatch(/const settingsLabel = isKo \? /);
    expect(shell).toMatch(/const characterLabel = isKo \? /);
    expect(shell).toContain("accessibilityLabel={profileLabel}");
    expect(shell).toContain("accessibilityLabel={settingsLabel}");
    expect(shell).toContain("accessibilityLabel={characterLabel}");
    expect(shell).not.toMatch(/accessibilityLabel="[^"]*[^\x00-\x7F]/);
  });
});
