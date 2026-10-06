// /career is bound to the signed-in account (gate CDA-05, Q-261004-39 Q5,
// 2026-10-07). The screen kept its rows across an account switch, and a late
// answer for the previous account could land in the next account's timeline.
// Render tests are not run in this repo (RN 0.85), so this pins the source
// contract the people screen uses for the same problem (people-error-state.test.ts):
// an outer screen that owns the auth gate, one body per account keyed by the
// account id, and a latest-wins guard on every answer.
import fs from "node:fs";
import path from "node:path";

const SRC = fs
  .readFileSync(path.resolve(__dirname, "..", "career.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const BODY_START = SRC.indexOf("function CareerTimelineBody");
const SCREEN = SRC.slice(SRC.indexOf("export default function CareerTimelineScreen"), BODY_START);
const BODY = SRC.slice(BODY_START, SRC.indexOf("const styles = StyleSheet.create"));

describe("/career keeps one account's rows on screen", () => {
  test("an account switch remounts the whole owner-bound state tree", () => {
    expect(BODY_START).toBeGreaterThan(-1);
    expect(SCREEN).toContain("<CareerTimelineBody key={userId} userId={userId} />");
    const loadingGate = SCREEN.indexOf("if (loading)");
    const authGate = SCREEN.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const body = SCREEN.indexOf("<CareerTimelineBody key={userId}");
    expect(loadingGate).toBeGreaterThan(-1);
    expect(loadingGate).toBeLessThan(authGate);
    expect(authGate).toBeLessThan(body);
    // The rows live in the body only, and the body never reads the account itself.
    expect(SCREEN).not.toContain("useState");
    expect(BODY).not.toContain("useAuth(");
    expect(BODY).toContain("listCareerRecords(userId)");
  });

  test("every answer passes the latest-wins guard, and unmount retires the guard", () => {
    expect(BODY).toContain("useRef(createLatestWins())");
    expect(BODY).toContain("const token = loadGuardRef.current.begin();");
    // Both the success and the failure path check the token before touching state.
    expect(BODY.match(/if \(loadGuardRef\.current\.isStale\(token\)\) return;/g)).toHaveLength(2);
    const then = BODY.indexOf(".then((r) => {");
    const setRows = BODY.indexOf("setRows(r);");
    expect(BODY.indexOf("isStale(token)", then)).toBeLessThan(setRows);
    expect(BODY).toMatch(/return \(\) => \{\s+guard\.begin\(\);\s+\};/);
  });
});
