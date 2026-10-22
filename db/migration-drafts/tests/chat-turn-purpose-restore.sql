\set ON_ERROR_STOP on
BEGIN;
-- Each case rolls back with the suite; mutations run these same assertions.
SELECT t40f.setup(5001);
SELECT t40.check((SELECT quota_day=t40f.today() FROM public.chat_turn_reservations WHERE turn_id=t40.id(5001,2)), 'F first receipt is server today');
SELECT t40.check(t40.refund(5001)=1, 'F red single chat refund');
SELECT t40.check(t40f.quota(5001)=0 AND t40f.markers(5001)=1, 'F count one deletes and marks');
SELECT t40.check(t40.refund(5001) IS NULL AND t40f.quota(5001)=0, 'F repeat does not restore again');
SELECT t40.check(NOT t40.begin_attempt(5001,4), 'F refunded cannot register again');

SELECT t40f.setup(5002,2);
UPDATE public.llm_proxy_purpose_daily SET count=3 WHERE user_id=t40.id(5002);
SELECT t40.check(t40.refund(5002,3)=1, 'F both red refund first evidence');
SELECT t40.check(t40f.quota(5002)=2 AND t40f.markers(5002)=1, 'F both red restore once');
SELECT t40.check(t40.refund(5002,4) IS NULL AND t40f.quota(5002)=2, 'F other red cannot restore twice');

SELECT t40f.setup(5003,2,'green','red');
SELECT t40.check(t40.refund(5003,4)=1, 'F green first chat still refunds');
SELECT t40.check(t40f.quota(5003)=1 AND t40f.markers(5003)=0, 'F green first prevents purpose restore');
SELECT t40f.setup(5004,2,'red','green');
SELECT t40.check(t40.refund(5004,3)=1, 'F green second chat still refunds');
SELECT t40.check(t40f.quota(5004)=1 AND t40f.markers(5004)=0, 'F green second prevents purpose restore');
SELECT t40f.setup(5005);
SELECT t40.admit(5005,'reask',4);
SELECT t40.check(t40.refund(5005)=1 AND t40f.quota(5005)=1 AND t40f.markers(5005)=0, 'F pending second prevents purpose restore');
SELECT t40.audit(5005,4);
SELECT t40.check(NOT t40.claim(5005,4) AND t40.refund(5005,4) IS NULL AND t40f.quota(5005)=1, 'F no later purpose-only settlement');

SELECT t40f.setup(5006,2);
DELETE FROM public.ai_audit_log WHERE id=t40.id(5006,3);
SELECT t40.check(t40.refund(5006,4)=1 AND t40f.quota(5006)=1 AND t40f.markers(5006)=0, 'F missing first audit prevents purpose restore');
SELECT t40f.setup(5007,2);
UPDATE public.ai_audit_log SET event_source='client_unverified' WHERE id=t40.id(5007,3);
SELECT t40.check(t40.refund(5007,4)=1 AND t40f.quota(5007)=1, 'F client evidence prevents purpose restore');
SELECT t40f.setup(5008,2);
UPDATE public.ai_audit_log SET user_id=t40.id(5001) WHERE id=t40.id(5008,3);
SELECT t40.check(t40.refund(5008,4)=1 AND t40f.quota(5008)=1, 'F foreign evidence prevents purpose restore');
SELECT t40f.setup(5009,2);
UPDATE public.ai_audit_log SET purpose='interview_probe' WHERE id=t40.id(5009,3);
SELECT t40.check(t40.refund(5009,4)=1 AND t40f.quota(5009)=1, 'F other purpose evidence prevents restore');
SELECT t40f.setup(5010,2);
UPDATE public.ai_audit_log SET created_at=clock_timestamp()+interval '1 day' WHERE id=t40.id(5010,3);
SELECT t40.check(t40.refund(5010,4)=1 AND t40f.quota(5010)=1, 'F future evidence prevents purpose restore');

