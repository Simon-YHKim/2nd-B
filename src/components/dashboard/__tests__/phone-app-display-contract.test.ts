import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const phone = readFileSync(join(__dirname, "..", "DashboardPhone.tsx"), "utf8");
const assets = readFileSync(join(__dirname, "..", "phone-app-assets.ts"), "utf8");

test("the phone has eleven live app tiles in three equal columns with user-specific notification count", () => {
  const order = phone.match(/const APP_ORDER: PhoneAppId\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  expect([...order.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1])).toEqual([
    "notifications", "assistant", "focus", "reminders", "money", "growth",
    "meals", "museum", "community", "relationships", "avatarPalette",
  ]);
  // Simon 2026-10-07: 3 x n, one gap everywhere, the grid spans the display width.
  expect(phone).toContain("const APP_COLUMNS = 3;");
  expect(phone).toContain("const APP_GAP = 9;");
  expect(phone).toContain('appRow: { flexDirection: "row", gap: APP_GAP },');
  expect(phone).toContain("appTile: { position: \"relative\", flex: 1, minWidth: 0,");
  expect(phone).toContain("noticeCenter.notices.filter((item) => noticeCenter.isUnread(item.id)).length");
  expect(phone).toContain('t(`phone.apps.${id}`)');
  expect(phone).toContain('disabled={disabled}');
  // Pixel iPhone (Simon 2026-10-07): no banner above the grid; a face is as wide as its column, square when the height allows.
  expect(phone).toContain("const appFaceHeight = Math.max(44, Math.min(appColumnWidth, appFaceFit));");
  expect(phone).toContain("<PhoneAppIcon id={id} size={appFaceHeight} disabled={disabled} />");
});

test("artwork is bundled locally while dates, controls, and routes remain interactive", () => {
  for (const [, relativePath] of assets.matchAll(/require\("(\.\.\/\.\.\/\.\.\/assets\/images\/phone-app\/[^\"]+)"\)/g)) {
    expect(existsSync(join(__dirname, "..", relativePath))).toBe(true);
  }
  // Pixel iPhone: the home screen has no hero banner; the status bar draws signal, time and battery in rects.
  expect(phone).not.toContain("PHONE_UI_ART.hero");
  // Simon 2026-10-06 removed the bottom shortcut row; its destinations stay on the app pages.
  expect(phone).not.toContain("PHONE_NAV_ICONS");
  expect(assets).not.toContain("PHONE_NAV_ICONS");
  expect(phone).toContain("<StatusBar ink={statusInk} time={statusTime} />");
  expect(phone).toContain('onPress={() => showPage(index)}');
  expect(phone).toContain('Math.abs(gesture.dx) > 55');
  // 2026-10-07: the More page and its rows (records, wiki search, capture, reading, side project) are gone;
  // capture stays in the bottom bar outside the phone, reading and side project in the assistant's tools.
  expect(phone).not.toContain('phoneApp === "more"');
  expect(phone).not.toContain('go("/reading")');
  expect(phone).not.toContain('go("/side-project")');
});

test("avatar palette is a tile in the app grid (the More page folded into it)", () => {
  expect(assets).toContain('avatarPalette: require("../../../assets/images/phone-app/app_icons/icon_avatar_palette.png")');
  expect(phone).toContain('{ id: "avatarPalette", route: "/avatar-palette" },');
  expect(phone).toContain('<PhoneAppIcon id={id}');
  // 2026-10-07: the daily board's two pages come first (PS-DASH-001 v2.2), then the apps.
  expect(phone).toContain('const pageIndex = tab === "dashboard" ? boardPage - 1 : APPS_PAGE;');
});
