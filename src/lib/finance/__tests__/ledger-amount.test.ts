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

import { createLedgerEntry, LEDGER_AMOUNT_MAX_DIGITS, MAX_LEDGER_KRW, parseLedgerAmount } from "../ledger";

beforeEach(() => {
  mockInserts.length = 0;
});

describe("parseLedgerAmount", () => {
  test("digits only; separators dropped", () => {
    expect(parseLedgerAmount("1,234")).toEqual({ kind: "ok", value: 1234 });
    expect(parseLedgerAmount("50000")).toEqual({ kind: "ok", value: 50000 });
  });

  test("empty and zero are empty (the add button stays off)", () => {
    expect(parseLedgerAmount("")).toEqual({ kind: "empty" });
    expect(parseLedgerAmount("000")).toEqual({ kind: "empty" });
    expect(parseLedgerAmount("abc")).toEqual({ kind: "empty" });
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

  test("the input's maxLength matches the ceiling's digits", () => {
    expect(LEDGER_AMOUNT_MAX_DIGITS).toBe(13);
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

  test("in range: inserted as the exact integer", async () => {
    await createLedgerEntry("u", { kind: "expense", amount_krw: 1234, category: "x" });
    expect(mockInserts).toHaveLength(1);
    expect((mockInserts[0] as { amount_krw: number }).amount_krw).toBe(1234);
  });
});