SELECT t40.setup(5011,1); SELECT t40.audit(5011); SELECT t40.claim(5011);
SELECT t40.check(t40.refund(5011)=1 AND t40f.quota(5011)=3 AND t40f.markers(5011)=0, 'F legacy NULL receipt chat only');
SELECT t40f.setup(5012);
DELETE FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id(5012);
SELECT t40.check(t40.refund(5012)=1 AND t40f.quota(5012)=0 AND t40f.markers(5012)=0, 'F absent purpose row keeps chat refund');
SELECT t40f.setup(5013);
UPDATE public.chat_usage SET count=0 WHERE user_id=t40.id(5013);
SELECT t40.snapshot(5013) AS zero_before \gset
SELECT t40.check(t40.refund(5013) IS NULL AND t40.snapshot(5013)=:'zero_before'::jsonb, 'F zero chat leaves all evidence untouched');
SELECT t40f.setup(5014);
UPDATE public.chat_usage SET count=1 WHERE user_id=t40.id(5014);
SELECT t40.check(t40.refund(5014)=0 AND t40f.quota(5014)=0, 'F integer zero return unchanged');
SELECT t40f.setup(5015);
UPDATE public.ai_audit_log SET created_at=clock_timestamp()-interval '11 minutes' WHERE id=t40.id(5015,3);
SELECT t40.snapshot(5015) AS expired_before \gset
SELECT t40.check(t40.refund(5015) IS NULL AND t40.snapshot(5015)=:'expired_before'::jsonb, 'F expired audit leaves all evidence untouched');

SELECT t40f.pair(5016);
SELECT t40.check(t40.refund(5016)=3 AND t40.refund(5016,5)=2, 'F different reservations both chat refunds');
SELECT t40.check(t40f.quota(5016)=3 AND t40f.markers(5016)=1, 'F user daily cap across reservations');
SELECT t40f.pair(5017,t40f.today()-1);
SELECT t40.refund(5017); SELECT t40.refund(5017,5);
SELECT t40.check(t40f.quota(5017)=3 AND t40f.markers(5017)=1, 'F cap independent of counted day');

SELECT t40f.pair(5018);
UPDATE public.chat_turn_reservations SET quota_day=t40f.today()-1 WHERE turn_id=t40.id(5018,2);
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count) VALUES(t40.id(5018),t40f.today()-1,'secondb_chat',2);
SELECT t40.check(t40.refund(5018)=3, 'F previous-day chat refund');
SELECT t40.check(t40f.quota(5018,t40f.today()-1)=2 AND t40f.markers(5018)=0, 'F previous-day refund does not spend today cap');
SELECT t40.check(t40.refund(5018,5)=2 AND t40f.quota(5018)=3 AND t40f.markers(5018)=1, 'F today remains eligible after old-day settlement');

SELECT t40f.pair(5019);
SELECT t40.refund(5019);
UPDATE public.chat_turn_reservations SET issued_at=clock_timestamp()-interval '3 days' WHERE turn_id=t40.id(5019,2);
SELECT t40.bump(5019,t40f.today()+1);
SELECT t40.check(t40f.markers(5019)=1, 'F malicious p_day cannot erase today marker');
SELECT t40.check(t40.refund(5019,5)=2 AND t40f.quota(5019)=3 AND t40f.markers(5019)=1, 'F bump then late refund still capped');

SELECT t40f.pair(5020); SELECT t40.refund(5020);
DELETE FROM public.ai_audit_log WHERE id=t40.id(5020,3);
SELECT t40.check(NOT EXISTS(SELECT 1 FROM public.chat_turn_refunds WHERE audit_id=t40.id(5020,3)) AND t40f.markers(5020)=1, 'F audit cascade retains daily marker');
SELECT t40.check(t40.refund(5020,5)=2 AND t40f.quota(5020)=3, 'F ledger cascade cannot reopen cap');

SELECT t40f.pair(5021); SELECT t40.refund(5021);
-- Model a prior processing date; never claim to change the real server clock.
UPDATE public.chat_turn_reservations SET purpose_restored_day=t40f.today()-1,
 issued_at=clock_timestamp()-interval '3 days' WHERE turn_id=t40.id(5021,2);
SELECT t40.bump(5021,t40f.today()+1);
SELECT t40.check(NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(5021,2)), 'F expired marker resumes ordinary cleanup');
SELECT t40.check(t40.refund(5021,5)=2 AND t40f.quota(5021)=2 AND t40f.markers(5021)=1, 'F previous processing day allows new restore');

