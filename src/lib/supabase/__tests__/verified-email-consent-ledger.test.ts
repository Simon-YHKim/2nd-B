// The email-confirm path records consent inside Postgres, while auto-confirm and
// OAuth paths use consent.ts. This guard keeps those two writers on the same
// published document versions and pins the safety acknowledgement added in 0130.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../consent";

const CR = String.fromCharCode(13);
const migrationDir = join(process.cwd(), "db", "migrations");
const AUTH = readFileSync(join(process.cwd(), "src", "lib", "supabase", "auth.ts"), "utf8")
  .split(CR)
  .join("");
const matchingMigrations = readdirSync(migrationDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .filter((name) =>
    readFileSync(join(migrationDir, name), "utf8").includes(
      "CREATE OR REPLACE FUNCTION public.complete_verified_email_signup()",
    ),
  )
  .sort();
const latestMigration = matchingMigrations[matchingMigrations.length - 1];

if (!latestMigration) {
  throw new Error("verified-email consent ledger migration not found");
}

const SQL = readFileSync(join(migrationDir, latestMigration), "utf8").split(CR).join("");
const EXEC = SQL.replace(/^\s*--.*$/gm, "");
const functionStart = EXEC.indexOf("CREATE OR REPLACE FUNCTION public.complete_verified_email_signup()");
const functionEnd = EXEC.indexOf(
  "REVOKE ALL ON FUNCTION public.complete_verified_email_signup()",
  functionStart,
);

if (functionStart < 0 || functionEnd < 0) {
  throw new Error(`${latestMigration} does not replace complete_verified_email_signup()`);
}

const FUNCTION = EXEC.slice(functionStart, functionEnd);

function declaredVersion(name: string): string {
  const match = FUNCTION.match(new RegExp(`${name}\\s+constant\\s+text\\s*:=\\s*'([^']+)'`, "i"));
  if (!match?.[1]) throw new Error(`${name} is not declared in ${latestMigration}`);
  return match[1];
}

function authSignupRevision(): string {
  const match = AUTH.match(
    /export const VERIFIED_EMAIL_SIGNUP_REVISION\s*=\s*"([^"]+)"\s+as const;/,
  );
  if (!match?.[1]) throw new Error("VERIFIED_EMAIL_SIGNUP_REVISION is not declared in auth.ts");
  return match[1];
}

describe("verified-email consent ledger", () => {
  test("uses the same server-owned document versions as the client writer", () => {
    expect(declaredVersion("ledger_consent_version")).toBe(CONSENT_VERSION);
    expect(declaredVersion("ledger_policy_version")).toBe(PRIVACY_POLICY_VERSION);
    expect(declaredVersion("ledger_terms_version")).toBe(TERMS_VERSION);
  });

  test("maps only the matching client consent revision", () => {
    expect(authSignupRevision()).toBe("email-v2");
    expect(declaredVersion("ledger_signup_revision")).toBe(authSignupRevision());
    expect(AUTH).toMatch(/signup_flow:\s*VERIFIED_EMAIL_SIGNUP_REVISION/);
    expect(AUTH).toMatch(
      /signup_consent_safety_notice:\s*args\.consent\.safetyNotice/,
    );
    expect(FUNCTION).toMatch(
      /signup_meta ->> 'signup_flow' IS DISTINCT FROM ledger_signup_revision/,
    );
    expect(AUTH).toContain("if (!allRequiredAcksChecked(args.consent))");
  });

  test("never lets auth metadata choose a document version", () => {
    expect(FUNCTION).not.toMatch(/signup_(?:consent|policy|terms)_version/i);
    expect(FUNCTION).not.toContain("2026-06-02");
  });

  test("requires and records the separately collected safety notice", () => {
    expect(FUNCTION).toContain("signup_consent_safety_notice");
    expect(FUNCTION).toMatch(
      /IF NOT \(service_ack AND llm_ack AND overseas_ack AND sensitive_ack AND safety_ack\) THEN/,
    );

    const insertStart = FUNCTION.indexOf("INSERT INTO public.consent_records");
    const insert = FUNCTION.slice(insertStart);
    expect(insertStart).toBeGreaterThan(-1);
    expect(insert).toMatch(/sensitive_data_ack,\s*safety_notice_ack,\s*locale/);
    expect(insert).toMatch(/sensitive_ack,\s*safety_ack,\s*signup_locale/);
  });

  test("accepts only JSON boolean literals for acknowledgements", () => {
    const keys = [
      "signup_consent_service",
      "signup_consent_llm_processing",
      "signup_consent_overseas_transfer",
      "signup_consent_sensitive_data",
      "signup_consent_safety_notice",
      "signup_consent_marketing",
    ];

    for (const key of keys) {
      expect(FUNCTION).toMatch(
        new RegExp(`\\(signup_meta\\s*->\\s*'${key}'\\)\\s*=\\s*'true'::jsonb`),
      );
      expect(FUNCTION).not.toMatch(new RegExp(`${key}'\\)\\s*::boolean`));
    }
  });

  test("keeps the first-confirmation and exact-version idempotence guards", () => {
    expect(FUNCTION).toContain(
      "OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL",
    );
    expect(FUNCTION).toContain("consent_version = ledger_consent_version");
    expect(FUNCTION).toContain("policy_version = ledger_policy_version");
    expect(FUNCTION).toContain("terms_version = ledger_terms_version");
    expect(FUNCTION).toContain("safety_notice_ack = true");
  });

  test("writes consent only for the profile inserted by this confirmation", () => {
    expect(FUNCTION).toMatch(/WITH inserted_user AS \(\s*INSERT INTO public\.users/);
    expect(FUNCTION).toMatch(/ON CONFLICT DO NOTHING\s*RETURNING id/);
    expect(FUNCTION).toMatch(/FROM inserted_user\s*WHERE id = NEW\.id/);
    expect(FUNCTION).not.toContain(
      "WHERE EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id)",
    );
  });

  test("accepts only an exact ISO date string before casting", () => {
    expect(FUNCTION).toContain(
      "jsonb_typeof(signup_meta -> 'signup_birth_date') IS DISTINCT FROM 'string'",
    );
    expect(FUNCTION).toContain(
      "signup_meta ->> 'signup_birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
    );
  });

  test("does not rewrite the append-only historical ledger", () => {
    expect(EXEC).not.toMatch(/UPDATE\s+public\.consent_records/i);
    expect(EXEC).not.toMatch(/DELETE\s+FROM\s+public\.consent_records/i);
  });
});
