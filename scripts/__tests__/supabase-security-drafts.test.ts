import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const workflow = read(".github/workflows/supabase-dry-run.yml");
const accountDeletionRegression = read("db/tests/account_deletion_completion_fence_regression.sql");
const peerRegression = read("db/tests/peer_response_rate_limit_regression.sql");
const rewardRunner = read("scripts/check-reward-ssv-db.sh");
const polarisRegression = read("db/migration-drafts/tests/polaris-generation-contract.sql");
const signupBootstrap = read("db/tests/signup_consent_admob_bootstrap.sql");
const serviceConsentRegression = read("db/migration-drafts/tests/llm-service-consent-management-contract.sql");
const avatarSpecRegression = read("db/migration-drafts/tests/users-avatar-spec-contract.sql");

const DRAFT_DIR = "db/migration-drafts";
const MIGRATION_DIR = "db/migrations";
const listDrafts = () =>
  readdirSync(join(ROOT, DRAFT_DIR)).filter((name) => /^UNNUMBERED_.*\.sql$/.test(name)).sort();
const listNumbered = () =>
  readdirSync(join(ROOT, MIGRATION_DIR)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const sameBytes = (draft: string, numbered: string) =>
  readFileSync(join(ROOT, DRAFT_DIR, draft)).equals(readFileSync(join(ROOT, MIGRATION_DIR, numbered)));

// One copy per migration (Simon decision Q-261005-07, 2026-10-05; guideline
// §0-2 "one source"). A draft is deleted in the same change that gives it a
// number. Until then the two copies had to be byte-identical, which also kept
// "INACTIVE DRAFT" headers on migrations production had already applied.
const promoted = [
  ["0191", "signup_consent_admob_20260925"],
  ["0192", "account_deletion_completion_fence"],
  ["0193", "effective_llm_consent_current_contract"],
  ["0194", "llm_service_consent_management"],
  ["0195", "polaris_generation_allowance"],
  ["0196", "reward_ssv_hardening"],
  ["0197", "paddle_refund_consequence_integrity"],
  ["0198", "service_contract_erasure_registry"],
  ["0199", "oauth_naver_rate_limit_completion"],
  ["0200", "rss_proxy_quota"],
  ["0206", "users_avatar_spec"],
  ["0207", "users_display_name_update"],
  ["0208", "signup_consent_privacy_20260929"],
  ["0210", "polascope_consent_20260928"],
  ["0215", "consent_email_v9_20261006"],
  ["0216", "peer_response_rate_limit"],
] as const;

// The only drafts allowed beside a numbered twin, as `version:stem`. 0197 keeps
// its reviewed draft until production applies it (the Q-261005-07 exception),
// and must stay byte-identical. Delete the entry with the draft.
const RETAINED_UNTIL_APPLIED = ["0197:paddle_refund_consequence_integrity"] as const;

// Drafts that do not have a number yet, each with its behavioural lane. A new
// draft is registered here; it leaves this map in the change that numbers it.
const pendingDrafts: Record<string, { runner: string; workflowInvocation: string }> = {};

/** Violations of the one-copy rule. Pure, so the guard itself can be mutated below. */
function draftCopyViolations(
  drafts: readonly string[],
  numbered: readonly string[],
  retained: readonly string[],
  same: (draft: string, numbered: string) => boolean,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const stem = draft.replace(/^UNNUMBERED_/, "").replace(/\.sql$/, "");
    const twins = numbered.filter((name) => name.slice(5) === `${stem}.sql`);
    if (twins.length === 0) continue;
    if (twins.length > 1) {
      errors.push(`more than one numbered migration shares the draft stem ${stem}`);
      continue;
    }
    const key = `${twins[0].slice(0, 4)}:${stem}`;
    if (!retained.includes(key)) {
      errors.push(`promoted draft still present: ${draft} beside ${twins[0]}`);
      continue;
    }
    seen.add(key);
    if (!same(draft, twins[0])) errors.push(`retained draft differs from ${twins[0]}`);
  }
  for (const key of retained) {
    if (!seen.has(key)) errors.push(`stale exception ${key}: its draft is gone`);
  }
  return errors;
}

