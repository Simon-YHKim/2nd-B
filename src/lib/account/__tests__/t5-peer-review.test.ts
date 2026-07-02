// Structural guard for db/migrations/0064_t5_peer_review.sql (F1: T5 peer-review
// schema + RLS + informant consent ledger). The SQL runs against real Postgres in
// supabase-dry-run CI; this test pins the safety-critical invariants so a future
// edit can't silently expose third-party PII, drop a consent requirement, or let
// the subject read a single informant's rating.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0064_t5_peer_review.sql"),
  "utf8",
);

describe("0064_t5_peer_review.sql — structure", () => {
  test("creates the three tables + enables RLS on each", () => {
    for (const t of ["peer_invitations", "informant_consents", "peer_observations"]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  test("invites store only a token HASH — never a raw email/phone", () => {
    expect(sql).toMatch(/invite_token_hash text NOT NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS peer_invitations_token_uniq/);
    // No email/phone COLUMN (a typed contact column) — comments may mention the words.
    expect(sql).not.toMatch(/(email|phone)\s+(text|citext|varchar)/i);
  });

  test("no rating can exist without an informant consent row (structural FK)", () => {
    expect(sql).toMatch(/informant_consent_id uuid NOT NULL REFERENCES informant_consents\(id\)/);
  });

  test("informant consent is mandatory and minor informants require guardian consent (decision 5)", () => {
    expect(sql).toMatch(/consent_at\s+timestamptz NOT NULL/);
    expect(sql).toMatch(/informant_consents_minor_guardian_ck[\s\S]*informant_is_minor = false OR guardian_consent_at IS NOT NULL/);
  });

  test("LLM/cross-border acks are REQUIRED true (decision 7 — synthesis crosses the border)", () => {
    expect(sql).toMatch(/informant_consents_llm_acks_ck[\s\S]*llm_processing_ack = true AND overseas_transfer_ack = true/);
  });

  test("GDPR lawful basis is recorded (decision 8)", () => {
    expect(sql).toMatch(/gdpr_lawful_basis\s+text NOT NULL DEFAULT 'consent'/);
  });

  test("SUBJECT can never read a single rating: no authenticated policy on the PII tables", () => {
    // Only peer_invitations gets authenticated policies; the two PII tables get NONE.
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON informant_consents/);
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON peer_observations/);
    // peer_invitations: subject owns select/insert/update of their own invites.
    expect(sql).toMatch(/CREATE POLICY peer_invitations_select_own[\s\S]*user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/CREATE POLICY peer_invitations_insert_own/);
  });

  test("aggregate reader is self-scoped, min-N gated (>=3), SECURITY DEFINER", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION t5_seen_aggregate\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/>= 3/); // min-N gate
  });

  test("aggregate excludes withdrawn observations, withdrawn consents, and non-accepted invites", () => {
    expect(sql).toMatch(/o\.withdrawn_at IS NULL/);
    expect(sql).toMatch(/c\.withdrawn_at IS NULL/);
    expect(sql).toMatch(/i\.status = 'accepted'/);
  });

  test("function grants: revoke anon, grant authenticated (self-scoped)", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION t5_seen_aggregate\(\) FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION t5_seen_aggregate\(\) TO authenticated/);
  });
});
