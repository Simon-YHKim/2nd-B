\set ON_ERROR_STOP on
-- S-specific expectations in a separate clone. Historical 0255 regression is unchanged.
BEGIN;
CREATE TEMP TABLE t40_closure_updates(turn_id uuid);
CREATE FUNCTION t40.track_closure_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.user_id=t40.id(28) THEN INSERT INTO pg_temp.t40_closure_updates VALUES(NEW.turn_id); END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t40_track_closure AFTER UPDATE OF binding_closed ON public.chat_turn_reservations
 FOR EACH ROW EXECUTE FUNCTION t40.track_closure_update();
DO $contracts$
DECLARE n int; f text; role_name text; expected_role text; b jsonb; before_state jsonb; got text;
BEGIN
 FOREACH f IN ARRAY ARRAY['bump_chat_usage_for_turn(uuid,date)','begin_chat_turn_attempt(uuid,uuid,uuid)',
   'claim_chat_turn_for_audit(uuid,uuid,uuid)','refund_chat_turn_after_output_swap(uuid)'] LOOP
  expected_role := CASE WHEN f LIKE 'begin%' OR f LIKE 'claim%' THEN 'service_role' ELSE 'authenticated' END;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   PERFORM t40.check(has_function_privilege(role_name,'public.'||f,'EXECUTE')=(role_name=expected_role),'ACL '||f||' '||role_name);
  END LOOP;
 END LOOP;
 PERFORM t40.check((SELECT proargnames=ARRAY['p_audit_id'] AND prorettype='int4'::regtype
   FROM pg_proc WHERE oid='public.refund_chat_turn_after_output_swap(uuid)'::regprocedure),'#2697 p_audit_id and int unchanged');
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  PERFORM t40.check(NOT has_table_privilege(role_name,'public.chat_turn_reservations','SELECT,INSERT,UPDATE,DELETE'),'no direct table access '||role_name);
 END LOOP;
 PERFORM t40.check((SELECT relrowsecurity FROM pg_class WHERE oid='public.chat_turn_reservations'::regclass)
  AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.chat_turn_reservations'::regclass),'policy-less RLS');

 -- T1: second answer arrives first; late first cannot replace it, but is refundable.
 PERFORM t40.setup(1); PERFORM t40.audit(1,3); PERFORM t40.audit(1,4); PERFORM t40.audit(1,5);
 PERFORM t40.check(t40.begin_attempt(1,3) AND t40.begin_attempt(1,4),'T1 two attempts');
 PERFORM t40.check(t40.claim(1,4) AND NOT t40.claim(1,3),'T1 second true late first false');
 PERFORM t40.check(NOT t40.begin_attempt(1,5) AND NOT t40.claim(1,5),'T1 third attempt denied');
 got := concat_ws(',',coalesce(t40.refund(1,3)::text,'null'),coalesce(t40.refund(1,4)::text,'null'),
   coalesce(t40.refund(1,5)::text,'null'),coalesce(t40.refund(1,3)::text,'null'));
 PERFORM t40.check(got='1,null,null,null','T1 back 1,null,null,null');
 PERFORM t40.check((SELECT audit_id=t40.id(1,4) AND attempt1_delivered AND attempt2_delivered AND state='refunded'
  FROM public.chat_turn_reservations WHERE turn_id=t40.id(1,2)),'T1 representative and both delivery flags');
 PERFORM t40.check((SELECT array_agg(audit_id)=ARRAY[t40.id(1,3)] FROM public.chat_turn_refunds
  WHERE audit_id IN(t40.id(1,3),t40.id(1,4),t40.id(1,5))),'T1 ledger uses late first only');

 -- T2: a previously bound first answer keeps its evidence after replacement.
 PERFORM t40.setup(2); PERFORM t40.audit(2,3); PERFORM t40.audit(2,4);
 PERFORM t40.check(t40.begin_attempt(2,3) AND t40.claim(2,3) AND t40.begin_attempt(2,4) AND t40.claim(2,4),'T2 replacement');
 PERFORM t40.check(NOT t40.claim(2,3),'T2 old duplicate false');
 got:=concat_ws(',',coalesce(t40.refund(2,3)::text,'null'),coalesce(t40.refund(2,4)::text,'null'),coalesce(t40.refund(2,5)::text,'null'));
 PERFORM t40.check(got='1,null,null','T2 back 1,null,null');
 PERFORM t40.check((SELECT audit_id=t40.id(2,4) FROM public.chat_turn_reservations WHERE turn_id=t40.id(2,2))
   AND EXISTS(SELECT 1 FROM public.chat_turn_refunds WHERE audit_id=t40.id(2,3)),'T2 representative and first ledger');

 -- Missing delivery, zero usage and missing usage consume nothing. 1 -> integer 0.
 PERFORM t40.setup(3,1,1); PERFORM t40.audit(3);
 UPDATE public.chat_turn_reservations SET state='answered',audit_id=t40.id(3,3) WHERE turn_id=t40.id(3,2);
 before_state:=t40.snapshot(3);
 PERFORM t40.check(t40.refund(3) IS NULL AND t40.snapshot(3)=before_state,'undelivered answered refuses without writes');
 PERFORM t40.claim(3); -- duplicate representative is false but now proves delivery
 UPDATE public.chat_usage SET count=0 WHERE user_id=t40.id(3);
 before_state:=t40.snapshot(3);
 PERFORM t40.check(t40.refund(3) IS NULL AND t40.snapshot(3)=before_state,'zero usage keeps evidence');
 DELETE FROM public.chat_usage WHERE user_id=t40.id(3);
 before_state:=t40.snapshot(3);
 PERFORM t40.check(t40.refund(3) IS NULL AND t40.snapshot(3)=before_state,'missing usage keeps evidence');
 INSERT INTO public.chat_usage(user_id,day,count) SELECT user_id,counted_day,1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(3,2);
 PERFORM t40.check(t40.refund(3)=0,'one to integer zero');
 DELETE FROM public.ai_audit_log WHERE id=t40.id(3,3);
 PERFORM t40.audit(3);
 before_state:=t40.snapshot(3);
 PERFORM t40.check(t40.refund(3) IS NULL AND NOT t40.claim(3) AND NOT t40.begin_attempt(3,4)
  AND t40.snapshot(3)=before_state,'ledger FK deletion never reopens refunded reservation');

 -- Registering attempt 2 is not proof that it passed the server return gate.
 PERFORM t40.setup(26,2); PERFORM t40.audit(26,3); PERFORM t40.audit(26,4); PERFORM t40.claim(26,3);
 before_state:=t40.snapshot(26);
 PERFORM t40.check(t40.refund(26,4) IS NULL AND t40.snapshot(26)=before_state,'undelivered attempt two refuses without writes');
 PERFORM t40.check(t40.claim(26,4) AND t40.refund(26,4)=1,'delivered attempt two refunds');

 -- Bump closes attempted reservations; late red records evidence without binding.
 PERFORM t40.setup(4,1); PERFORM t40.audit(4);
 b:=t40.bump(4);
 PERFORM t40.check((SELECT binding_closed AND attempts=1 AND attempt1_audit_id=t40.id(4,3)
   FROM public.chat_turn_reservations WHERE turn_id=t40.id(4,2)),'bump preserves attempted reservation');
 PERFORM t40.check((SELECT count(*)=1 FROM public.chat_turn_reservations WHERE user_id=t40.id(4) AND NOT binding_closed),'one open reservation');
 PERFORM t40.check(NOT t40.claim(4) AND NOT t40.begin_attempt(4,4),'closed claim false and begin false');
 DELETE FROM public.chat_turn_reservations WHERE turn_id=(b->>'turnId')::uuid;
 PERFORM t40.check(NOT t40.begin_attempt(4,4),'closed stays closed after newer row disappears');
 PERFORM t40.check(t40.refund(4)=2,'closed late red refunds');
 PERFORM t40.check((SELECT state='refunded' AND audit_id IS NULL AND attempt1_delivered
   FROM public.chat_turn_reservations WHERE turn_id=t40.id(4,2)),'no synthetic representative on closed refund');

 PERFORM t40.setup(5); b:=t40.bump(5);
 PERFORM t40.check(NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(5,2)),'bump deletes attempt zero');
 PERFORM t40.setup(6,1); PERFORM t40.audit(6); PERFORM t40.claim(6); b:=t40.bump(6);
 PERFORM t40.check((SELECT binding_closed AND audit_id=t40.id(6,3) FROM public.chat_turn_reservations WHERE turn_id=t40.id(6,2)),'bump preserves bound representative');
 PERFORM t40.check(t40.refund(6)=2,'previous bound answer still refundable');
 PERFORM t40.setup(7,1); PERFORM t40.audit(7); PERFORM t40.claim(7);
 UPDATE public.chat_turn_reservations SET issued_at=clock_timestamp()-interval '3 days' WHERE turn_id=t40.id(7,2);
 b:=t40.bump(7);
 PERFORM t40.check(t40.refund(7) IS NULL AND NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(7,2)),'two day cleanup removes refund evidence');

 PERFORM t40.setup(28,1); PERFORM t40.bump(28);
 DELETE FROM pg_temp.t40_closure_updates;
 PERFORM t40.bump(28);
 PERFORM t40.check((SELECT count(*)=1 FROM pg_temp.t40_closure_updates),'bump updates only newly closed row');

 -- Exactly one slot globally, not LIMIT 1. Both same-row and cross-row corruption.
 PERFORM t40.setup(8,1); PERFORM t40.audit(8); PERFORM t40.claim(8);
 UPDATE public.chat_turn_reservations SET attempts=2,attempt2_audit_id=attempt1_audit_id WHERE turn_id=t40.id(8,2);
 before_state:=t40.snapshot(8);
 PERFORM t40.check(t40.refund(8) IS NULL AND t40.snapshot(8)=before_state,'same-row duplicate attribution refuses');
 UPDATE public.chat_turn_reservations SET attempts=1,attempt2_audit_id=NULL WHERE turn_id=t40.id(8,2);
 INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,attempts,attempt1_audit_id)
 SELECT t40.id(8,6),user_id,counted_day,1,attempt1_audit_id FROM public.chat_turn_reservations WHERE turn_id=t40.id(8,2);
 before_state:=t40.snapshot(8);
 PERFORM t40.check(t40.refund(8) IS NULL AND t40.snapshot(8)=before_state,'cross-row duplicate attribution refuses');
 PERFORM t40.check(NOT public.claim_chat_turn_for_audit(t40.id(8),t40.id(8,3),t40.id(8,6))
  AND t40.snapshot(8)=before_state,'representative collision records no delivery');

 -- A closed row never attempts a representative UPDATE, so only the explicit
 -- collision guard can refuse this evidence-only write.
 PERFORM t40.setup(27,1); PERFORM t40.audit(27); PERFORM t40.claim(27);
 INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,attempts,attempt1_audit_id,attempted_at,binding_closed)
 SELECT t40.id(27,6),user_id,counted_day,1,attempt1_audit_id,attempted_at,true
 FROM public.chat_turn_reservations WHERE turn_id=t40.id(27,2);
 before_state:=t40.snapshot(27);
 PERFORM t40.check(NOT public.claim_chat_turn_for_audit(t40.id(27),t40.id(27,3),t40.id(27,6))
  AND t40.snapshot(27)=before_state,'evidence-only collision records no delivery');

 PERFORM t40.setup(29,1); PERFORM t40.audit(29); PERFORM t40.claim(29);
 PERFORM t40.setup(30,1);
 UPDATE public.chat_turn_reservations SET attempts=2,attempt2_audit_id=t40.id(29,3) WHERE turn_id=t40.id(30,2);
 before_state:=t40.snapshot(29);
 PERFORM t40.check(t40.refund(29) IS NULL AND t40.snapshot(29)=before_state,'other-owner duplicate attribution refuses');

 -- Green and red may both have returned: S refunds chat only, never purpose.
 PERFORM t40.setup(9,2); PERFORM t40.audit(9,3,'green'); PERFORM t40.audit(9,4);
 PERFORM t40.claim(9,3); PERFORM t40.claim(9,4);
 before_state:=t40.snapshot(9);
 PERFORM t40.check(t40.refund(9,3) IS NULL AND t40.refund(9,4)=1,'green plus red chat refund');
 PERFORM t40.check(t40.snapshot(9)->'q'=before_state->'q','S purpose table unchanged');

 -- Invalid audit evidence / time windows. Independent identifiers for every case.
 FOR n IN 10..16 LOOP
  PERFORM t40.setup(n,1);
  PERFORM t40.audit(n,3,CASE WHEN n=10 THEN 'green' ELSE 'red' END,
   CASE WHEN n=11 THEN 'client_unverified' ELSE 'server_verified' END,
   CASE WHEN n=12 THEN 'ops_recommend' ELSE 'secondb_chat' END,
   CASE WHEN n=13 THEN interval '11 minutes' WHEN n=14 THEN interval '-1 minute' ELSE interval '0' END);
  UPDATE public.chat_turn_reservations SET state='answered',audit_id=t40.id(n,3),attempt1_delivered=true WHERE turn_id=t40.id(n,2);
  IF n=15 THEN UPDATE public.ai_audit_log SET user_id=t40.id(1) WHERE id=t40.id(n,3); END IF;
  IF n=16 THEN UPDATE public.chat_turn_reservations SET user_id=t40.id(1) WHERE turn_id=t40.id(n,2); END IF;
  before_state:=t40.snapshot(n);
  PERFORM t40.check(t40.refund(n) IS NULL AND t40.snapshot(n)=before_state,'invalid refund evidence '||n);
 END LOOP;
 FOR n IN 17..21 LOOP
  PERFORM t40.setup(n,1);
  PERFORM t40.audit(n,3,'red','server_verified','secondb_chat',CASE WHEN n=17 THEN interval '61 seconds' WHEN n=18 THEN interval '-1 minute' ELSE interval '0' END);
  IF n=19 THEN UPDATE public.chat_turn_reservations SET attempted_at=clock_timestamp()-interval '6 minutes' WHERE turn_id=t40.id(n,2); END IF;
  IF n=20 THEN UPDATE public.chat_turn_reservations SET attempted_at=clock_timestamp()+interval '1 minute' WHERE turn_id=t40.id(n,2); END IF;
  IF n=21 THEN UPDATE public.chat_turn_reservations SET attempt1_audit_id=t40.id(n,5) WHERE turn_id=t40.id(n,2); END IF;
  before_state:=t40.snapshot(n);
  PERFORM t40.check(NOT t40.claim(n) AND t40.snapshot(n)=before_state,'invalid claim evidence '||n);
 END LOOP;
 -- Server-stored counted day (yesterday), independent from today's request/answer.
 PERFORM t40.setup(22,1); PERFORM t40.audit(22); PERFORM t40.claim(22);
 UPDATE public.chat_turn_reservations SET counted_day=counted_day-1 WHERE turn_id=t40.id(22,2);
 INSERT INTO public.chat_usage(user_id,day,count) SELECT user_id,counted_day,1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(22,2);
 got:=t40.refund(22)::text;
 PERFORM t40.check(got='0' AND (SELECT sum(count)=2 FROM public.chat_usage WHERE user_id=t40.id(22)),'midnight refunds counted day only');
 -- Check the new narrow constraint, not a blanket removal of the old check.
 PERFORM t40.setup(23,1);
 PERFORM t40.check(t40.error('UPDATE public.chat_turn_reservations SET state=''refunded'' WHERE turn_id=t40.id(23,2)')='23514','unbound refund needs closed delivered attempt');
 UPDATE public.chat_turn_reservations SET binding_closed=true WHERE turn_id=t40.id(23,2);
 PERFORM t40.check(t40.error('UPDATE public.chat_turn_reservations SET state=''refunded'' WHERE turn_id=t40.id(23,2)')='23514','closed unbound refund still needs delivery');
 -- Underlying errors must propagate and undo ledger/counter/state together.
 PERFORM t40.setup(24,1); PERFORM t40.audit(24); PERFORM t40.claim(24);
 PERFORM t40.setup(25,1,5);
 before_state:=t40.snapshot(25);
 PERFORM t40.check(t40.error('SELECT t40.bump(25)')='P0001','cap error propagates');
 PERFORM t40.check(t40.snapshot(25)=before_state,'failed bump keeps prior binding and count');
