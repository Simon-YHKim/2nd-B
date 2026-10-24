import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
//
// The third column replaces the second copy as a witness. While each draft sat
// beside its numbered file, the dry-run workflow's `cmp` loop failed when only
// one side changed, so a quiet edit to an already-numbered migration (say the
// 0192 deletion fence) could not land alone. With one copy nothing compared the
// numbered file to anything, so the digest of the promoted bytes is pinned here
// instead (CRLF -> LF, trimmed: the same normalisation as check-definer-grants,
// whose pins for 0191/0208/0210/0215 match these). For 0191-0215 they are the
// digests of the blobs the deleted drafts shared at 5104a686. A migration
// production has applied must not change at all; write a new one. One that is
// not applied yet may be revised before its GO, and its digest moves in the same
// commit with the reason.
const promoted = [
  ["0270", "crisis_ai_hold", "c681c8ff0c7fc5f1401fc76ce5499d351635386711d0c8e4448760c4e3359c9b"],
  ["0267", "chat_turn_purpose_restore", "e7cfe580a1e2eeceeb47bceee8d65806d0585df29cd2ce7831f377a9ca165210"],
  ["0266", "chat_turn_refund_evidence", "128170bea3ffe4944dcad8c82d4554418a807074181232c7c55ea564a5194cb7"],
  ["0265", "chat_turn_attempt_with_quota", "017563cf778ba4b408f87ad1dbe21bed6e08b2331cb6de5144423560918939ef"],
  ["0263", "records_embedding_consent_guard", "ec7e9caa3c0652bcf501dfc7e70a8eada4309ebecf3c08eba95c9e9fb58b5b20"],
  ["0261", "reward_ssv_grant_helper_acl", "781b0a218086fed68ec3a89b134998a05fc044f1a9708c4088e49ca25669b039"],
  ["0236", "dashboard_generation", "a86ab9e7c03e335d0eb27b8c90f5e18b345824975e112d5ad51de57a5287d4b3"],
  ["0191", "signup_consent_admob_20260925", "6ba82c9ec8a796e99f1398398c58560b58513147119928d3ad004b31b0781648"],
  ["0192", "account_deletion_completion_fence", "d42dbfc8a3d53ada60beb589918eaa4ac78e72d49b91af2e16d2f6457187b229"],
  ["0193", "effective_llm_consent_current_contract", "579b8ca0729c337fb1cfae9a76ccb99144bc7ad12d9b078d95e3d4a286bd0e19"],
  ["0194", "llm_service_consent_management", "9d600758069d7e9f20204e90034dfaed0ff492e4f7f0aa83547df550488c63a8"],
  ["0195", "polaris_generation_allowance", "c83eb94c8e73d6cbc4ff03b1cf531564115133a0e37e9618cdb70ca47feaf67a"],
  ["0196", "reward_ssv_hardening", "7ecfba419bdf2173b78106cf51e6a7e174d9ff24226d8a8eb5c975719f4d26f1"],
  ["0197", "paddle_refund_consequence_integrity", "2df1dd033fbfff20e399ad6e82ac64c48a0726bc1661fda2587ade8c44bf4af3"],
  ["0198", "service_contract_erasure_registry", "de57a5154bcf0f4fb31a4a9f58b86079981cfa6e44968af542c5dc7099fb7b7f"],
  ["0199", "oauth_naver_rate_limit_completion", "8772906589a4732f1830ec62e130c0d2b616a96dd102ed1c0000000d5967a961"],
  ["0200", "rss_proxy_quota", "f600cf43cffd2d6f219ecd6e1f5379ea4914b7dfd395201b6a03c0f0f285dbab"],
  ["0206", "users_avatar_spec", "746474a137798ef99ab890cf9be65bf99978b7f8c9413c4010c3564dbfb3b24e"],
  ["0207", "users_display_name_update", "30b31c05acffe5ecfd840c920d10c72f3d67f550b79818ab78b4b14150b61b8f"],
  ["0208", "signup_consent_privacy_20260929", "8c7e758936650a982c60fe1f0d828db683c4252ff45124f4766ca016a495e64a"],
  ["0210", "polascope_consent_20260928", "12a40e2208601f237cbccac5a3b49043f004719e916f828078eccf388f407b9f"],
  ["0215", "consent_email_v9_20261006", "e5f38f6a6fa856729d24caf811dd2d300405a403b4129a842c6f27f2c30670e6"],
  ["0216", "peer_response_rate_limit", "7b7abc8d550ff17cc4f13457d8eec8904d4c821884dcaa892b5dbd8feb685946"],
  ["0262", "consent_email_v10_20261018", "b7debcea9593692c9aa6115072b0af5a5b86007b0743cf3fe423a05e23dd7bf5"],
] as const;

