import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const phone = readFileSync(join(__dirname, "..", "DashboardPhone.tsx"), "utf8");
const assets = readFileSync(join(__dirname, "..", "phone-app-assets.ts"), "utf8");

test("the phone has twelve live app tiles in four columns with user-specific notification count", () => {
  const order = phone.match(/const APP_ORDER: PhoneAppId\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  expect([...order.matchAll(/"([a-z]+)"/g)].map((match) => match[1])).toEqual([
    "notifications", "assistant", "focus", "reminders", "money", "growth",
    "meals", "museum", "community", "relationships", "settings", "more",
  ]);
  expect(phone).toContain('width: "24%"');
  expect(phone).toContain("noticeCenter.notices.filter((item) => noticeCenter.isUnread(item.id)).length");
  expect(phone).toContain('t(`phone.apps.${id}`)');
  expect(phone).toContain('disabled={disabled}');
  expect(phone).toContain("const appTileHeight = Math.max(48, Math.min(67");
  expect(phone).toContain('style={[styles.appTile, { height: appTileHeight }]}');
});

test("artwork is bundled locally while dates, controls, and routes remain interactive", () => {
  for (const [, relativePath] of assets.matchAll(/require\("(\.\.\/\.\.\/\.\.\/assets\/images\/phone-app\/[^\"]+)"\)/g)) {
    expect(existsSync(join(__dirname, "..", relativePath))).toBe(true);
  }
  expect(phone).toContain("source={PHONE_UI_ART.hero}");
  // Simon 2026-10-06 removed the bottom shortcut row; its destinations stay on the app pages.
  expect(phone).not.toContain("PHONE_NAV_ICONS");
  expect(assets).not.toContain("PHONE_NAV_ICONS");
  expect(phone).toContain('date(new Date().toISOString())');
  expect(phone).toContain('onPress={() => showPage(index)}');
  expect(phone).toContain('Math.abs(gesture.dx) > 55');
  expect(phone).toContain('onPress={() => go("/records")}');
  expect(phone).toContain('onPress={() => go("/wiki")}');
  expect(phone).toContain('onPress={() => go("/capture")}');
});

test("avatar palette opens from the third phone page without changing the main app grid", () => {
  expect(assets).toContain('avatarPalette: require("../../../assets/images/phone-app/app_icons/icon_avatar_palette.png")');
  expect(phone).toContain('testID="phone-avatar-palette"');
  expect(phone).toContain('accessibilityLabel={t("phone.apps.avatarPalette")}');
  expect(phone).toContain('numberOfLines={1} style={styles.appLabel}>{t("phone.apps.avatarPaletteShort")}');
  expect(phone).toContain('onPress={() => go("/avatar-palette")}');
  expect(phone).toContain('source={PHONE_APP_ICONS.avatarPalette}');
  expect(phone).toContain('const pageIndex = tab === "dashboard" ? 0 : phoneApp === "more" ? 2 : 1');
});
