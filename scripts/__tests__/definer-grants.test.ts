import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");
const checker = join(root, "scripts/check-definer-grants.ts");
const tsx = require.resolve("tsx/cli");
const draft = readFileSync(join(root, "db/migration-drafts/UNNUMBERED_signup_consent_admob_20260925.sql"), "utf8");
const grant = "GRANT EXECUTE ON FUNCTION public.signup_consent_contract_status() TO anon, authenticated;";
const tempPrefix = join(tmpdir(), "2ndb-definer-grants-");
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(tempPrefix);
  mkdirSync(join(fixture, "db/migrations"), { recursive: true });
});
afterEach(() => {
  // Only remove the dedicated directory this test created, never a repo path.
  if (!resolve(fixture).startsWith(resolve(tempPrefix))) throw new Error("Invalid fixture path");
  rmSync(fixture, { recursive: true, force: true });
});

function run(sql: string, laterSql?: string) {
  writeFileSync(join(fixture, "db/migrations/9998_reviewed_metadata.sql"), sql);
  if (laterSql) writeFileSync(join(fixture, "db/migrations/9999_later.sql"), laterSql);
  const result = spawnSync(process.execPath, [tsx, checker], {
    cwd: fixture, encoding: "utf8", timeout: 10000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("reviewed public signup metadata grant", () => {
  test("the actual draft passes as a temporary numbered migration", () => {
    const result = run(draft);
    expect(result.status).toBe(0);
    expect(result.output).toContain("SECURITY PASS");
  });

  test("normalizes checkout line endings without normalizing SQL literals", () => {
    expect(run(`\n${draft.replace(/\r?\n/g, "\r\n")}\n`).status).toBe(0);
  });

  test.each([
    ["PUBLIC role", grant.replace("anon, authenticated", "PUBLIC")],
    ["extra role", grant.replace("anon, authenticated", "anon, authenticated, service_role")],
    ["overload", grant.replace("status()", "status(text)")],
    ["another schema", grant.replace("public.signup_", "other.signup_")],
    ["resolver", grant.replace("signup_consent_contract_status()", "signup_consent_contract(text)")],
    ["trigger", grant.replace("signup_consent_contract_status()", "complete_verified_email_signup()")],
    ["multiple functions", grant.replace("status()", "status(), public.other_function()")],
  ])("rejects %s in the grant", (_name, replacement) => {
    expect(run(draft.replace(grant, replacement)).status).toBe(1);
  });

  test.each([
    ["body", draft.replace("SELECT revision.id,", "SELECT 'unreviewed'::text,")],
    ["write in body", draft.replace("  SELECT revision.id,", "  DELETE FROM public.users;\n  SELECT revision.id,")],
    ["return shape", draft.replace("confirmation_ready boolean", "confirmation_ready text")],
    ["search path", draft.replace("AS $status$", "SET search_path = 'public'\nAS $status$")],
    ["helper implementation", draft.replace("email-v4", "email-v5")],
    ["extra grant", `${draft}\nGRANT EXECUTE ON FUNCTION public.other_function() TO anon;`],
    ["second metadata grant", `${draft}\n${grant}`],
  ])("rejects an unreviewed %s", (_name, changed) => {
    expect(run(changed).status).toBe(1);
  });

  test("another migration cannot replace the publicly exposed body without review", () => {
    const changed = "CREATE OR REPLACE FUNCTION public.signup_consent_contract_status() " +
      "RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'unreviewed'::text $$;\n" +
      "REVOKE ALL ON FUNCTION public.other_function() FROM anon;";
    expect(run(draft, changed).status).toBe(1);
  });

  test.each([
    ["resolver reading private records", "CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text) " +
      "RETURNS TABLE(consent_version text, policy_version text, terms_version text, confirmation_eligible boolean) " +
      "LANGUAGE sql STABLE SET search_path = '' AS $body$ " +
      "SELECT 'v'::text, (SELECT body FROM public.records LIMIT 1), 't'::text, true $body$;"],
    ["resolver ALTER", "ALTER FUNCTION public.signup_consent_contract(text) SET search_path = 'public';"],
    ["quoted resolver ALTER", 'ALTER ROUTINE "public"."signup_consent_contract"(text) SECURITY INVOKER;'],
    ["unqualified resolver replacement", "CREATE OR REPLACE FUNCTION signup_consent_contract(text) RETURNS text LANGUAGE sql AS $$ SELECT 'changed'::text $$;"],
    ["trigger replacement", "CREATE OR REPLACE FUNCTION public.complete_verified_email_signup() RETURNS trigger " +
      "LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;"],
    ["trigger ALTER", "ALTER FUNCTION public.complete_verified_email_signup() SECURITY INVOKER;"],
    ["resolver drop", "DROP FUNCTION public.signup_consent_contract(text);"],
  ])("blocks later %s even without any new anonymous grant", (_name, changed) => {
    const result = run(draft, changed);
    expect(result.status).toBe(1);
    expect(result.output).toContain("unreviewed change to the public signup metadata");
  });

  const history = [
    "0086_require_email_confirmation.sql", "0148_verified_email_signup_consent_ledger.sql",
    "0149_atomic_complete_profile_signup_consent.sql", "0150_signup_consent_contract_20260902.sql",
  ];
  test("accepts the exact historical dependency definitions before the reviewed public migration", () => {
    for (const filename of history) {
      writeFileSync(join(fixture, "db/migrations", filename), readFileSync(join(root, "db/migrations", filename)));
    }
    expect(run(draft).status).toBe(0);
  });

  test("a historical filename cannot exempt a changed resolver body", () => {
    const filename = history[3];
    const changed = readFileSync(join(root, "db/migrations", filename), "utf8").replace("email-v3", "email-v5");
    writeFileSync(join(fixture, "db/migrations", filename), changed);
    expect(run(draft).status).toBe(1);
  });

  test("historical dependency SQL cannot be replayed as a later rollback migration", () => {
    expect(run(draft, readFileSync(join(root, "db/migrations", history[2]), "utf8")).status).toBe(1);
  });

  test("keeps the existing missing-revoke and ordinary anon-grant rules", () => {
    expect(run("CREATE FUNCTION public.private_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;").status).toBe(1);
    expect(run("GRANT EXECUTE ON FUNCTION public.other_function() TO anon;").status).toBe(1);
    expect(run("CREATE FUNCTION public.private_rpc() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;\n" +
      "REVOKE ALL ON FUNCTION public.private_rpc() FROM PUBLIC, anon;").status).toBe(0);
  });
});
