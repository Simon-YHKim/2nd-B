-- INACTIVE DRAFT: provenance-backed effective LLM consent.
--
-- Do not number, apply, or deploy this file from a local inventory branch.
-- Immediately before an approved push, re-scan the remote migration catalog,
-- reserve max + 1, and promote this forward-only draft under that number.
--
-- consent_records historically allowed authenticated self-insert. Its values
-- can document what a client asserted, but cannot prove that a server-owned
-- writer selected the subject, contract tuple, and canonical service shape.
-- This migration therefore records provenance only for FUTURE inserts whose
-- effective SQL role is the consent_records table owner (for example the
-- SECURITY DEFINER verified-email trigger). Direct authenticated/service-role
-- inserts never receive a provenance receipt.
--
-- No historical backfill is safe: old server rows and client-forged rows are
-- indistinguishable. Keep LLM_REQUIRE_VERIFIED_CONSENT unset until a reviewed
-- server-owned re-consent writer and UI have populated current receipts for
-- every account intended to retain LLM access. Before activation, a read-only
-- coverage query must show zero uncovered active accounts; then canary the v2
-- RPC before the console owner sets the flag. Applying this draft alone does
-- not activate the proxy gate.
--
-- There is deliberately no top-level BEGIN/COMMIT. Supabase CLI supplies the
-- transaction; SET LOCAL remains scoped to it.

SET LOCAL lock_timeout = '10s';

-- Pin this migration to the exact document tuple it was reviewed against.
-- A missing dependency or a future contract bump must abort promotion instead
-- of silently turning every runtime lookup into false/403.
DO $contract_preflight$
DECLARE
  matching_contracts bigint;
  consent_records_owner oid;
BEGIN
  SELECT count(*)
    INTO matching_contracts
    FROM public.signup_consent_contract('email-v3') AS contract
   WHERE contract.consent_version = '2026-09-07'
     AND contract.policy_version = '2026-09-07'
     AND contract.terms_version = '2026-08-16'
     AND contract.confirmation_eligible IS TRUE;

  IF matching_contracts IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'llm_consent_contract_not_ready'
      USING ERRCODE = '55000';
  END IF;

  SELECT relation.relowner
    INTO consent_records_owner
    FROM pg_catalog.pg_class relation
   WHERE relation.oid = 'public.consent_records'::pg_catalog.regclass;

  IF consent_records_owner IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_proc routine
        WHERE routine.oid = 'public.complete_verified_email_signup()'::pg_catalog.regprocedure
          AND routine.proowner = consent_records_owner
     ) THEN
    RAISE EXCEPTION 'llm_consent_server_writer_owner_not_ready'
      USING ERRCODE = '55000';
  END IF;
END
$contract_preflight$;

