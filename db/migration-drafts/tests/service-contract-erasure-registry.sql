-- Actual registry/erase RPC and service-contract tables in the disposable
-- Polaris lane. The SSV table DDL/ACL is copied verbatim from its actual draft;
-- the complete SSV RPC behavior remains covered by the separate reward lane.
-- @LOAD_ACTUAL_REWARD_RATE_TABLE@
INSERT INTO public.reward_ssv_issue_rate_limits(user_id,claimed_at)
VALUES('88888888-8888-4888-8888-888888888888',ARRAY[now()]);

CREATE FUNCTION pg_temp.service_contract_data() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM public.account_deletion_tombstones t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY consent_record_id) FROM public.llm_consent_receipts t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.consent_records t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.polaris_generations t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM public.reward_ssv_issue_rate_limits t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.records t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id,version) FROM public.personas t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.users t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id,month_bucket) FROM public.usage_counters t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.polaris_generation_config t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.credit_ledger t),
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.credit_balance t)
  );
$$;
CREATE TEMP TABLE registry_existing_before AS SELECT * FROM public.erasure_registry;
CREATE TEMP TABLE service_contract_data_before AS SELECT pg_temp.service_contract_data() AS data;
DO $forward_preconditions$
DECLARE forward_sql text := $forward_sql$
-- @LOAD_ACTUAL_REGISTRY_FORWARD@
$forward_sql$;
BEGIN
  ALTER TABLE public.reward_ssv_issue_rate_limits RENAME TO reward_ssv_issue_rate_limits_missing;
  PERFORM pg_temp.expect_consent_error(forward_sql,'P0001','erasure_additions_owner_table_missing');
  ALTER TABLE public.reward_ssv_issue_rate_limits_missing RENAME TO reward_ssv_issue_rate_limits;
  ALTER TABLE public.reward_ssv_issue_rate_limits RENAME COLUMN user_id TO missing_owner;
  PERFORM pg_temp.expect_consent_error(forward_sql,'P0001','erasure_additions_owner_table_missing');
  ALTER TABLE public.reward_ssv_issue_rate_limits RENAME COLUMN missing_owner TO user_id;
  GRANT EXECUTE ON FUNCTION public.erase_my_data(text) TO authenticated;
  PERFORM pg_temp.expect_consent_error(forward_sql,'P0001','erasure_additions_rpc_must_remain_locked');
  REVOKE EXECUTE ON FUNCTION public.erase_my_data(text) FROM authenticated;
  IF EXISTS(SELECT * FROM public.erasure_registry EXCEPT SELECT * FROM registry_existing_before) THEN
    RAISE EXCEPTION 'failed forward precondition left a partial registry update';
  END IF;
END $forward_preconditions$;
BEGIN;
\ir ../UNNUMBERED_service_contract_erasure_registry.sql
COMMIT;
BEGIN;
\ir ../UNNUMBERED_service_contract_erasure_registry.sql
COMMIT;
DO $$ BEGIN
  IF EXISTS(SELECT * FROM registry_existing_before EXCEPT SELECT * FROM public.erasure_registry)
    OR (SELECT count(*) FROM public.erasure_registry)<>(SELECT count(*)+4 FROM registry_existing_before)
    OR (SELECT data FROM service_contract_data_before) IS DISTINCT FROM pg_temp.service_contract_data() THEN
    RAISE EXCEPTION 'registry forward repeat changed existing registry or user data';
  END IF;
  IF (SELECT count(*) FROM public.erasure_registry WHERE table_name IN ('account_deletion_tombstones',
      'llm_consent_receipts','polaris_generations','reward_ssv_issue_rate_limits')
      AND owner_column='user_id' AND class='retained' AND delete_order IS NULL AND cascades_from IS NULL)<>4 THEN
    RAISE EXCEPTION 'registry forward omitted or misclassified a service-contract table';
  END IF;
END $$;

-- Registry-row compatibility with the exact historical 66-row seed. This is
-- deliberately not a claim that this minimal fixture reproduces all 66 tables
-- or their deletion policies; the full catalog regression owns that verdict.
BEGIN;
-- @LOAD_ACTUAL_BASE_REGISTRY_SEED@
CREATE TEMP TABLE registry_66_before AS SELECT * FROM public.erasure_registry;
\ir ../UNNUMBERED_service_contract_erasure_registry.sql
\ir ../UNNUMBERED_service_contract_erasure_registry.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM registry_66_before)<>66 OR (SELECT count(*) FROM public.erasure_registry)<>70
    OR EXISTS(SELECT * FROM registry_66_before EXCEPT SELECT * FROM public.erasure_registry)
    OR (SELECT data FROM service_contract_data_before) IS DISTINCT FROM pg_temp.service_contract_data() THEN
    RAISE EXCEPTION 'four-row forward pruned or rewrote the historical 66-row seed';
  END IF;
END $$;
ROLLBACK;

