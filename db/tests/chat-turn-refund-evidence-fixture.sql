\set ON_ERROR_STOP on
-- Synthetic, committed helpers only in the disposable T40 clone. No live data.
CREATE SCHEMA t40;
GRANT USAGE ON SCHEMA t40 TO authenticated, service_role, anon;
CREATE FUNCTION t40.id(n int, slot int DEFAULT 1) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('26102240-0000-4000-' || lpad(slot::text,4,'0') || '-' || lpad(n::text,12,'0'))::uuid
$$;
CREATE FUNCTION t40.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'T40 FAIL: %', label USING ERRCODE='P0040'; END IF;
 RAISE NOTICE 'T40 PASS: %', label;
END;
$$;
CREATE FUNCTION t40.setup(n int, attempts int DEFAULT 0, usage_count int DEFAULT 2) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d date := (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
 PERFORM set_config('session_replication_role','replica',true);
 INSERT INTO auth.users(id,email) VALUES (t40.id(n),'t40-'||n||'@example.invalid');
 PERFORM set_config('session_replication_role','origin',true);
 INSERT INTO public.users(id,email,birth_date,locale)
 VALUES(t40.id(n),'t40-'||n||'@example.invalid',DATE '1990-01-01','en');
 INSERT INTO public.chat_usage(user_id,day,count) VALUES(t40.id(n),d,usage_count);
 INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count) VALUES(t40.id(n),d,'secondb_chat',3);
 INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at,attempts,
   attempt1_audit_id,attempt2_audit_id,attempted_at)
 VALUES(t40.id(n,2),t40.id(n),d,clock_timestamp()-interval '1 second',attempts,
   CASE WHEN attempts>=1 THEN t40.id(n,3) END, CASE WHEN attempts=2 THEN t40.id(n,4) END,
   CASE WHEN attempts>0 THEN clock_timestamp()-interval '1 second' END);
END;
$$;
CREATE FUNCTION t40.audit(n int, slot int DEFAULT 3, zone text DEFAULT 'red',
 source text DEFAULT 'server_verified', purpose text DEFAULT 'secondb_chat', age interval DEFAULT interval '0')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,
 safety_zone,latency_ms,created_at,purpose,event_source)
 VALUES(t40.id(n,slot),t40.id(n),'00','00','fixture',false,zone::public.safety_zone,1,
 clock_timestamp()-age,purpose,source);
END;
$$;
-- Call real entrypoints under their real SQL roles. JWTs never confer EXECUTE.
CREATE FUNCTION t40.begin_attempt(n int, slot int DEFAULT 3) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE result boolean;
BEGIN
 PERFORM set_config('role','service_role',true);
 result := public.begin_chat_turn_attempt(t40.id(n),t40.id(n,slot),t40.id(n,2));
 PERFORM set_config('role','none',true); RETURN result;
END;
$$;
CREATE FUNCTION t40.claim(n int, slot int DEFAULT 3) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE result boolean;
BEGIN
 PERFORM set_config('role','service_role',true);
 result := public.claim_chat_turn_for_audit(t40.id(n),t40.id(n,slot),t40.id(n,2));
 PERFORM set_config('role','none',true); RETURN result;
END;
$$;
CREATE FUNCTION t40.refund(n int, slot int DEFAULT 3) RETURNS int LANGUAGE plpgsql AS $$
DECLARE result int;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',t40.id(n)::text,true);
 PERFORM set_config('role','authenticated',true);
 result := public.refund_chat_turn_after_output_swap(t40.id(n,slot));
 PERFORM set_config('role','none',true); RETURN result;
END;
$$;
CREATE FUNCTION t40.bump(n int, d date DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',t40.id(n)::text,true);
 PERFORM set_config('role','authenticated',true);
 result := public.bump_chat_usage_for_turn(t40.id(n),d);
 PERFORM set_config('role','none',true); RETURN result;
END;
$$;
CREATE FUNCTION t40.admit(n int, intent text, slot int) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('role','service_role',true);
 result := public.begin_chat_turn_attempt_with_quota(t40.id(n),t40.id(n,slot),t40.id(n,2),'openai',intent);
 PERFORM set_config('role','none',true);
 PERFORM set_config('request.jwt.claim.role','',true); RETURN result;
END;
$$;
CREATE FUNCTION t40.error(statement text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE statement; RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END;
$$;
CREATE FUNCTION t40.snapshot(n int) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'r',(SELECT jsonb_agg(to_jsonb(r) ORDER BY turn_id) FROM public.chat_turn_reservations r WHERE user_id=t40.id(n)),
 'c',(SELECT jsonb_agg(to_jsonb(c) ORDER BY day) FROM public.chat_usage c WHERE user_id=t40.id(n)),
 'q',(SELECT jsonb_agg(to_jsonb(q) ORDER BY kst_day,purpose) FROM public.llm_proxy_purpose_daily q WHERE user_id=t40.id(n)),
 'l',(SELECT jsonb_agg(to_jsonb(l) ORDER BY audit_id) FROM public.chat_turn_refunds l
 WHERE audit_id IN (SELECT id FROM public.ai_audit_log WHERE user_id=t40.id(n))))
$$;