SELECT t40.setup(5022,0);
UPDATE public.chat_turn_reservations SET counted_day=t40f.today()-1 WHERE turn_id=t40.id(5022,2);
SELECT t40.admit(5022,'reask',3);
SELECT t40.check((SELECT quota_day=t40f.today() AND attempts=1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(5022,2)), 'F attempt-zero reask records actual debit day');
UPDATE public.chat_turn_reservations SET quota_day=t40f.today()-1 WHERE turn_id=t40.id(5022,2);
SELECT t40.admit(5022,'reask',4);
SELECT t40.check((SELECT quota_day=t40f.today()-1 AND attempts=2 FROM public.chat_turn_reservations WHERE turn_id=t40.id(5022,2)), 'F second attempt preserves receipt');
SELECT t40.setup(5023,1);
SELECT t40.admit(5023,'reask',4);
SELECT t40.check((SELECT quota_day IS NULL AND attempts=2 FROM public.chat_turn_reservations WHERE turn_id=t40.id(5023,2)), 'F legacy first enforce second stays NULL');
SELECT t40.setup(5024,0);
SELECT t40.bump(5024);
SELECT t40.check((t40.admit(5024,'first',3)->>'kind')='unbound' AND t40f.quota(5024)=4
 AND NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id(5024) AND quota_day IS NOT NULL), 'F unbound charges without receipt');

SELECT t40.setup(5025,0);
UPDATE public.llm_proxy_purpose_daily SET count=5 WHERE user_id=t40.id(5025);
SELECT t40.snapshot(5025) AS capped_before \gset
SELECT t40.check(t40.error('SELECT t40.admit(5025,''first'',3)')='T3901'
 AND t40.snapshot(5025)=:'capped_before'::jsonb, 'F quota refusal rolls back registration');
SELECT t40.setup(5026,0);
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count) VALUES(t40.id(5026),t40f.today()-46,'secondb_chat',1);
SELECT t40.admit(5026,'first',3);
SELECT t40.check(t40f.quota(5026,t40f.today()-46)=0 AND t40f.quota(5026)=4, 'F unchanged consume retains 45-day cleanup');

SELECT t40f.setup(5027); SELECT t40.bump(5027);
SELECT t40.check(t40.refund(5027)=2 AND t40f.quota(5027)=0, 'F closed prior reservation still restores');

SELECT t40f.setup(5029);
SELECT t40.admit(5029,'reask',4); SELECT t40.audit(5029,4);
SELECT t40.check(t40.refund(5029)=1 AND t40f.quota(5029)=1 AND t40f.markers(5029)=0, 'F audited but undelivered second prevents restore');

-- Force a real daily-index conflict AFTER its normal precheck. Only the purpose
-- subtransaction (including this trigger's competing marker) may roll back.
SELECT t40f.pair(5030);
CREATE FUNCTION t40f.competing_marker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE public.chat_turn_reservations SET purpose_restored_day=t40f.today() WHERE turn_id=t40.id(5030,6);
 RETURN NEW;
END;
$$;
CREATE TRIGGER f_competing_marker AFTER UPDATE ON public.llm_proxy_purpose_daily
 FOR EACH ROW WHEN (NEW.user_id=t40.id(5030)) EXECUTE FUNCTION t40f.competing_marker();
SELECT t40.check(t40.error('SELECT t40.refund(5030)') IS NULL, 'F daily index conflict keeps chat transaction');
SELECT t40.check(t40f.quota(5030)=4 AND t40f.markers(5030)=0
 AND (SELECT count=3 FROM public.chat_usage WHERE user_id=t40.id(5030) AND day=t40f.today())
 AND (SELECT state='refunded' FROM public.chat_turn_reservations WHERE turn_id=t40.id(5030,2)), 'F daily index conflict rolls back purpose only');
DROP TRIGGER f_competing_marker ON public.llm_proxy_purpose_daily;

-- Unrelated write errors must escape and undo chat, ledger, quota and marker.
CREATE FUNCTION t40f.reject_marker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.purpose_restored_day IS NOT NULL THEN
  RAISE EXCEPTION 'fixture marker failure' USING ERRCODE='23505', CONSTRAINT='unrelated_unique';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER f_fail_marker BEFORE UPDATE ON public.chat_turn_reservations FOR EACH ROW EXECUTE FUNCTION t40f.reject_marker();
SELECT t40f.setup(5028);
SELECT t40.snapshot(5028) AS atomic_before \gset
SELECT t40.check(t40.error('SELECT t40.refund(5028)')='23505' AND t40.snapshot(5028)=:'atomic_before'::jsonb, 'F unexpected unique error rolls back whole refund');
DROP TRIGGER f_fail_marker ON public.chat_turn_reservations;

SELECT t40.check(NOT has_table_privilege('authenticated','public.chat_turn_reservations','SELECT')
 AND NOT has_table_privilege('authenticated','public.llm_proxy_purpose_daily','UPDATE'), 'F no direct client access');
SELECT t40.check((SELECT relrowsecurity FROM pg_class WHERE oid='public.chat_turn_reservations'::regclass), 'F reservation RLS stays enabled');
ROLLBACK;
