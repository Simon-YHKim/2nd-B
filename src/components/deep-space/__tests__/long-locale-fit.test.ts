// R2B-05 (2026-10-05): long-locale text must fit, or wrap, where it is drawn.
//
// 1. The bottom dock's labels must fit their tab.
//
// The dock gives each of its five tabs a fifth of the bar and draws the label
// on one line (MdNavBar numberOfLines={1}), so a long word is cut, not wrapped.
// The 2026-10-05 web measure (pt, 1280 and phone widths) showed
// "Configurações" (13 letters) cut to "Configuraç…" on every screen with the
// dock: the label cell was 69px wide and the word needed 71px (77px bold, as
// the active tab). The longest label that did fit was id "Pengaturan" (10).
// pt now uses "Ajustes", the iOS pt-BR name for Settings.
//
// This is a length budget, not a pixel measure: 10 Latin letters, with a
// Hangul/CJK character counted as two. A new or retranslated dock label over
// the budget has to be shortened (in all five locales' sense, not just one)
// or the dock redesigned; it should not be cut on screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AVAILABLE_UI_LOCALES } from "@/lib/i18n/locales";

const ROOT = join(__dirname, "..", "..", "..", "..");
const BUDGET = 10;

function dockKeys(): string[] {
  const shell = readFileSync(join(ROOT, "src/components/deep-space/DeepSpaceScreen.tsx"), "utf8");
  const tabs = shell.match(/const TABS: DeepSpaceTab\[\] = \[([^\]]*)\]/);
  expect(tabs).not.toBeNull();
  const fromShell = [...tabs![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  const navBar = readFileSync(join(ROOT, "src/components/deepspace/shell/SbNavBar.tsx"), "utf8");
  const fromNavBar = [...navBar.matchAll(/labelKey: "ds\.dock\.([a-z]+)"/g)].map((m) => m[1]);
  return [...new Set([...fromShell, ...fromNavBar])];
}

function width(label: string): number {
  let units = 0;
  for (const ch of label) units += /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch) ? 2 : 1;
  return units;
}

describe("dock labels fit their tab", () => {
  it("reads the five dock tabs from the shell", () => {
    expect(dockKeys()).toEqual(expect.arrayContaining(["home", "capture", "chat", "wiki", "settings"]));
  });

  it(`every shipped locale keeps each dock label within ${BUDGET} units`, () => {
    const over: string[] = [];
    for (const lng of AVAILABLE_UI_LOCALES) {
      const home = JSON.parse(readFileSync(join(ROOT, "locales", lng, "home.json"), "utf8")) as {
        ds: { dock: Record<string, string> };
      };
      for (const key of dockKeys()) {
        const label = home.ds.dock[key];
        expect(typeof label).toBe("string");
        if (width(label) > BUDGET) over.push(`${lng} ds.dock.${key} "${label}" (${width(label)})`);
      }
    }
    expect(over).toEqual([]);
  });

  it("the budget counts Hangul as two units", () => {
    expect(width("Pengaturan")).toBe(10);
    expect(width("Configurações")).toBe(13);
    expect(width("별자리")).toBe(6);
  });
});

// The other three places the same measure cut text (R2B-05). Source contracts:
// the layout is what fixes them, and a render test is not available here.
describe("long-locale text wraps instead of clipping", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

  it("/core-brain stacks the deck title above the swipe hint", () => {
    const deck = read("src/components/deep-space/PolarisDeck.tsx");
    // Side by side, the title shrank with the hint on web and lost its noun
    // ("minha Es…", and "North Star" in en too).
    expect(deck).toMatch(/deckHeadCopy: \{[^}]*flexDirection: "column"/);
    expect(deck).toMatch(/deckTitle: \{[^}]*flexShrink: 0/);
    expect(deck).toContain('<Text style={styles.deckHint} numberOfLines={2}>');
  });

  it("/brightness wraps star names in the label column and aligns the axis with it", () => {
    const screen = read("src/app/brightness.tsx");
    expect(screen.match(/style=\{styles\.rowLabel\} numberOfLines=\{2\}/g)?.length).toBe(2);
    expect(screen).not.toMatch(/style=\{styles\.rowLabel\} numberOfLines=\{1\}/);
    expect(screen).toContain("rowLabel: { width: ROW_LABEL_WIDTH }");
    expect(screen).toContain("paddingLeft: ROW_LABEL_WIDTH + GRID_GAP");
  });

  it("/integrations gives names two lines and the action button three", () => {
    const screens = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    expect(screens).toContain('<RNText numberOfLines={2} style={[m3TextStyle("titleSmall"), cx.integrationName]}>');
    expect(screens).toContain('<RNText numberOfLines={3} style={[m3TextStyle("labelSmall"), cx.integrationActionText]}>');
  });
});
