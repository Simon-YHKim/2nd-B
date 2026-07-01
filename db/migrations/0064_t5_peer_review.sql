-- 0064_t5_peer_review.sql
-- F1 (T5 peer-review pipeline) — schema + RLS + informant consent ledger only.
-- NO UI, no client code, no LLM call wired here (F2 = informant flow, F3 = subject
-- aggregate view, F4 = LLM synthesis). Spec: docs/T5-PEER-REVIEW-SPEC.md.
--
-- Ratified decisions (Simon, 2026-07-01) baked into this schema:
--   1. v1 scope = the 3 OBSERVABLE traits only (extraversion/conscientiousness/
--      agreeableness) — ratings jsonb is validated app-side to those keys.
--   2. informant = no-account, one-time tokenized link (only the token HASH stored).
--   3. consent stored in a DEDICATED informant_consents table (the informant is a
--      different PIPA data subject than the account holder — never co-mingled).
--   4. min-N = 3 before any aggregate is shown (enforced in t5_seen_aggregate()).
--   5. minor informants ALLOWED with guardian consent -> guardian_consent_at is
--      REQUIRED (CHECK) whenever informant_is_minor (PIPA §22-2 / COPPA style).
--   6. ratings-only (no free-text note column in v1 -> no moderation surface).
--   7. LLM gap-synthesis is intended (F4) -> informant data will cross border to
--      Gemini, so llm_processing_ack + overseas_transfer_ack are REQUIRED true
--      (CHECK). No consent row can exist without those acknowledgements.
--   8. GDPR in scope -> gdpr_lawful_basis recorded (Art.6(1)(a) consent);
--      erasure rides users ON DELETE CASCADE + withdrawn_at + a future purge.
--
-- Privacy invariants enforced at the DB, not just the app:
--   * A rating cannot exist without an informant consent row
--     (peer_observations.informant_consent_id NOT NULL + FK).
--   * The SUBJECT can never read a single informant's rating: peer_observations
--     and informant_consents have RLS enabled with NO authenticated policies, so
--     the only read path is the SECURITY DEFINER aggregate below, which refuses to
--     return anything until >= 3 active ratings exist (re-identification guard).
--   * Writes (informant responses) come through a service_role edge function which
--     bypasses RLS; there is deliberately no client insert path for third-party PII.

-- 1. peer_invitations -- owned by the subject; only the token HASH is retained ----
CREATE TABLE IF NOT EXISTS peer_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- subject
  invite_token_hash text NOT NULL,                                          -- hash only; raw link delivered out-of-band
  invited_label     text,                                                   -- nickname the user gives; NEVER a raw email/phone
  relation_kind     text NOT NULL CHECK (relation_kind IN ('friend','family','coworker','partner','other')),
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','declined','withdrawn','expired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  responded_at      timestamptz,
  expires_at        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS peer_invitations_user_idx ON peer_invitations (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS peer_invitations_token_uniq ON peer_invitations (invite_token_hash);

-- 2. informant_consents -- the informant's OWN opt-in ledger (separate subject) ---
CREATE TABLE IF NOT EXISTS informant_consents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id             uuid NOT NULL REFERENCES peer_invitations(id) ON DELETE CASCADE,
  subject_user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- denormalized for RLS/retention
  consent_at                timestamptz NOT NULL,                                   -- no row without the informant's opt-in
  informant_is_minor        boolean NOT NULL DEFAULT false,
  guardian_consent_at       timestamptz,                                            -- required when minor (CHECK below)
  guardian_verification_token_hash text,                                            -- proof a guardian verified; no email stored
  llm_processing_ack        boolean NOT NULL DEFAULT false,                         -- decision 7: Gemini synthesis
  overseas_transfer_ack     boolean NOT NULL DEFAULT false,                         -- decision 7: cross-border (국외이전)
  gdpr_lawful_basis         text NOT NULL DEFAULT 'consent' CHECK (gdpr_lawful_basis IN ('consent')),
  ip_hash                   text,                                                   -- hashed, never raw IP
  ua_hash                   text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  withdrawn_at              timestamptz,                                            -- informant withdrawal -> drops from aggregate
  -- A minor informant requires recorded guardian consent (decision 5).
  CONSTRAINT informant_consents_minor_guardian_ck
    CHECK (informant_is_minor = false OR guardian_consent_at IS NOT NULL),
  -- LLM synthesis crosses the border, so both acks MUST be given (decision 7).
  CONSTRAINT informant_consents_llm_acks_ck
    CHECK (llm_processing_ack = true AND overseas_transfer_ack = true)
);
CREATE INDEX IF NOT EXISTS informant_consents_subject_idx ON informant_consents (subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS informant_consents_invitation_idx ON informant_consents (invitation_id);

-- 3. peer_observations -- the structured ratings (no rating without a consent) ----
CREATE TABLE IF NOT EXISTS peer_observations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id        uuid NOT NULL REFERENCES peer_invitations(id) ON DELETE CASCADE,
  subject_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  informant_consent_id uuid NOT NULL REFERENCES informant_consents(id) ON DELETE CASCADE,  -- structural: no rating w/o consent
  ratings              jsonb NOT NULL,                                                       -- {extraversion,conscientiousness,agreeableness}: 1..5
  created_at           timestamptz NOT NULL DEFAULT now(),
  withdrawn_at         timestamptz
);
CREATE INDEX IF NOT EXISTS peer_observations_subject_idx ON peer_observations (subject_user_id) WHERE withdrawn_at IS NULL;

