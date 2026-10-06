// Wiring for Q-261004-40 strict (0219, docs/design/onboarding-server-261006.md).
//
// The #2092 gates left twelve bundles of findings (design section 2). Section 6
// says how the strict design closes each one. This file is the index: one
// describe per bundle, each pinning the source fact that closes it, and naming
// where the behaviour is exercised:
//   account-first-run.test.ts   the client store against a fake 0219 server
//   state.test.ts / ttfv-gate.test.ts / ttfv-review-screen.test.ts   the screens' writes
//   db/tests/onboarding_first_run_claims_regression.sql   the SQL as the real roles
//   supabase-dry-run.yml "Race two first-run claims" / "Round-trip the 0219 ..."
// Render tests are blocked on this RN version, so the screens are read as text.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const code = (path: string) => read(path).replace(/^\s*\/\/.*$/gm, "");
const sqlCode = (path: string) => read(path).replace(/--[^\n]*/g, "");

const SHELL = "src/components/deep-space/DeepSpaceShell.tsx";
const IMPORT = "src/lib/capture/use-import-pending.ts";
const ONBOARDING = "src/app/onboarding.tsx";
const TTFV = "src/app/ttfv.tsx";
const STORE = "src/lib/onboarding/account-first-run.ts";
const STATE = "src/lib/onboarding/state.ts";
const GATE = "src/lib/onboarding/ttfv-gate.ts";
const MIGRATION = "db/migrations/0219_users_first_run_claims.sql";
const DOWN = "db/migrations/rollback/0219_down.sql";
const REGRESSION = "db/tests/onboarding_first_run_claims_regression.sql";
const WORKFLOW = ".github/workflows/supabase-dry-run.yml";

