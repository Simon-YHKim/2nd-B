import { monthBucket, summarizeMonth } from "../ledger";

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
