// Simon 2026-10-12 (Q-261012-59): the settings rows no longer draw a line that
// only repeats their title ("Account" / "Opens account management"). Those
// sentences stay as the row's spoken hint. Source contract: render tests are not
// available here.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const screen = fs.readFileSync(path.join(ROOT, "src/app/settings.tsx"), "utf8");
// 2026-10-13 Q11 removes the redundant records row from settings.
const RESTATING = ["account", "privacy", "theme", "data", "support"] as const;

describe("settings rows: a line that restates the title is spoken, not drawn", () => {
  test("the link row keeps a spoken-only hint apart from the drawn subtitle", () => {
    expect(screen).toContain("hint?: string;");
    expect(screen).toContain("accessibilityHint={hint ?? sub}");
    // Only `sub` reaches the screen.
    expect(screen).toMatch(/\{sub \? <RNText style=\{\[m3Styles\.rowSub,/);
    expect(screen).not.toMatch(/\{hint \? <RNText/);
  });

  test.each(RESTATING)("%s: its opens-this line is a hint", (key) => {
    expect(screen).toContain(`label={t("nav.${key}")} hint={t("nav.${key}Hint")}`);
  });

  test("no row draws a key named ...Hint as its subtitle", () => {
    expect(screen.match(/sub=\{t\("[\w.]*Hint"\)\}/g)).toBeNull();
  });

  test.each(["en", "ko", "es", "pt", "id"])("%s keeps the remaining rows' spoken hints", (lng) => {
    const nav = (JSON.parse(fs.readFileSync(path.join(ROOT, "locales", lng, "settings.json"), "utf8")) as { nav: Record<string, unknown> }).nav;
    for (const key of RESTATING) {
      expect({ key, kind: typeof nav[`${key}Hint`] }).toEqual({ key, kind: "string" });
    }
  });
});
