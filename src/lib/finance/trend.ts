// Month-over-month spending trend (money_check grounding, B). Pure — pairs with
// finance/ledger.ts summaries. No LLM, no I/O.

export interface MonthDelta {
  /** current - previous (KRW). */
  delta: number;
  /** delta / previous in 0..; null when there is no previous baseline. */
  pct: number | null;
  direction: "up" | "down" | "flat";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** The YYYY-MM bucket immediately before `month` (YYYY-MM). */
export function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 2, 1); // m is 1-based → m-2 is previous month index
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** Compare two month totals. flat when equal. */
export function monthDelta(current: number, previous: number): MonthDelta {
  const delta = current - previous;
  const pct = previous > 0 ? delta / previous : null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { delta, pct, direction };
}
