// The email-confirm path and complete-profile RPC share one frozen revision
// contract in Postgres. This guard pins every historical tuple and keeps the
// email trigger aligned with the versions rendered by the current client.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../consent";

const CR = String.fromCharCode(13);
const migrationDir = join(process.cwd(), "db", "migrations");
const AUTH = readFileSync(join(process.cwd(), "src", "lib", "supabase", "auth.ts"), "utf8")
  .split(CR)
  .join("");

// Append new revisions; never edit an existing tuple. A revision identifies
// the exact documents and consent surface shown by an already-installed client.
const FROZEN_SIGNUP_REVISION_TUPLES = {
  "email-v2": {
    consentVersion: "2026-08-16",
    policyVersion: "2026-08-30",
    termsVersion: "2026-08-16",
    confirmationEligible: true,
  },
  "complete-profile-v1": {
    consentVersion: "2026-08-16",
    policyVersion: "2026-08-30",
    termsVersion: "2026-08-16",
    confirmationEligible: false,
  },
} as const;

const migrations = readdirSync(migrationDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => {
    const sql = readFileSync(join(migrationDir, name), "utf8").split(CR).join("");
    return { name, exec: sql.replace(/^\s*--.*$/gm, "") };
  });

function lastPatternMatch(source: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  return matches[matches.length - 1];
}

function latestFunctionDefinition(label: string, signature: RegExp) {
  for (const migration of [...migrations].reverse()) {
    const signatureMatch = lastPatternMatch(migration.exec, signature);
    if (signatureMatch?.index === undefined) continue;

    const start = signatureMatch.index;
    const bodyMatch = migration.exec.slice(start).match(/\bAS\s+(\$[A-Za-z0-9_]*\$)/i);
    const bodyMarker = bodyMatch?.[1];
    const bodyStart = bodyMatch?.index === undefined ? -1 : start + bodyMatch.index;
    const closing = bodyMarker
      ? migration.exec.indexOf(`${bodyMarker};`, bodyStart + bodyMarker.length)
      : -1;
    if (!bodyMarker || bodyStart < 0 || closing < 0) {
      throw new Error(`${migration.name} has an unterminated ${label}`);
    }
    return {
      migration: migration.name,
      definition: migration.exec.slice(start, closing + bodyMarker.length + 1),
    };
  }
  throw new Error(`${label} migration not found`);
}

const CONTRACT_DEF = latestFunctionDefinition(
  "signup consent contract",
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.signup_consent_contract\s*\(\s*p_revision\s+text\s*\)/i,
);
const TRIGGER_DEF = latestFunctionDefinition(
  "verified-email signup trigger",
  /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.complete_verified_email_signup\s*\(\s*\)/i,
);
const CONTRACT = CONTRACT_DEF.definition;
const FUNCTION = TRIGGER_DEF.definition;
const EXEC = `${CONTRACT}\n${FUNCTION}`;

type FrozenRevision = keyof typeof FROZEN_SIGNUP_REVISION_TUPLES;

function allContractTuples() {
  const tuples: Record<
    string,
    {
      consentVersion: string;
      policyVersion: string;
      termsVersion: string;
      confirmationEligible: boolean;
    }
  > = {};
  const rows = CONTRACT.matchAll(
    /\('([^']+)'::text,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*(true|false)\)/gi,
  );
  for (const match of rows) {
    const revision = match[1];
    if (tuples[revision]) throw new Error(`${revision} is duplicated in ${CONTRACT_DEF.migration}`);
    tuples[revision] = {
      consentVersion: match[2],
      policyVersion: match[3],
      termsVersion: match[4],
      confirmationEligible: match[5].toLowerCase() === "true",
    };
  }
  return tuples;
}

function contractTuple(revision: FrozenRevision) {
  const tuple = allContractTuples()[revision];
  if (!tuple) throw new Error(`${revision} is not frozen in ${CONTRACT_DEF.migration}`);
  return tuple;
}

