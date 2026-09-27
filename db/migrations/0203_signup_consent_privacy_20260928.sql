-- 0203_signup_consent_privacy_20260928.sql
--
-- 개인정보처리방침 v4(2026-09-28)를 서버 계약에 올린다. Simon 결정 2026-09-28
-- 00:3x: 이번 판은 **공지형 개정**이다(재동의형 아님). 필수 동의 문구와 약관은
-- 그대로이고 방침 날짜만 바뀐다. 그래서
--   1. 새 가입은 email-v5 = ('2026-09-07', '2026-09-28', '2026-08-16') 로 기록한다.
--      이미 설치된 앱은 email-v4 를 계속 보낸다 - 그 행은 지우지 않는다.
--   2. LLM 동의 판정(0193)은 email-v4 와 email-v5 튜플을 **둘 다 현재**로 본다.
--      기존 계정의 동의가 판 날짜 하나 때문에 무효가 되지 않는다. 다음에 재동의형
--      개정을 하면 그때 옛 튜플을 이 목록에서 뺀다.
--   3. 서버 쓰기(가입 트리거 · 0194 서비스 동의)가 email-v5 튜플로 남긴 행도
--      provenance 영수증을 받도록 capture 함수와 CHECK 제약을 넓힌다.
--
-- 순서: 이 파일을 운영에 적용하고 확인한 **뒤에** 2026-09-28 방침 · 클라이언트를
-- 게시한다. 웹 게시 워크플로가 scripts/check-signup-consent-deployment.cjs 로
-- signup_consent_contract_status() 에 email-v5 가 준비됐는지 먼저 본다.
-- 이 파일은 동의를 소급하지 않고, 광고 동의를 만들지 않으며, 옛 영수증을 새
-- 판으로 올리지 않는다.
--
-- 선행: 0191(email-v4) · 0193(LLM 동의 provenance). 0194(서비스 동의)는 운영에
-- 아직 없고 이 파일 뒤에 적용된다 - 0194 는 같은 PR 에서 email-v5 튜플을 쓰도록
-- 고쳤다. 함수 본문은 0191 · 0193 에서 기계적으로 옮기고 표시한 곳만 바꿨다.
--
-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기 트랜잭션으로
-- 감싼다.

SET LOCAL lock_timeout = '10s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.signup_consent_contract('email-v4') AS contract
    WHERE contract.consent_version = '2026-09-07'
      AND contract.policy_version = '2026-09-26'
      AND contract.terms_version = '2026-08-16'
      AND contract.confirmation_eligible IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_trigger AS hook ON hook.tgfoid = routine.oid
    WHERE routine.oid = 'public.complete_verified_email_signup()'::regprocedure
      AND routine.prosecdef
      AND position('public.signup_consent_contract' in routine.prosrc) > 0
      AND position('contract.confirmation_eligible IS TRUE' in routine.prosrc) > 0
      AND hook.tgrelid = 'auth.users'::regclass
      AND hook.tgname = 'trg_complete_verified_email_signup'
      AND hook.tgenabled IN ('O', 'A') AND hook.tgtype = 17
      AND NOT hook.tgisinternal
  ) THEN
    RAISE EXCEPTION 'signup_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
  IF to_regclass('public.llm_consent_receipts') IS NULL
     OR to_regprocedure('public.capture_llm_consent_provenance()') IS NULL
     OR to_regprocedure('public.llm_consent_current_decision(uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.llm_consent_receipts'::regclass
          AND conname = 'llm_consent_receipts_contract_revision_check'
     ) THEN
    RAISE EXCEPTION 'llm_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
END
$preflight$;

----------------------------------------------------------------------
-- 1. 가입 계약: email-v5 추가 (0191 에서 옮김, VALUES 한 줄과 상태 목록만 다름)
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.signup_consent_contract(p_revision text)
RETURNS TABLE (
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean
)
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $contract$
  SELECT contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible
  FROM (VALUES
    ('email-v2'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, true),
    ('complete-profile-v1'::text, '2026-08-16'::text, '2026-08-30'::text, '2026-08-16'::text, false),
    ('email-v3'::text, '2026-09-07'::text, '2026-09-07'::text, '2026-08-16'::text, true),
    ('email-v4'::text, '2026-09-07'::text, '2026-09-26'::text, '2026-08-16'::text, true),
    ('email-v5'::text, '2026-09-07'::text, '2026-09-28'::text, '2026-08-16'::text, true)
  ) AS contract(signup_revision, consent_version, policy_version, terms_version, confirmation_eligible)
  WHERE contract.signup_revision = p_revision
