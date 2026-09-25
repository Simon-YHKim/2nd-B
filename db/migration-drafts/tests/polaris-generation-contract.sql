-- Run ONLY in a disposable, empty local PostgreSQL database.
-- Use scripts/test-polaris-sql.mjs (explicit port, polaris_ user, polaris_test database).
-- The runner loads the latest credit functions below and exercises concurrent clients.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, tier text NOT NULL DEFAULT 'free');
CREATE FUNCTION public.effective_subscription_tier(p_user_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT tier FROM public.users WHERE id=p_user_id $$;
CREATE TABLE public.records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text, audit_period text, tags text[], body text, created_at timestamptz DEFAULT now());
CREATE TABLE public.usage_counters(user_id uuid NOT NULL,month_bucket text NOT NULL,reasoning_used int NOT NULL DEFAULT 0,
  reward_credits int NOT NULL DEFAULT 0,reward_consumed int NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,month_bucket));
CREATE FUNCTION public.billing_request_role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
\ir ../../migrations/0134_credit_ledger.sql
-- @LOAD_LATEST_CREDIT_CONTRACT@
-- Fail loudly if the draft tries to write the frozen compatibility counters.
CREATE FUNCTION public.reject_frozen_credit_writes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.reward_consumed IS DISTINCT FROM OLD.reward_consumed OR NEW.reward_credits IS DISTINCT FROM OLD.reward_credits THEN
    RAISE EXCEPTION 'frozen legacy reward counters';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_frozen_credit_writes BEFORE UPDATE ON public.usage_counters FOR EACH ROW EXECUTE FUNCTION public.reject_frozen_credit_writes();
\ir ../../migrations/0008_personas.sql
-- Actual table/function bodies from 0189, and actual deletion-fence table.
-- @LOAD_ERASURE_CONTRACT@
INSERT INTO public.erasure_registry(table_name,owner_column,class,delete_order,reason) VALUES
  ('records','user_id','client_erasable',30,'Local fixture records'),
  ('personas','user_id','client_erasable',41,'Local fixture personas');
\ir ../../migrations/0190_lock_erase_my_data_authenticated.sql
\ir ../UNNUMBERED_polaris_generation_allowance.sql

INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.users(id) SELECT id FROM auth.users;
INSERT INTO public.records(id,user_id,kind,audit_period,tags,body)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','audit_response','work',ARRAY['interview'],'I build practical tools.');
SELECT set_config('test.user_id','11111111-1111-4111-8111-111111111111',false);

DO $$
DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  generation uuid; snapshot jsonb;
BEGIN
  UPDATE public.polaris_generation_config SET enabled=true;
  generation := (public.reserve_polaris_generation(u,'snapshot-content')->>'generation_id')::uuid;
  snapshot := public.claim_polaris_generation(u,generation);
  IF snapshot->0->>'excerpt' IS DISTINCT FROM 'I build practical tools.' THEN
    RAISE EXCEPTION 'claim did not bind provider input to saved interview content';
  END IF;
  PERFORM public.settle_polaris_generation(u,generation,NULL);
  generation := (public.reserve_polaris_generation(u,'snapshot-edited')->>'generation_id')::uuid;
  UPDATE public.records SET body='This changed after reservation.' WHERE user_id=u;
  BEGIN
    PERFORM public.claim_polaris_generation(u,generation);
    RAISE EXCEPTION 'changed interview was dispatched';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF; END;
  PERFORM public.cancel_polaris_generation(u,generation);
  UPDATE public.records SET body='I build practical tools.' WHERE user_id=u;
  UPDATE public.polaris_generation_config SET enabled=false;
END $$;

DO $$
DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  first_id uuid; next_id uuid; v jsonb; i int;
  cards jsonb := '[{"id":"maker","label":"Maker","summary":"Builds tools","evidence":{"domains":["work"],"constructs":["self-reported narrative (same-source)"]},"claimStrength":2,"status":"proposed","evidenceRefs":["record:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]}]';
