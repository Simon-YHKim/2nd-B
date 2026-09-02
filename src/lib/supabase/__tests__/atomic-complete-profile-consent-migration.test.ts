// Structural guard for the server-first complete-profile transaction. Real
// PostgreSQL behavior (rollback, permissions, and two-session convergence) is
// exercised by supabase-dry-run.yml; these tests pin the public API and the
// fail-closed boundaries that a formatter or later forward migration can drift.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INTRO_SQL = readFileSync(
  join(process.cwd(), "db", "migrations", "0149_atomic_complete_profile_signup_consent.sql"),
  "utf8",
).replaceAll("\r", "");
const CONTRACT_SQL = readFileSync(
  join(process.cwd(), "db", "migrations", "0150_signup_consent_contract_20260902.sql"),
  "utf8",
).replaceAll("\r", "");
const CONTRACT_EXEC = CONTRACT_SQL.replace(/^\s*--.*$/gm, "");
const migrationDir = join(process.cwd(), "db", "migrations");
const rpcSignature =
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.complete_profile_signup_consent\s*\(/gi;
const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => {
    const sql = readFileSync(join(migrationDir, name), "utf8").replaceAll("\r", "");
    return { name, exec: sql.replace(/^\s*--.*$/gm, "") };
  });

let latestRpcMigration:
  | { name: string; exec: string; signatureMatch: RegExpMatchArray }
  | undefined;
for (const migration of [...migrations].reverse()) {
  const matches = [...migration.exec.matchAll(new RegExp(rpcSignature.source, rpcSignature.flags))];
  const signatureMatch = matches[matches.length - 1];
  if (signatureMatch) {
    latestRpcMigration = { ...migration, signatureMatch };
    break;
  }
}

if (!latestRpcMigration) throw new Error("complete-profile consent RPC migration not found");

const LATEST_EXEC = latestRpcMigration.exec;
const rpcStart = latestRpcMigration.signatureMatch.index ?? -1;
const rpcTail = LATEST_EXEC.slice(rpcStart);
const bodyMatch = rpcTail.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)/i);
const bodyMarker = bodyMatch?.[1];
const bodyStart = bodyMatch?.index === undefined ? -1 : rpcStart + bodyMatch.index;
const rpcEnd = bodyMarker
  ? LATEST_EXEC.indexOf(`${bodyMarker};`, bodyStart + bodyMarker.length)
  : -1;

if (rpcStart < 0 || bodyStart < 0 || rpcEnd < 0 || !bodyMarker) {
  throw new Error(`${latestRpcMigration.name} has an unterminated complete-profile consent RPC`);
}

const RPC = LATEST_EXEC.slice(rpcStart, rpcEnd + bodyMarker.length + 1);
const SIGNATURE = RPC.slice(0, RPC.indexOf("RETURNS jsonb"));
const CONTRACT_ACL_MUTATIONS = [
  ...CONTRACT_EXEC.matchAll(/(?:GRANT EXECUTE|REVOKE ALL)\s+ON FUNCTION[\s\S]*?;/gi),
];

