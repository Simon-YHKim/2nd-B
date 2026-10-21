\set ON_ERROR_STOP on
-- Scratch PostgreSQL only: replay ALL numbered migrations, then apply the draft
-- with --single-transaction before running this file. Fixtures always roll back.
-- T04-T08 and the sequential side of T09. Two-connection races are separate:
-- 0/reask+reask => first,reask; 0/first+first => first,rejected;
-- 1/reask+reask => reask,rejected; mixed 0 => order-dependent late-first rejection.
-- Also race a new bump, refund and claim against admission under real connections.
BEGIN;

CREATE FUNCTION pg_temp.t39_id(n integer, kind integer DEFAULT 1) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('26102139-0000-4000-800' || kind || '-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.t39_check(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'T39 FAIL: %', label; END IF;
  RAISE NOTICE 'T39 PASS: %', label;
END;
$$;
CREATE FUNCTION pg_temp.t39_error(statement text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END;
$$;
CREATE FUNCTION pg_temp.t39_admit(n integer, intent text, slot integer DEFAULT 3) RETURNS jsonb
LANGUAGE sql VOLATILE AS $$
  SELECT public.begin_chat_turn_attempt_with_quota(
    pg_temp.t39_id(n), pg_temp.t39_id(n, slot), pg_temp.t39_id(n, 2), 'openai', intent)
$$;
CREATE FUNCTION pg_temp.t39_reply(kind text, reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'allowed', kind <> 'rejected', 'kind', kind,
    'attempt', CASE kind WHEN 'first' THEN 1 WHEN 'reask' THEN 2 ELSE NULL END,
    'quotaCharged', kind IN ('first', 'unbound'),
    'bindingEligible', kind IN ('first', 'reask'), 'reaskAvailable', kind = 'first',
    'error', reason)
$$;
CREATE FUNCTION pg_temp.t39_snapshot() RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'reservations', (SELECT jsonb_agg(to_jsonb(r) ORDER BY turn_id) FROM public.chat_turn_reservations r),
    'chat', (SELECT jsonb_agg(to_jsonb(c) ORDER BY user_id, day) FROM public.chat_usage c),
    'purpose', (SELECT jsonb_agg(to_jsonb(q) ORDER BY user_id, kst_day, purpose) FROM public.llm_proxy_purpose_daily q))
$$;

-- T04: effective ACL and actual calls are both checked. JWT role text cannot
-- confer SQL EXECUTE; the service caller must also carry the server role claim.
DO $$
DECLARE r text; f regprocedure := 'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)'::regprocedure;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    PERFORM pg_temp.t39_check(has_function_privilege(r, f, 'EXECUTE') = (r = 'service_role'), 'T04 execute ' || r);
    PERFORM pg_temp.t39_check(NOT has_table_privilege(r, 'public.chat_turn_reservations', 'SELECT,INSERT,UPDATE,DELETE'), 'T04 reservation ACL unchanged ' || r);
    PERFORM pg_temp.t39_check(NOT has_table_privilege(r, 'public.llm_proxy_purpose_daily', 'SELECT,INSERT,UPDATE,DELETE'), 'T04 quota ACL unchanged ' || r);
  END LOOP;
  PERFORM pg_temp.t39_check(NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
    WHERE p.oid = f AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 'T04 no PUBLIC execute');
  PERFORM pg_temp.t39_check((SELECT prosecdef AND provolatile = 'v' AND proconfig @> ARRAY['search_path=""']
    FROM pg_proc WHERE oid = f), 'T04 volatile definer empty path');
END;
$$;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL ROLE anon;
SELECT pg_temp.t39_check(pg_temp.t39_error($q$SELECT pg_temp.t39_admit(1,'first')$q$) = '42501', 'T04 anon denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t39_check(pg_temp.t39_error($q$SELECT pg_temp.t39_admit(1,'first')$q$) = '42501', 'T04 authenticated denied with service claim');
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.t39_check(pg_temp.t39_error($q$SELECT pg_temp.t39_admit(1,'first')$q$) = '42501', 'T04 service without service claim denied');
SET LOCAL request.jwt.claim.role = '';
SET LOCAL request.jwt.claims = '{}';
SELECT pg_temp.t39_check(pg_temp.t39_error($q$SELECT pg_temp.t39_admit(1,'first')$q$) = '42501', 'T04 missing claim denied');
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';

-- Only synthetic local users. Trigger compatibility matches the numbered CI fixture.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email)
SELECT pg_temp.t39_id(n), 't39-' || n || '@example.invalid' FROM generate_series(1, 24) n;
SET LOCAL session_replication_role = origin;
INSERT INTO public.users(id,email,birth_date,locale)
SELECT pg_temp.t39_id(n), 't39-' || n || '@example.invalid', DATE '1990-01-01', 'en' FROM generate_series(1, 24) n;
INSERT INTO public.chat_usage(user_id,day,count)
SELECT pg_temp.t39_id(n), (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date, 1 FROM generate_series(1, 24) n;
INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at)
SELECT pg_temp.t39_id(n,2), pg_temp.t39_id(n), (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,
  clock_timestamp() - interval '1 second' FROM generate_series(1, 24) n;

-- Required arguments/provider/intent, including SQL NULL, fail before any write.
DO $$
DECLARE before_state jsonb := pg_temp.t39_snapshot(); args text[]; i integer; a text[];
BEGIN
  args := ARRAY[quote_literal(pg_temp.t39_id(6)), quote_literal(pg_temp.t39_id(6,3)),
    quote_literal(pg_temp.t39_id(6,2)), quote_literal('openai'), quote_literal('first')];
  FOR i IN 1..5 LOOP
    a := args; a[i] := 'NULL';
    PERFORM pg_temp.t39_check(pg_temp.t39_error('SELECT public.begin_chat_turn_attempt_with_quota(' || array_to_string(a, ',') || ')') = '22023', 'T04 required argument ' || i);
  END LOOP;
  FOREACH a SLICE 1 IN ARRAY ARRAY[ARRAY['gemini','first'],ARRAY['claude','first'],ARRAY['xai','first'],
    ARRAY['openai','FIRST'],ARRAY['openai',''],ARRAY['openai','other']] LOOP
    args[4] := quote_literal(a[1]); args[5] := quote_literal(a[2]);
    PERFORM pg_temp.t39_check(pg_temp.t39_error('SELECT public.begin_chat_turn_attempt_with_quota(' || array_to_string(args, ',') || ')') = '22023', 'T04 invalid provider/intent ' || array_to_string(a, '/'));
  END LOOP;
  PERFORM pg_temp.t39_check(pg_temp.t39_snapshot() = before_state, 'T04 invalid arguments changed no rows');
END;
$$;

-- T05/T06: intent is not the server attempt number. Real service SQL role.
SET LOCAL ROLE service_role;
SELECT pg_temp.t39_check(pg_temp.t39_admit(1, 'first') = pg_temp.t39_reply('first'), 'T05 first zero to one');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'reask') = pg_temp.t39_reply('first'), 'T05 reask zero to one charges');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'first', 5) = pg_temp.t39_reply('rejected', 'first_already_registered'), 'T06 late first rejected');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'reask', 3) = pg_temp.t39_reply('rejected', 'reask_ineligible'), 'T07 repeated audit id rejected');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'reask', 4) = pg_temp.t39_reply('reask'), 'T07 second reask exempt');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'reask', 5) = pg_temp.t39_reply('rejected', 'reask_ineligible'), 'T07 third attempt rejected');
SELECT pg_temp.t39_check(pg_temp.t39_admit(2, 'first', 5) = pg_temp.t39_reply('rejected', 'first_already_registered'), 'T06 first after second rejected');
RESET ROLE;
SELECT pg_temp.t39_check((SELECT count(*) = 2 AND bool_and(count = 1) FROM public.llm_proxy_purpose_daily
  WHERE user_id IN (pg_temp.t39_id(1),pg_temp.t39_id(2)) AND purpose = 'secondb_chat'), 'T05/T06 purpose exactly once each');
