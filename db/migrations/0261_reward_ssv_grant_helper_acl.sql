-- 0261: after 0214, remove the two legacy direct-grant entry points.
-- The deployed v104 Edge calls v3 -> v2 -> these helpers; the same-owner
-- SECURITY DEFINER chain still calls them after caller EXECUTE is revoked.
-- Apply transactionally. No data rewrite, new table, or automatic rollback.
SET LOCAL lock_timeout = '10s';
DO $preconditions$
DECLARE
  v_v2 regprocedure := to_regprocedure('public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)');
  v_v3 regprocedure := to_regprocedure('public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)');
  v_reasoning regprocedure := to_regprocedure('public.grant_reward_credits_ssv(uuid,text,integer,text)');
  v_chat regprocedure := to_regprocedure('public.grant_chat_ad_bonus_ssv(uuid,text)');
  v_owner oid;
BEGIN
  IF v_v2 IS NULL OR v_v3 IS NULL OR v_reasoning IS NULL OR v_chat IS NULL THEN
    RAISE EXCEPTION 'SSV helper ACL requires 0172, 0196, 0213 and 0214';
  END IF;
  SELECT proowner INTO v_owner FROM pg_catalog.pg_proc WHERE oid = v_v3;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc
             WHERE oid IN (v_v2, v_v3, v_reasoning, v_chat)
               AND (NOT prosecdef OR proowner <> v_owner))
     OR NOT has_function_privilege('service_role', v_v3, 'EXECUTE')
     OR has_function_privilege('service_role', v_v2, 'EXECUTE')
     OR (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_v3) !~ 'settle_reward_ssv_ticket_v2'
     OR (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_v2) !~ 'grant_reward_credits_ssv'
     OR (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_v2) !~ 'grant_chat_ad_bonus_ssv' THEN
    RAISE EXCEPTION 'SSV helper ACL requires the same-owner definer chain and v2 direct access already revoked';
  END IF;
END
$preconditions$;

REVOKE ALL ON FUNCTION public.grant_reward_credits_ssv(uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_chat_ad_bonus_ssv(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $postconditions$
DECLARE
  v_role text;
  v_fn text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH v_fn IN ARRAY ARRAY[
      'public.grant_reward_credits_ssv(uuid,text,integer,text)',
      'public.grant_chat_ad_bonus_ssv(uuid,text)',
      'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)'
    ] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'SSV helper ACL still permits % to execute %', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_function_privilege('service_role',
       'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.settle_reward_ssv_ticket_v3(text,text,text,integer,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SSV helper ACL requires v3 to stay service-role only';
  END IF;
END
$postconditions$;
