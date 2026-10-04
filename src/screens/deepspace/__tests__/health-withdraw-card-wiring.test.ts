import fs from "node:fs";
import path from "node:path";

// What only a render could show, read from the source instead (render tests are blocked on
// RN 0.85). The flow itself is tested in lib/health/__tests__/withdraw.test.ts.
//
// 1. The privacy screen shows the health card, shares its busy flag (every save there writes
//    the whole prefs object) and takes every prefs object the card reads or saves into the
//    copy its other toggles save from. Its own first read, which is fail-soft and may land
//    last, no longer overwrites a newer copy. Without both, an analytics tap could write
//    health_import back to true (and log a separate consent the user never gave).
// 2. The card withdraws through the flow under an account lease, hands the OFF to the screen
//    before it lets the screen's other toggles save again, withdraws the screen's copy when the
//    outcome is not known, does not overwrite a copy a screen save made while it was reading,
//    reloads when the screen comes back into focus, and never saves prefs itself, so it has no
//    way to turn the consent on.
// 3. Every key the card shows exists in all five locales, and each button is named by the text
//    it shows (WCAG 2.5.3).
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
  test("is rendered once, shares the busy flag and takes the card's prefs as the copy to save from", () => {
    const screen = privacyScreen();
    expect(screen.match(/<HealthWithdrawCard\b/g)).toHaveLength(1);
    expect(screen).toMatch(/busy=\{busy\}/);
    expect(screen).toMatch(/onBusyChange=\{setBusy\}/);
    expect(screen).toMatch(/onPrefsKnown=\{\(ownerId, known\) => \{\s*if \(activeUserRef\.current !== ownerId\) return;\s*prefsRef\.current = known;\s*prefsUserRef\.current = ownerId;/);
    expect(screen).toMatch(/onPrefsUnknown=\{\(ownerId\) => \{\s*if \(prefsUserRef\.current === ownerId\) prefsUserRef\.current = null;/);
    // The analytics / ads toggle refuses to save without an owned copy, which is what onPrefsUnknown withdraws.
    expect(screen).toMatch(/prefsUserRef\.current !== userId \|\|\s*!prefsRef\.current \|\|\s*busy\s*\) return;/);
  });

  test("the screen's own first read does not overwrite a newer copy", () => {
    const screen = privacyScreen();
    expect(screen).toMatch(/if \(prefsUserRef\.current !== targetUserId\) \{\s*prefsRef\.current = p;\s*prefsUserRef\.current = targetUserId;\s*\}/);
  });

  test("withdraws under an account lease, hands the OFF on before unlocking, withdraws the copy when unsure", () => {
    const card = read(CARD);
    expect(card).toMatch(/beginAccountSessionLease\(owner\)/);
    expect(card).toMatch(/withdrawHealthImport\(owner, healthWithdrawDeps\(\(\) => lease\.assertCurrent\(\), \(prefs\) => \{\s*if \(!current\(\)\) return;[^}]*knownRef\.current\(owner, prefs\);\s*setConsent\(false\);\s*releaseBusy\(\);/);
    expect(card).not.toMatch(/withTimeout\(\s*withdrawHealthImport/);
    expect(card).toMatch(/if \(!settled && current\(\)\) \{[^}]*unknownRef\.current\(owner\);/);
    expect(card).toMatch(/lease\.release\(\)/);
    expect(card).toMatch(/useFocusRefetch\(\(\) => \{\s*if \(!runningRef\.current && !busyRef\.current\)/);
    expect(card).toMatch(/if \(!startedBusy && !busyRef\.current && busyEpochRef\.current === epoch\) knownRef\.current\(owner, prefs\);/);
    expect(card).not.toMatch(/savePrivacyPrefs/);
    for (const file of [CARD, FLOW]) expect(read(file)).not.toMatch(/health_import:\s*true/);
  });

  test("shows only keys that exist in every locale, no inline Korean, and names each button by its text", () => {
    const card = read(CARD);
    expect(card).not.toMatch(/[ㄱ-ㆎ가-힣]/);
    const keys = [...card.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]);
    expect(keys).toEqual(expect.arrayContaining(["privacyHealth.turnOff", "privacyHealth.deleteRest", "privacyHealth.residueUnknown", "import.healthMinorLocked"]));
    for (const locale of LOCALES) {
      const tree = JSON.parse(read(`locales/${locale}/deepspace.json`));
      for (const key of keys) expect([locale, key, typeof lookup(tree, key)]).toEqual([locale, key, "string"]);
    }
    const buttons = [...card.matchAll(/accessibilityLabel=\{t\("([^"]+)"\)\}>\s*<Text[^>]*>\{t\("([^"]+)"\)\}/g)];
    expect(buttons.length).toBe((card.match(/<Pressable\s/g) ?? []).length);
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const [, label, shown] of buttons) expect(label).toBe(shown);
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

describe("health withdrawal on the import screen (where the consent is given)", () => {
  const IMPORT = "src/screens/deepspace/dds-import-inbox-screens.tsx";

  test("one tap withdraws through the same flow, under a lease, never age-gated", () => {
    const screen = read(IMPORT).replace(/\r\n/g, "\n");
    const start = screen.indexOf("async function handleHealthWithdraw()");
    expect(start).toBeGreaterThan(-1);
    const end = screen.indexOf("\n  }\n", start);
    expect(end).toBeGreaterThan(start);
    const handler = screen.slice(start, end);
    expect(handler).toMatch(/beginAccountSessionLease\(owner\)/);
    expect(handler).toMatch(/withdrawHealthImport\(owner, healthWithdrawDeps\(\(\) => lease\.assertCurrent\(\), \(\) => setHealthPref\(false\)\)\)/);
    expect(handler).toMatch(/lease\.release\(\)/);
    expect(handler).not.toMatch(/isMinor/);
    expect(handler).not.toMatch(/health_import:\s*true/);
  });

  test("the button shows whenever the consent is on and is named by its text", () => {
    const screen = read(IMPORT);
    expect(screen).toMatch(/\{healthPref \? \(\s*<MdButton\s*label=\{t\("privacyHealth\.turnOff"\)\}[\s\S]*?onPress=\{\(\) => void handleHealthWithdraw\(\)\}\s*accessibilityLabel=\{t\("privacyHealth\.turnOff"\)\}/);
  });
});