SELECT pg_temp.t39_check((SELECT attempts = 2 AND attempt1_audit_id = pg_temp.t39_id(2,3) AND attempt2_audit_id = pg_temp.t39_id(2,4)
  FROM public.chat_turn_reservations WHERE turn_id = pg_temp.t39_id(2,2)), 'T06 late first did not take a slot');

-- Audit writes belong to the no-SET-ROLE server session, as in the 0255 fixture.
INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,created_at,purpose,event_source)
SELECT pg_temp.t39_id(2,k),pg_temp.t39_id(2),'0a0b','0c0d','local-test',false,'green',1,
  clock_timestamp(),'secondb_chat','server_verified' FROM generate_series(3,5) k;
SELECT pg_temp.t39_check(public.claim_chat_turn_for_audit(pg_temp.t39_id(2),pg_temp.t39_id(2,4),pg_temp.t39_id(2,2)), 'T06 admitted second can claim');
SELECT pg_temp.t39_check(NOT public.claim_chat_turn_for_audit(pg_temp.t39_id(2),pg_temp.t39_id(2,5),pg_temp.t39_id(2,2)), 'T06 rejected late first cannot claim');
SELECT pg_temp.t39_check(NOT public.claim_chat_turn_for_audit(pg_temp.t39_id(2),pg_temp.t39_id(2,3),pg_temp.t39_id(2,2)), 'T06 earlier answer cannot replace second');

