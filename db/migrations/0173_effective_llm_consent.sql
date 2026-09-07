-- 0173_effective_llm_consent.sql
-- Integration candidate only: re-scan remote and local migration
-- reservations immediately before push; renumber again if precedence changed.
-- Canonical, fail-closed consent reader for the LLM proxy egress boundary.
--
-- consent_records is not one timeline for one purpose. It also contains later
-- health_import, recommendations, and personal_import grants, so ordering all
-- rows and taking LIMIT 1 can hide the service consent behind an unrelated
-- event. Select the newest service event first, validate it without falling
-- back to an older grant, then evaluate any
-- withdrawable preference that grant explicitly carried.
--
-- There is deliberately no invented global "LLM consent" privacy key here.
-- The current privacy contract has no such key. consent_changes records the
-- optional keys in users.privacy_prefs, so only a known privacy key that is
-- explicitly true in this service grant's optional_consents is related. Its
-- current value and its latest post-grant change must both still permit it.
-- Mapping an unrelated preference (ads, analytics, or recommendations) to the
-- mandatory sign-up acknowledgements would give that preference a legal
-- meaning the present schema does not establish.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.effective_llm_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- This RPC accepts a user id because an Edge proxy calls with service_role
  -- after validating the end-user JWT. Never expose that arbitrary subject
  -- parameter to an end-user role, even if an ACL drifts later.
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
             c.consent_version,
             c.terms_version,
             c.policy_version,
             c.optional_consents,
             c.created_at
        FROM public.consent_records c
       WHERE c.user_id = p_user_id
         AND pg_catalog.jsonb_typeof(c.purposes) = 'array'
         AND c.purposes @> '["service"]'::jsonb
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 1
    ),
    known_pref_keys(pref_key) AS (
      -- Snapshot of src/lib/privacy/prefs.ts at this migration. These are the
      -- only keys consent_changes is documented to receive from the app.
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
       AND NULLIF(pg_catalog.btrim(c.consent_version), '') IS NOT NULL
       AND NULLIF(pg_catalog.btrim(c.terms_version), '') IS NOT NULL
       AND NULLIF(pg_catalog.btrim(c.policy_version), '') IS NOT NULL
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
  ), false);
EXCEPTION
  -- A malformed JSON value, missing dependency, privilege failure, or other
  -- lookup error must deny egress. The proxy separately treats an RPC/network
  -- error as denial; this closes failures that occur inside the function.
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Supabase may auto-grant new functions to client roles. Reset every known
-- role first, then hand back only the proxy's service role.
REVOKE ALL ON FUNCTION public.effective_llm_consent(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_llm_consent(uuid) TO service_role;

-- Abort the migration if the end-state is callable by a client role or not
-- callable by the proxy role. has_function_privilege includes PUBLIC grants,
-- so it also detects a missed default PUBLIC privilege.
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.effective_llm_consent(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.effective_llm_consent(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.effective_llm_consent(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'effective_llm_consent ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

