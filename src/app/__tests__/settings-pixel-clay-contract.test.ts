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

    expect(routes.filter((route) => route === "/integrations")).toHaveLength(1);

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

  test("keeps legacy typography and spacing isolated from PIXEL-CLAY overrides", () => {
    expect(source).toContain('headline: { ...koType(24, 32, 0, "600")');
    expect(source).toContain('sectionLabel: { ...koType(14, 20, 0.1, "500")');
    expect(source).toContain('divider: { height: 1, backgroundColor: m3.color.outlineVariant');
    expect(source).toContain('row: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3');
    expect(source).toContain('pixelRow: { minHeight: 56');
    expect(source).toContain('pixel ? m3Styles.pixelRow : null');
    expect(source).toContain('isDeepSpaceUI() ? m3Styles.pixelHeadline : null');
    expect(source).toContain('styles.pixelDisclosureHeaderPressed');
    expect(source).toContain('styles.disclosureHeaderPressed');
  });

  test("language and data deletion disclosures use the same raised icon-row pattern as settings links", () => {
    const disclosure = source.slice(source.indexOf("function DisclosureSection("), source.indexOf("export default function Settings()"));
    expect(disclosure).toContain('variant="bevel"');
    expect(disclosure).toContain("<M3IconBadge");
    expect(disclosure).toContain("m3Styles.pixelRow");
    expect(disclosure).toContain("accessibilityState={{ expanded }}");
    expect(disclosure).toContain("styles.pixelDisclosureBody");
    expect(source).toMatch(/<DisclosureSection[\s\S]*?title=\{t\("language.title"\)\}[\s\S]*?icon="article"/);
    expect(source).toMatch(/<DisclosureSection[\s\S]*?title=\{t\("deleteData"\)\}[\s\S]*?icon="trash"/);
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
