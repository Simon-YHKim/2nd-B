// eventWhen in a negative-offset zone. All-day events are stored at UTC midnight; read with
// local getters they would land a day early in the Americas, a mistake neither Korea (+9)
// nor CI (UTC) can show. Same child-process approach as refresh-cadence.test.ts.
import { execFileSync } from "node:child_process";
import path from "node:path";

test("all-day events keep their date in New York; timed events read in local time", () => {
  const root = path.resolve(__dirname, "../../../..");
  const output = execFileSync(
    process.execPath,
    [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "fixtures", "event-when-probe.ts")],
    { cwd: root, encoding: "utf8", env: { ...process.env, TZ: "America/New_York" } },
  );
  expect(JSON.parse(output)).toEqual({
    localDateOfUtcMidnight: 1,
    allDay: "2026-10-02",
    allDaySpan: "2026-10-02~10-04",
    timed: "2026-10-02 14:00~15:30",
  });
});