END
$contracts$;
CREATE FUNCTION t40.fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test downstream failure' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER t40_fail BEFORE UPDATE ON public.chat_usage FOR EACH ROW EXECUTE FUNCTION t40.fail_refund();
SELECT t40.snapshot(24)::text AS before_error \gset
SELECT t40.check(t40.error('SELECT t40.refund(24)')='23514','unexpected SQL error propagates');
SELECT t40.check(t40.snapshot(24)=:'before_error'::jsonb,'SQL error rolls all writes back');
CREATE OR REPLACE FUNCTION t40.fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'unrelated unique error' USING ERRCODE='23505', CONSTRAINT='t40_other_key'; END;
$$;
SELECT t40.check(t40.error('SELECT t40.refund(24)')='23505','non-ledger unique error propagates');
SELECT t40.check(t40.snapshot(24)=:'before_error'::jsonb,'non-ledger unique rolls all writes back');
DROP TRIGGER t40_fail ON public.chat_usage;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT t40.check(t40.error('SELECT public.refund_chat_turn_after_output_swap(NULL::uuid)')='42501','unsigned request denied');
SELECT t40.check(t40.error('SELECT public.begin_chat_turn_attempt(NULL,NULL,NULL)')='42501','authenticated begin denied');
SELECT t40.check(t40.error('SELECT public.claim_chat_turn_for_audit(NULL,NULL,NULL)')='42501','authenticated claim denied');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT t40.check(t40.error('SELECT public.refund_chat_turn_after_output_swap(NULL::uuid)')='42501','service refund denied');
RESET ROLE;
ROLLBACK;
