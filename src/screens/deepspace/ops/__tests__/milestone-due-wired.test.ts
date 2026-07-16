// The milestone Overdue chip was unreachable code.
//
// ops/milestones.ts shipped `target_date` and `milestoneOverdue()`, and
// MilestonesScreen rendered the chip off it:
//
//   if (milestoneOverdue(m)) return { tone: "danger", label: c.overdue };
//
// But nothing ever SET a due date: both writes passed `{ title }` only, so
// target_date stayed null forever, and milestoneOverdue() short-circuits on
// `!m.target_date` -- the chip could never fire. The model, the overdue rule and
// the chip all existed; the one missing wire was an input. A calendar picker now
// supplies it.
//
// These guards keep the wire connected. They assert the WIRING (a date reaches
// the writes), not the formatting -- regexes tolerate reflow.

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
/** Normalize CRLF: the repo checks out CRLF on Windows, and a scanner that
 *  silently matches nothing still reports PASS -- worse than no scanner. */
const read = (f: string): string => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

const src = read(join(ROOT, "src/screens/deepspace/ops/screens.tsx"));

describe("milestone due date is wired end to end", () => {
  test("the scanner is actually reading the screen (not vacuously passing)", () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain("export function MilestonesScreen()");
  });

  test("the screen still decides Overdue from milestoneOverdue()", () => {
    expect(src).toMatch(/milestoneOverdue\(m\)/);
  });

  test("create passes a target_date, so a new goal can ever be overdue", () => {
    expect(src).toMatch(/createMilestone\(\s*userId,\s*domain,\s*\{[^}]*target_date/);
  });

  test("edit passes a target_date, so a due date can be set, changed or cleared", () => {
    expect(src).toMatch(/updateMilestone\(\s*userId,\s*editing\.id,\s*\{[^}]*target_date/);
  });

  test("the date comes from a calendar picker, not free text", () => {
    expect(src).toContain("<DateField");
  });
});