CREATE TABLE public.llm_consent_receipts (
  consent_record_id uuid PRIMARY KEY
    REFERENCES public.consent_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,
  contract_revision text NOT NULL
    CHECK (contract_revision IN ('email-v2', 'complete-profile-v1', 'email-v3')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX llm_consent_receipts_user_idx
  ON public.llm_consent_receipts (user_id, recorded_at DESC);

ALTER TABLE public.llm_consent_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_consent_receipts
  FROM PUBLIC, anon, authenticated, service_role;

-- SECURITY INVOKER is essential. current_user must remain the effective role
-- of the INSERT that fired the trigger: table-owner DEFINER writers are trusted;
-- ordinary authenticated/service-role statements are not.
CREATE OR REPLACE FUNCTION public.capture_llm_consent_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  consent_records_owner name;
  matched_revision text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
    INTO consent_records_owner
    FROM pg_catalog.pg_class relation
   WHERE relation.oid = 'public.consent_records'::pg_catalog.regclass;

  IF consent_records_owner IS NULL
     OR current_user IS DISTINCT FROM consent_records_owner THEN
    RETURN NEW;
  END IF;

  SELECT candidate.revision
    INTO matched_revision
    FROM (
      VALUES
        ('email-v3'::text, 1),
        ('email-v2'::text, 2),
        ('complete-profile-v1'::text, 3)
    ) AS candidate(revision, priority)
    CROSS JOIN LATERAL public.signup_consent_contract(candidate.revision) AS contract
   WHERE NEW.required_ack IS TRUE
     AND NEW.llm_processing_ack IS TRUE
     AND NEW.overseas_transfer_ack IS TRUE
     AND NEW.sensitive_data_ack IS TRUE
     AND NEW.safety_notice_ack IS TRUE
     AND NEW.consent_version = contract.consent_version
     AND NEW.policy_version = contract.policy_version
     AND NEW.terms_version = contract.terms_version
     AND pg_catalog.jsonb_typeof(NEW.purposes) = 'array'
     AND NEW.purposes @> '["service"]'::jsonb
   ORDER BY candidate.priority
   LIMIT 1;

  IF matched_revision IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.llm_consent_receipts (
    consent_record_id,
    user_id,
    contract_revision
  ) VALUES (
    NEW.id,
    NEW.user_id,
    matched_revision
  )
  ON CONFLICT (consent_record_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_llm_consent_provenance()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS capture_llm_consent_provenance_after_insert
  ON public.consent_records;
CREATE TRIGGER capture_llm_consent_provenance_after_insert
AFTER INSERT ON public.consent_records
FOR EACH ROW
EXECUTE FUNCTION public.capture_llm_consent_provenance();

CREATE OR REPLACE FUNCTION public.effective_llm_consent_v2(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL
     OR public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RETURN false;
  END IF;

  RETURN COALESCE((
    WITH latest_service AS (
      SELECT c.id,
             c.user_id,
             c.required_ack,
             c.llm_processing_ack,
             c.overseas_transfer_ack,
             c.sensitive_data_ack,
             c.safety_notice_ack,
             c.consent_version,
             c.terms_version,
             c.policy_version,
             c.optional_consents,
             c.created_at
        FROM public.consent_records c
        JOIN public.llm_consent_receipts provenance
          ON provenance.consent_record_id = c.id
         AND provenance.user_id = c.user_id
         AND provenance.contract_revision = 'email-v3'
       WHERE c.user_id = p_user_id
         AND pg_catalog.jsonb_typeof(c.purposes) = 'array'
         AND c.purposes @> '["service"]'::jsonb
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 1
    ),
    current_contract AS (
      SELECT contract.consent_version,
             contract.policy_version,
             contract.terms_version
        FROM public.signup_consent_contract('email-v3') AS contract
       WHERE contract.confirmation_eligible IS TRUE
    ),
    known_pref_keys(pref_key) AS (
      VALUES
        ('ads'),
        ('sharing'),
        ('recommendations'),
        ('external_analytics'),
        ('long_term_memory'),
        ('ops_push'),
        ('health_import'),
        ('records_embedding'),
        ('chat_autosave')
    ),
    relevant_prefs AS (
      SELECT k.pref_key
        FROM latest_service c
        JOIN known_pref_keys k
          ON c.optional_consents @> pg_catalog.jsonb_build_object(k.pref_key, true)
    )
    SELECT c.required_ack IS TRUE
       AND c.llm_processing_ack IS TRUE
       AND c.overseas_transfer_ack IS TRUE
       AND c.sensitive_data_ack IS TRUE
       AND c.safety_notice_ack IS TRUE
       AND c.consent_version = contract.consent_version
       AND c.policy_version = contract.policy_version
       AND c.terms_version = contract.terms_version
       AND pg_catalog.jsonb_typeof(c.optional_consents) = 'object'
       AND u.account_status IS NOT DISTINCT FROM 'active'
       AND pg_catalog.jsonb_typeof(u.privacy_prefs) = 'object'
       AND NOT EXISTS (
         SELECT 1
           FROM relevant_prefs r
          WHERE u.privacy_prefs -> r.pref_key IS DISTINCT FROM 'true'::jsonb
             OR COALESCE((
               SELECT cc.event_type IS NOT DISTINCT FROM 'revoke'
                 FROM public.consent_changes cc
                WHERE cc.user_id = c.user_id
                  AND cc.pref_key = r.pref_key
                  AND cc.created_at >= c.created_at
                ORDER BY cc.created_at DESC, cc.id DESC
                LIMIT 1
             ), false)
       )
      FROM latest_service c
      JOIN public.users u ON u.id = c.user_id
      CROSS JOIN current_contract contract
  ), false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.effective_llm_consent_v2(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_llm_consent_v2(uuid)
  TO service_role;

DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.llm_consent_receipts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.llm_consent_receipts', 'SELECT')
     OR has_table_privilege('service_role', 'public.llm_consent_receipts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.llm_consent_receipts', 'INSERT')
     OR has_function_privilege('anon', 'public.effective_llm_consent_v2(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.effective_llm_consent_v2(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.effective_llm_consent_v2(uuid)', 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger trigger_row
        WHERE trigger_row.tgrelid = 'public.consent_records'::pg_catalog.regclass
          AND trigger_row.tgname = 'capture_llm_consent_provenance_after_insert'
          AND NOT trigger_row.tgisinternal
     ) THEN
    RAISE EXCEPTION 'llm_consent_provenance_verification_failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;