// Every migration file a behavioural lane replays, numbered or (0197) retained.
const behaviorLanes = {
  "0206_users_avatar_spec.sql": {
    runner: avatarSpecRegression,
    workflowInvocation: "-f db/migration-drafts/tests/users-avatar-spec-contract.sql",
  },
  "0198_service_contract_erasure_registry.sql": {
    runner: read("db/migration-drafts/tests/service-contract-erasure-registry.sql"),
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "0194_llm_service_consent_management.sql": {
    runner: serviceConsentRegression,
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "0210_polascope_consent_20260928.sql": {
    runner: read("db/migration-drafts/tests/polascope-consent-forward-contract.sql"),
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "0215_consent_email_v9_20261006.sql": {
    runner: read("db/migration-drafts/tests/consent-email-v9-forward-contract.sql"),
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "0191_signup_consent_admob_20260925.sql": {
    runner: signupBootstrap,
    workflowInvocation: "node scripts/test-signup-consent-sql.mjs 5432 signup_local signup_test_ci",
  },
  "0195_polaris_generation_allowance.sql": {
    runner: polarisRegression,
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "0192_account_deletion_completion_fence.sql": {
    runner: accountDeletionRegression,
    workflowInvocation: "-f db/tests/account_deletion_completion_fence_regression.sql",
  },
  "UNNUMBERED_paddle_refund_consequence_integrity.sql": {
    runner: workflow,
    workflowInvocation:
      "\\i db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql",
  },
  "0196_reward_ssv_hardening.sql": {
    runner: rewardRunner,
    workflowInvocation: "run: bash scripts/check-reward-ssv-db.sh",
  },
} as const;

describe("migration drafts: one copy per migration, and scratch PostgreSQL coverage", () => {
  test("no promoted draft sits beside its numbered migration (Q-261005-07)", () => {
    expect(draftCopyViolations(listDrafts(), listNumbered(), RETAINED_UNTIL_APPLIED, sameBytes))
      .toEqual([]);
  });

  test("the one-copy guard fails when a promoted draft comes back or the exception drifts", () => {
    const drafts = listDrafts();
    const numbered = listNumbered();
    // A deleted copy restored beside 0200.
    expect(draftCopyViolations(
      [...drafts, "UNNUMBERED_rss_proxy_quota.sql"], numbered, RETAINED_UNTIL_APPLIED, sameBytes,
    )).toEqual(["promoted draft still present: UNNUMBERED_rss_proxy_quota.sql beside 0200_rss_proxy_quota.sql"]);
    // The retained 0197 draft edited without its numbered file.
    expect(draftCopyViolations(drafts, numbered, RETAINED_UNTIL_APPLIED, () => false))
      .toEqual(["retained draft differs from 0197_paddle_refund_consequence_integrity.sql"]);
    // The 0197 draft deleted after production applies it, exception left behind.
    expect(draftCopyViolations(
      drafts.filter((name) => !name.includes("paddle_refund")), numbered, RETAINED_UNTIL_APPLIED, sameBytes,
    )).toEqual(["stale exception 0197:paddle_refund_consequence_integrity: its draft is gone"]);
    // A genuinely new draft with no number yet is allowed.
    expect(draftCopyViolations(
      [...drafts, "UNNUMBERED_reconsent_v8_20261005.sql"], numbered, RETAINED_UNTIL_APPLIED, sameBytes,
    )).toEqual([]);
  });

  test("accounts for every unnumbered draft exactly once", () => {
    const retainedDrafts = RETAINED_UNTIL_APPLIED.map((key) => `UNNUMBERED_${key.slice(5)}.sql`);
    expect(listDrafts()).toEqual([...retainedDrafts, ...Object.keys(pendingDrafts)].sort());
  });

  test("every promoted migration is numbered, and only the retained exception keeps a draft", () => {
    for (const [version, stem] of promoted) {
      expect(existsSync(join(ROOT, MIGRATION_DIR, `${version}_${stem}.sql`))).toBe(true);
      const retained = (RETAINED_UNTIL_APPLIED as readonly string[]).includes(`${version}:${stem}`);
      expect([`${version}:${stem}`, existsSync(join(ROOT, DRAFT_DIR, `UNNUMBERED_${stem}.sql`))])
        .toEqual([`${version}:${stem}`, retained]);
    }
  });

  test("no SQL fixture replays a deleted draft", () => {
    const fixtures = [
      ...readdirSync(join(ROOT, "db/tests")).map((name) => `db/tests/${name}`),
      ...readdirSync(join(ROOT, DRAFT_DIR, "tests")).map((name) => `${DRAFT_DIR}/tests/${name}`),
    ].filter((path) => path.endsWith(".sql"));
    const retainedDrafts = RETAINED_UNTIL_APPLIED.map((key) => `UNNUMBERED_${key.slice(5)}.sql`);
    const offenders = fixtures.flatMap((path) =>
      [...read(path).matchAll(/^\\i(?:r)?\s+[^\n]*?(UNNUMBERED_[a-z0-9_]+\.sql)/gm)]
        .filter((hit) => !retainedDrafts.includes(hit[1]))
        .map((hit) => `${path}: ${hit[1]}`),
    );
    expect(fixtures.length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });

  test("the numbered replay step enforces the one-copy rule before inspecting the schema", () => {
    const step = workflow.slice(
      workflow.indexOf("- name: Verify promoted server-first contracts"),
      workflow.indexOf("- name: Exercise the 0189 rollback round trip"),
    );
    expect(RETAINED_UNTIL_APPLIED).toHaveLength(1);
    expect(step).toContain(`retained_until_applied="${RETAINED_UNTIL_APPLIED[0]}"`);
    expect(step).toContain("for draft in db/migration-drafts/UNNUMBERED_*.sql; do");
    expect(step).toContain("promoted draft still present beside");
    expect(step).toContain("cmp -s");
    expect(step).toContain("drop the retained_until_applied exception");
    expect(step).toContain("SELECT count(*) FROM public.erasure_registry) <> 71");
    expect(step).toContain("('0201', 'rss_proxy_erasure_registry')");
    expect(step).not.toMatch(/\\i db\/migration-drafts\/UNNUMBERED_/);
  });

  test("pins the promoted display_name grant to its source-level contract", () => {
    const displayName = read(`${MIGRATION_DIR}/0207_users_display_name_update.sql`);
    expect(read("src/lib/supabase/__tests__/users-table-acl-migration.test.ts"))
      .toContain("0207_users_display_name_update.sql");
    expect(displayName).toMatch(/GRANT UPDATE \(display_name\) ON public\.users TO authenticated;/);
    expect(displayName).not.toMatch(/GRANT UPDATE ON public\.users/);
  });

  test("exercises the numbered Naver limiter without persisting scratch calls", () => {
    const regression = read("db/tests/oauth_naver_rate_limit_completion_regression.sql");
    expect(workflow).toContain("-f db/tests/oauth_naver_rate_limit_completion_regression.sql");
    expect(regression).toContain("global rejection allocated peer rows");
    expect(regression).toContain("rejected peer spent global quota");
    expect(regression).toContain("OAuth state was not single-use");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("exercises the numbered 0216 peer limiter without replaying its draft", () => {
    expect(workflow).toContain("-f db/tests/peer_response_rate_limit_regression.sql");
    expect(peerRegression).not.toMatch(/^\\i(?:r)?\s/m);
    expect(peerRegression).toContain("after the numbered 0216 migration");
    expect(peerRegression).toContain("hot key overflow call % was admitted");
    expect(peerRegression).toContain("request beyond the accepted aggregate cap was admitted");
    expect(peerRegression).toContain("global denial allocated a new keyed row");
    expect(peerRegression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("executes numbered RSS quota behavior without replaying its draft", () => {
    const regression = read("db/tests/rss_proxy_quota_regression.sql");
    expect(workflow).not.toContain("- name: Dry-run standalone security migration drafts");
    expect(workflow).toContain("-f db/tests/rss_proxy_quota_regression.sql");
    expect(regression).toContain("global rejection allocated a user quota row");
    expect(regression).toContain("account deletion did not cascade RSS user quota");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("exercises the numbered 2026-09-29 notice revision without replaying its draft", () => {
    const regression = read("db/tests/signup_consent_privacy_20260929_regression.sql");
    expect(workflow).toContain("-f db/tests/signup_consent_privacy_20260929_regression.sql");
    expect(regression).toContain("email-v6 is not ready");
    expect(regression).toContain("two current revisions share one document tuple");
    expect(regression).toContain("consent must stay current after a notice revision");
    expect(regression).toContain("an email-v3 receipt must not count as current");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("exercises the numbered 2026-10-05 PolaScope contract without replaying its draft", () => {
    const regression = read("db/tests/polascope_consent_20261005_regression.sql");
    const draftLane = read("db/migration-drafts/tests/polascope-consent-forward-contract.sql");
    expect(workflow).toContain("-f db/tests/polascope_consent_20261005_regression.sql");
    expect(workflow).not.toContain("-f db/migration-drafts/tests/polascope-consent-forward-contract.sql");
    expect(regression).not.toMatch(/\\i(?:r)?\s+[^\r\n]*UNNUMBERED_/);
    expect(regression).toContain("signup tuple preservation/current contract failed");
    expect(regression).toContain("email-v6 legacy confirmation/provenance changed");
    expect(draftLane).toContain("\\ir ../../tests/polascope_consent_20261005_regression.sql");
  });


  test("exercises the numbered 2026-10-06 email-v9 contract without replaying its draft", () => {
    const regression = read("db/tests/consent_email_v9_20261006_regression.sql");
    const draftLane = read("db/migration-drafts/tests/consent-email-v9-forward-contract.sql");
    expect(workflow).toContain("-f db/tests/consent_email_v9_20261006_regression.sql");
    expect(regression).not.toMatch(/\\i(?:r)?\s+[^\r\n]*UNNUMBERED_/);
    expect(regression).toContain("signup tuple preservation/current contract failed");
    expect(regression).toContain("email-v9 confirmation/provenance contract failed");
    expect(draftLane).toContain("\\ir ../../tests/consent_email_v9_20261006_regression.sql");
  });

  test.each(Object.entries(behaviorLanes))(
    "executes %s from its behavioral scratch lane",
    (migration, { runner, workflowInvocation }) => {
      const escapedMigration = migration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(runner).toMatch(new RegExp(`\\\\i(?:r)?\\s+[^\\r\\n]*${escapedMigration}`));
      expect(workflow).toContain(workflowInvocation);
    },
  );

  test("seeds the Supabase auth and storage contracts used by the deletion fence", () => {
    const accountDeletionMigration = read(`${MIGRATION_DIR}/0192_account_deletion_completion_fence.sql`);
    expect(workflow).toContain("CREATE TABLE IF NOT EXISTS auth.sessions");
    expect(workflow).toContain("CREATE TABLE IF NOT EXISTS storage.buckets");
    expect(workflow).toContain("CREATE TABLE IF NOT EXISTS storage.objects");
    expect(workflow).toContain("CREATE OR REPLACE FUNCTION storage.foldername(name text)");
    expect(workflow).toContain(
      "-f db/tests/account_deletion_completion_fence_regression.sql",
    );
    expect(workflow).toContain(
      "ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY",
    );
    expect(workflow).toContain("\\i db/migrations/0192_account_deletion_completion_fence.sql");
    expect(workflow).toContain(
      "storage.objects RLS must be enabled before account-deletion policies",
    );
    expect(accountDeletionRegression).toContain("post-fence insert succeeded");
    expect(accountDeletionRegression).toContain("post-fence update succeeded");
    expect(accountDeletionRegression).toContain(
      "deployed compatibility wrapper could not publish the deletion fence",
    );
    expect(accountDeletionRegression).toContain("pre-fence update was blocked");
    expect(accountDeletionRegression).toContain("storage.objects RLS is disabled");
    expect(accountDeletionRegression).toContain("raw-clippings policy contract is incomplete");
    expect(accountDeletionRegression).toContain("storage.foldername contract is incorrect");
    expect(accountDeletionRegression).toContain("owner delete was blocked");
    expect(accountDeletionMigration).not.toContain("pg_catalog.coalesce(");
    const storagePolicies = accountDeletionMigration.slice(
      accountDeletionMigration.indexOf('DROP POLICY IF EXISTS "raw_clippings_owner_select"'),
    );
    expect(storagePolicies).not.toContain("FROM public.users");
  });

  test("runs the signup behavior fixture against the real historical routines", () => {
    expect(workflow).toContain('"scripts/test-signup-consent-sql.mjs"');
    expect(read("scripts/test-signup-consent-sql.mjs"))
      .toContain('"db/tests/signup_consent_admob_bootstrap.sql"');
    expect(signupBootstrap).toContain("\\ir ../migrations/0148_verified_email_signup_consent_ledger.sql");
    expect(signupBootstrap).toContain("\\ir ../migrations/0149_atomic_complete_profile_signup_consent.sql");
    expect(signupBootstrap).toContain("\\ir ../migrations/0150_signup_consent_contract_20260902.sql");
    expect(signupBootstrap).toContain("\\ir ../migrations/0191_signup_consent_admob_20260925.sql");
    expect(signupBootstrap).toContain("\\ir signup_consent_admob_regression.sql");
  });
});
