import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const workflow = read(".github/workflows/supabase-dry-run.yml");
const accountDeletionRegression = read("db/tests/account_deletion_completion_fence_regression.sql");
const peerRegression = read("db/tests/peer_response_rate_limit_regression.sql");
const rewardRunner = read("scripts/check-reward-ssv-db.sh");

const drafts = readdirSync(join(ROOT, "db", "migration-drafts"))
  .filter((name) => /^UNNUMBERED_.*\.sql$/.test(name))
  .sort();

const standaloneDrafts = [
  "UNNUMBERED_effective_llm_consent_current_contract.sql",
  "UNNUMBERED_oauth_naver_rate_limit_completion.sql",
  "UNNUMBERED_rss_proxy_quota.sql",
] as const;

const behaviorDrafts = {
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
    workflowInvocation: "run: bash scripts/check-reward-ssv-db.sh",
  },
} as const;

describe("scratch PostgreSQL coverage for inactive security drafts", () => {
  test("accounts for every unnumbered draft exactly once", () => {
    expect(drafts).toEqual(
      [...standaloneDrafts, ...Object.keys(behaviorDrafts)].sort(),
    );
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

  test.each(Object.entries(behaviorDrafts))(
    "executes %s from its behavioral scratch lane",
    (draft, { runner, workflowInvocation }) => {
      const escapedDraft = draft.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(runner).toMatch(new RegExp(`\\\\i(?:r)?\\s+[^\\r\\n]*${escapedDraft}`));
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
});
