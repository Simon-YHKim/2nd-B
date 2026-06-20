import { domainProgress, milestoneOverdue } from "../milestones";

const NOW = new Date(2026, 5, 20); // 2026-06-20

describe("milestoneOverdue", () => {
  test("true when target_date is before today and not done", () => {
    expect(milestoneOverdue({ status: "todo", target_date: "2026-06-19" }, NOW)).toBe(true);
    expect(milestoneOverdue({ status: "doing", target_date: "2026-01-01" }, NOW)).toBe(true);
  });
  test("false when done, no date, or future date", () => {
    expect(milestoneOverdue({ status: "done", target_date: "2026-06-19" }, NOW)).toBe(false);
    expect(milestoneOverdue({ status: "todo", target_date: null }, NOW)).toBe(false);
    expect(milestoneOverdue({ status: "todo", target_date: "2026-06-20" }, NOW)).toBe(false); // today is not overdue
    expect(milestoneOverdue({ status: "todo", target_date: "2026-12-31" }, NOW)).toBe(false);
  });
});

describe("domainProgress", () => {
  test("done / total ratio", () => {
    const ms = [{ status: "done" as const }, { status: "done" as const }, { status: "todo" as const }, { status: "doing" as const }];
    expect(domainProgress(ms)).toEqual({ done: 2, total: 4, pct: 0.5 });
  });
  test("empty → zeros, no divide-by-zero", () => {
    expect(domainProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});
