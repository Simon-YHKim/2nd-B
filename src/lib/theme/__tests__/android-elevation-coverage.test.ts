import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Android elevation coverage", () => {
  // Legacy UI track removed 2026-06-23: the auth-form and main/secondary card screens
  // that this contract used to pin (sign-in/sign-up/reset-password, inbox, data,
  // research, theme, big-five, manual, permissions, support) were collapsed to thin
  // deep-space wrappers. The deep-space shell renders depth with border + bgMid fill +
  // glow tokens, not the legacy premium androidElevation helper — exactly the migration
  // the original `complete-profile` note in this file anticipated. As a result the
  // `androidElevation.authForm` tier no longer has any active surface, so its case is
  // removed. The contract below stays meaningful by guarding the surfaces that still use
  // the Android elevation helper, so the Android-flat regression it was written to catch
  // can't silently come back on the surviving paths.

  it("keeps the standalone info card on the shared card elevation", () => {
    // attachment.tsx is still a real (non-wrapper) screen that renders a premium
    // android-elevation card; it must keep its Android elevation so the surface is not
    // flat on Android.
    expect(readProjectFile("src/app/attachment.tsx")).toContain(
      "androidElevationStyle(androidElevation.card)",
    );
  });

  it("keeps the shared back-arrow chrome on the shared card elevation", () => {
    // BackArrow is the shared navigation affordance reused across the deep-space and
    // remaining legacy surfaces; its raised states carry the Android elevation.
    const source = readProjectFile("src/components/ui/BackArrow.tsx");
    const count = source.split("androidElevationStyle(androidElevation.card)").length - 1;
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
