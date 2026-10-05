// QA round 2 (2026-10-05): the hand-entry tool screens, wired.
//
// tool-logic.test.ts pins the decisions; this pins that the screens actually CALL them.
// No RN renderer in this jest (RN 0.85), so these read screens.tsx as text, one screen
// body at a time, CRLF-normalized (a scanner that reads the wrong bytes passes forever).
//
//   R2C-02  /reading   a failed search said nothing ("no suggestions yet")
//   R2C-07  shelf / goals / meals had no way to delete; an emptied meal cell stayed
//   R2C-08  finished books vanished, the page count could not move, re-adding reset progress
//   R2C-09  an overdue goal's chip never changed on the first tap
//   R2C-10  tool screens showed the assistant's "No suggestions yet" empty/loading copy
//   R2C-11  /ledger claimed "Other currencies convert automatically (FX)"
//   R2C-15  the meal sheet had no day/meal, a wrong placeholder, and a fixed "닭" search
//   R2C-16  ledger ✕ deleted on one tap; the amount had no ceiling

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (f: string): string => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

const src = read("src/screens/deepspace/ops/screens.tsx");
const copy = read("src/components/deepspace/ops/copy.ts");
const body = (from: string, to: string): string => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`screen body not found: ${from}`);
  return src.slice(a, b);
};
const reading = body("export function ReadingScreen()", "export function MilestonesScreen()");
const goals = body("export function MilestonesScreen()", "export function LedgerScreen()");
const ledger = body("export function LedgerScreen()", "export function SideProjectScreen");
const meals = body("export function MealsScreen()", "// --- Scheduled reminders");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const bundles = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(read(`locales/${l}/ops.json`)) as Record<string, unknown>]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;
const lookup = (obj: Record<string, unknown>, key: string): unknown =>
  key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

describe("the scanner is reading the real screens", () => {
  test("each screen body is non-trivial", () => {
    for (const s of [reading, goals, ledger, meals]) expect(s.length).toBeGreaterThan(800);
  });
});

