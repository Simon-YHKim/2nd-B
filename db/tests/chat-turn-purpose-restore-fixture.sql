\set ON_ERROR_STOP on
-- Extends the unchanged S fixture in a disposable clone only.
CREATE SCHEMA t40f;
CREATE FUNCTION t40f.today() RETURNS date LANGUAGE sql VOLATILE AS $$
 SELECT (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date
$$;
CREATE FUNCTION t40f.setup(n int, attempts int DEFAULT 1, first_zone text DEFAULT 'red',
 second_zone text DEFAULT 'red') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM t40.setup(n,0);
 DELETE FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id(n);
 PERFORM t40.admit(n,'first',3);
 PERFORM t40.audit(n,3,first_zone);
 PERFORM t40.claim(n,3);
 IF attempts=2 THEN
   PERFORM t40.admit(n,'reask',4);
   PERFORM t40.audit(n,4,second_zone);
   PERFORM t40.claim(n,4);
 END IF;
END;
$$;
CREATE FUNCTION t40f.pair(n int, other_day date DEFAULT t40f.today()) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM t40f.setup(n);
 PERFORM t40.audit(n,5);
 INSERT INTO public.chat_usage(user_id,day,count) VALUES(t40.id(n),other_day,4)
 ON CONFLICT(user_id,day) DO UPDATE SET count=4;
 UPDATE public.llm_proxy_purpose_daily SET count=4 WHERE user_id=t40.id(n);
 INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at,state,audit_id,
 attempts,attempt1_audit_id,attempted_at,attempt1_delivered,quota_day)
 VALUES(t40.id(n,6),t40.id(n),other_day,clock_timestamp(),'answered',t40.id(n,5),
 1,t40.id(n,5),clock_timestamp(),true,t40f.today());
END;
$$;
CREATE FUNCTION t40f.quota(n int, d date DEFAULT t40f.today()) RETURNS int LANGUAGE sql AS $$
 SELECT COALESCE((SELECT count FROM public.llm_proxy_purpose_daily
 WHERE user_id=t40.id(n) AND kst_day=d AND purpose='secondb_chat'),0)
$$;
CREATE FUNCTION t40f.markers(n int, d date DEFAULT t40f.today()) RETURNS bigint LANGUAGE sql AS $$
 SELECT count(*) FROM public.chat_turn_reservations WHERE user_id=t40.id(n) AND purpose_restored_day=d
$$;
CREATE FUNCTION t40f.consume(n int) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE result boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('role','service_role',true);
 SELECT allowed INTO STRICT result FROM public.consume_llm_proxy_purpose_quota(t40.id(n),'openai','secondb_chat');
 PERFORM set_config('role','none',true);
 PERFORM set_config('request.jwt.claim.role','',true);
 RETURN result;
END;
$$;