-- T04: a foreign reservation is indistinguishable from a missing one. First
-- charges normally as unbound; reask does not charge, reveal or alter that row.
DO $$
DECLARE missing jsonb; foreign_reply jsonb; before_turn jsonb;
BEGIN
  SELECT to_jsonb(r) INTO before_turn FROM public.chat_turn_reservations r WHERE turn_id = pg_temp.t39_id(2,2);
  missing := public.begin_chat_turn_attempt_with_quota(pg_temp.t39_id(5),pg_temp.t39_id(5,3),pg_temp.t39_id(99,2),'openai','reask');
  foreign_reply := public.begin_chat_turn_attempt_with_quota(pg_temp.t39_id(5),pg_temp.t39_id(5,3),pg_temp.t39_id(2,2),'openai','reask');
  PERFORM pg_temp.t39_check(missing = pg_temp.t39_reply('rejected','reask_ineligible') AND foreign_reply = missing, 'T04 missing and foreign reask same');
  missing := public.begin_chat_turn_attempt_with_quota(pg_temp.t39_id(5),pg_temp.t39_id(5,3),pg_temp.t39_id(99,2),'openai','first');
  foreign_reply := public.begin_chat_turn_attempt_with_quota(pg_temp.t39_id(5),pg_temp.t39_id(5,4),pg_temp.t39_id(2,2),'openai','first');
  PERFORM pg_temp.t39_check(missing = pg_temp.t39_reply('unbound') AND foreign_reply = missing, 'T04 missing and foreign first same');
  PERFORM pg_temp.t39_check((SELECT to_jsonb(r) = before_turn FROM public.chat_turn_reservations r WHERE turn_id = pg_temp.t39_id(2,2)), 'T04 foreign reservation unchanged');
  PERFORM pg_temp.t39_check((SELECT count = 2 FROM public.llm_proxy_purpose_daily WHERE user_id = pg_temp.t39_id(5)), 'T04 unbound purpose exactly twice');
END;
$$;

