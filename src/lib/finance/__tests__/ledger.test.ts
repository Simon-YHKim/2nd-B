const mockLedgerCalls: unknown[][] = [];
jest.mock("@/lib/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  const rec = (m: string) => (...a: unknown[]) => {
    mockLedgerCalls.push([m, ...a]);
    return builder;
  };
  for (const m of ["from", "select", "eq", "gte", "lt", "lte", "order"]) builder[m] = rec(m);
  builder.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
  return { getSupabaseClient: () => builder };
});

import { listEntriesForMonth, monthBucket, summarizeMonth } from "../ledger";

describe("monthBucket", () => {
  test("from a YYYY-MM-DD key and a Date", () => {
    expect(monthBucket("2026-06-20")).toBe("2026-06");
    expect(monthBucket(new Date(2026, 5, 1))).toBe("2026-06");
  });
});

describe("summarizeMonth (pure income/expense/net + per-category)", () => {
  const entries = [
    { occurred_on: "2026-06-01", kind: "income" as const, amount_krw: 3000000, category: "급여" },
    { occurred_on: "2026-06-03", kind: "expense" as const, amount_krw: 50000, category: "식비" },
    { occurred_on: "2026-06-10", kind: "expense" as const, amount_krw: 120000, category: "식비" },
    { occurred_on: "2026-06-12", kind: "expense" as const, amount_krw: 30000, category: "교통" },
    { occurred_on: "2026-05-30", kind: "expense" as const, amount_krw: 999999, category: "식비" }, // other month
  ];

  test("sums only the target month and computes net", () => {
    const s = summarizeMonth(entries, "2026-06");
    expect(s.income).toBe(3000000);
    expect(s.expense).toBe(200000); // 50k + 120k + 30k
    expect(s.net).toBe(2800000);
  });

  test("per-category expense totals sorted high → low", () => {
    const s = summarizeMonth(entries, "2026-06");
    expect(s.byCategory).toEqual([
      { category: "식비", total: 170000 },
      { category: "교통", total: 30000 },
    ]);
  });

  test("empty month → zeros", () => {
    const s = summarizeMonth(entries, "2026-07");
    expect(s).toEqual({ month: "2026-07", income: 0, expense: 0, net: 0, byCategory: [] });
  });

  test("income rows never appear in byCategory", () => {
    const s = summarizeMonth(entries, "2026-06");
    expect(s.byCategory.find((c) => c.category === "급여")).toBeUndefined();
  });
});

describe("listEntriesForMonth date bounds (regression: no invalid YYYY-MM-31)", () => {
  beforeEach(() => {
    mockLedgerCalls.length = 0;
  });

  test("uses an exclusive first-of-next-month upper bound, not the invalid -31 date", async () => {
    // 2026-02-31 does not exist; Postgres raises 22008 instead of clamping, so the
    // query must bound on [2026-02-01, 2026-03-01) rather than <= 2026-02-31.
    await listEntriesForMonth("u1", "2026-02");
    expect(mockLedgerCalls.find((c) => c[0] === "gte")).toEqual(["gte", "occurred_on", "2026-02-01"]);
    expect(mockLedgerCalls.find((c) => c[0] === "lt")).toEqual(["lt", "occurred_on", "2026-03-01"]);
    expect(mockLedgerCalls.some((c) => c[0] === "lte")).toBe(false);
    expect(mockLedgerCalls.some((c) => typeof c[2] === "string" && c[2].endsWith("-31"))).toBe(false);
  });

  test("rolls the year over at December", async () => {
    await listEntriesForMonth("u1", "2026-12");
    expect(mockLedgerCalls.find((c) => c[0] === "lt")).toEqual(["lt", "occurred_on", "2027-01-01"]);
  });
});
