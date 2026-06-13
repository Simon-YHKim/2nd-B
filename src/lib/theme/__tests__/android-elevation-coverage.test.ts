import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Android elevation coverage", () => {
  it("keeps auth form containers on the shared auth elevation", () => {
    const authScreens = [
      "src/app/(auth)/sign-up.tsx",
      "src/app/(auth)/sign-in.tsx",
      "src/app/(auth)/complete-profile.tsx",
      "src/app/(auth)/reset-password.tsx",
    ];

    for (const file of authScreens) {
      expect(readProjectFile(file)).toContain("androidElevationStyle(androidElevation.authForm)");
    }
  });

  it("keeps the main card/list cluster on the shared card elevation", () => {
    const cardScreens = [
      { file: "src/app/inbox.tsx", minCount: 1 },
      { file: "src/app/data.tsx", minCount: 1 },
      { file: "src/app/research.tsx", minCount: 2 },
      { file: "src/app/theme.tsx", minCount: 1 },
    ];

    for (const { file, minCount } of cardScreens) {
      const count = readProjectFile(file).split("androidElevationStyle(androidElevation.card)").length - 1;
      expect(count).toBeGreaterThanOrEqual(minCount);
    }
  });

  it("keeps secondary card screens on the shared card elevation", () => {
    // Closes the remaining Android-flat gap surfaced after the first rollout:
    // assessment + info screens that had iOS shadow* but no Android elevation.
    const secondaryScreens = [
      "src/app/big-five.tsx",
      "src/app/attachment.tsx",
      "src/app/manual.tsx",
      "src/app/permissions.tsx",
      "src/app/support.tsx",
    ];

    for (const file of secondaryScreens) {
      expect(readProjectFile(file)).toContain("androidElevationStyle(androidElevation.card)");
    }
  });
});