-- T07: an already charged legacy first remains eligible at the purpose cap.
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count)
SELECT pg_temp.t39_id(n),(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,'secondb_chat',5 FROM unnest(ARRAY[3,4]) n;
SELECT pg_temp.t39_check(public.begin_chat_turn_attempt(pg_temp.t39_id(4),pg_temp.t39_id(4,3),pg_temp.t39_id(4,2)), 'T07 legacy first fixture');
SELECT pg_temp.t39_check(pg_temp.t39_admit(4,'reask',4) = pg_temp.t39_reply('reask'), 'T07 legacy second at 5/5 exempt');
SELECT pg_temp.t39_check((SELECT count = 5 FROM public.llm_proxy_purpose_daily WHERE user_id = pg_temp.t39_id(4)), 'T07 cap unchanged');

-- T08: assert rows BEFORE the expected SQLSTATE, so replacing RAISE with a
-- normal rejection is caught by residual registration, not by syntax or types.
-- The old quota row would be pruned by consume; the rejection must undo that too.
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count)
VALUES (pg_temp.t39_id(3),(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 46,'secondb_chat',1);
DO $$
DECLARE before_state jsonb := pg_temp.t39_snapshot(); err text; intent text;
BEGIN
  FOREACH intent IN ARRAY ARRAY['first','reask'] LOOP
    err := pg_temp.t39_error(format('SELECT pg_temp.t39_admit(3,%L)',intent));
    PERFORM pg_temp.t39_check(pg_temp.t39_snapshot() = before_state, 'T08 quota rejection rolled back registration and cleanup ' || intent);
    PERFORM pg_temp.t39_check(err = 'T3901', 'T08 only normal quota denial is T3901 ' || intent);
  END LOOP;
  err := pg_temp.t39_error(format('SELECT public.begin_chat_turn_attempt_with_quota(%L,%L,%L,%L,%L)',
    pg_temp.t39_id(3),pg_temp.t39_id(3,3),pg_temp.t39_id(99,2),'openai','first'));
  PERFORM pg_temp.t39_check(pg_temp.t39_snapshot() = before_state AND err = 'T3901', 'T08 unbound cap denial also atomic');
END;
$$;

-- T07: refunded, future-issued, nonlatest and spent reservations use existing
-- begin eligibility. A failed first with no prior registration is unbound.
UPDATE public.chat_turn_reservations SET issued_at = clock_timestamp() + interval '1 hour' WHERE turn_id = pg_temp.t39_id(10,2);
SELECT pg_temp.t39_check(pg_temp.t39_admit(10,'reask') = pg_temp.t39_reply('rejected','reask_ineligible'), 'T07 future reask ineligible');
SELECT pg_temp.t39_check(pg_temp.t39_admit(10,'first') = pg_temp.t39_reply('unbound'), 'T07 future first unbound');
SELECT pg_temp.t39_check((SELECT attempts = 0 FROM public.chat_turn_reservations WHERE turn_id = pg_temp.t39_id(10,2)), 'T07 unbound has no registration');
SELECT pg_temp.t39_check(pg_temp.t39_admit(11,'first') = pg_temp.t39_reply('first'), 'T07 nonlatest first fixture');
INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at)
VALUES (pg_temp.t39_id(11,6),pg_temp.t39_id(11),(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,clock_timestamp());
SELECT pg_temp.t39_check(pg_temp.t39_admit(11,'reask',4) = pg_temp.t39_reply('rejected','reask_ineligible'), 'T07 nonlatest reask ineligible');
UPDATE public.chat_turn_reservations SET state = 'refunded',audit_id = pg_temp.t39_id(12,3),attempts = 1,
  attempt1_audit_id = pg_temp.t39_id(12,3),attempted_at = clock_timestamp() WHERE turn_id = pg_temp.t39_id(12,2);
SELECT pg_temp.t39_check(pg_temp.t39_admit(12,'reask',4) = pg_temp.t39_reply('rejected','reask_ineligible'), 'T07 refunded reask ineligible');

-- Date contract: counted day may differ from issue day and from the server's
-- first-admission day. No calendar-equality check and no automatic chat refund.
UPDATE public.chat_usage SET day = day - 1 WHERE user_id = pg_temp.t39_id(7);
UPDATE public.chat_turn_reservations SET counted_day = counted_day - 1 WHERE user_id = pg_temp.t39_id(7);
UPDATE public.chat_usage SET day = day + 1 WHERE user_id = pg_temp.t39_id(8);
UPDATE public.chat_turn_reservations SET counted_day = counted_day + 1 WHERE user_id = pg_temp.t39_id(8);
SELECT pg_temp.t39_check(pg_temp.t39_admit(7,'first') = pg_temp.t39_reply('first'), 'date yesterday counted today first');
SELECT pg_temp.t39_check(pg_temp.t39_admit(8,'reask') = pg_temp.t39_reply('first'), 'date device day differs first reask');
SELECT pg_temp.t39_check((SELECT count(*) = 2 AND bool_and(kst_day = (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date AND count = 1)
  FROM public.llm_proxy_purpose_daily WHERE user_id IN (pg_temp.t39_id(7),pg_temp.t39_id(8))), 'date first quota uses server KST');
UPDATE public.chat_usage SET day = day - 1 WHERE user_id = pg_temp.t39_id(9);
UPDATE public.chat_turn_reservations SET counted_day = counted_day - 1, issued_at = clock_timestamp() - interval '1 day',
  attempts = 1, attempt1_audit_id = pg_temp.t39_id(9,3), attempted_at = clock_timestamp() - interval '1 day' WHERE user_id = pg_temp.t39_id(9);
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count)
VALUES (pg_temp.t39_id(9),(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 1,'secondb_chat',1);
SELECT pg_temp.t39_check(pg_temp.t39_admit(9,'reask',4) = pg_temp.t39_reply('reask'), 'date yesterday first today second');
SELECT pg_temp.t39_check((SELECT count(*) = 1 AND bool_and(kst_day = (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 1 AND count = 1)
  FROM public.llm_proxy_purpose_daily WHERE user_id = pg_temp.t39_id(9)), 'date second changes neither day quota');

-- No separate daily exemption cap: six independent previously charged turns
-- may each use their second slot on the same server day. Older answered rows
-- are retained; each succeeding row is latest when it asks.
DO $$
DECLARE i integer; turn uuid;
BEGIN
  FOR i IN 1..6 LOOP
    turn := pg_temp.t39_id(100+i,2);
    INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at,state,audit_id,attempts,attempt1_audit_id,attempted_at)
    VALUES (turn,pg_temp.t39_id(13),(clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 1,
      clock_timestamp(),'answered',pg_temp.t39_id(100+i,3),1,pg_temp.t39_id(100+i,3),clock_timestamp());
    PERFORM pg_temp.t39_check(public.begin_chat_turn_attempt_with_quota(pg_temp.t39_id(13),pg_temp.t39_id(100+i,4),turn,'openai','reask')
      = pg_temp.t39_reply('reask'), 'T07 no daily exemption cap ' || i);
  END LOOP;
  PERFORM pg_temp.t39_check(NOT EXISTS(SELECT 1 FROM public.llm_proxy_purpose_daily WHERE user_id = pg_temp.t39_id(13)), 'T07 six exemptions no purpose write');
END;
$$;

-- Fault injection is scoped to a subtransaction and restores 0259 each time.
-- Real RPC errors keep their SQLSTATE; missing/extra/malformed rows fail closed.
DO $$
DECLARE body text; expected text; before_state jsonb; err text; sample record;
BEGIN
  FOR sample IN SELECT * FROM (VALUES
    ('policy', 'RAISE EXCEPTION ''local quota policy unavailable'' USING ERRCODE = ''P0001'';', 'P0001'),
    ('missing', 'RETURN;', 'P0002'),
    ('multiple', 'RETURN QUERY SELECT true,1,5; RETURN QUERY SELECT true,2,5;', 'P0003'),
    ('null', 'RETURN QUERY SELECT NULL::boolean,1,5;', '55000'),
    ('used_null', 'RETURN QUERY SELECT true,NULL::integer,5;', '55000'),
    ('limit_null', 'RETURN QUERY SELECT true,1,NULL::integer;', '55000'),
    ('used_zero', 'RETURN QUERY SELECT true,0,5;', '55000'),
    ('limit_zero', 'RETURN QUERY SELECT true,1,0;', '55000'),
    ('limit_large', 'RETURN QUERY SELECT true,1,10001;', '55000'),
    ('true_over', 'RETURN QUERY SELECT true,6,5;', '55000'),
    ('false_under', 'RETURN QUERY SELECT false,1,5;', '55000')
  ) AS cases(label, body, expected) LOOP
    BEGIN
      body := 'BEGIN UPDATE public.chat_usage SET count=count+1 WHERE user_id=p_user_id; ' || sample.body || ' END;';
      EXECUTE 'CREATE OR REPLACE FUNCTION public.consume_llm_proxy_purpose_quota(p_user_id uuid,p_provider text,p_purpose text)
        RETURNS TABLE(allowed boolean,used integer,quota_limit integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '''' AS ' || quote_literal(body);
      before_state := pg_temp.t39_snapshot();
      err := pg_temp.t39_error($q$SELECT pg_temp.t39_admit(14,'first')$q$);
      PERFORM pg_temp.t39_check(pg_temp.t39_snapshot() = before_state, 'T08 lower error rolls back both writes ' || sample.label);
      PERFORM pg_temp.t39_check(err = sample.expected AND err <> 'T3901', 'T08 error classification ' || sample.label);
      RAISE EXCEPTION USING ERRCODE = 'ZX039', MESSAGE = 'restore local quota fixture';
    EXCEPTION WHEN SQLSTATE 'ZX039' THEN NULL;
    END;
  END LOOP;
END;
$$;

-- Invalid begin outcomes are admission errors; they cannot become unbound.
DO $$
DECLARE body text; before_state jsonb; err text;
BEGIN
  FOREACH body IN ARRAY ARRAY['BEGIN RETURN NULL; END;', 'BEGIN RETURN true; END;'] LOOP
    BEGIN
      EXECUTE 'CREATE OR REPLACE FUNCTION public.begin_chat_turn_attempt(p_user_id uuid,p_audit_id uuid,p_turn_id uuid)
        RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '''' AS ' || quote_literal(body);
      before_state := pg_temp.t39_snapshot();
      err := pg_temp.t39_error($q$SELECT pg_temp.t39_admit(14,'first')$q$);
      PERFORM pg_temp.t39_check(pg_temp.t39_snapshot() = before_state AND err = '55000', 'T08 invalid begin outcome rolls back');
      RAISE EXCEPTION USING ERRCODE = 'ZX039', MESSAGE = 'restore local begin fixture';
    EXCEPTION WHEN SQLSTATE 'ZX039' THEN NULL;
    END;
  END LOOP;
END;
$$;

SELECT pg_temp.t39_check((SELECT count(*) = 24 AND bool_and(count = 1) FROM public.chat_usage
  WHERE user_id::text LIKE '26102139-0000-%'), 'T05 all admissions added zero chat bumps');
SELECT pg_temp.t39_check(NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE attempts > 2), 'T09 slot ceiling');
ROLLBACK;
