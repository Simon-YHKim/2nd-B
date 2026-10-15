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
import { LEDGER_AMOUNT_MAX_CHARS, ledgerAmountEdit, parseLedgerAmount } from "@/lib/finance/ledger";

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
    expect(reading).toMatch(/catch \(e\) \{\n\s*next = bookSearchFailed\(trimmed, e\);/);
    expect(reading).toContain("if (seq === searchSeq.current) setSearch(next);");
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
    expect(reading).toContain("await manualBook(trimmed)");
    expect(reading).toContain("if (seq === searchSeq.current) setManual(book);");
    expect(reading).toContain("onPress={() => void onAdd(manual)}");
  });
});

describe("R2C-07 / R2C-08: the shelf", () => {
  test("a book can be removed, through the two-tap guard", () => {
    expect(reading).toContain("await removeFromShelf(userId, entryId);");
    expect(reading).toContain("const del = useTwoTapDelete((id) => void onRemove(id));");
    expect(reading.match(/<DeleteChip armed=\{del\.armedId === /g)?.length).toBe(4);
  });
  test("gate CD-R2-01: a settled delete closes only the deleted book's page editor", () => {
    const remover = reading.slice(reading.indexOf("const onRemove"), reading.indexOf("const del = useTwoTapDelete"));
    expect(remover.length).toBeGreaterThan(200);
    expect(remover).toMatch(/await removeFromShelf\(userId, entryId\);\n(\s*\/\/.*\n)*\s*setPageEdit\(\(open\) => editorAfterDelete\(open, entryId\)\);\n\s*shelf\.reload\(\);/);
    // The old close read the editor captured when the delete started, then closed whatever
    // was open by the time it settled, another book's draft included.
    expect(remover).not.toContain("setPageEdit(null)");
    expect(remover).not.toContain("pageEdit?.id");
  });
  test("finished books and every book being read are drawn", () => {
    expect(reading).toContain("const view = shelfView(shelf.data);");
    expect(reading).toContain("view.done.map(");
    expect(reading).toContain("view.alsoReading.map(");
  });
  test("the page count can be saved", () => {
    // Re-aimed 2026-10-06 (gate BL-09): the save reads the editor opening it started from
    // (`edit`), so its UPDATE and its close both belong to that one opening.
    expect(reading).toContain("const edit = pageEdit;");
    expect(reading).toContain("const pages = parsePageDraft(edit.cur, edit.total);");
    expect(reading).toContain("await updateShelfEntry(userId, edit.id, pages);");
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
  test("gate CD-R1-01: a settled delete closes only the deleted goal's editor", () => {
    const deleter = goals.slice(goals.indexOf("const onDelete"), goals.indexOf("const delGoal"));
    expect(deleter.length).toBeGreaterThan(300);
    expect(deleter).toMatch(/await deleteMilestone\(userId, id\);\n(\s*\/\/.*\n)*\s*setEditing\(\(open\) => editorAfterDelete\(open, id\)\);\n\s*ms\.reload\(\);/);
    expect(deleter).not.toContain("setEditing(null)");
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
    // Re-aimed 2026-10-07 (gate S3-02): this used to require onChangeText={setAmount}, which
    // held a pasted string of any length.
    // Re-aimed 2026-10-07 (gate OPSFIX-A1-04): the field then kept 65 characters of a long
    // paste, and one deleted leading 0 made them a 64-character amount. Every edit now goes
    // through ledgerAmountEdit, which takes no text longer than the parser reads and keeps
    // what the field held instead (ledger-amount.test.ts).
    expect(amountInput).toMatch(
      /onChangeText=\{\(v\) => \{\n\s*const edit = ledgerAmountEdit\(amount, v\);\n\s*setAmount\(edit\.text\);\n\s*setAmountOverflow\(edit\.overflow\);\n\s*\}\}/,
    );
    expect(amountInput).not.toContain(".slice(");
    expect(ledger.match(/setAmount\(/g)?.length).toBe(2); // the edit above, and the reset after an add
    expect(ledger).toContain('setAmount("");');
    expect(amountInput).toContain('keyboardType="number-pad"');
    // Nothing shortens the typed string to a length the parser would read.
    expect(amountInput).not.toMatch(/maxLength/);
    expect(ledger).not.toMatch(/LEDGER_AMOUNT_MAX_DIGITS/);
    expect(ledger).toContain("const amountParsed = parseLedgerAmount(amount);");
    expect(ledger).toContain("{amountTooLarge ? (");
    expect(ledger).toContain('t("toolScreens.ledger.amountTooLarge", { max: MAX_LEDGER_KRW.toLocaleString() })');
  });

  // Gate S-02 (2026-10-07): "-500", "1e3" and "12.34" were saved as 500, 13 and 1234.
  test("an amount that is not whole won says so under the field and cannot be added", () => {
    // Re-aimed 2026-10-07 (gate OPSFIX-A1-04): an edit too long to take says so the same way.
    expect(ledger).toContain('const amountInvalid = amountOverflow || amountParsed.kind === "invalid";');
    expect(ledger).toMatch(/\) : amountInvalid \? \(\n\s*<Text variant="caption" style=\{styles\.fieldErr\} accessibilityLiveRegion="polite">\n\s*\{t\("toolScreens\.ledger\.amountInvalid"\)\}/);
    // The add button is on for "ok" only: "invalid" and "tooLarge" both leave it off, and so
    // does a refused edit until the field takes the next one. The keyboard's done on the
    // category field goes through onAddEntry, which checks canAdd too.
    expect(ledger).toContain('const canAdd = !busy && amountParsed.kind === "ok" && !amountOverflow;');
    expect(ledger).toContain("if (!userId || !canAdd) return;");
    expect(ledger).toContain("amount_krw: amountNum,");
  });

  // Gate OPSFIX-A3-02 (2026-10-07): the amount field stays editable while an add runs. An edit
  // refused as too long then set amountOverflow, and the add's success emptied the field without
  // clearing it (the reset does not go through onChangeText), so the format hint stayed up under
  // an empty field. Replayed here with the real edit rule and parser, applying the resets the
  // screen's success path makes.
  test("OPSFIX-A3-02: an over-long paste while an add runs, then the add lands: no hint under the empty field", () => {
    const adder = ledger.slice(ledger.indexOf("const onAddEntry"), ledger.indexOf("const onDeleteEntry"));
    const landed = adder.slice(adder.indexOf("await createLedgerEntry("), adder.indexOf("} catch {"));
    const failed = adder.slice(adder.indexOf("} catch {"), adder.indexOf("} finally {"));
    expect(landed.length).toBeGreaterThan(150);
    expect(failed.length).toBeGreaterThan(10);
    // "5000" is being added; a paste one character too long comes in meanwhile and is refused.
    let field = ledgerAmountEdit("", "5000");
    field = ledgerAmountEdit(field.text, "9".repeat(LEDGER_AMOUNT_MAX_CHARS + 1));
    expect(field).toEqual({ text: "5000", overflow: true });
    // The add lands: apply what its success path resets.
    if (landed.includes('setAmount("");')) field = { ...field, text: "" };
    if (landed.includes("setAmountOverflow(false);")) field = { ...field, overflow: false };
    // What shows under the field, by the screen's own rule (pinned above): nothing.
    const parsed = parseLedgerAmount(field.text);
    const hintShown = parsed.kind === "tooLarge" || field.overflow || parsed.kind === "invalid";
    expect(field).toEqual({ text: "", overflow: false });
    expect(hintShown).toBe(false);
    // A failed add keeps the field and its refusal as they are: the reset is on success only.
    expect(failed).not.toContain("setAmountOverflow(");
    expect(ledger.match(/setAmountOverflow\(/g)?.length).toBe(2); // the edit, and the reset after an add
  });

  // Gate OPSFIX-A1-05 (2026-10-07): the hint said letters and signs are not taken, while the
  // parser takes ₩ (or ￦) in front and 원 after. Each locale now shows those forms (each one
  // parses as whole won: ledger-amount.test.ts), and no longer says letters are refused.
  test.each(LOCALES)("OPSFIX-A1-05: the %s amount hint shows the forms the field takes", (l) => {
    const hint = lookup(bundles[l], "toolScreens.ledger.amountInvalid") as string;
    for (const form of ["12000", "12,000", "₩12,000", "12,000원"]) expect([l, hint]).toEqual([l, expect.stringContaining(form)]);
    expect([l, hint]).toEqual([l, expect.not.stringMatching(/letter|문자|letra|huruf/i)]);
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
    // Re-aimed 2026-10-06 (gate r3): the lock is the cell's module-wide lock, not a ref
    // owned by one mounted screen (the route and the phone hub each mount their own).
    expect(meals).toContain("const outcome = await runExclusive(mealWriteLock(userId, sheet.date, sheet.slot), async () => {");
    expect(meals).not.toMatch(/useRef<WriteLock>/);
    expect(meals).not.toContain("mealLock");
    // The lock-holding writer is the only place a meal write is awaited.
    expect(meals.match(/await (setMeal|clearMeal)\(/g) ?? []).toEqual([]);
    expect(meals.match(/writeMeal\(sheet, /g)?.length).toBe(2);
  });

  test("BL-07: while a write runs, the sheet takes no new draft and no second submit", () => {
    const input = meals.slice(meals.indexOf("<TextInput"), meals.indexOf("/>", meals.indexOf("<TextInput")));
    expect(input.length).toBeGreaterThan(200);
    expect(input).toContain("editable={!mealWriting}");
    expect(input).toMatch(/onChangeText=\{\(v\) => \{\n\s*if \(mealWriting\) return;\n\s*setDraft\(v\);/);
    expect(input).toMatch(/onSubmitEditing=\{\(\) => \{\n\s*if \(!mealWriting\) void saveCell\(\);/);
    expect(input).not.toContain("onSubmitEditing={() => void saveCell()}");
    const chipsAt = meals.indexOf("{ideaChips.map(");
    const chips = meals.slice(chipsAt, meals.indexOf("</View>", chipsAt));
    expect(chips.length).toBeGreaterThan(100);
    expect(chips).toContain("disabled={mealWriting}");
    expect(chips).toMatch(/if \(mealWriting\) return;\s*setDraft\(name\);/);
    // The busy state counts this screen's writes, so one settling cannot re-open the sheet
    // while another is still in flight.
    expect(meals).toContain("const mealWriting = mealWrites > 0;");
    const writer = meals.slice(meals.indexOf("const writeMeal"), meals.indexOf("const saveCell"));
    expect(writer).toContain("setMealWrites((n) => n + 1);");
    expect(writer).toContain("setMealWrites((n) => n - 1);");
  });

  test("BL-03: both buttons are off while a write runs", () => {
    const saveButton = meals.slice(meals.indexOf("{pending?.current ? ("), meals.indexOf("</Modal>"));
    expect(saveButton.match(/disabled=\{mealWriting\}/g)?.length).toBe(2);
  });

  test("BL-03: a late write closes only the sheet it started from", () => {
    // Re-aimed 2026-10-07 (gate S3-01): through mealSheetAfterWrite, which also keeps the
    // sheet open, marked failed, when the write failed (tool-logic.test.ts).
    expect(meals).toContain("setPending((open) => mealSheetAfterWrite(open, sheet.session, outcome));");
    const writer = meals.slice(meals.indexOf("const writeMeal"), meals.indexOf("const saveCell"));
    expect(writer).not.toContain("setPending(null)");
  });
});

// Gate S3-01 (2026-10-07): a failed meal write closed the sheet over the draft, and the error
// was a screen-wide banner that read as the failure of whatever cell was open by then.
// Re-aimed 2026-10-07 (simplified): Simon asked for the simple model. The failure record kept
// after the sheet closed (mealErr), the banner naming the failed cell, the retry chip, the
// "changed elsewhere" notice and the draft handed back on a later opening are gone, and so are
// the checks that pinned them. The decisions are in tool-logic.test.ts (mealSheetAfterWrite,
// mealSheetDismiss); this pins that the screen calls them.
describe("gate S3-01 (simplified): a failed meal write keeps its sheet open, and only while it is open", () => {
  const writer = meals.slice(meals.indexOf("const writeMeal"), meals.indexOf("const saveCell"));
  const saver = meals.slice(meals.indexOf("const saveCell"), meals.indexOf("// Gate BL-02:"));
  const openCell = meals.slice(meals.indexOf("const openCell"), meals.indexOf("const onLookUp"));
  const modalAt = meals.indexOf("<Modal ");
  const beforeModal = meals.slice(0, modalAt);
  const sheetBody = meals.slice(modalAt, meals.indexOf("</Modal>"));

  test("the scanner found the writer, the save, the opening and the sheet", () => {
    expect(writer.length).toBeGreaterThan(400);
    expect(saver.length).toBeGreaterThan(300);
    expect(openCell.length).toBeGreaterThan(200);
    expect(sheetBody.length).toBeGreaterThan(2000);
  });

  test("(a) while a write runs, the backdrop and the back do nothing, and no cell opens", () => {
    expect(meals).toMatch(/const closeSheet = \(\) => \{\s*if \(!mealWriting\) resetLookup\(\);\s*setPending\(\(open\) => mealSheetDismiss\(open, mealWriting\)\);\s*\};/);
    expect(sheetBody).toContain('<Modal visible={pending !== null} transparent animationType="slide" onRequestClose={closeSheet}>');
    // The phone backdrop has a non-interactive dither child; the same press guard remains.
    expect(sheetBody).toContain("<Pressable style={styles.mealBackdrop} onPress={closeSheet} disabled={mealWriting}>");
    // The sheet itself has no other way to close. The two plain closes left are the save's:
    // no user or no sheet, and nothing to write. The save button is off while a write runs.
    expect(sheetBody).not.toContain("setPending(");
    expect(meals.match(/setPending\(null\)/g)?.length).toBe(2);
    expect(saver).toMatch(/if \(action === "close"\) \{\n\s*resetLookup\(\);\n\s*setPending\(null\);\n\s*return;\n\s*\}/);
    expect(openCell).toMatch(/\n\s*if \(mealWriting\) return;\n\s*sheetSeq\.current \+= 1;/);
  });

  test("(b) a failed write keeps the sheet and the draft, and says so inside the sheet", () => {
    expect(writer).toContain('if (outcome === "busy") return;');
    expect(writer.match(/setPending\(/g)?.length).toBe(1);
    expect(writer).toContain("setPending((open) => mealSheetAfterWrite(open, sheet.session, outcome));");
    // The writer never touches the draft: what was typed stays in the input. (The confirmed
    // clear empties it from inside its own write: OPSFIX-A3-01 below.)
    expect(writer).not.toContain("setDraft(");
    expect(meals).toContain("const sheetFailed = pending !== null && pending.failed && !mealWriting;");
    expect(sheetBody).toMatch(
      /\{sheetFailed \? \(\n\s*<Text variant="caption" style=\{styles\.saveErrText\} accessibilityRole="alert" accessibilityLiveRegion="polite">\n\s*\{t\("toolScreens\.meals\.saveFailed"\)\}/,
    );
  });

  test("(b) trying again is the same save button, reading the draft as it stands", () => {
    // No separate retry write: the only meal writes are the save and the two-tap clear.
    expect(meals.match(/writeMeal\(sheet, /g)?.length).toBe(2);
    expect(meals).not.toMatch(/retryMeal|mealRetry|draftAsked/);
    expect(saver).toContain("const action = mealSaveAction(draft, pending.current);");
  });

  // Gate OPSFIX-A3-01 (2026-10-07): a failed two-tap clear left the stored meal in the input, so
  // the same save button read it as unchanged, closed the sheet and never tried the clear again.
  // The run itself (fail, then the save clears again; busy changes nothing) is in
  // tool-logic.test.ts; this pins that the screen's clear is wired the way that run assumes.
  test("OPSFIX-A3-01: the confirmed clear empties the draft inside its locked write, so a failed clear is saved again as a clear", () => {
    const clearer = meals.slice(meals.indexOf("const clearArm = useTwoTapDelete"), meals.indexOf("const clearArmed"));
    expect(clearer.length).toBeGreaterThan(300);
    // The draft is emptied inside the write writeMeal runs, not before writeMeal: a clear the
    // lock refuses ("busy") never runs that write, so it leaves the draft as it was.
    expect(clearer).toMatch(/void writeMeal\(sheet, \(\) => \{\n\s*setDraft\(""\);\n\s*return clearMeal\(userId, sheet\.date, sheet\.slot\);\n\s*\}\);/);
    expect(clearer.match(/setDraft\(/g)?.length).toBe(1);
    // writeMeal calls that write only from runExclusive's callback, after the lock is taken.
    expect(writer).toMatch(
      /const outcome = await runExclusive\(mealWriteLock\(userId, sheet\.date, sheet\.slot\), async \(\) => \{\n\s*resetLookup\(\);\n\s*setMealWrites\(\(n\) => n \+ 1\);\n\s*try \{\n\s*await write\(\);/,
    );
    expect(writer.match(/write\(\)/g)?.length).toBe(1);
  });

  test("(c) a write that landed reloads the week and closes the sheet it came from", () => {
    expect(writer).toContain('if (outcome === "done") week.reload();');
    expect(writer).not.toContain("setPending(null)");
  });

  test("(d) closing drops the draft and the line: the next opening starts from the stored meal", () => {
    expect(openCell).toContain("setPending({ session: sheetSeq.current, date, slot, day, current: current?.title ?? null, failed: false });");
    expect(openCell).toContain('setDraft(current?.title ?? "");');
    // Nothing of a failure outlives its sheet.
    expect(meals).not.toMatch(/mealErr|mealOpening|mealFailure|mealUnsaved|otherCellFailed/);
  });

  test("(e) no screen-wide failure: no saveErr flag and no banner on the meals screen", () => {
    expect(meals).not.toMatch(/setSaveErr|saveErr\b/);
    expect(meals).not.toContain("SaveErrorBanner");
    expect(beforeModal).not.toContain("toolScreens.meals.saveFailed");
  });

  test.each(LOCALES)("%s keeps the one meal failure line and none of the removed keys", (l) => {
    expect(typeof lookup(bundles[l], "toolScreens.meals.saveFailed")).toBe("string");
    for (const gone of ["saveFailedCell", "changedSinceSet", "changedSinceClear", "useUnsaved", "retryClear"]) {
      expect([gone, lookup(bundles[l], `toolScreens.meals.${gone}`)]).toEqual([gone, undefined]);
    }
  });
});

describe("gate BL-09: the shelf's page-count save", () => {
  const saver = reading.slice(reading.indexOf("const onSavePages"), reading.indexOf("return (\n    <OpsFrame"));
  const editorAt = reading.indexOf("{pageEdit?.id === reading.id ? (");
  const editor = reading.slice(editorAt, reading.indexOf("{c.finishedReading}", editorAt));
  const fields = editor.slice(editor.indexOf("<TextInput"), editor.indexOf("{pageErr ||"));
  const saveChip = editor.slice(editor.indexOf('<View style={styles.chipRow}>'), editor.indexOf("{c.cancel}"));
  const openerAt = editor.indexOf(") : (");
  const opener = editor.slice(openerAt, editor.indexOf("</Pressable>", openerAt));

  test("the scanner found the save, the editor and the opener", () => {
    expect(saver.length).toBeGreaterThan(400);
    expect(fields.length).toBeGreaterThan(600);
    expect(saveChip.length).toBeGreaterThan(100);
    expect(opener.length).toBeGreaterThan(200);
  });

  test("the save runs only under the book's shared lock", () => {
    expect(saver).toContain("const outcome = await runExclusive(pageWriteLock(userId, edit.id), async () => {");
    expect(saver).toContain('if (outcome === "busy") return;');
    // The lock-holding writer is the only place a page count is written.
    expect(reading.match(/updateShelfEntry\(/g)?.length).toBe(1);
    expect(reading).not.toMatch(/useRef<WriteLock>/);
  });

  test("while a save runs, neither field takes a new draft or a second submit", () => {
    expect(fields.match(/editable=\{!pageSaving\}/g)?.length).toBe(2);
    expect(fields.match(/onChangeText=\{\(v\) => \{\n\s*if \(pageSaving\) return;\n\s*setPageEdit\(/g)?.length).toBe(2);
    expect(fields.match(/onSubmitEditing=\{\(\) => \{\n\s*if \(!pageSaving\) void onSavePages\(\);/g)?.length).toBe(2);
    expect(fields).not.toContain("onSubmitEditing={() => void onSavePages()}");
    expect(saver).toContain("if (!userId || !pageEdit || pageSaving) return;");
  });

  test("the save chip and the opener are off while a save runs", () => {
    expect(saveChip).toContain("disabled={pageSaving}");
    expect(opener).toContain("disabled={pageSaving}");
  });

  test("the busy state counts this screen's saves, so one settling cannot free the editor early", () => {
    expect(reading).toContain("const pageSaving = pageWrites > 0;");
    expect(saver).toContain("setPageWrites((n) => n + 1);");
    expect(saver).toContain("setPageWrites((n) => n - 1);");
  });

  test("every opening of the editor is a new session", () => {
    expect(opener).toContain("pageEditSeq.current += 1;");
    expect(opener).toContain("session: pageEditSeq.current,");
  });

  test("a settled save closes only the opening it started from, and a failed one keeps it", () => {
    expect(saver).toMatch(/if \(outcome === "done"\) \{\n\s*setPageEdit\(\(open\) => sheetAfterWrite\(open, edit\.session\)\);\n\s*shelf\.reload\(\);\n\s*\} else setSaveErr\(true\);/);
    expect(saver).not.toContain("setPageEdit(null)");
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