$contract$;

REVOKE ALL ON FUNCTION public.signup_consent_contract(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_verified_email_signup()
  FROM PUBLIC, anon, authenticated, service_role;
-- The dormant complete-profile contract remains closed; email-v5 does not
-- authorize an older profile form to assert it showed the new policy.
REVOKE ALL ON FUNCTION public.complete_profile_signup_consent(
  text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean
)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.signup_consent_contract_status()
RETURNS TABLE (
  signup_revision text,
  consent_version text,
  policy_version text,
  terms_version text,
  confirmation_eligible boolean,
  confirmation_ready boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $status$
  SELECT revision.id, contract.consent_version, contract.policy_version,
         contract.terms_version, contract.confirmation_eligible,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS routine
           JOIN pg_catalog.pg_trigger AS hook ON hook.tgfoid = routine.oid
           WHERE routine.oid = 'public.complete_verified_email_signup()'::regprocedure
             AND routine.prosecdef
             AND position('public.signup_consent_contract' in routine.prosrc) > 0
             AND position('contract.confirmation_eligible IS TRUE' in routine.prosrc) > 0
             AND hook.tgrelid = 'auth.users'::regclass
             AND hook.tgname = 'trg_complete_verified_email_signup'
             AND hook.tgenabled IN ('O', 'A') AND hook.tgtype = 17
             AND NOT hook.tgisinternal
             AND NOT pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
             AND NOT pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE')
         )
  FROM (VALUES ('email-v2'), ('complete-profile-v1'), ('email-v3'), ('email-v4'), ('email-v5')) AS revision(id)
  CROSS JOIN LATERAL public.signup_consent_contract(revision.id) AS contract
$status$;

REVOKE ALL ON FUNCTION public.signup_consent_contract_status()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_consent_contract_status() TO anon, authenticated;

COMMENT ON FUNCTION public.signup_consent_contract_status() IS
  'Public policy metadata only. Reads the actual signup contract and confirmation trigger readiness; contains no account data and grants no consent.';

----------------------------------------------------------------------
-- 2. LLM 동의 provenance: email-v5 영수증 허용 (0193 에서 옮김)
----------------------------------------------------------------------

ALTER TABLE public.llm_consent_receipts
  DROP CONSTRAINT llm_consent_receipts_contract_revision_check,
  ADD CONSTRAINT llm_consent_receipts_contract_revision_check
    CHECK (contract_revision IN ('email-v2', 'complete-profile-v1', 'email-v3', 'email-v4', 'email-v5'));

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
        ('email-v5'::text, 1),
        ('email-v4'::text, 2),
        ('email-v3'::text, 3),
        ('email-v2'::text, 4),
        ('complete-profile-v1'::text, 5)
    ) AS candidate(revision, priority)
    CROSS JOIN LATERAL public.signup_consent_contract(candidate.revision) AS contract
   -- Provenance identifies the server writer, not a positive decision. A
   -- trusted negative event must supersede its older positive receipt too.
   WHERE NEW.consent_version = contract.consent_version
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

