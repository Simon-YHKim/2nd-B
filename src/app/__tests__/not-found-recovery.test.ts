import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "..", "+not-found.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("the real Expo Router not-found fallback", () => {
  test("replaces the invalid history entry with canonical home", () => {
    expect(source).toContain('router.replace("/")');
    expect(source).toContain("onPress={goHome}");
    expect(source).not.toMatch(/router\.(push|back)\(/);
    expect(source).not.toContain("/deepspace-home");
    expect(source).not.toContain("/2nd-B");
  });

  test("Android hardware Back follows the same recovery and cleans up", () => {
    expect(source).toContain('Platform.OS !== "android"');
    expect(source).toMatch(/BackHandler\.addEventListener\("hardwareBackPress", \(\) => \{\s*goHome\(\);\s*return true;/);
    expect(source).toContain("subscription.remove()");
  });

  test("uses the adopted PIXEL-CLAY primitives without reviving the demo screen", () => {
    expect(source).toContain("<PixelSurface");
    expect(source).toContain("<PixelPressable");
    expect(source).toContain("background={m3.color.primary}");
    expect(source).toContain("<PixelGlyph");
    expect(source).toContain("<SbStarfield cosmic />");
    expect(source).not.toMatch(/PremiumAppShell|SceneHero|CORE_VILLAGE_UI/);
    expect(source).not.toMatch(/href="\/(audit|persona|manual|capture)"/);
  });

  test("keeps one translated, accessible 44px recovery action", () => {
    expect(source).toContain('useTranslation("notFound")');
    expect(source).toContain('accessibilityRole="header"');
    expect(source).toContain('accessibilityLabel={t("actions.home")}');
    expect(source).toContain('accessibilityHint={t("actions.homeHint")}');
    expect(source).toContain("minHeight: m3.minTouch");
    expect(source).not.toContain("numberOfLines");
  });

  test("suppresses the global push-style back chip while mounted", () => {
    expect(source).toContain("registerOwnBack()");
    expect(source).toContain("unregisterOwnBack()");
  });
});
