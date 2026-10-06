// Wiring for Q-261004-40 (0219): the hooks read the owner's server marks only
// once the session is ready, the screens pass the owner, and the migration, its
// rollback and its scratch-PostgreSQL lane stay together. Render tests are
// blocked on this RN version, so React's hooks are replaced with a deterministic
// harness, as in coachmarks-gate.test.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockGetSupabaseClient = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: mockGetSupabaseClient }));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useEffect: jest.fn(),
  useState: jest.fn(),
  useSyncExternalStore: jest.fn(),
}));

import { useEffect, useState, useSyncExternalStore } from "react";

import { __resetAccountFirstRunForTests, type AccountFirstRunSnapshot } from "../account-first-run";
import { useOnboardingComplete } from "../state";
import { useAutoTriggerTTFV } from "../ttfv-gate";

const ROOT = join(__dirname, "../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const A = "a0219000-0000-4000-8000-00000000000a";
const OLD = "2026-01-01T00:00:00+00:00";

function harness(device: unknown, snapshot: AccountFirstRunSnapshot) {
  const effects: Array<() => void | (() => void)> = [];
  // The first useState of each hook is the device value; any later one starts
  // from its initializer (the TTFV gate's mount-time confirmation count).
  let states = 0;
  (useState as jest.Mock).mockImplementation((initial: unknown) => {
    states += 1;
    if (states === 1) return [device, () => undefined];
    return [typeof initial === "function" ? (initial as () => unknown)() : initial, () => undefined];
  });
  (useEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => { effects.push(effect); });
  (useSyncExternalStore as jest.Mock).mockImplementation(() => snapshot);
  return { runEffects: () => effects.forEach((effect) => effect()) };
}

function serverReads(): string[] {
  const reads: string[] = [];
  mockGetSupabaseClient.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: (_column: string, owner: string) => ({
          maybeSingle: () => {
            reads.push(owner);
            return Promise.resolve({ data: { onboarding_completed_at: OLD, ttfv_seen_at: null }, error: null });
          },
        }),
      }),
    }),
  });
  return reads;
}

beforeEach(() => {
  __resetAccountFirstRunForTests();
  mockGetSupabaseClient.mockReset();
});

describe("first-run hooks", () => {
  const server: AccountFirstRunSnapshot = { userId: A, status: "server", confirmedSeq: 1, onboardingCompletedAt: OLD, ttfvSeenAt: null };

  test("before the session is ready nothing is read and the gate waits", () => {
    const reads = serverReads();
    const h = harness(false, server);
    expect(useOnboardingComplete(A, false)).toBeNull();
    h.runEffects();
    expect(reads).toEqual([]);
  });

  test("ready: the owner's server mark decides, not the empty device (W-12)", () => {
    const reads = serverReads();
    const h = harness(false, server);
    expect(useOnboardingComplete(A, true)).toBe(true);
    h.runEffects();
    expect(reads).toEqual([A]);
  });

  test("ready: an existing account is not sent to /ttfv from an empty device", () => {
    serverReads();
    harness({ seen: false, completedAt: new Date().toISOString() }, server);
    expect(useAutoTriggerTTFV(A, true)).toBe(false);
  });

  test("ready: a first-day send from the server waits for an answer newer than the screen (CDA-01)", () => {
    serverReads();
    const firstDay = { ...server, onboardingCompletedAt: new Date().toISOString() };
    harness({ seen: false, completedAt: null }, { ...firstDay, confirmedSeq: 0 });
    expect(useAutoTriggerTTFV(A, true)).toBeNull();
    harness({ seen: false, completedAt: null }, { ...firstDay, confirmedSeq: 1 });
    expect(useAutoTriggerTTFV(A, true)).toBe(true);
  });

  test("signed out: the device value, and no server read", () => {
    const reads = serverReads();
    const h = harness(true, { userId: null, status: "idle", confirmedSeq: 0, onboardingCompletedAt: null, ttfvSeenAt: null });
    expect(useOnboardingComplete(null, true)).toBe(true);
    h.runEffects();
    expect(reads).toEqual([]);
  });
});

