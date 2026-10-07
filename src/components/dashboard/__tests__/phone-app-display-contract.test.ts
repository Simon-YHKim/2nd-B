import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const phone = readFileSync(join(__dirname, "..", "DashboardPhone.tsx"), "utf8");
const assets = readFileSync(join(__dirname, "..", "phone-app-assets.ts"), "utf8");

test("the phone has twelve live app tiles in four columns with user-specific notification count", () => {
  const order = phone.match(/const APP_ORDER: PhoneAppId\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  expect([...order.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1])).toEqual([
    "notifications", "assistant", "focus", "reminders", "money", "growth",
    "meals", "museum", "community", "relationships", "settings", "avatarPalette",
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
  // 2026-10-07: the More page and its rows (records, wiki search, capture, reading, side project) are gone;
  // capture stays on the dock, reading and side project in the assistant's tools.
  expect(phone).not.toContain('phoneApp === "more"');
  expect(phone).not.toContain('go("/reading")');
  expect(phone).not.toContain('go("/side-project")');
});

test("avatar palette is a tile in the app grid (the More page folded into it)", () => {
  expect(assets).toContain('avatarPalette: require("../../../assets/images/phone-app/app_icons/icon_avatar_palette.png")');
  expect(phone).toContain('{ id: "avatarPalette", route: "/avatar-palette" },');
  expect(phone).toContain('source={PHONE_APP_ICONS[id]}');
  // 2026-10-07: the daily board's two pages come first (PS-DASH-001 v2.2), then the apps.
  expect(phone).toContain('const pageIndex = tab === "dashboard" ? boardPage - 1 : APPS_PAGE;');
});