-- Replay only the objects destroyed by the real 0189 rollback, then 0190 and
-- the new registry-only forward. Product tables/routines are left in place.
-- This models the SQL object order; CLI ledger necessity/sufficiency remains
-- the existing full-schema rollback round-trip lane's responsibility.
BEGIN;
DROP FUNCTION public.erase_my_data(text);
DROP TABLE public.erasure_registry;
-- @RECREATE_ACTUAL_ERASURE_OBJECTS@
INSERT INTO public.erasure_registry SELECT * FROM registry_existing_before;
\ir ../../migrations/0190_lock_erase_my_data_authenticated.sql
DO $replay_control$ BEGIN
  IF EXISTS(SELECT 1 FROM public.erasure_registry WHERE table_name='polaris_generations') THEN
    RAISE EXCEPTION 'rollback control did not lose the forward registry effect';
  END IF;
  -- Reapplying product provisioning would CREATE an existing table. The
  -- registry-only forward must not need that migration to run a second time.
  BEGIN
    -- @REPLAY_POLARIS_PROVISIONING@
    RAISE EXCEPTION 'provisioning unexpectedly replayed over live product tables';
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;
END $replay_control$;
\ir ../UNNUMBERED_service_contract_erasure_registry.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM public.erasure_registry)<>(SELECT count(*)+4 FROM registry_existing_before)
    OR EXISTS(SELECT * FROM registry_existing_before EXCEPT SELECT * FROM public.erasure_registry)
    OR (SELECT data FROM service_contract_data_before) IS DISTINCT FROM pg_temp.service_contract_data()
    OR has_function_privilege('authenticated','public.erase_my_data(text)','EXECUTE')
    OR has_function_privilege('anon','public.erase_my_data(text)','EXECUTE') THEN
    RAISE EXCEPTION 'registry-only replay lost data, registry rows or erasure lock';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: registry forward repeats without pruning 66 historical rows or user data; registry-only rollback replay preserves product objects and erasure lock';

-- Real combined content/account deletion behavior of the four additions.
DO $$
DECLARE
  u uuid:='cccc3333-3333-4333-8333-333333333333';
  r uuid:='cccc3333-cccc-4ccc-8ccc-cccccccccccc';
  g uuid; before_token text; receipt_id uuid; before_receipt public.llm_consent_receipts%ROWTYPE;
  cards jsonb := '[{"id":"cleanup","label":"Cleanup","summary":"Fixture role","status":"proposed","claimStrength":2,"evidence":{"domains":["work"],"constructs":["self-reported narrative (same-source)"]},"evidenceRefs":["record:cccc3333-cccc-4ccc-8ccc-cccccccccccc"]}]';
  erasure_receipt jsonb;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(u,'erasure-fixture@example.invalid',now());
  INSERT INTO public.users(id,birth_date,minor_tier) VALUES(u,'2000-01-01','adult');
  PERFORM set_config('test.user_id',u::text,true);
  PERFORM public.write_llm_service_consent(u,'service-v1',public.llm_service_consent_status(u)->>'change_token',
    'grant','{"service":true,"llmProcessing":true,"overseasTransfer":true,"sensitiveData":true,"safetyNotice":true}','en');
  before_token:=public.effective_llm_consent_snapshot_v2(u)->>'token';
  SELECT * INTO before_receipt FROM public.llm_consent_receipts WHERE user_id=u;
  receipt_id:=before_receipt.consent_record_id;
  INSERT INTO public.reward_ssv_issue_rate_limits(user_id,claimed_at) VALUES(u,ARRAY[now()]);
  INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES(r,u,'audit_response','work',ARRAY['interview'],'Combined erasure source.');
  g:=(public.reserve_polaris_generation(u,'registry-completed')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,g);
  PERFORM public.settle_polaris_generation(u,g,cards,before_token);
  PERFORM public.ratify_polaris_role_card(u,cards->0);
  g:=(public.reserve_polaris_generation(u,'registry-running')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,g);
  erasure_receipt:=public.erase_my_data('content');
  IF EXISTS(SELECT 1 FROM public.records WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.personas WHERE user_id=u)
    OR EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id=u AND (evidence<>'[]'::jsonb OR status IN ('reserved','running')))
    OR (public.polaris_generation_status(u)->>'intro_remaining')::int<>1
    OR public.effective_llm_consent_snapshot_v2(u)->>'token' IS DISTINCT FROM before_token
    OR NOT EXISTS(SELECT 1 FROM public.llm_consent_receipts p WHERE p=before_receipt)
    OR NOT EXISTS(SELECT 1 FROM public.reward_ssv_issue_rate_limits WHERE user_id=u AND cardinality(claimed_at)=1)
    OR (SELECT sum((value->>'categories')::int) FROM jsonb_array_elements(erasure_receipt->'outcomes'))
      <>(SELECT count(*) FROM public.erasure_registry) THEN
    RAISE EXCEPTION 'combined content wipe reset consent/rate/quota or retained evidence';
  END IF;
  INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(u,gen_random_uuid());
  PERFORM public.erase_my_data('content');
  IF NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=u) THEN
    RAISE EXCEPTION 'content wipe removed the durable account fence';
  END IF;
  DELETE FROM auth.users WHERE id=u;
  IF EXISTS(SELECT 1 FROM public.llm_consent_receipts WHERE user_id=u)
    OR EXISTS(SELECT 1 FROM public.consent_records WHERE id=receipt_id)
    OR EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id=u)
    OR EXISTS(SELECT 1 FROM public.reward_ssv_issue_rate_limits WHERE user_id=u)
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=u) THEN
    RAISE EXCEPTION 'combined account deletion violated cascade/fence retention';
  END IF;
END $$;
SELECT 'PASS: registered service contracts preserve consent/rate/lifetime state on content wipe, clear evidence, cascade account-owned ledgers and retain the account tombstone';
