// R2C-16 (2026-10-05): the ledger amount had no ceiling.
//
// A 25-digit amount was sent as `amount_krw: 1e+25` and refused with HTTP 400; the
// screen said "try again" and the retry sent the same 400. Worse, 16-18 digit amounts
// (above 2^53, inside bigint) were stored silently ROUNDED: 9999999999999999 became
// 10000000000000000. Both the screen's parser and createLedgerEntry now refuse
// anything above MAX_LEDGER_KRW, so a typed amount is stored exactly or not at all.

const mockInserts: unknown[] = [];
jest.mock("@/lib/persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("@/lib/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.insert = (row: unknown) => {
    mockInserts.push(row);
    return builder;
  };
  builder.select = () => builder;
  builder.single = async () => ({
    data: { id: "1", user_id: "u", occurred_on: "2026-10-05", kind: "expense", amount_krw: 1, category: "x", created_at: "" },
    error: null,
  });
  return { getSupabaseClient: () => builder };
});

import {
  createLedgerEntry,
  LEDGER_AMOUNT_MAX_CHARS,
  LEDGER_AMOUNT_MAX_DIGITS,
  ledgerAmountEdit,
  MAX_LEDGER_KRW,
  parseLedgerAmount,
} from "../ledger";

beforeEach(() => {
  mockInserts.length = 0;
});

describe("parseLedgerAmount", () => {
  test("digits only; separators dropped", () => {
    expect(parseLedgerAmount("1,234")).toEqual({ kind: "ok", value: 1234 });
    expect(parseLedgerAmount("50000")).toEqual({ kind: "ok", value: 50000 });
  });

  // Re-aimed 2026-10-07 (gate S-02): "abc" used to be read as empty here, because every
  // non-digit was deleted first. Letters are now refused with a reason ("invalid" below);
  // only blank text and zero leave the add button off without one.
  test("empty and zero are empty (the add button stays off)", () => {
    expect(parseLedgerAmount("")).toEqual({ kind: "empty" });
    expect(parseLedgerAmount("   ")).toEqual({ kind: "empty" });
    expect(parseLedgerAmount("000")).toEqual({ kind: "empty" });
    expect(parseLedgerAmount("₩0")).toEqual({ kind: "empty" });
  });

  test("the ceiling itself is allowed", () => {
    expect(parseLedgerAmount(String(MAX_LEDGER_KRW))).toEqual({ kind: "ok", value: MAX_LEDGER_KRW });
  });

  test("one won over the ceiling is refused", () => {
    expect(parseLedgerAmount(String(MAX_LEDGER_KRW + 1))).toEqual({ kind: "tooLarge" });
  });

  test("the measured failures are refused, not sent", () => {
    expect(parseLedgerAmount("1".repeat(25))).toEqual({ kind: "tooLarge" }); // went out as 1e+25
    expect(parseLedgerAmount("9999999999999999")).toEqual({ kind: "tooLarge" }); // was stored rounded
  });

  test("leading zeros do not count toward the digit limit", () => {
    expect(parseLedgerAmount("0000000000000000012")).toEqual({ kind: "ok", value: 12 });
  });

  // Re-aimed 2026-10-05 (gate S-01 / BL-01): this used to say "the input's maxLength
  // matches the ceiling's digits". The input had maxLength 13, which counts raw
  // characters, separators included, so a pasted allowed amount was cut short BEFORE this
  // parser saw it. The digit gate stays here; the input has no maxLength any more
  // (tool-screens-contract.test.ts pins that).
  test("the parser's digit gate is the ceiling's digit count", () => {
    expect(LEDGER_AMOUNT_MAX_DIGITS).toBe(13);
  });

  test("a formatted amount at the ceiling is read whole, not 1,000x smaller", () => {
    const pasted = "1,000,000,000,000";
    // Longer than the digit count: a raw maxLength of 13 would have kept "1,000,000,000".
    expect(pasted.length).toBeGreaterThan(LEDGER_AMOUNT_MAX_DIGITS);
    expect(pasted.slice(0, LEDGER_AMOUNT_MAX_DIGITS)).toBe("1,000,000,000");
    expect(parseLedgerAmount(pasted)).toEqual({ kind: "ok", value: MAX_LEDGER_KRW });
    expect(parseLedgerAmount("₩ 999,999,999,999")).toEqual({ kind: "ok", value: 999_999_999_999 });
  });

  test("a formatted amount above the ceiling is refused, not shortened into range", () => {
    expect(parseLedgerAmount("10,000,000,000,000")).toEqual({ kind: "tooLarge" });
    expect(parseLedgerAmount("1,000,000,000,001")).toEqual({ kind: "tooLarge" });
  });
});