describe("R2C-02: a failed book search says so", () => {
  test("the catch records a failure instead of an empty result list", () => {
    expect(reading).toMatch(/catch \(e\) \{\n\s*if \(seq === searchSeq\.current\) setSearch\(bookSearchFailed\(trimmed, e\)\);/);
    expect(reading).not.toMatch(/setResults\(\[\]\)/);
  });
  test("failure renders an error (or quota) state with a retry", () => {
    expect(reading).toMatch(/variant=\{search\.rate \? "rate" : "error"\}/);
    expect(reading).toContain("onCta={() => void onSearch(search.q)}");
  });
  test("zero hits has its own line, apart from the empty shelf", () => {
    expect(reading).toContain('t("toolScreens.reading.noResults", { q: search.q })');
  });
  test("when search fails or finds nothing, the typed title can still go on the shelf", () => {
    expect(reading).toContain("manualBook(search.q)");
    expect(reading).toContain("onPress={() => void onAdd(manual)}");
  });
});

describe("R2C-07 / R2C-08: the shelf", () => {
  test("a book can be removed, through the two-tap guard", () => {
    expect(reading).toContain("await removeFromShelf(userId, entryId);");
    expect(reading).toContain("const del = useTwoTapDelete((id) => void onRemove(id));");
    expect(reading.match(/<DeleteChip armed=\{del\.armedId === /g)?.length).toBe(4);
  });
  test("finished books and every book being read are drawn", () => {
    expect(reading).toContain("const view = shelfView(shelf.data);");
    expect(reading).toContain("view.done.map(");
    expect(reading).toContain("view.alsoReading.map(");
  });
  test("the page count can be saved", () => {
    expect(reading).toContain("const pages = parsePageDraft(pageEdit.cur, pageEdit.total);");
    expect(reading).toContain("await updateShelfEntry(userId, pageEdit.id, pages);");
  });
  test("a result already on the shelf is not offered again", () => {
    expect(reading).toContain("const onShelf = shelfVolumeIds(shelf.data);");
    expect(reading).toContain("onShelf.has(b.id) ?");
  });
});

describe("R2C-09 / R2C-07: goals", () => {
  test("the chip comes from milestoneChip, and overdue is no longer the chip", () => {
    expect(goals).toContain("const chip = milestoneChip(m.status);");
    expect(goals).not.toMatch(/if \(milestoneOverdue\(m\)\) return/);
  });
  test("overdue is shown on the due-date line", () => {
    expect(goals).toContain("const overdue = milestoneOverdue(m);");
    expect(goals).toContain("{overdue ? ` · ${c.overdue}` : \"\"}");
  });
  test("the chip tells a screen reader its state and what a tap does", () => {
    expect(goals).toContain('t("toolScreens.goals.chipA11y", { state: chip.label, next: chip.nextLabel })');
  });
  test("a goal can be deleted, through the two-tap guard", () => {
    expect(goals).toContain("await deleteMilestone(userId, id);");
    expect(goals).toContain("const delGoal = useTwoTapDelete((id) => void onDelete(id));");
  });
});

describe("R2C-16 / R2C-11: ledger", () => {
  test("✕ never deletes on its own", () => {
    expect(ledger).not.toMatch(/onPress=\{\(\) => void onDeleteEntry\(/);
  });
  // Re-aimed 2026-10-05 (gate S-01 / BL-01). This used to REQUIRE
  // maxLength={LEDGER_AMOUNT_MAX_DIGITS} on the amount input, and that was the bug: maxLength
  // counts separators, so a pasted "1,000,000,000,000" (an allowed amount) was cut to
  // "1,000,000,000" before the parser saw it and saved 1,000x less. The ceiling is the same;
  // it now lives only in parseLedgerAmount (ledger-amount.test.ts), which sees the whole string.
  test("the amount field has a ceiling, and the reason is shown", () => {
    const start = ledger.indexOf("value={amount}");
    const amountInput = ledger.slice(start, ledger.indexOf("/>", start));
    expect(amountInput).toContain("onChangeText={setAmount}");
    expect(amountInput).toContain('keyboardType="number-pad"');
    // Nothing shortens the typed string before parseLedgerAmount reads it.
    expect(amountInput).not.toMatch(/maxLength/);
    expect(ledger).not.toMatch(/LEDGER_AMOUNT_MAX_DIGITS/);
    expect(ledger).toContain("const amountParsed = parseLedgerAmount(amount);");
    expect(ledger).toContain("{amountTooLarge ? (");
    expect(ledger).toContain('t("toolScreens.ledger.amountTooLarge", { max: MAX_LEDGER_KRW.toLocaleString() })');
  });
  test("the currency note states what the screen does", () => {
    expect(ledger).toContain('t("toolScreens.ledger.currencyNote")');
    expect(src).not.toContain("fxNote");
    expect(copy).not.toMatch(/fxNote\s*:/);
    for (const text of [src, copy, ...LOCALES.map((l) => JSON.stringify(bundles[l]))]) {
      expect(text).not.toMatch(/자동 환산|convert automatically/);
    }
  });
});

describe("R2C-07 / R2C-15: meals", () => {
  test("opening a cell makes no food-DB request", () => {
    expect(meals).not.toMatch(/searchFoods\(ko \? /);
    const openCell = meals.slice(meals.indexOf("const openCell"), meals.indexOf("const onLookUp"));
    expect(openCell.length).toBeGreaterThan(50);
    expect(openCell).not.toContain("searchFoods");
  });
  test("the food DB is asked only with what the user typed, on the Korean screen", () => {
    expect(meals).toContain("const items = await searchFoods(query);");
    expect(meals).toContain("if (!ko || query.length === 0) return;");
  });
  test("the sheet says which day and meal it edits, and the input has a real placeholder", () => {
    expect(meals).toContain('t("toolScreens.meals.sheetSubtitle", { day: pending.day, date: pending.date, slot: c[pending.slot] })');
    expect(meals).toContain('placeholder={t("toolScreens.meals.placeholder")}');
    expect(meals).not.toContain("placeholder={c.mealIdeas}");
  });
  test("an emptied cell is cleared, and a filled cell has a clear button", () => {
    expect(meals).toContain("const action = mealSaveAction(draft, pending.current);");
    // Re-aimed 2026-10-05 (gate BL-03): the clear still happens, now through writeMeal's lock.
    expect(meals).toContain('action === "clear" ? clearMeal(userId, sheet.date, sheet.slot) : setMeal(userId, sheet.date, sheet.slot, title)');
    expect(meals).toContain("{pending?.current ? (");
  });
});

describe("gate BL-02 / BL-03: the meal sheet's clear and save", () => {
  const clearButton = meals.slice(meals.indexOf("{pending?.current ? ("), meals.indexOf("{c.save}"));

  test("BL-02: 'clear this meal' takes two taps in the same sheet opening", () => {
    expect(clearButton.length).toBeGreaterThan(200);
    expect(clearButton).toContain("onPress={() => clearArm.press(mealClearArmKey(pending))}");
    expect(clearButton).not.toMatch(/clearMeal\(/);
    expect(meals).toMatch(/const clearArm = useTwoTapDelete\(\(key\) => \{\n\s*if \(!userId \|\| !pending \|\| mealClearArmKey\(pending\) !== key\) return;/);
    // The armed state is visible: the label says the next tap clears.
    expect(clearButton).toContain('{clearArmed ? t("toolScreens.delete.confirm") : t("toolScreens.meals.clear")}');
  });

  test("BL-02: every opening is a new session, so an arm never carries over", () => {
    const openCell = meals.slice(meals.indexOf("const openCell"), meals.indexOf("const onLookUp"));
    expect(openCell).toContain("sheetSeq.current += 1;");
    expect(openCell).toContain("setPending({ session: sheetSeq.current,");
  });

  test("BL-03: save and clear write only through the shared lock", () => {
    expect(meals).toContain("const outcome = await runExclusive(mealLock.current, async () => {");
    // The lock-holding writer is the only place a meal write is awaited.
    expect(meals.match(/await (setMeal|clearMeal)\(/g) ?? []).toEqual([]);
    expect(meals.match(/writeMeal\(sheet, /g)?.length).toBe(2);
  });

  test("BL-03: both buttons are off while a write runs", () => {
    const saveButton = meals.slice(meals.indexOf("{pending?.current ? ("), meals.indexOf("</Modal>"));
    expect(saveButton.match(/disabled=\{mealWriting\}/g)?.length).toBe(2);
  });

  test("BL-03: a late write closes only the sheet it started from", () => {
    expect(meals).toContain("setPending((open) => sheetAfterWrite(open, sheet.session));");
    const writer = meals.slice(meals.indexOf("const writeMeal"), meals.indexOf("const saveCell"));
    expect(writer).not.toContain("setPending(null)");
  });
});

describe("R2C-10: tool screens use their own empty and loading copy", () => {
  test("no tool screen borrows the assistant's 'No suggestions yet' card", () => {
    for (const s of [reading, goals, ledger]) {
      expect(s).not.toContain("title={c.emptyTitle}");
      expect(s).not.toContain("body={c.emptyBody}");
      expect(s).toContain("<ToolLoading />");
    }
  });
});

describe("every toolScreens key the screens use exists in all five locales", () => {
  const used = [...new Set([...src.matchAll(/"(toolScreens\.[A-Za-z0-9_.]+)"/g)].map((m) => m[1]!))];

  test("the key scan found the keys", () => {
    expect(used.length).toBeGreaterThan(25);
  });

  test.each(LOCALES)("%s has every key as a non-empty string", (l) => {
    const missing = used.filter((k) => {
      const v = lookup(bundles[l], `${k}`);
      return typeof v !== "string" || v.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  test.each(LOCALES)("%s has every meal idea the sheet reads", (l) => {
    const ideaKeys = /const MEAL_IDEA_KEYS = \[([^\]]+)\]/.exec(src)?.[1]?.match(/"(i\d+)"/g) ?? [];
    expect(ideaKeys.length).toBeGreaterThan(3);
    for (const k of ideaKeys) expect(typeof lookup(bundles[l], `toolScreens.meals.ideas.${k.replace(/"/g, "")}`)).toBe("string");
  });
});