const normalizedSqlSha256 = (sql: string) =>
  createHash("sha256").update(sql.replace(/\r\n/g, "\n").trim()).digest("hex");

/** Numbered files whose bytes moved since promotion. Pure, so the check can be mutated below. */
function promotedDigestDrift(
  pins: readonly (readonly [string, string, string])[],
  readNumbered: (file: string) => string,
): string[] {
  return pins
    .map(([version, stem, digest]) => [`${version}_${stem}.sql`, digest] as const)
    .filter(([file, digest]) => normalizedSqlSha256(readNumbered(file)) !== digest)
    .map(([file]) => file);
}
const readNumberedMigration = (file: string) => read(`${MIGRATION_DIR}/${file}`);

// The only drafts allowed beside a numbered twin, as `version:stem`. 0197 keeps
// its reviewed draft until production applies it (the Q-261005-07 exception),
// and must stay byte-identical. Delete the entry with the draft.
const RETAINED_UNTIL_APPLIED = ["0197:paddle_refund_consequence_integrity"] as const;

// Drafts that do not have a number yet, each with its behavioural lane. A new
// draft is registered here; it leaves this map in the change that numbers it.
const pendingDrafts: Record<string, { runner: string; workflowInvocation: string }> = {
  "UNNUMBERED_account_export_read_grants.sql": {
    runner: "db/migration-drafts/tests/account-export-read-grants.sql",
    workflowInvocation: "psql -X -h 127.0.0.1 -U postgres -d account_export_grants_test_ci -v ON_ERROR_STOP=1 -f db/migration-drafts/tests/account-export-read-grants.sql",
  },
  "UNNUMBERED_interview_content_authority.sql": {
    runner: "scripts/test-interview-content-authority-sql.mjs",
    workflowInvocation: 'node scripts/test-interview-content-authority-sql.mjs "$LOCAL_SQL_CONTAINER" t16_authority_test_ci',
  },
  "UNNUMBERED_account_deletion_receipt_contract.sql": {
    runner: "scripts/test-deletion-receipt-sql.mjs",
    workflowInvocation: 'node scripts/test-deletion-receipt-sql.mjs "$LOCAL_SQL_CONTAINER" t04_receipt_test_ci',
  },
};

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
  "0270_crisis_ai_hold.sql": {
    runner: read("db/tests/crisis_ai_hold_regression.sql"),
    workflowInvocation: "-f db/tests/crisis_ai_hold_regression.sql",
  },
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
  "0262_consent_email_v10_20261018.sql": {
    runner: read("db/migration-drafts/tests/consent-email-v10-forward-contract.sql"),
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

  test("0265-0267 keep separate pre-install schemas and inspect the final numbered schema", () => {
    const stage = workflow.split("- name: Apply staged migrations (0147+) through Supabase CLI")[1]
      .split("- name:")[0];
    expect(stage).toContain("for boundary in 0265 0266 0267 0270 final; do");
    expect(stage).toContain('if [[ "$boundary" == final ]] || (( 10#$version < 10#$boundary )); then');
    expect(stage.indexOf("supabase db push")).toBeLessThan(stage.indexOf("CREATE DATABASE t39_t40_before_${boundary} TEMPLATE postgres"));
    expect(stage).toContain('actual_count="$(psql');
    expect(stage).toContain('expected_count="${#staged_migrations[@]}"');
    expect(stage).toContain("for name in ('0266_chat_turn_refund_evidence.sql', '0267_chat_turn_purpose_restore.sql'):");
    expect(stage).toContain("b'DO $cli_transaction$ BEGIN EXECUTE $cli_body$' + source");
    expect(stage).toContain("b'$cli_body$; END $cli_transaction$;\\n'");
    expect(stage).toContain("CLI wrapper delimiter collision");
    const admission = workflow.split("- name: Exercise dormant T39 admission on full schema clone")[1].split("- name:")[0];
    expect(admission).toContain("TEMPLATE t39_t40_before_0266");
    expect(admission.match(/-f db\/migrations\/0265_chat_turn_attempt_with_quota.sql/g)).toHaveLength(2);
    const reapply = admission.indexOf("migrations/0265_chat_turn_attempt_with_quota.sql");
    const rollback = admission.indexOf("rollback/0265_down.sql");
    expect(reapply).toBeLessThan(admission.indexOf("-f db/tests/chat-turn-attempt-with-quota.sql"));
    expect(reapply).toBeLessThan(rollback);
    expect(rollback).toBeLessThan(admission.lastIndexOf("migrations/0265_chat_turn_attempt_with_quota.sql"));
    expect(admission).toContain("--schema=public --schema=supabase_migrations");
    expect(admission.indexOf('t39_before="$(t39_snapshot)"')).toBeLessThan(reapply);
    expect(admission.indexOf('t39_after="$(t39_snapshot)"')).toBeGreaterThan(reapply);
    const compare = 'cmp <(printf \'%s\\n\' "$t39_before") <(printf \'%s\\n\' "$t39_after")';
    expect(admission).toContain(compare);
    expect(admission.indexOf(compare)).toBeGreaterThan(reapply);
    expect(admission.indexOf(compare)).toBeLessThan(rollback);
    for (const lane of ["Exercise chat turn refund on proxy evidence only", "Race two chat turn refunds over one proxy row"]) {
      expect(workflow.split(`- name: ${lane}`)[1].split("- name:")[0]).toContain("PGDATABASE: t39_t40_before_0265");
    }
    const verify = workflow.split("- name: Verify promoted server-first contracts")[1].split("- name:")[0];
    expect(verify).not.toContain("source digests");
    for (const [number, stem] of promoted.filter(([number]) => ["0265", "0266", "0267"].includes(number))) {
      expect(verify).toContain(`('${number}', '${stem}')`);
    }
    expect(verify).toContain("))) <> 16");
    expect(verify).toContain("'attempt1_delivered','attempt2_delivered','binding_closed','quota_day','purpose_restored_day'" );
    expect(verify).toContain("chat_turn_reservations_purpose_restore_day_key");
    expect(verify).toContain("NOT has_function_privilege('service_role','public.begin_chat_turn_attempt_with_quota");
  });

  test("0265-0267 rollback files retain every reviewed byte after newline normalization", () => {
    const pins = [
      ["0265", "7d980cb43f548d3c43cfd23697e04cea270cc2ee7505374ab1206e10059e05a3"],
      ["0266", "bbff4bbdbe47cc2de48c5c2a85635e60944145b60203dda281fd821dad0aadd2"],
      ["0267", "433ed7f8829ba12eceac4d3d2173c08a87a9ebc9b08fd486bd4e576727c8843f"],
    ];
    for (const [number, digest] of pins) {
      expect(createHash("sha256").update(read(`db/migrations/rollback/${number}_down.sql`)).digest("hex")).toBe(digest);
    }
  });

  test("account export grants stay on their isolated full-schema lane with rollback coverage", () => {
    const regression = read("db/migration-drafts/tests/account-export-read-grants.sql");
    const lane = workflow.slice(
      workflow.indexOf("- name: Exercise account export column grants on full schema clone"),
      workflow.indexOf("- name: Exercise records embedding consent on full schema clone"),
    );
    expect(lane).toContain("CREATE DATABASE account_export_grants_test_ci TEMPLATE postgres");
    expect(lane).toContain(pendingDrafts["UNNUMBERED_account_export_read_grants.sql"].workflowInvocation);
    expect(lane).toContain("DROP DATABASE IF EXISTS account_export_grants_test_ci");
    expect(regression).toContain("\\ir ../UNNUMBERED_account_export_read_grants.sql");
    expect(regression).toContain("\\ir ../rollback/UNNUMBERED_account_export_read_grants_down.sql");
    expect(regression).toContain("SET LOCAL ROLE service_role;");
    expect(regression).toContain("SET LOCAL ROLE authenticated;");
    expect(regression).toContain("SET LOCAL ROLE anon;");
    expect(regression).toContain("WHEN insufficient_privilege THEN RETURN");
    expect(regression).toContain("SELECT pg_temp.assert_export_acl(false);");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("account export forward and rollback touch only the approved 20 service SELECT columns", () => {
    const grants = [
      ["llm_consent_receipts", "consent_record_id, user_id, contract_revision, service_action, recorded_at"],
      ["weather_consent_state", "user_id, enabled, contract, locale, updated_at"],
      ["weather_access_events", "id, user_id, event, recipient, contract, created_at"],
      ["dashboard_generation_settings", "user_id, timezone, locale, last_active_at"],
    ];
    const statements = (sql: string) => sql.replace(/^--.*$/gm, "").replace(/\s+/g, " ").trim();
    for (const [file, verb, preposition] of [
      ["UNNUMBERED_account_export_read_grants.sql", "GRANT", "TO"],
      ["rollback/UNNUMBERED_account_export_read_grants_down.sql", "REVOKE", "FROM"],
    ]) {
      const expected = "SET LOCAL lock_timeout = '10s'; " + grants.map(([table, columns]) =>
        `${verb} SELECT (${columns}) ON public.${table} ${preposition} service_role;`,
      ).join(" ");
      expect(statements(read(`${DRAFT_DIR}/${file}`))).toBe(expected);
    }
  });

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
    for (const draft of Object.values(pendingDrafts)) {
      expect(existsSync(join(ROOT, draft.runner))).toBe(true);
      expect(workflow.split("\n").some((line) => line.trim() === draft.workflowInvocation)).toBe(true);
    }
  });

  test("numbered migrations keep the bytes they were promoted with", () => {
    expect(promotedDigestDrift(promoted, readNumberedMigration)).toEqual([]);
  });

  test("the digest pin fails when a numbered migration changes alone", () => {
    // The gate's case: a security edit to 0192 with no draft left to disagree.
    const edited = (file: string) => {
      const sql = readNumberedMigration(file);
      return file.startsWith("0192_")
        ? sql.replace("storage.objects RLS must be enabled", "storage.objects RLS may be disabled")
        : sql;
    };
    expect(readNumberedMigration("0192_account_deletion_completion_fence.sql"))
      .toContain("storage.objects RLS must be enabled");
    expect(promotedDigestDrift(promoted, edited)).toEqual(["0192_account_deletion_completion_fence.sql"]);
    // A one-line append to 0216 is caught too; line endings alone are not drift.
    expect(promotedDigestDrift(promoted, (file) =>
      file.startsWith("0216_") ? `${readNumberedMigration(file)}\nSELECT 1;` : readNumberedMigration(file),
    )).toEqual(["0216_peer_response_rate_limit.sql"]);
    expect(promotedDigestDrift(promoted, (file) => readNumberedMigration(file).replace(/\n/g, "\r\n")))
      .toEqual([]);
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
    const registered = [...retainedDrafts, ...Object.keys(pendingDrafts)];
    const allowedFiles = new Set(registered.flatMap((draft) => [
      resolve(ROOT, DRAFT_DIR, draft),
      resolve(ROOT, DRAFT_DIR, "rollback", draft.replace(/\.sql$/, "_down.sql")),
    ]).filter(existsSync));
    const offenders = fixtures.flatMap((path) =>
      [...read(path).matchAll(/^\\(ir|i)\s+([^\n]*?UNNUMBERED_[a-z0-9_]+\.sql)/gm)]
        .filter((hit) => !allowedFiles.has(resolve(ROOT, hit[1] === "ir" ? dirname(path) : ".", hit[2])))
        .map((hit) => `${path}: ${hit[2]}`),
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
    // 71 baseline rows + five from 0226 (interview sessions, transcript head and turns,
    // context-block ids, the session-start counter) + two weather tables from 0233
    // + two dashboard tables from 0237 + the import receipt from 0240 + the chat turn reservations from 0258.
    const registry = JSON.parse(read("db/erasure-registry.json"));
    expect(Object.keys(registry.tables)).toHaveLength(82);
    expect(registry.tables.profile_context_imports).toMatchObject({ owner: "user_id", class: "retained" });
    expect(registry.tables.chat_turn_reservations).toMatchObject({ owner: "user_id", class: "account_delete_only" });
    expect(step).toContain("SELECT count(*) FROM public.erasure_registry) <> 82");
    expect(step).toContain("82 registry rows, contracts and ACL verified");
    expect(step).toMatch(/WHERE table_name='chat_turn_reservations' AND owner_column='user_id'\s+AND class='account_delete_only' AND delete_order IS NULL AND cascades_from IS NULL\) <> 1/);
    expect(step).toMatch(/WHERE table_name='profile_context_imports' AND owner_column='user_id'\s+AND class='retained' AND delete_order IS NULL AND cascades_from IS NULL\) <> 1/);
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

  test("exercises numbered 0261 helper ACL without replaying the migration", () => {
    const regression = read("db/tests/reward_ssv_grant_helper_acl_regression.sql");
    expect(workflow).toContain("-f db/tests/reward_ssv_grant_helper_acl_regression.sql");
    expect(regression).not.toMatch(/^\\i(?:r)?\s/m);
    expect(regression).toContain("direct reasoning grant was allowed");
    expect(regression).toContain("direct chat grant was allowed");
    expect(regression).toContain("SET LOCAL ROLE service_role;");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("D4 cleans held rows after both immutable 0263 guards and repairs prior draft residuals", () => {
    const draft = read("db/migrations/0270_crisis_ai_hold.sql");
    const consent = read("db/migrations/0263_records_embedding_consent_guard.sql");
    const trigger = draft.match(/CREATE TRIGGER (\w+) BEFORE INSERT OR UPDATE ON public\.records\n\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_record_ai_hold_embedding\(\);/);
    expect(trigger).not.toBeNull();
    const consentNames = [...consent.matchAll(/CREATE TRIGGER (zz_records_embedding_(?:delete|write)_guard)/g)].map((match) => match[1]);
    expect([...consentNames, trigger![1]].sort()).toEqual([
      "zz_records_embedding_delete_guard", "zz_records_embedding_write_guard", trigger![1],
    ]);
    // A draft may add a narrower D4 rule, never replace or disable 0263.
    expect(draft).not.toMatch(/(?:CREATE OR REPLACE FUNCTION|ALTER FUNCTION|DROP FUNCTION) public\.(?:guard_record_embedding_(?:delete|write)|guard_records_embedding_consent|clear_record_embeddings_on_privacy_change)\(/);
    expect(draft).not.toMatch(/(?:DROP|ALTER|CREATE) TRIGGER[^;]*zz_records_embedding_(?:delete|write)_guard/);
    expect(draft).not.toMatch(/DISABLE TRIGGER|UPDATE public\.users|SET (?:LOCAL )?session_replication_role/i);
    expect(draft).toContain("WHERE (ai_hold OR interview_ai_hold OR ai_followup ->> 'zone' = 'red')");
  });

  test("D4 regression proves real consented vectors, unchanged 0263 and its complete suite after draft install", () => {
    const regression = read("db/tests/crisis_ai_hold_regression.sql");
    const apply = "\\ir ../migrations/0270_crisis_ai_hold.sql";
    expect(regression.indexOf("'fixture has three real consented vectors'")).toBeLessThan(regression.indexOf(apply));
    expect(regression).toContain("'all four 0263 functions and ACLs unchanged'");
    expect(regression).toContain("'all four 0263 trigger identities definitions and enablement unchanged'");
    expect(regression).toContain("'0263 stale NULL still restores non-held pair'");
    expect(regression).toContain("'reapply repairs already-held residual pairs'");
    expect(regression).toContain("'existing record vector search returns only ordinary row'");
    expect(regression).toContain(`BEGIN;\n${apply}\n\\ir records_embedding_consent_regression.sql`);
    expect(regression).toContain("RAISE EXCEPTION 'D4 scratch rollback left draft objects'");
  });

  test("D4 AI views project only reader columns without pinning unrelated rollback columns", () => {
    const draft = read("db/migrations/0270_crisis_ai_hold.sql");
    const projections = {
      records: "id user_id kind topic body summary structured prompt audit_period tags ai_followup created_at embedding embedding_model",
      sources: "id user_id kind title source_url storage_path frontmatter tags ingested captured_at simon_relevance",
      wiki_pages: "id user_id slug kind title body_md frontmatter tags source_id created_at updated_at embedding embedding_model",
    };
    for (const [table, columns] of Object.entries(projections)) {
      const select = draft.match(new RegExp(`CREATE OR REPLACE VIEW public\\.${table}_ai_eligible[\\s\\S]*?AS\\s+SELECT ([\\s\\S]*?)\\s+FROM public\\.${table}\\b`));
      expect(select).not.toBeNull();
      expect(select![1].split(",").map(column => column.trim().replace(/^[rsw]\./, "")))
        .toEqual(columns.split(" "));
    }
    const regression = read("db/tests/crisis_ai_hold_regression.sql");
    expect(regression).toContain("\\ir ../migrations/rollback/0218_down.sql");
    expect(regression).toContain("'0218 rollback preserves held original and empty pair'");
    expect(regression).toContain("BEGIN;\n\\ir ../migrations/0270_crisis_ai_hold.sql\n\\ir records_system_tags_regression.sql");
  });

  test("runs 0263 consent contracts and real races on an isolated full-schema clone", () => {
    const runner = read("scripts/test-records-embedding-consent-sql.mjs");
    expect(workflow).toContain('- "scripts/test-records-embedding-consent-sql.mjs"');
    expect(workflow).toContain("CREATE DATABASE embed_consent_test_ci TEMPLATE postgres");
    expect(workflow).toContain('node scripts/test-records-embedding-consent-sql.mjs "$LOCAL_SQL_CONTAINER" embed_consent_test_ci');
    expect(workflow).toContain("GRANT SELECT ON public.users TO authenticated;");
    expect(workflow).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;");
    for (const path of [
      "db/migrations/0263_records_embedding_consent_guard.sql",
      "db/tests/records_embedding_consent_regression.sql",
      "db/ops/records_embedding_cleanup_batch.sql",
    ]) {
      expect(runner).toContain(path);
      expect(existsSync(join(ROOT, path))).toBe(true);
    }
    expect(runner).toContain("supabase_migrations.schema_migrations ORDER BY version");
    expect(runner).toContain("pg_catalog.pg_stat_activity");
    expect(runner).toContain("wait_event_type='Lock'");
    expect(runner).toContain("[0, 1000, 10000, 100000]");
    expect(runner).toContain("assert.equal(guardCalls, 0");
    expect(runner).toContain("--no-password");
    expect(runner).toContain("npipe:////./pipe/docker_engine");
    expect(runner).toContain("unix:///var/run/docker.sock");
    expect(existsSync(join(ROOT, "db/migrations/rollback/0263_down.sql"))).toBe(false);
    expect(runner).toContain("IF current_database() !~ '^embed_consent_test_[a-z0-9_]+$'");
    expect(runner).toContain("disposable embedding test database required");
    expect(runner).toContain("embed_stale_full_true");
    expect(runner).toContain("embed_stale_cas");
    expect(runner).toContain("embed_delete_off_to_on");
    expect(runner).toContain("assert.equal(deleteGuardCalls, count");
    expect(runner).toContain("DROP TRIGGER zz_records_embedding_delete_guard ON public.records;");
    expect(runner).toContain("DROP FUNCTION public.guard_record_embedding_delete();");
  });

  test("cleanup checks all four trigger bindings exactly as the 0263 installer before selecting users", () => {
    const installation = read("db/migrations/0263_records_embedding_consent_guard.sql");
    const cleanup = read("db/ops/records_embedding_cleanup_batch.sql");
    const bindingCheck = /IF NOT EXISTS \(\n       SELECT 1 FROM pg_catalog\.pg_trigger[\s\S]+?\) THEN/;
    const expected = installation.match(bindingCheck)?.[0];
    expect(expected).toBeDefined();
    expect(cleanup.match(bindingCheck)?.[0]).toBe(expected);
    expect(cleanup.indexOf(expected!)).toBeLessThan(cleanup.indexOf("SELECT u.id INTO v_user"));
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

  test("exercises the numbered 2026-10-18 email-v10 contract and keeps it in the polaris lane", () => {
    const regression = read("db/tests/consent_email_v10_20261018_regression.sql");
    const forwardLane = read("db/migration-drafts/tests/consent-email-v10-forward-contract.sql");
    const serviceLane = read("db/migration-drafts/tests/llm-service-consent-management-contract.sql");
    expect(workflow).toContain("-f db/tests/consent_email_v10_20261018_regression.sql");
    expect(regression).not.toMatch(/\\i(?:r)?\s+[^\r\n]*UNNUMBERED_/);
    expect(regression).toContain("email-v10 signup tuple preservation/current contract failed");
    expect(regression).toContain("email-v10 confirmation/provenance contract failed");
    expect(regression).toContain("email-v9 confirmation/provenance changed after email-v10");
    expect(forwardLane).toContain("\\ir ../../migrations/0262_consent_email_v10_20261018.sql");
    expect(forwardLane).toContain("\\ir ../../tests/consent_email_v10_20261018_regression.sql");
    // The v10 forward contract runs after the v9 one, on the same fixture.
    expect(serviceLane.indexOf("\\ir consent-email-v10-forward-contract.sql"))
      .toBeGreaterThan(serviceLane.indexOf("\\ir consent-email-v9-forward-contract.sql"));
  });

  test("exercises the numbered 0219 first-run claims, their race and their rollback", () => {
    // 0219 (Q-261004-40 strict) was written as a numbered file with no draft.
    // Its regression replays it on fixtures; two more steps race two sessions for
    // one grant and round-trip the single-transaction-only rollback.
    const regression = read("db/tests/onboarding_first_run_claims_regression.sql");
    expect(existsSync(join(ROOT, DRAFT_DIR, "UNNUMBERED_users_first_run_claims.sql"))).toBe(false);
    expect(workflow).toContain("-f db/tests/onboarding_first_run_claims_regression.sql");
    expect(workflow).toContain("- name: Race two first-run claims for one account");
    expect(workflow).toContain("- name: Round-trip the 0219 first-run rollback (single transaction only)");
    expect(regression).toContain("\\ir ../migrations/0219_users_first_run_claims.sql");
    expect(regression).toContain("a second welcome claim was granted");
    expect(regression).toContain("a stale receipt released the grant");
    expect(regression).toContain("a claim passed the deletion fence");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test.each(Object.entries(behaviorLanes))(
    "executes %s from its behavioral scratch lane",
    (migration, { runner, workflowInvocation }) => {
      const escapedMigration = migration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(runner).toMatch(new RegExp(`\\\\i(?:r)?\\s+[^\\r\\n]*${escapedMigration}`));
      expect(workflow).toContain(workflowInvocation);
    },
  );

  test("exercises the numbered 0225 interview transcript ledger without replaying it", () => {
    const regression = read("db/tests/interview_transcript_ledger_regression.sql");
    expect(workflow).toContain("-f db/tests/interview_transcript_ledger_regression.sql");
    expect(regression).not.toMatch(/^\\i(?:r)?\s/m);
    expect(regression).toContain("an authenticated caller wrote a verdict row");
    expect(regression).toContain("ledger rows do not equal user turns");
    expect(regression).toContain("a second commit added again");
    expect(regression).toContain("discard did not erase exactly the session audit hashes");
    expect(regression).toContain("R2 D6-01: commit revived a folded session");
    expect(regression).toContain("R2 D6-03: unseen turn appended after session close");
    expect(regression).toContain("R2 D6-04: account cascade kept verdict/refused audit hashes");
    expect(regression).toContain("R2 D6-51: snapshot returned hold evidence");
    expect(regression).toContain("R2 D6-53: late context writer restored a deleted record id");
    expect(regression).toContain("account deletion left owned interview rows behind");
    expect(regression).toMatch(/^BEGIN;[\s\S]*ROLLBACK;\s*$/m);
  });

  test("0225 fails closed without cron and rollback stops outside a transaction (R2 D6-06/08)", () => {
    const migration = read("db/migrations/0225_interview_transcript_ledger.sql");
    const rollback = read("db/migrations/rollback/0225_down.sql");
    expect(migration).toContain("current_setting('app.allow_missing_pg_cron', true) IS DISTINCT FROM 'on'");
    expect(migration).toContain("RAISE EXCEPTION '0225: pg_cron required;");
    expect(workflow).toContain("ALTER DATABASE postgres SET app.allow_missing_pg_cron = 'on'");
    expect(rollback).toMatch(/^\\set ON_ERROR_STOP on\r?\n/);
    const firstSql = rollback.replace(/^--.*$/gm, "").replace(/^\\set .*$/gm, "").trimStart();
    expect(firstSql).toMatch(/^LOCK TABLE public\.interview_sessions/);
  });

  test("0225 adds only the record hold predicate to both 0218 Polaris bodies and keeps it on rollback", () => {
    const baseline = read("db/migrations/0218_records_system_tags.sql");
    const migration = read("db/migrations/0225_interview_transcript_ledger.sql");
    const rollback = read("db/migrations/rollback/0225_down.sql");
    for (const name of ["reserve_polaris_generation", "polaris_evidence_snapshot"]) {
      const definition = (sql: string) => {
        const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
        expect(start).toBeGreaterThanOrEqual(0);
        return sql.slice(start, sql.indexOf("END $$;", start) + "END $$;".length).replace(/\r\n/g, "\n");
      };
      const before = definition(baseline);
      const after = definition(migration);
      const hold = name === "reserve_polaris_generation" ? "interview_ai_hold" : "r.interview_ai_hold";
      expect(after).toContain(`      AND NOT ${hold}\n`);
      expect(after.replace(`      AND NOT ${hold}\n`, "")).toBe(before);
      expect(definition(rollback)).toBe(after);
    }
  });

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
