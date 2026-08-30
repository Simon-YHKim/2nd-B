import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(__dirname, "../settings.tsx"), "utf8");

describe("PIXEL-CLAY settings screen contract", () => {
  test("uses the shared pixel surface and Galmuri type scale inside the real settings shell", () => {
    expect(source).toContain('import { PixelSurface } from "@/components/pixel/PixelSurface"');
    expect(source).toContain('import { m3TextStyle } from "@/components/m3/typeface"');
    expect(source).toMatch(/<DeepSpaceScreen active="settings" header="none" variant="windowed">/);
    expect(source).toContain('<PixelSurface variant="bevel"');
    expect(source).toContain('...m3TextStyle("headlineSmall")');
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).not.toContain('from "@/components/deep-space/DeepSpaceLinks"');
  });

  test("keeps every production destination while removing duplicate deep-space navigation", () => {
    const routes = [
      ...source.matchAll(/router\.(?:push|replace)\("([^"]+)"\)/g),
    ].map((match) => match[1]);

    expect(new Set(routes)).toEqual(
      new Set([
        "/",
        "/account",
        "/capture",
        "/data",
        "/dev-screens",
        "/import-hub",
        "/integrations",
        "/manual",
        "/museum",
        "/notices",
        "/ops",
        "/permissions",
        "/plans",
        "/privacy",
        "/profile",
        "/reasoning",
        "/records",
        "/sign-in",
        "/subscription",
        "/support",
        "/theme",
      ]),
    );
    expect(source).toContain("isDevSurfaceEnabled() ?");
    expect(source.match(/<M3ToggleRow\b/g)).toHaveLength(2);
  });

  test("keeps the legacy rollback navigation explicitly secondary", () => {
    const legacyBranch = source.slice(
      source.indexOf("legacy retains its original two button clusters"),
      source.indexOf("<DisclosureSection", source.indexOf("legacy retains its original two button clusters")),
    );
    expect(legacyBranch.match(/<Button\b/g)).toHaveLength(8);
    expect(legacyBranch.match(/variant="secondary"/g)).toHaveLength(8);
  });

  test("retains the destructive wizard, confirmation phrase, busy lock, and feedback modals", () => {
    for (const operation of [
      "deleteRecordsByKind",
      "deleteRecordsByTag",
      "deleteAllWikiPages",
      "deleteUningestedSources",
      "deleteAllChatUsage",
      "deleteAllUserData",
    ]) {
      expect(source).toContain(operation);
    }
    expect(source).toContain('const CONFIRM_PHRASE = "DELETE"');
    expect(source).toContain("fullDeleteConfirm !== CONFIRM_PHRASE || busy !== null");
    expect(source).toContain("visible={pendingConfirm !== null}");
    expect(source).toContain("visible={actionError !== null}");
    expect(source).toContain('accessibilityRole="switch"');
  });
});