-- RLS -----------------------------------------------------------------------------
ALTER TABLE peer_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE informant_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_observations  ENABLE ROW LEVEL SECURITY;

-- peer_invitations: the subject manages ONLY their own invitations. Informant
-- responses (status -> accepted/declined) are applied by the service_role edge
-- function (bypasses RLS). informant_consents + peer_observations get NO
-- authenticated policies at all -> the subject can never read third-party PII or a
-- single rating; the only read path is t5_seen_aggregate() below.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    DROP POLICY IF EXISTS peer_invitations_select_own ON peer_invitations;
    DROP POLICY IF EXISTS peer_invitations_insert_own ON peer_invitations;
    DROP POLICY IF EXISTS peer_invitations_update_own ON peer_invitations;

    CREATE POLICY peer_invitations_select_own ON peer_invitations
      FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY peer_invitations_insert_own ON peer_invitations
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY peer_invitations_update_own ON peer_invitations
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Aggregate reader: the ONLY way the subject sees peer data. Self-scoped to
-- auth.uid(), and returns NOTHING until >= 3 active ratings exist (min-N, decision
-- 4). SECURITY DEFINER so it can read the RLS-locked observation rows, but it never
-- exposes a single informant's row -- only per-trait averages + the count.
CREATE OR REPLACE FUNCTION t5_seen_aggregate()
RETURNS TABLE (trait text, avg_score numeric, informant_count int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;  -- unauthenticated: nothing
  END IF;
  RETURN QUERY
  WITH active AS (
    SELECT o.ratings
    FROM peer_observations o
    JOIN informant_consents c ON c.id = o.informant_consent_id
    JOIN peer_invitations   i ON i.id = o.invitation_id
    WHERE o.subject_user_id = uid
      AND o.withdrawn_at IS NULL
      AND c.withdrawn_at IS NULL
      AND i.status = 'accepted'
  ),
  cnt AS (SELECT count(*)::int AS n FROM active)
  SELECT kv.key::text,
         round(avg((kv.value)::numeric), 2),
         (SELECT n FROM cnt)
  FROM active a, jsonb_each_text(a.ratings) kv
  WHERE (SELECT n FROM cnt) >= 3   -- min-N gate: below threshold => zero rows
  GROUP BY kv.key;
END;
$$;

-- Self-scoped read: safe to expose to authenticated (it uses auth.uid() and the
-- min-N gate). Revoke anon explicitly (function-grants rule), grant authenticated.
REVOKE ALL ON FUNCTION t5_seen_aggregate() FROM PUBLIC;
REVOKE ALL ON FUNCTION t5_seen_aggregate() FROM anon;
GRANT EXECUTE ON FUNCTION t5_seen_aggregate() TO authenticated;

-- DEFERRED (later phases, intentionally NOT here):
--   F2  informant token flow + consent surface (service_role edge writes).
--   F3  subject-side aggregate Seen gap view (reads t5_seen_aggregate()).
--   F4  LLM gap synthesis (C1 gemini.ts + C3 audit + C9 classify), gated on the
--       llm_processing_ack/overseas_transfer_ack this schema already requires.
--   retention: purge_expired_peer_invitations() + withdrawn-observation aging,
--       mirroring 0063 (GDPR storage-limitation) — follow-up migration.