describe("screens pass the owner and wait for the restored session", () => {
  test("home shell and the pending-import prompt gate on the same readiness", () => {
    for (const path of ["src/components/deep-space/DeepSpaceShell.tsx", "src/lib/capture/use-import-pending.ts"]) {
      const src = read(path);
      expect(src).toContain("const firstRunReady = !loading && hasProfile === true;");
      expect(src).toContain("useOnboardingComplete(userId, firstRunReady)");
      expect(src).toContain("useAutoTriggerTTFV(userId, firstRunReady)");
    }
  });

  test("finishing the welcome does not swap the closing slide for a redirect", () => {
    const src = read("src/app/onboarding.tsx");
    expect(src).toContain("if (onboardingComplete === false && !carouselShown) setCarouselShown(true);");
    expect(src).toContain("if (onboardingComplete === true && !carouselShown) return <RedirectHome />;");
  });

  test("the welcome and the first-day review write the account mark", () => {
    expect(read("src/app/onboarding.tsx")).toContain("markOnboardingComplete(userId);");
    expect(read("src/app/ttfv.tsx")).toContain("onContentReady={() => markTTFVSeen(userId)}");
  });
});

describe("migration 0219 travels with its rollback and scratch lane", () => {
  const sql = read("db/migrations/0219_users_first_run_marks.sql");
  const code = sql.replace(/--[^\n]*/g, "");

  test("only the owner RPCs write the marks; anon and PUBLIC cannot call them", () => {
    expect(code).not.toMatch(/GRANT\s+(UPDATE|INSERT)\s*\([^)]*(onboarding_completed_at|ttfv_seen_at)/i);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.mark_onboarding_completed\(uuid\) FROM PUBLIC, anon;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.mark_ttfv_seen\(uuid\) FROM PUBLIC, anon;/);
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.mark_onboarding_completed\(uuid\), public\.mark_ttfv_seen\(uuid\) TO authenticated;\s*$/,
    );
    expect(code.match(/auth\.uid\(\) IS NULL OR auth\.uid\(\) IS DISTINCT FROM p_user_id/g)).toHaveLength(2);
    expect(code.match(/SET search_path = ''/g)).toHaveLength(2);
    expect(code).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/m);
  });

  test("the backfill marks only accounts with evidence, with created_at, and leaves RLS on after", () => {
    expect(code).toContain("SET onboarding_completed_at = u.created_at");
    expect(code).toContain("WHERE u.onboarding_completed_at IS NULL");
    expect(code).toContain("EXISTS (SELECT 1 FROM public.records AS r WHERE r.user_id = u.id)");
    expect(code).toContain("EXISTS (SELECT 1 FROM public.sources AS s WHERE s.user_id = u.id)");
    expect(code).not.toMatch(/SET\s+ttfv_seen_at\s*=\s*u\./);
    expect(code.indexOf("SET LOCAL row_security = off;")).toBeLessThan(code.indexOf("SET onboarding_completed_at = u.created_at"));
    expect(code.indexOf("SET LOCAL row_security = on;")).toBeGreaterThan(code.indexOf("SET onboarding_completed_at = u.created_at"));
  });

  test("the rollback drops both RPCs and both columns, and CI replays the regression", () => {
    const down = read("db/migrations/rollback/0219_down.sql");
    expect(down).toContain("DROP FUNCTION IF EXISTS public.mark_onboarding_completed(uuid);");
    expect(down).toContain("DROP FUNCTION IF EXISTS public.mark_ttfv_seen(uuid);");
    expect(down).toMatch(/DROP COLUMN IF EXISTS onboarding_completed_at,\s*DROP COLUMN IF EXISTS ttfv_seen_at;/);
    // CD-04: one transaction, so a failed or timed-out ALTER keeps the RPCs too.
    const downCode = down.replace(/--[^\n]*/g, "");
    expect(downCode).toMatch(/^BEGIN;\s*SET LOCAL lock_timeout = '10s';/m);
    expect(downCode.indexOf("BEGIN;")).toBeLessThan(downCode.indexOf("DROP FUNCTION"));
    expect(downCode.trimEnd().endsWith("DROP COLUMN IF EXISTS ttfv_seen_at;\n\nCOMMIT;")).toBe(true);
    expect(read(".github/workflows/supabase-dry-run.yml"))
      .toContain("-f db/tests/onboarding_first_run_regression.sql");
    const regression = read("db/tests/onboarding_first_run_regression.sql");
    expect(regression).toContain("\\ir ../migrations/0219_users_first_run_marks.sql");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
    for (const failure of [
      "account without evidence was marked complete",
      "backfill moved an existing completion mark",
      "marked another account complete",
      "a direct client write of onboarding_completed_at was allowed",
      "a second completion moved the first one",
      "anon executed mark_ttfv_seen",
    ]) expect(regression).toContain(failure);
  });
});
