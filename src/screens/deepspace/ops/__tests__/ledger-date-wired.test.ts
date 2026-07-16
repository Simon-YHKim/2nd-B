// A ledger row could only ever be booked "today".
//
// createLedgerEntry has always accepted `occurred_on` (it merely falls back to
// localDayKey()), but the form never sent one -- so there was no way to record
// yesterday's coffee. A calendar picker now supplies it.
//
// The subtle half is the CLAMP. LedgerScreen is pinned to exactly one month:
//
//   const month = monthBucket(new Date());
//   listEntriesForMonth(userId, month)   // the list
//   summarizeMonth(entries, month)       // the totals
//
// There is no month navigation, so a row dated outside `month` would be written
// and then be invisible -- a silent write, the very failure this screen's other
// guards exist to prevent (cf. no-silent-save.test.ts). The picker is therefore
// clamped to [first-of-month, today]: backdating inside the visible month works,
// and a row can neither vanish nor book a future expense into this month's total.
//
// These guards keep the three facts in agreement: the fixed month, the clamp,
// and the wiring. They assert behaviour, not formatting.

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
/** Normalize CRLF: the repo checks out CRLF on Windows, and a scanner that
 *  silently matches nothing still reports PASS -- worse than no scanner. */
const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const src = read(join(ROOT, "src/screens/deepspace/ops/screens.tsx"));

describe("ledger entry date is wired", () => {
  test("the scanner is actually reading the screen (not vacuously passing)", () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain("export function LedgerScreen()");
  });

  test("the write passes occurred_on, so a row is not forced to today", () => {
    expect(src).toMatch(/createLedgerEntry\(\s*userId,\s*\{[^}]*occurred_on/);
  });

  test("each row shows its day, so a backdated row is identifiable", () => {
    expect(src).toContain("occurred_on.slice(5)");
  });
});

describe("the ledger date cannot book a row the user would never see", () => {
  test("the screen is still pinned to one current month", () => {
    // The clamp below is only correct while this holds. If month navigation ever
    // lands, this fails first -- go re-decide the clamp, do not just delete it.
    expect(src).toContain("const month = monthBucket(new Date());");
  });

  test("the picker is clamped to [first-of-month, today]", () => {
    expect(src).toContain("minDate={`${month}-01`}");
    expect(src).toContain("maxDate={localDayKey()}");
  });
});