BEGIN
  IF (public.polaris_generation_status(u)->>'available')::boolean THEN RAISE EXCEPTION 'capability must start OFF'; END IF;
  UPDATE public.polaris_generation_config SET enabled=true;
  v := public.reserve_polaris_generation(u,'retry-idempotent'); first_id := (v->>'generation_id')::uuid;
  IF (public.reserve_polaris_generation(u,'retry-idempotent')->>'generation_id')::uuid <> first_id THEN RAISE EXCEPTION 'idempotency failed'; END IF;
  BEGIN
    PERFORM public.reserve_polaris_generation(u,'other-concurrent'); RAISE EXCEPTION 'concurrency guard missing';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_generation_active' THEN RAISE; END IF; END;
  PERFORM public.claim_polaris_generation(u,first_id);
  BEGIN
    PERFORM public.claim_polaris_generation(u,first_id); RAISE EXCEPTION 'dispatch replay allowed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_reservation_required' THEN RAISE; END IF; END;
  PERFORM public.cancel_polaris_generation(u,first_id);
  IF (SELECT status FROM public.polaris_generations WHERE id=first_id) <> 'running' THEN RAISE EXCEPTION 'client cancelled dispatched request'; END IF;
  PERFORM public.settle_polaris_generation(u,first_id,NULL);
  IF (public.polaris_generation_status(u)->>'intro_remaining')::int <> 2 THEN RAISE EXCEPTION 'failed intro charged'; END IF;
  FOR i IN 1..2 LOOP
    next_id := (public.reserve_polaris_generation(u,'intro-success-'||i)->>'generation_id')::uuid;
    PERFORM public.claim_polaris_generation(u,next_id);
    IF NOT public.settle_polaris_generation(u,next_id,cards) THEN RAISE EXCEPTION 'success failed'; END IF;
    IF NOT public.settle_polaris_generation(u,next_id,cards) THEN RAISE EXCEPTION 'settlement not idempotent'; END IF;
  END LOOP;
  IF (public.polaris_generation_status(u)->>'intro_remaining')::int <> 0 THEN RAISE EXCEPTION 'intro not lifetime two'; END IF;
  IF EXISTS (SELECT 1 FROM public.usage_counters WHERE user_id=u) THEN RAISE EXCEPTION 'intro spent plan allowance'; END IF;
  IF (SELECT ((patterns->>'role_cards_v1')::jsonb->0->>'status') FROM public.personas WHERE user_id=u)<>'proposed' THEN RAISE EXCEPTION 'auto approval'; END IF;
  next_id := (public.reserve_polaris_generation(u,'paid-failure')->>'generation_id')::uuid;
  IF (SELECT spend FROM public.polaris_generations WHERE id=next_id)<>'base' THEN RAISE EXCEPTION 'plan allowance unused'; END IF;
  PERFORM public.claim_polaris_generation(u,next_id);
  PERFORM public.settle_polaris_generation(u,next_id,'[]');
  IF (SELECT reasoning_used FROM public.usage_counters WHERE user_id=u)<>0 THEN RAISE EXCEPTION 'empty draft charged'; END IF;
  FOR i IN 1..2 LOOP
    next_id := (public.reserve_polaris_generation(u,'plan-success-'||i)->>'generation_id')::uuid;
    PERFORM public.claim_polaris_generation(u,next_id);
    PERFORM public.settle_polaris_generation(u,next_id,cards);
  END LOOP;
  BEGIN
    PERFORM public.reserve_polaris_generation(u,'plan-exhausted'); RAISE EXCEPTION 'free plan cap bypassed';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_limit_exceeded' THEN RAISE; END IF; END;
  -- Real 0134 ledger tables/triggers and latest 0135 spend/refund functions.
  INSERT INTO public.credit_ledger(id,user_id,kind,units,lot_id,lot_opened_at,lot_expires_at)
    VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',u,'promo',2,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',now(),now()+interval '1 day');
  next_id := (public.reserve_polaris_generation(u,'credit-failure')->>'generation_id')::uuid;
  IF public.credit_available(u)<>1 THEN RAISE EXCEPTION 'credit not reserved'; END IF;
  IF (SELECT cardinality(credit_entry_ids) FROM public.polaris_generations WHERE id=next_id)<>1 THEN RAISE EXCEPTION 'credit references missing'; END IF;
  PERFORM public.claim_polaris_generation(u,next_id);
  PERFORM public.settle_polaris_generation(u,next_id,NULL);
  PERFORM public.settle_polaris_generation(u,next_id,NULL);
  IF public.credit_available(u)<>2 THEN RAISE EXCEPTION 'credit refund not exactly once'; END IF;
  UPDATE public.users SET tier='cortex' WHERE id=u;
  next_id := (public.reserve_polaris_generation(u,'plus-next-run')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,next_id);
  PERFORM public.settle_polaris_generation(u,next_id,NULL);
  IF (SELECT reasoning_used FROM public.usage_counters WHERE user_id=u)<>2 THEN RAISE EXCEPTION 'plus failed call charged'; END IF;
  PERFORM set_config('test.user_id','22222222-2222-4222-8222-222222222222',true);
  BEGIN
    PERFORM public.reserve_polaris_generation(u,'other-owner'); RAISE EXCEPTION 'owner guard missing';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.settle_polaris_generation('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',NULL);
    RAISE EXCEPTION 'client settlement allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

