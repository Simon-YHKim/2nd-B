import { readdirSync, readFileSync } from "node:fs";
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

const drafts = readdirSync(join(ROOT, "db", "migration-drafts"))
  .filter((name) => /^UNNUMBERED_.*\.sql$/.test(name))
  .sort();

const standaloneDrafts = [
  "UNNUMBERED_oauth_naver_rate_limit_completion.sql",
  "UNNUMBERED_rss_proxy_quota.sql",
] as const;

const promoted = [
  ["0191", "signup_consent_admob_20260925"],
  ["0192", "account_deletion_completion_fence"],
  ["0193", "effective_llm_consent_current_contract"],
  ["0194", "llm_service_consent_management"],
  ["0195", "polaris_generation_allowance"],
  ["0196", "reward_ssv_hardening"],
  ["0197", "paddle_refund_consequence_integrity"],
  ["0198", "service_contract_erasure_registry"],
] as const;

const behaviorDrafts = {
  "UNNUMBERED_service_contract_erasure_registry.sql": {
    runner: read("db/migration-drafts/tests/service-contract-erasure-registry.sql"),
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "UNNUMBERED_llm_service_consent_management.sql": {
    runner: serviceConsentRegression,
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "UNNUMBERED_signup_consent_admob_20260925.sql": {
    runner: signupBootstrap,
    workflowInvocation: "node scripts/test-signup-consent-sql.mjs 5432 signup_local signup_test_ci",
  },
  "UNNUMBERED_polaris_generation_allowance.sql": {
    runner: polarisRegression,
    workflowInvocation: "node scripts/test-polaris-sql.mjs 5432 polaris_local polaris_test_ci",
  },
  "UNNUMBERED_account_deletion_completion_fence.sql": {
    runner: accountDeletionRegression,
    workflowInvocation: "-f db/tests/account_deletion_completion_fence_regression.sql",
  },
  "UNNUMBERED_paddle_refund_consequence_integrity.sql": {
    runner: workflow,
    workflowInvocation:
      "\\i db/migration-drafts/UNNUMBERED_paddle_refund_consequence_integrity.sql",
  },
  "UNNUMBERED_peer_response_rate_limit.sql": {
    runner: peerRegression,
    workflowInvocation: "-f db/tests/peer_response_rate_limit_regression.sql",
  },
  "UNNUMBERED_reward_ssv_hardening.sql": {
    runner: rewardRunner,
    runnerMigration: "0196_reward_ssv_hardening.sql",
    workflowInvocation: "run: bash scripts/check-reward-ssv-db.sh",
  },
} as const;

describe("scratch PostgreSQL coverage for inactive security drafts", () => {
  test("accounts for every unnumbered draft exactly once", () => {
    expect(drafts).toEqual(
      [...standaloneDrafts, ...Object.keys(behaviorDrafts),
        "UNNUMBERED_effective_llm_consent_current_contract.sql"].sort(),
    );
  });

  test("numbered replay uses the exact reviewed SQL from every retained draft", () => {
    const step = workflow.slice(
      workflow.indexOf("- name: Verify promoted server-first contracts"),
      workflow.indexOf("- name: Exercise the 0189 rollback round trip"),
    );
    for (const [version, stem] of promoted) {
      expect(read(`db/migrations/${version}_${stem}.sql`))
        .toBe(read(`db/migration-drafts/UNNUMBERED_${stem}.sql`));
      expect(step).toContain(`${version}:${stem}`);
    }
    expect(step).toContain("cmp -s");
    expect(step).toContain("SELECT count(*) FROM public.erasure_registry) <> 70");
    expect(step).not.toMatch(/\\i db\/migration-drafts\/UNNUMBERED_/);
  });

  test.each(standaloneDrafts)("executes and rolls back %s in the pinned workflow", (draft) => {
    const step = workflow.slice(
      workflow.indexOf("- name: Dry-run standalone security migration drafts"),
      workflow.indexOf("- name: Exercise public-data quota contract"),
    );

    expect(step).toContain(`db/migration-drafts/${draft}`);
    expect(step).toContain('for draft in "${drafts[@]}"; do');
    expect(step).toMatch(/psql -X[\s\S]*BEGIN;[\s\S]*\\i \$draft[\s\S]*ROLLBACK;/);
  });

  test("does not reapply the promoted effective-consent draft after numbered replay", () => {
    const step = workflow.slice(
      workflow.indexOf("- name: Dry-run standalone security migration drafts"),
      workflow.indexOf("- name: Exercise content-erasure RPC isolation"),
    );
    expect(step).not.toContain("UNNUMBERED_effective_llm_consent_current_contract.sql");
    expect(step).toMatch(/<<SQL\s+BEGIN;\s+\\i \$draft\s+ROLLBACK;\s+SQL/);
    expect(step).not.toMatch(/\bCOMMIT\s*;/);
  });

  test.each(Object.entries(behaviorDrafts))(
    "executes %s from its behavioral scratch lane",
    (draft, contract) => {
      const { runner, workflowInvocation } = contract;
      const migration = "runnerMigration" in contract ? contract.runnerMigration : draft;
      const escapedMigration = migration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(runner).toMatch(new RegExp(`\\\\i(?:r)?\\s+[^\\r\\n]*${escapedMigration}`));
      expect(workflow).toContain(workflowInvocation);
    },
  );

  test("seeds the Supabase auth and storage contracts used by the deletion fence", () => {
    const accountDeletionDraft = read(
      "db/migration-drafts/UNNUMBERED_account_deletion_completion_fence.sql",
    );
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
    expect(accountDeletionDraft).not.toContain("pg_catalog.coalesce(");
    const storagePolicies = accountDeletionDraft.slice(
      accountDeletionDraft.indexOf('DROP POLICY IF EXISTS "raw_clippings_owner_select"'),
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
    expect(signupBootstrap).toContain("\\ir signup_consent_admob_regression.sql");
  });
});
