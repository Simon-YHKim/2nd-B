// The 가계부(ledger) screen could not be used as a ledger.
//
// Its ＋ button called createLedgerEntry with a HARDCODED placeholder:
//
//   await createLedgerEntry(userId, { kind: "expense", amount_krw: 0, category: "기타" });
//
// So every tap inserted a 0-won "기타" row the user could never edit, and there was no way
// to delete a wrong row. You could not enter an amount; you could not remove a mistake. A
// ledger that records nothing you type and forgets nothing you regret.
//
// The lib supported the real thing all along -- createLedgerEntry takes a real amount and
// category (and clamps to a positive integer), and deleteLedgerEntry exists. Only the UI
// was a stub. This wires the actual form + a per-row delete.
//
// No RN renderer in this jest setup, so assert the source shape -- CRLF-normalized, because
// a scanner that reads the wrong bytes reports PASS forever.

import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string): string =>
  readFileSync(resolve(__dirname, "..", rel), "utf8").replace(/\r\n/g, "\n");

const src = read("screens.tsx");
// The LedgerScreen body only.
const ledger = src.slice(src.indexOf("export function LedgerScreen"), src.indexOf("export function SideProjectScreen"));

describe("the ledger records a real amount, not a placeholder", () => {
  test("the guard is reading the LedgerScreen body", () => {
    expect(ledger).toContain("createLedgerEntry");
    expect(ledger.length).toBeGreaterThan(400);
  });

  test("no more zero-won placeholder insert", () => {
    expect(ledger).not.toMatch(/amount_krw:\s*0\b/);
    expect(ledger).not.toMatch(/onQuickRecord/);
  });

  test("the add path passes the amount the user typed", () => {
    expect(ledger).toMatch(/amount_krw:\s*amountNum/);
    // amountNum is derived from the input, digits only.
    expect(ledger).toMatch(/const amountNum = Math\.floor\(Number\(amount\.replace/);
    // and the button is gated on a positive amount, not always-on.
    expect(ledger).toMatch(/const canAdd = !busy && amountNum > 0/);
  });

  test("there is an amount input", () => {
    expect(ledger).toMatch(/value=\{amount\}/);
    expect(ledger).toMatch(/keyboardType="number-pad"/);
  });

  test("kind (수입/지출) is selectable, not hardcoded to expense", () => {
    expect(ledger).toMatch(/setKind\("income"\)/);
    expect(ledger).toMatch(/setKind\("expense"\)/);
    expect(ledger).toMatch(/kind,\n\s+amount_krw: amountNum/);
  });

  test("a wrong row can be deleted", () => {
    expect(src).toMatch(/import \{ createLedgerEntry, deleteLedgerEntry,/);
    expect(ledger).toMatch(/deleteLedgerEntry\(userId, id\)/);
    expect(ledger).toMatch(/onPress=\{\(\) => void onDeleteEntry\(e\.id\)\}/);
  });
});