/** The body of `CREATE OR REPLACE FUNCTION public.<name>(` up to its closing `$$;`. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return "";
  const open = sql.indexOf("$$", start);
  const close = sql.indexOf("$$;", open + 2);
  return sql.slice(open, close);
}

describe("bundle 1 (CDA-01): only a server grant opens a first-run screen", () => {
  test("the home opens /onboarding or /ttfv only from the claim decision, never from marks", () => {
    const shell = code(SHELL);
    expect(shell).toContain('const firstRun = useFirstRunHomeGate(userId, gate === "ready", true);');
    expect(shell).toContain('if (firstRun === "/onboarding") return <Redirect href="/onboarding" />;');
    expect(shell).toContain('if (firstRun === "/ttfv") return <Redirect href="/ttfv" />;');
    expect(shell).not.toMatch(/useOnboardingComplete|useAutoTriggerTTFV|ttfvSeenAt|onboardingCompletedAt/);
    const store = code(STORE);
    // A route is decided only right after a claim came back granted.
    expect(store).toContain('if (await claim(s, "onboarding")) return { gate: "/onboarding", retryable: false };');
    expect(store).toContain('if (await claim(s, "ttfv")) return { gate: "/ttfv", retryable: false };');
  });

  test("the grant is one conditional UPDATE per kind (the race step proves one of two tabs wins)", () => {
    const claim = functionBody(sqlCode(MIGRATION), "claim_first_run");
    expect(claim).toMatch(/SET onboarding_claimed_at = v_now\s+WHERE u\.id = p_user_id\s+AND u\.onboarding_claimed_at IS NULL\s+AND u\.onboarding_completed_at IS NULL;\s+v_granted := FOUND;/);
    expect(claim).toMatch(/AND u\.ttfv_seen_at IS NULL\s+AND u\.ttfv_claimed_at IS NULL/);
    expect(read(WORKFLOW)).toContain("- name: Race two first-run claims for one account");
    expect(read(WORKFLOW)).toContain('if [[ "$b" != "false|held|tab-b" ]]; then');
  });
});

describe("bundle 2 (CD2-02): a failed read is a failure, not a confirmation", () => {
  test("there is no revalidation path and no confirmation counter", () => {
    const store = code(STORE);
    expect(store).not.toMatch(/revalidate|confirmedSeq|confirmations/);
    expect(store).toContain("if (!(await ensureMarks(s))) {");
  });
});

describe("bundles 3, 4 (CD2-01, CDA2-01): every answer is bound to one sign-in", () => {
  test("the sign-in is the JWT session_id, checked before and after every answer", () => {
    const store = code(STORE);
    expect(store).toContain("const sessionId = sessionIdFromAccessToken(current.access_token);");
    expect(store).toContain("if (answer.sessionId !== s.key.sessionId || !(await stillCurrent(s))) {");
    expect(store).toContain('if (!(await stillCurrent(s))) throw new Error("First-run sign-in changed during the read");');
    // A different sign-in starts with nothing cached.
    expect(store).toMatch(/if \(session && sameKey\(key, session\.key\)\) return session;\s+session = \{/);
  });

  test("both functions echo the caller's session_id", () => {
    const sql = sqlCode(MIGRATION);
    for (const name of ["claim_first_run", "finish_first_run"]) {
      const body = functionBody(sql, name);
      expect(body).toContain("NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id'");
      expect(body).toContain("'session_id', v_session");
    }
  });
});

describe("bundle 5 (CDA-02): the chance is stored before the screen opens", () => {
  test("no outbox and no resend: nothing writes the device or retries a mark", () => {
    const store = code(STORE);
    expect(store).not.toMatch(/localStorage|AsyncStorage|resend|outbox/i);
    expect(code(GATE)).not.toMatch(/localStorage|AsyncStorage|setItem/);
  });
});

describe("bundle 6 (CDA2-02, CD2-03): one request at a time, and a late grant is not followed", () => {
  test("a timeout marks the claim lapsed and the in-flight request is shared", () => {
    const store = code(STORE);
    expect(store).toContain('if (slot.state === "pending") slot.state = "lapsed";');
    expect(store).toContain("let inflight = slot.inflight;");
    expect(store).toContain("let inflight = s.reading;");
    expect(store).toContain("let inflight = s.finishing.get(flight);");
  });
});

describe("bundle 7 (CD2-04): the rollback runs alone, as one transaction", () => {
  test("no BEGIN/COMMIT in the file, a guard that refuses autocommit, and CI round-trips it", () => {
    const down = sqlCode(DOWN);
    expect(down).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(down).toContain("SET LOCAL first_run_rollback.in_one_transaction = 'yes';");
    expect(down.indexOf("must run as one transaction")).toBeLessThan(down.indexOf("DROP FUNCTION"));
    for (const fn of ["claim_first_run(uuid, text)", "finish_first_run(uuid, text, text, uuid)", "first_run_marks_json(uuid)"]) {
      expect(down).toContain(`DROP FUNCTION IF EXISTS public.${fn};`);
    }
    for (const column of ["onboarding_claimed_at", "onboarding_completed_at", "ttfv_claimed_at", "ttfv_claim_token", "ttfv_seen_at"]) {
      expect(down).toContain(`DROP COLUMN IF EXISTS ${column}`);
    }
    const workflow = read(WORKFLOW);
    expect(workflow).toContain("- name: Round-trip the 0219 first-run rollback (single transaction only)");
    expect(workflow).toContain("rollback/0219_down.sql committed the caller's open transaction (CD2-04)");
    expect(workflow).toContain('--single-transaction -f "$down"');
  });
});

describe("bundle 8 (CDA-04 = CD-02): a signed-in account never reads the device flag", () => {
  test("the device flag is answered only when there is no owner", () => {
    expect(code(STATE)).toContain("return ownerId ? account : device;");
    expect(code(IMPORT)).not.toMatch(/useOnboardingComplete|useAutoTriggerTTFV/);
  });
});

describe("bundle 9 (CDA-05): a web storage error does not stop the finish", () => {
  test("every device read and write is wrapped, and the screen leaves after the stored answer", () => {
    const state = code(STATE);
    expect(state).toMatch(/try \{\s*ls\(\)\?\.setItem\(ONBOARDING_KEY, completedAt\);\s*\} catch/);
    expect(state).toMatch(/function readLocalFlag[\s\S]*?try \{\s*return !!local\.getItem\(key\);\s*\} catch \{\s*return false;/);
    expect(code(ONBOARDING)).toContain("leaveOnboarding(destination);");
  });
});

describe("bundle 10 (CD-03): no client role can INSERT or UPDATE any first-run column", () => {
  test("the postcondition covers authenticated and anon, INSERT and UPDATE, all five columns", () => {
    const sql = sqlCode(MIGRATION);
    expect(sql).toContain("FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP");
    expect(sql).toContain("FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP");
    for (const column of ["onboarding_claimed_at", "onboarding_completed_at", "ttfv_claimed_at", "ttfv_claim_token", "ttfv_seen_at"]) {
      expect(sql).toContain(`'${column}'`);
    }
    expect(sqlCode(REGRESSION)).toContain("a client role can write a first-run column directly: % % %");
  });
});

describe("bundle 11 (CD-05): the deletion fence stops both functions", () => {
  test("the 0192 shared lock comes before the tombstone check, which comes before any write", () => {
    const sql = sqlCode(MIGRATION);
    for (const name of ["claim_first_run", "finish_first_run"]) {
      const body = functionBody(sql, name);
      const lock = body.indexOf("pg_catalog.pg_advisory_xact_lock_shared(");
      const fence = body.indexOf("FROM public.account_deletion_tombstones AS t WHERE t.user_id = p_user_id");
      const write = body.indexOf("UPDATE public.users");
      expect(lock).toBeGreaterThan(0);
      expect(body).toContain("pg_catalog.hashtextextended(p_user_id::text, 260913)");
      expect(fence).toBeGreaterThan(lock);
      expect(write).toBeGreaterThan(fence);
      expect(body).toContain("RAISE EXCEPTION 'account_deletion_in_progress' USING ERRCODE = '42501';");
    }
    const regression = read(REGRESSION);
    expect(regression).toContain("a claim passed the deletion fence");
    expect(regression).toContain("the first-run functions did not take the 0192 shared advisory lock");
  });
});

describe("bundle 12 (CDA-03): no latch decides what the welcome screen shows", () => {
  test("the screen keeps the first answer per owner and never latches on a hidden render", () => {
    const onboarding = code(ONBOARDING);
    expect(onboarding).not.toContain("carouselShown");
    expect(onboarding).toContain("const onboardingComplete = useOnboardingComplete(userId, !loading);");
    expect(onboarding).toMatch(/if \(loading \|\| onboardingComplete === null\) return <InlineLoader \/>;\s*if \(onboardingComplete === true\) return <RedirectHome \/>;/);
    const store = code(STORE);
    expect(store).toContain("const settled = answer !== null && answer.ownerId === ownerId;");
    expect(store).toContain("if (!ready || !ownerId || settled) return;");
  });
});

describe("the rest of the design", () => {
  test("the pending-import prompt reads the home's decision and never claims", () => {
    const hook = code(IMPORT);
    expect(hook).toContain("const firstRun = useFirstRunHomeGate(userId, firstRunReady);");
    expect(hook).not.toMatch(/useFirstRunHomeGate\([^)]*true\)/);
  });

  test("a failed read is decided again on the next home entry, while the home is the screen in view", () => {
    const shell = code(SHELL);
    expect(shell).toContain("retryFirstRunHomeVisit(userId);");
    expect(shell).toContain('if (next === "active" && homeFocusedRef.current) retryFirstRunHomeVisit(userId);');
  });

  test("/ttfv reports with the home's receipt; the welcome waits for its stored finish", () => {
    const ttfv = code(TTFV);
    expect(ttfv).toContain("const token = ttfvClaimToken(userId);");
    expect(ttfv).toContain("onContentReady={() => markTTFVSeen(userId, token)}");
    expect(ttfv).toContain("onContentUnavailable={() => releaseTTFVClaim(userId, token)}");
  });

  test("0219 keeps the #2092 backfill rule and bounds row_security to it", () => {
    const sql = sqlCode(MIGRATION);
    expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(sql).toMatch(/SET onboarding_claimed_at = COALESCE\(u\.onboarding_claimed_at, u\.created_at\),\s*onboarding_completed_at = u\.created_at/);
    expect(sql).toContain("EXISTS (SELECT 1 FROM public.records AS r WHERE r.user_id = u.id)");
    expect(sql).toContain("EXISTS (SELECT 1 FROM public.sources AS s WHERE s.user_id = u.id)");
    expect(sql).not.toMatch(/SET\s+ttfv_\w+\s*=\s*u\./);
    expect(sql.indexOf("SET LOCAL row_security = off;")).toBeLessThan(sql.indexOf("UPDATE public.users AS u"));
    expect(sql.indexOf("SET LOCAL row_security = on;")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_first_run\(uuid, text\), public\.finish_first_run\(uuid, text, text, uuid\) TO authenticated;\s*$/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.first_run_marks_json(uuid) FROM PUBLIC, anon, authenticated;");
    expect(read(WORKFLOW)).toContain("-f db/tests/onboarding_first_run_claims_regression.sql");
    expect(read(REGRESSION)).toContain("\\ir ../migrations/0219_users_first_run_claims.sql");
    expect(read(REGRESSION)).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });
});