describe("0149 atomic complete-profile signup consent", () => {
  test("exposes one non-overloaded PostgREST signature with only screen inputs", () => {
    expect(RPC).toMatch(
      /complete_profile_signup_consent\(\s*p_birth_date text,\s*p_locale text,\s*p_display_name text,\s*p_signup_revision text,\s*p_service_ack boolean,\s*p_llm_processing_ack boolean,\s*p_overseas_transfer_ack boolean,\s*p_sensitive_data_ack boolean,\s*p_safety_notice_ack boolean,\s*p_marketing_ack boolean\s*\)/,
    );
    expect(SIGNATURE).not.toMatch(/\bDEFAULT\b/i);
    expect(RPC).not.toMatch(/p_(?:user_id|email|age_band|minor_tier|judge_mode)/i);
    expect(RPC).not.toMatch(/p_(?:consent|policy|terms)_version/i);
  });

  test("is an authenticated server-owned JSON transaction", () => {
    expect(RPC).toMatch(/RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER/);
    expect(RPC).toContain("SET search_path = ''");
    expect(RPC).toContain("caller_id uuid := auth.uid()");
    expect(RPC).toContain("FROM auth.users AS auth_user");
    expect(RPC).toContain("signup_consent_email_unconfirmed");
    expect(RPC).toContain("signup_consent_email_missing");
  });

  test("locks auth state before the absence-covering advisory and public rows", () => {
    const lock = RPC.indexOf("pg_catalog.pg_advisory_xact_lock(");
    const authUser = RPC.indexOf("FROM auth.users AS auth_user");
    const profile = RPC.indexOf("FROM public.users AS user_profile");
    const ledger = RPC.indexOf("FROM public.consent_records AS receipt");
    expect(lock).toBeGreaterThan(-1);
    expect(authUser).toBeLessThan(lock);
    expect(lock).toBeLessThan(profile);
    expect(lock).toBeLessThan(ledger);
    expect(RPC).toMatch(/FROM auth\.users AS auth_user[\s\S]*FOR SHARE;/);
    expect(RPC).toContain("'signup-consent:' || caller_id::text");
  });

  test("keeps existing profile fields immutable and derives tier from stored DOB", () => {
    expect(RPC).toContain(
      "current_age := date_part('year', age(current_date, profile.birth_date))::int",
    );
    expect(RPC).toContain("profile.minor_tier IS DISTINCT FROM current_tier");
    expect(RPC).toContain("signup_consent_age_transition_required");
    expect(RPC).not.toMatch(/UPDATE\s+public\.users/i);
    expect(RPC).not.toMatch(/SET\s+(?:birth_date|display_name|locale|minor_tier)/i);
  });

  test("uses UI locale only for the new receipt and validates every acknowledgement", () => {
    expect(RPC).toContain("p_locale NOT IN ('en', 'ko')");
    expect(RPC).toMatch(/p_service_ack IS NOT TRUE[\s\S]*p_safety_notice_ack IS NOT TRUE/);
    expect(RPC).toContain("p_marketing_ack IS NULL");
    expect(RPC).toMatch(/p_safety_notice_ack,\s*p_locale\s*\);/);
  });

  test("recognizes only a complete canonical signup receipt", () => {
    for (const field of [
      "consent_version",
      "policy_version",
      "terms_version",
      "age_band",
      "minor_tier",
      "required_ack",
      "llm_processing_ack",
      "overseas_transfer_ack",
      "sensitive_data_ack",
      "safety_notice_ack",
      "purposes",
      "optional_consents",
      "locale",
    ]) {
      expect(RPC).toContain(`receipt.${field}`);
    }
    expect(RPC).toContain("marketing_change_requires_dedicated_flow");
    expect(RPC).toContain("signup_consent_history_conflict");
    const mismatchGuard = RPC.indexOf("IF marketing_mismatch_exists THEN");
    const exactGuard = RPC.indexOf("IF exact_receipt_exists THEN");
    expect(mismatchGuard).toBeGreaterThan(-1);
    expect(exactGuard).toBeGreaterThan(-1);
    expect(mismatchGuard).toBeLessThan(exactGuard);
  });

  test("allows only new creation, zero-row repair, or exact no-op outcomes", () => {
    for (const key of [
      "profile_created",
      "consent_created",
      "repaired",
      "already_complete",
      "judge_mode",
      "display_name",
    ]) {
      expect(RPC).toContain(`'${key}'`);
    }
    expect(RPC).toContain("repaired := NOT profile_created");
    expect(RPC).toContain("IF history_count > 0 THEN");
    expect(RPC).toContain("INSERT INTO public.consent_records");
  });

  test("keeps every helper private and leaves the dormant v1 RPC revoked", () => {
    expect(CONTRACT_EXEC).toMatch(
      /REVOKE ALL ON FUNCTION public\.signup_consent_contract\(text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(CONTRACT_EXEC).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_verified_email_signup\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(CONTRACT_EXEC).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_profile_signup_consent\([\s\S]*?\) FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(CONTRACT_EXEC).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_profile_signup_consent/i,
    );
    expect(CONTRACT_EXEC).not.toContain("complete-profile-v2");
    expect(latestRpcMigration?.name).toBe("0149_atomic_complete_profile_signup_consent.sql");
    expect(CONTRACT_EXEC).toContain("NOTIFY pgrst, 'reload schema'");

    const finalAclMutation = CONTRACT_ACL_MUTATIONS.at(-1)?.[0] ?? "";
    expect(finalAclMutation).toMatch(
      /^REVOKE ALL ON FUNCTION public\.complete_profile_signup_consent\([\s\S]*authenticated, service_role;$/i,
    );
  });

  test("never rewrites or deletes the append-only consent history", () => {
    expect(RPC).not.toMatch(/UPDATE\s+public\.consent_records/i);
    expect(RPC).not.toMatch(/DELETE\s+FROM\s+public\.consent_records/i);
  });

  test("documents a rollback order that cannot strand the trigger", () => {
    expect(INTRO_SQL).toMatch(
      /drop that RPC,[\s\S]*reapply[\s\S]*0148_verified_email_signup_consent_ledger\.sql[\s\S]*only then drop signup_consent_contract/i,
    );
  });
});
