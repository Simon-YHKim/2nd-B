import { readFileSync } from "node:fs";
import { join } from "node:path";

const phone = readFileSync(join(__dirname, "..", "DashboardPhone.tsx"), "utf8");
const shell = readFileSync(join(__dirname, "..", "..", "deep-space", "DeepSpaceShell.tsx"), "utf8");

test("home bell opens notifications inside the phone and app list can reopen them", () => {
  expect(shell).toContain('app: "notifications"');
  expect(phone).toContain('app === "notifications" ? "tools" : resume?.tab ?? "dashboard"');
  expect(phone).toContain('setPhoneApp("notifications")');
  expect(phone).toContain('if (phoneApp === "notifications")');
  expect(phone).toContain("if (noticeCenter.isUnread(item.id)) void noticeCenter.markSeen(item.id)");
  expect(phone).toContain('id: "museum", route: "/museum"');
});