// Gate S-02 (2026-10-07): the parser deleted every non-digit and read what was left, so a
// typed amount was saved as a DIFFERENT positive amount. The three reproductions from the
// gate, then the rest of the same family.
describe("parseLedgerAmount takes whole won only (gate S-02)", () => {
  const INVALID = { kind: "invalid" };

  test("the gate's reproductions are refused, not turned into another amount", () => {
    expect(parseLedgerAmount("-500")).toEqual(INVALID); // was saved as 500
    expect(parseLedgerAmount("1e3")).toEqual(INVALID); // was saved as 13
    expect(parseLedgerAmount("12.34")).toEqual(INVALID); // was saved as 1234
  });

  test("signs, decimals, exponents, letters and other currencies are refused", () => {
    for (const raw of ["+500", "500-", "−500", "1.000", "12,50", "1E3", "0x10", "abc", "12abc", "$12", "12 USD", "１２０００"]) {
      expect([raw, parseLedgerAmount(raw)]).toEqual([raw, INVALID]);
    }
  });

  test("a comma counts only when it splits threes", () => {
    for (const raw of ["12,34", "1,2,3", "1,0000", ",500", "500,", "1,,000", "0,012", "12 000"]) {
      expect([raw, parseLedgerAmount(raw)]).toEqual([raw, INVALID]);
    }
    expect(parseLedgerAmount("12,345")).toEqual({ kind: "ok", value: 12345 });
    expect(parseLedgerAmount("1,234,567")).toEqual({ kind: "ok", value: 1_234_567 });
  });

  test("the won sign, 원 and the spaces around them are taken", () => {
    expect(parseLedgerAmount("₩12,000")).toEqual({ kind: "ok", value: 12000 });
    expect(parseLedgerAmount("￦ 5000")).toEqual({ kind: "ok", value: 5000 });
    expect(parseLedgerAmount("12,000원")).toEqual({ kind: "ok", value: 12000 });
    expect(parseLedgerAmount(" 3000 원 ")).toEqual({ kind: "ok", value: 3000 });
    expect(parseLedgerAmount("₩ 12,000 원")).toEqual({ kind: "ok", value: 12000 });
    // ...but each only once, and only on its own side.
    for (const raw of ["₩₩100", "100₩", "원100", "100원원"]) {
      expect([raw, parseLedgerAmount(raw)]).toEqual([raw, INVALID]);
    }
  });
});

// Gate S3-02 (2026-10-07): the amount text had no length limit, and the parser ran its
// patterns over all of it on every render.
describe("parseLedgerAmount reads at most LEDGER_AMOUNT_MAX_CHARS characters (gate S3-02)", () => {
  test("the widest amount the field takes fits well inside the limit", () => {
    const widest = "₩ 1,000,000,000,000 원";
    expect(widest.length).toBeLessThan(LEDGER_AMOUNT_MAX_CHARS);
    expect(parseLedgerAmount(widest)).toEqual({ kind: "ok", value: MAX_LEDGER_KRW });
  });

  test("text at the limit is read; one character past it is refused, whatever it says", () => {
    const atLimit = `${"0".repeat(LEDGER_AMOUNT_MAX_CHARS - 1)}1`;
    expect(parseLedgerAmount(atLimit)).toEqual({ kind: "ok", value: 1 });
    expect(parseLedgerAmount(`0${atLimit}`)).toEqual({ kind: "invalid" });
    expect(parseLedgerAmount(`${atLimit} `)).toEqual({ kind: "invalid" });
  });

  test("a huge paste is refused without being read", () => {
    expect(parseLedgerAmount("1,000".repeat(200_000))).toEqual({ kind: "invalid" });
  });
});