CREATE OR REPLACE FUNCTION public.llm_consent_current_decision(p_user_id uuid)
RETURNS TABLE(allowed boolean,token text) LANGUAGE sql STABLE SET search_path = '' AS $$
    WITH latest_service AS (
      SELECT c.id, provenance.state_revision,
             COALESCE(provenance.optional_consents_since,c.created_at) AS optional_since,
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
       WHERE c.user_id = p_user_id
         AND pg_catalog.jsonb_typeof(c.purposes) = 'array'
         AND c.purposes @> '["service"]'::jsonb
       ORDER BY provenance.receipt_order DESC
       LIMIT 1
    ),
    -- 0203: email-v5 is a NOTICE revision of email-v4 (only the policy date
    -- differs; Simon, 2026-09-28), so a receipt for either tuple is current.
    -- A future RE-CONSENT revision must drop the superseded tuple here.
    current_contract AS (
      SELECT contract.consent_version,
             contract.policy_version,
             contract.terms_version
        FROM (VALUES ('email-v4'::text), ('email-v5'::text)) AS current_revision(id)
        CROSS JOIN LATERAL public.signup_consent_contract(current_revision.id) AS contract
       WHERE contract.confirmation_eligible IS TRUE
    ),
    relevant_prefs AS (
      SELECT k.pref_key FROM latest_service c
      CROSS JOIN LATERAL public.llm_consent_relevant_prefs(c.optional_consents) k
    )
    SELECT c.required_ack IS TRUE
       AND c.llm_processing_ack IS TRUE
       AND c.overseas_transfer_ack IS TRUE
       AND c.sensitive_data_ack IS TRUE
       AND c.safety_notice_ack IS TRUE
       AND EXISTS (
         SELECT 1
           FROM current_contract contract
          WHERE contract.consent_version = c.consent_version
            AND contract.policy_version = c.policy_version
            AND contract.terms_version = c.terms_version
       )
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
                  AND cc.created_at >= c.optional_since
                ORDER BY cc.created_at DESC, cc.id DESC
                LIMIT 1
             ), false)
       )
      , encode(sha256(convert_to(c.id::text||':'||c.state_revision::text,'UTF8')),'hex')

      FROM latest_service c
      JOIN public.users u ON u.id = c.user_id
      CROSS JOIN (SELECT 1 FROM current_contract LIMIT 1) AS any_current_contract
  ;
$$;
REVOKE ALL ON FUNCTION public.llm_consent_current_decision(uuid) FROM PUBLIC,anon,authenticated,service_role;

----------------------------------------------------------------------
-- 끝 상태를 적용 시점에 확인한다 (0191 · 0193 과 같은 모양).
----------------------------------------------------------------------

DO $verify$
DECLARE
  routine regprocedure;
BEGIN
  IF (SELECT count(*) FROM public.signup_consent_contract_status()
       WHERE confirmation_eligible IS TRUE AND confirmation_ready IS TRUE
         AND ((signup_revision = 'email-v4' AND consent_version = '2026-09-07'
               AND policy_version = '2026-09-26' AND terms_version = '2026-08-16')
           OR (signup_revision = 'email-v5' AND consent_version = '2026-09-07'
               AND policy_version = '2026-09-28' AND terms_version = '2026-08-16'))) <> 2 THEN
    RAISE EXCEPTION 'signup_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
  IF position('''email-v5''' in (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.capture_llm_consent_provenance()'::regprocedure)) = 0
     OR position('''email-v5''' in (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.llm_consent_current_decision(uuid)'::regprocedure)) = 0
     OR position('''email-v4''' in (SELECT prosrc FROM pg_catalog.pg_proc
       WHERE oid = 'public.llm_consent_current_decision(uuid)'::regprocedure)) = 0
     OR position('''email-v5''' in (SELECT pg_catalog.pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.llm_consent_receipts'::regclass
         AND conname = 'llm_consent_receipts_contract_revision_check')) = 0
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = 'public.consent_records'::regclass
          AND tgname = 'capture_llm_consent_provenance_after_insert'
          AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'llm_consent_contract_not_ready' USING ERRCODE = '55000';
  END IF;
  FOREACH routine IN ARRAY ARRAY[
    'public.signup_consent_contract(text)'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.capture_llm_consent_provenance()'::regprocedure,
    'public.llm_consent_current_decision(uuid)'::regprocedure
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', routine, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', routine, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', routine, 'EXECUTE') THEN
      RAISE EXCEPTION '0203: % must stay closed to client roles', routine USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('anon', 'public.signup_consent_contract_status()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.signup_consent_contract_status()', 'EXECUTE') THEN
    RAISE EXCEPTION '0203: the public contract status RPC lost its grant' USING ERRCODE = '42501';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