DO $$
DECLARE
  u uuid := '11111111-1111-4111-8111-111111111111';
  generation uuid; card jsonb; cards jsonb; before_used int;
BEGIN
  SELECT (patterns->>'role_cards_v1')::jsonb->0 INTO card FROM public.personas WHERE user_id=u;
  cards := jsonb_build_array(card,card||'{"id":"planner","label":"Planner"}'::jsonb);
  UPDATE public.personas SET patterns=patterns||jsonb_build_object('other_pattern','preserved','role_cards_v1',cards::text) WHERE user_id=u;
  PERFORM public.ratify_polaris_role_card(u,card);
  PERFORM public.ratify_polaris_role_card(u,cards->1);
  PERFORM public.ratify_polaris_role_card(u,card); -- Same displayed contents: idempotent.
  IF (SELECT count(*) FROM public.personas p,jsonb_array_elements((p.patterns->>'role_cards_v1')::jsonb) c
      WHERE p.user_id=u AND c->>'status'='ratified')<>2 THEN RAISE EXCEPTION 'sibling approval lost'; END IF;
  IF (SELECT patterns->>'other_pattern' FROM public.personas WHERE user_id=u)<>'preserved' THEN RAISE EXCEPTION 'other pattern overwritten'; END IF;
  BEGIN
    PERFORM public.ratify_polaris_role_card(u,card||'{"summary":"A different card was displayed"}'::jsonb);
    RAISE EXCEPTION 'stale displayed card was approved';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_card_changed' THEN RAISE; END IF; END;
  PERFORM set_config('test.user_id','22222222-2222-4222-8222-222222222222',true);
  BEGIN
    PERFORM public.ratify_polaris_role_card(u,card); RAISE EXCEPTION 'other owner approved card';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.user_id',u::text,true);
  SELECT reasoning_used INTO before_used FROM public.usage_counters WHERE user_id=u;
  generation := (public.reserve_polaris_generation(u,'changed-after-claim')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  UPDATE public.records SET body='Updated while the provider was running.' WHERE user_id=u;
  BEGIN
    PERFORM public.settle_polaris_generation(u,generation,jsonb_build_array(card));
    RAISE EXCEPTION 'settlement accepted changed evidence';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF; END;
  PERFORM public.settle_polaris_generation(u,generation,NULL);
  UPDATE public.records SET body='I build practical tools.' WHERE user_id=u;
  IF (SELECT reasoning_used FROM public.usage_counters WHERE user_id=u)<>before_used THEN RAISE EXCEPTION 'changed evidence was charged'; END IF;
  IF has_function_privilege('authenticated','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.ratify_polaris_role_card(uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'private snapshot or anonymous approval exposed';
  END IF;
END $$;

DO $$
DECLARE
  u uuid := '33333333-3333-4333-8333-333333333333';
  r uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  generation uuid; i int;
  card jsonb := '{"id":"erasable","label":"Erasable","summary":"A disposable derived role","status":"proposed","claimStrength":2,"evidence":{"domains":["work"],"constructs":["self-reported narrative (same-source)"]},"evidenceRefs":["record:dddddddd-dddd-4ddd-8ddd-dddddddddddd"]}';
BEGIN
  INSERT INTO auth.users VALUES(u);
  INSERT INTO public.users(id) VALUES(u);
  INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES(r,u,'audit_response','work',ARRAY['interview'],'A disposable interview.');
  PERFORM set_config('test.user_id',u::text,true);
  generation := (public.reserve_polaris_generation(u,'erase-running')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  DELETE FROM public.records WHERE id=r;
  IF NOT EXISTS(SELECT 1 FROM public.polaris_generations WHERE id=generation AND status='failed' AND evidence='[]'::jsonb) THEN
    RAISE EXCEPTION 'record deletion retained an active reservation or evidence hash';
  END IF;
  IF (public.polaris_generation_status(u)->>'intro_remaining')::int<>2 THEN RAISE EXCEPTION 'erased reservation was charged'; END IF;
  INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES(r,u,'audit_response','work',ARRAY['interview'],'A disposable interview.');
  FOR i IN 1..2 LOOP
    generation := (public.reserve_polaris_generation(u,'erasure-intro-'||i)->>'generation_id')::uuid;
    PERFORM public.claim_polaris_generation(u,generation);
    PERFORM public.settle_polaris_generation(u,generation,jsonb_build_array(card));
  END LOOP;
  PERFORM public.ratify_polaris_role_card(u,card);
  generation := (public.reserve_polaris_generation(u,'erase-paid-running')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  -- Execute the real locked 0189 function as fixture owner, not a fake sweep.
  PERFORM public.erase_my_data('content');
  IF EXISTS(SELECT 1 FROM public.records WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.personas WHERE user_id=u) THEN
    RAISE EXCEPTION 'content wipe retained source or derived content';
  END IF;
  IF EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id=u AND evidence<>'[]'::jsonb)
    OR EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id=u AND status IN ('reserved','running')) THEN
    RAISE EXCEPTION 'content wipe retained active generation or evidence hash';
  END IF;
  IF (SELECT reasoning_used FROM public.usage_counters WHERE user_id=u)<>0 THEN RAISE EXCEPTION 'content wipe failed to refund paid reservation'; END IF;
  IF (public.polaris_generation_status(u)->>'intro_remaining')::int<>0 THEN RAISE EXCEPTION 'content wipe reset lifetime quota'; END IF;
  IF public.settle_polaris_generation(u,generation,jsonb_build_array(card)) THEN RAISE EXCEPTION 'late callback resurrected wiped content'; END IF;
  INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES(r,u,'audit_response','work',ARRAY['interview'],'Another disposable interview.');
  generation := (public.reserve_polaris_generation(u,'deletion-fence-running')->>'generation_id')::uuid;
  PERFORM public.claim_polaris_generation(u,generation);
  INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES(u,'44444444-4444-4444-8444-444444444444');
  BEGIN PERFORM public.reserve_polaris_generation(u,'after-delete-fence'); RAISE EXCEPTION 'deletion fence allowed reserve'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.claim_polaris_generation(u,generation); RAISE EXCEPTION 'deletion fence allowed claim'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.settle_polaris_generation(u,generation,jsonb_build_array(card)); RAISE EXCEPTION 'deletion fence allowed content persistence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.ratify_polaris_role_card(u,card); RAISE EXCEPTION 'deletion fence allowed approval'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.settle_polaris_generation(u,generation,NULL);
  IF (SELECT reasoning_used FROM public.usage_counters WHERE user_id=u)<>0 THEN RAISE EXCEPTION 'deletion fence prevented refund'; END IF;
  DELETE FROM auth.users WHERE id=u;
  IF EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id=u) THEN RAISE EXCEPTION 'account deletion retained Polaris ledger'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.polaris_generation_config) THEN RAISE EXCEPTION 'account deletion removed global config'; END IF;
END $$;
SELECT 'PASS: record/content/account erasure, quota-preserving cleanup, late callback and existing deletion fence' AS erasure_result;
SELECT 'PASS: Polaris lifetime two, shared plan, no-charge failures, idempotency, owner and service grants' AS result;
