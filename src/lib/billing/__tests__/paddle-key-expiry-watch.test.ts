// PADDLE_API_KEY is the credential with the least feedback in the whole repo.
//
// It expires on a fixed date, it lives in Supabase secrets (not GitHub), Paddle
// exposes no endpoint that reports its expiry, and as of 2026-08-19 its
// dashboard "Last used" is still "-" because self-serve cancel/refund has never
// been switched on. So it is on course to expire without ever having been used,
// and the failure afterwards is a 401 inside an edge function at the exact
// moment somebody enables a feature - which reads as "the new feature is broken",
// not "the key died". Nothing about that sequence produces a signal on its own.
//
// The weekly credential check is the only signal there is, so this pins the
// three properties that make it one:
//   1. the row EXISTS. A credential nobody tracks looks exactly like a healthy
//      one; that is the silent gap the 2026-08-18 hardening found for secrets.
//   2. the date is authoritative from a repo Variable, so a rotation is one
//      command rather than a PR nobody opens mid-rotation.
//   3. an unset Variable warns but does NOT invent a wrong date - it falls back
//      to the transcribed literal, so the check keeps a real deadline.
//
// This test is deliberately about the WORKFLOW, not about billing code. It sits
// here because the credential is the billing one, and because the thing it
// protects (self-serve refund/cancel) is what the rest of this folder tests.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const wf = readFileSync(join(WORKFLOWS, "credential-expiry-check.yml"), "utf8").replace(/\r\n/g, "\n");
const edge = readFileSync(
  join(ROOT, "supabase", "functions", "subscription-manage", "index.ts"),
  "utf8",
);

describe("the weekly credential check still watches the Paddle key", () => {
  test("it runs on a schedule and can be run by hand", () => {
    expect(wf).toMatch(/schedule:\s*\n\s*- cron: "0 0 \* \* 1"/);
    expect(wf).toMatch(/workflow_dispatch:/);
  });

  test("PADDLE_API_KEY has a row at all", () => {
    // The whole point. If someone deletes this while tidying, the key goes back
    // to expiring in silence and every other assertion here is beside the point.
    expect(wf).toMatch(/record "PADDLE_API_KEY \(2nd-B subscription-manage\)"/);
  });

  test("the date goes through record(), which validates it", () => {
    // record() rejects an empty or unparseable date instead of doing arithmetic
    // on it - the 2026-08-18 fix for the "-20683일" row. A note() with a raw
    // date pasted in would bypass that.
    expect(wf).toMatch(/record \(\) \{ # label, date-string/);
    expect(wf).toMatch(/''\|\*\[!0-9\]\*\)/);
    const paddleLines = wf.split("\n").filter((l) => l.includes("PADDLE_API_KEY (2nd-B"));
    expect(paddleLines.length).toBeGreaterThan(0);
    for (const l of paddleLines) expect(l.trim().startsWith("record ")).toBe(true);
  });
});

describe("the expiry date is maintainable without a PR", () => {
  test("a repo Variable is the authoritative value", () => {
    expect(wf).toMatch(/PADDLE_EXPIRES_AT: \$\{\{ vars\.PADDLE_API_KEY_EXPIRES_AT \}\}/);
    expect(wf).toMatch(/if \[ -n "\$\{PADDLE_EXPIRES_AT:-\}" \]; then/);
    expect(wf).toMatch(/record "PADDLE_API_KEY \(2nd-B subscription-manage\)" "\$PADDLE_EXPIRES_AT"/);
  });

  test("unset warns, and says exactly how to fix it", () => {
    // A warning with no remedy in the issue body is a warning people learn to
    // scroll past.
    expect(wf).toMatch(/PADDLE_API_KEY_EXPIRES_AT \| 미설정/);
    expect(wf).toMatch(/gh variable set PADDLE_API_KEY_EXPIRES_AT --body/);
    // bump 1 = WARN, so the issue opens; bump 2 is reserved for already-expired.
    const elseBlock = wf.slice(wf.indexOf("else", wf.indexOf("PADDLE_EXPIRES_AT:-")), wf.indexOf("echo \"worst=$worst\""));
    expect(elseBlock).toMatch(/bump 1/);
    expect(elseBlock).not.toMatch(/bump 2/);
  });

  test("unset does NOT mean unknown: the transcribed date is still used", () => {
    // Reporting "확인 필요" with no date would be a false alarm about a key that
    // is fine, and false alarms are how a weekly check stops being read.
    expect(wf).toMatch(/PADDLE_TRANSCRIBED="\d{4}-\d{2}-\d{2}"/);
    expect(wf).toMatch(/record "PADDLE_API_KEY \([^"]*전사값\)" "\$PADDLE_TRANSCRIBED"/);
  });
});

describe("the key itself never comes near GitHub", () => {
  test("no workflow reads a PADDLE_API_KEY secret", () => {
    // It lives in Supabase secrets because that is where the edge function reads
    // it. Copying it here to probe liveness would widen its blast radius to
    // every workflow run, for a signal we already get from the date.
    for (const f of readdirSync(WORKFLOWS)) {
      const text = readFileSync(join(WORKFLOWS, f), "utf8");
      expect(text).not.toMatch(/secrets\.PADDLE_API_KEY/);
    }
  });

  test("the label names the real consumer, so the issue points somewhere", () => {
    expect(edge).toMatch(/Deno\.env\.get\('PADDLE_API_KEY'\)/);
    expect(wf).toContain("2nd-B subscription-manage");
  });

  test("that consumer fails closed without the key, which is why expiry is quiet", () => {
    // No crash, no alert: the feature just reports itself unavailable. That is
    // correct behaviour and exactly why the date has to be watched instead.
    expect(edge).toMatch(/const hasKey = \(Deno\.env\.get\('PADDLE_API_KEY'\) \?\? ''\)\.length > 0;/);
  });
});