function authSignupRevision(): string {
  const match = AUTH.match(
    /export const VERIFIED_EMAIL_SIGNUP_REVISION\s*=\s*"([^"]+)"\s+as const;/,
  );
  if (!match?.[1]) throw new Error("VERIFIED_EMAIL_SIGNUP_REVISION is not declared in auth.ts");
  return match[1];
}

describe("verified-email consent ledger", () => {
  test("keeps every frozen surface tuple append-only and exact", () => {
    expect(allContractTuples()).toEqual(FROZEN_SIGNUP_REVISION_TUPLES);
  });

  test("pins only the revision emitted by today's email client to current documents", () => {
    const revision = authSignupRevision();
    if (!(revision in FROZEN_SIGNUP_REVISION_TUPLES)) {
      throw new Error(`${revision} has no frozen server contract`);
    }
    expect(contractTuple(revision as FrozenRevision)).toMatchObject({
      consentVersion: CONSENT_VERSION,
      policyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
    });
  });

  test("allows only the pinned email revision through confirmation", () => {
    expect(authSignupRevision()).toBe("email-v2");
    expect(contractTuple(authSignupRevision() as "email-v2").confirmationEligible).toBe(true);
    expect(contractTuple("complete-profile-v1").confirmationEligible).toBe(false);
    expect(AUTH).toMatch(/signup_flow:\s*VERIFIED_EMAIL_SIGNUP_REVISION/);
    expect(FUNCTION).toContain("public.signup_consent_contract(signup_meta ->> 'signup_flow')");
    expect(FUNCTION).toContain("contract.confirmation_eligible IS TRUE");
  });

  test("never lets auth metadata choose a document version", () => {
    expect(FUNCTION).not.toMatch(/signup_(?:consent|policy|terms)_version/i);
    expect(FUNCTION).not.toContain("2026-06-02");
  });

  test("requires and records every separately collected acknowledgement", () => {
    expect(AUTH).toMatch(/signup_consent_safety_notice:\s*args\.consent\.safetyNotice/);
    expect(AUTH).toContain("if (!allRequiredAcksChecked(args.consent))");
    expect(FUNCTION).toMatch(
      /IF NOT \(service_ack AND llm_ack AND overseas_ack AND sensitive_ack AND safety_ack\) THEN/,
    );

    const insertStart = FUNCTION.indexOf("INSERT INTO public.consent_records");
    const insert = FUNCTION.slice(insertStart);
    expect(insertStart).toBeGreaterThan(-1);
    expect(insert).toMatch(/sensitive_data_ack,\s*safety_notice_ack,\s*locale/);
    expect(insert).toMatch(/sensitive_ack,\s*safety_ack,\s*signup_locale/);
  });

  test("accepts only JSON boolean literals from confirmation metadata", () => {
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

  test("keeps first-confirmation and full-receipt idempotence guards", () => {
    expect(FUNCTION).toContain(
      "OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL",
    );
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
    ]) {
      expect(FUNCTION).toContain(`receipt.${field}`);
    }
  });

  test("writes consent only for the profile inserted by this confirmation", () => {
    expect(FUNCTION).toMatch(/WITH inserted_user AS \(\s*INSERT INTO public\.users/);
    expect(FUNCTION).toMatch(/ON CONFLICT DO NOTHING\s*RETURNING id/);
    expect(FUNCTION).toMatch(/FROM inserted_user\s*WHERE id = NEW\.id/);
    expect(FUNCTION).not.toContain("WHERE EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id)");
  });

  test("accepts only an exact ISO date string before casting", () => {
    expect(FUNCTION).toContain(
      "jsonb_typeof(signup_meta -> 'signup_birth_date') IS DISTINCT FROM 'string'",
    );
    expect(FUNCTION).toContain(
      "signup_meta ->> 'signup_birth_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
    );
  });

  test("serializes with the complete-profile RPC and keeps history append-only", () => {
    expect(FUNCTION).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(FUNCTION).toContain("'signup-consent:' || NEW.id::text");
    expect(EXEC).not.toMatch(/UPDATE\s+public\.consent_records/i);
    expect(EXEC).not.toMatch(/DELETE\s+FROM\s+public\.consent_records/i);
  });
});
