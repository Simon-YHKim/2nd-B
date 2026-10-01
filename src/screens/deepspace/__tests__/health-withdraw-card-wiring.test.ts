import fs from "node:fs";
import path from "node:path";

// What only a render could show, read from the source instead (render tests are blocked on
// RN 0.85). The flow itself is tested in lib/health/__tests__/withdraw.test.ts.
//
// 1. The privacy screen shows the health card, shares its busy flag (every save there writes
//    the whole prefs object) and takes the saved prefs back into the copy the analytics toggle
//    saves from. Without that, the next analytics tap would write health_import back to true.
// 2. The card withdraws through the flow under an account lease and never saves prefs itself,
//    so it has no way to turn the consent on.
// 3. Every key the card shows exists in all five locales.
// 4. The import consent chip no longer promises "90 days": nothing is deleted on day 90.
const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const SCREENS = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const CARD = "src/screens/deepspace/dds-health-withdraw-card.tsx";
const FLOW = "src/lib/health/withdraw.ts";
const HUB = "src/screens/deepspace/import/ImportHubScreen.tsx";

function privacyScreen(): string {
  const source = read(SCREENS);
  const start = source.indexOf("export function DeepSpacePrivacyDesignScreen(");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\nexport function ", start + 1);
  return source.slice(start, end === -1 ? undefined : end);
}

function lookup(tree: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), tree);
}

describe("health card on the privacy screen", () => {
  test("is rendered once, shares the busy flag and hands the saved prefs back", () => {
    const screen = privacyScreen();
    expect(screen.match(/<HealthWithdrawCard\b/g)).toHaveLength(1);
    expect(screen).toMatch(/busy=\{busy\}/);
    expect(screen).toMatch(/onBusyChange=\{setBusy\}/);
    expect(screen).toMatch(/onPrefsSaved=\{\(ownerId, saved\) => \{\s*if \(prefsUserRef\.current === ownerId\) prefsRef\.current = saved;/);
  });

  test("withdraws under an account lease and never saves prefs on its own", () => {
    const card = read(CARD);
    expect(card).toMatch(/beginAccountSessionLease\(owner\)/);
    expect(card).toMatch(/withdrawHealthImport\(owner, healthWithdrawDeps\(\(\) => lease\.assertCurrent\(\)\)\)/);
    expect(card).toMatch(/lease\.release\(\)/);
    expect(card).not.toMatch(/savePrivacyPrefs/);
    for (const file of [CARD, FLOW]) expect(read(file)).not.toMatch(/health_import:\s*true/);
  });

  test("shows only keys that exist in every locale, and no inline Korean", () => {
    const card = read(CARD);
    expect(card).not.toMatch(/[ㄱ-ㆎ가-힣]/);
    const keys = [...card.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]);
    expect(keys).toEqual(expect.arrayContaining(["privacyHealth.turnOff", "privacyHealth.deleteRest", "import.healthMinorLocked"]));
    for (const locale of LOCALES) {
      const tree = JSON.parse(read(`locales/${locale}/deepspace.json`));
      for (const key of keys) expect([locale, key, typeof lookup(tree, key)]).toEqual([locale, key, "string"]);
    }
  });
});

describe("import consent retention chip", () => {
  test("comes from the locale files and promises no day count", () => {
    const hub = read(HUB);
    expect(hub).toMatch(/<MetaChip label=\{importT\("retention\.chip"\)\} \/>/);
    expect(hub).not.toMatch(/keep90|90일|90 days/);
    for (const locale of LOCALES) {
      const chip = lookup(JSON.parse(read(`locales/${locale}/import.json`)), "retention.chip");
      expect(typeof chip).toBe("string");
      expect(chip).not.toMatch(/\d/);
    }
  });
});