// Gate OPSFIX-A1-04 (2026-10-07): the field kept the first 65 characters of a long paste. The
// parser refused those, but deleting one leading 0 left 64 characters it read as another amount.
describe("ledgerAmountEdit takes no edit longer than the parser reads (gate OPSFIX-A1-04)", () => {
  /** The user's next edit: one leading character deleted, as in the gate's repro. */
  const dropFirst = (text: string): string => text.slice(1);

  test("the gate's repro: '0' x 63 + '12000' pasted, then a leading 0 deleted, is never 12 won", () => {
    const pasted = `${"0".repeat(63)}12000`;
    expect(pasted.length).toBeGreaterThan(LEDGER_AMOUNT_MAX_CHARS);
    // What the field used to do: keep 65 characters, then the delete made 12 won out of them.
    const oldHeld = pasted.slice(0, LEDGER_AMOUNT_MAX_CHARS + 1);
    expect(parseLedgerAmount(dropFirst(oldHeld))).toEqual({ kind: "ok", value: 12 });
    // Now: the paste is not taken, the empty field stays empty, and the delete has nothing to cut.
    const afterPaste = ledgerAmountEdit("", pasted);
    expect(afterPaste).toEqual({ text: "", overflow: true });
    const afterDelete = ledgerAmountEdit(afterPaste.text, dropFirst(afterPaste.text));
    expect(afterDelete).toEqual({ text: "", overflow: false });
    expect(parseLedgerAmount(afterDelete.text)).toEqual({ kind: "empty" });
  });

  test("a refused edit leaves exactly what the field held, never a piece of the paste", () => {
    for (const held of ["", "5000", "₩12,000", "abc"]) {
      for (const pasted of [`${"0".repeat(63)}12000`, `${held}${"9".repeat(LEDGER_AMOUNT_MAX_CHARS + 1)}`, "1,000".repeat(200_000)]) {
        expect(ledgerAmountEdit(held, pasted)).toEqual({ text: held, overflow: true });
      }
    }
  });

  test("typing one character past the limit is refused; at the limit it is taken", () => {
    const atLimit = `${"0".repeat(LEDGER_AMOUNT_MAX_CHARS - 1)}1`;
    expect(ledgerAmountEdit(atLimit.slice(0, -1), atLimit)).toEqual({ text: atLimit, overflow: false });
    expect(ledgerAmountEdit(atLimit, `${atLimit}2`)).toEqual({ text: atLimit, overflow: true });
  });

  test("the next edit the field takes clears the refusal and is read as typed", () => {
    const refused = ledgerAmountEdit("", `${"0".repeat(63)}12000`);
    const retyped = ledgerAmountEdit(refused.text, "12000");
    expect(retyped).toEqual({ text: "12000", overflow: false });
    expect(parseLedgerAmount(retyped.text)).toEqual({ kind: "ok", value: 12000 });
  });
});

describe("createLedgerEntry refuses an out-of-range amount before any write", () => {
  test("above the ceiling: throws and inserts nothing", async () => {
    await expect(
      createLedgerEntry("u", { kind: "expense", amount_krw: MAX_LEDGER_KRW + 1, category: "x" }),
    ).rejects.toThrow("ledger_amount_out_of_range");
    await expect(createLedgerEntry("u", { kind: "expense", amount_krw: 1e25, category: "x" })).rejects.toThrow(
      "ledger_amount_out_of_range",
    );
    expect(mockInserts).toEqual([]);
  });

  // Gate S-02 (2026-10-07): the amount used to be rounded and clamped BEFORE this check, so a
  // direct call stored 1.5 as 2 and -500 as a 0-won row.
  test("not a whole positive won: throws and inserts nothing, nothing is rounded or clamped", async () => {
    for (const amount of [1.5, 0.4, -500, 0, -0, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(createLedgerEntry("u", { kind: "expense", amount_krw: amount, category: "x" })).rejects.toThrow(
        "ledger_amount_out_of_range",
      );
    }
    expect(mockInserts).toEqual([]);
  });

  test("in range: inserted as the exact integer", async () => {
    await createLedgerEntry("u", { kind: "expense", amount_krw: 1234, category: "x" });
    expect(mockInserts).toHaveLength(1);
    expect((mockInserts[0] as { amount_krw: number }).amount_krw).toBe(1234);
  });
});
