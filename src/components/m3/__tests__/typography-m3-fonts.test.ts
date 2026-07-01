// Guard that the M3 chrome fonts (Roboto family + Roboto Mono) are registered
// under keys that exactly match the m3.font strings, so migrated screens resolve
// them instead of silently falling back to the system font (rev2 P1b).
import { readFileSync } from "node:fs";
import path from "node:path";

import { m3 } from "@/lib/theme/m3";

const ROOT = path.resolve(__dirname, "../../../..");

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

describe("M3 font registration (src/theme/typography.ts)", () => {
  const src = read("src/theme/typography.ts");

  test("fontAssets registers Roboto at three weights + Roboto Mono", () => {
    expect(src).toMatch(/Roboto:\s*require\(/);
    expect(src).toMatch(/RobotoMedium:\s*require\(/);
    expect(src).toMatch(/RobotoBold:\s*require\(/);
    expect(src).toMatch(/RobotoMono:\s*require\(/);
  });

  test("the registered keys match the m3.font chrome / mono strings", () => {
    // If these drift apart, M3 text falls back to the system font at runtime.
    expect(m3.font.chrome).toBe("Roboto");
    expect(m3.font.mono).toBe("RobotoMono");
    expect(src).toContain(`${m3.font.chrome}:`);
    expect(src).toContain(`${m3.font.mono}:`);
  });

  test("fonts come from the @expo-google-fonts packages (bundled, no runtime fetch)", () => {
    expect(src).toContain("@expo-google-fonts/roboto/");
    expect(src).toContain("@expo-google-fonts/roboto-mono/");
  });
});
