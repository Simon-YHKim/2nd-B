-- Every path exercises real FK/BEFORE triggers, never direct digest edits.
BEGIN;
/* FINALIZE_FIXTURE */
SET LOCAL ROLE service_role;
SELECT pg_temp.finish(n) FROM generate_series(1,8)n;
RESET ROLE;
CREATE TEMP TABLE original_receipts AS SELECT owner_id,commit_receipt FROM public.interview_work_contracts;
DELETE FROM public.records WHERE user_id=pg_temp.uid(1);
DELETE FROM public.interview_transcripts WHERE user_id=pg_temp.uid(2);
DELETE FROM public.interview_transcript_turns WHERE user_id=pg_temp.uid(3) AND turn_no=2;
DELETE FROM public.interview_sessions WHERE owner_id=pg_temp.uid(4);
DELETE FROM public.users WHERE id=pg_temp.uid(5);
DELETE FROM auth.users WHERE id=pg_temp.uid(6);
SELECT pg_temp.check((SELECT count(*)=5 AND bool_and(w.session_state='erased' AND w.snapshot_digest IS NULL AND w.erased_at IS NOT NULL AND w.commit_receipt=o.commit_receipt)
 FROM public.interview_work_contracts w JOIN original_receipts o USING(owner_id)
 WHERE w.owner_id IN (pg_temp.uid(1),pg_temp.uid(2),pg_temp.uid(3),pg_temp.uid(4),pg_temp.uid(5))), 'record/head/turn/session/profile erase hash, retain exact receipt');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(6)),'Auth cascade removes metadata');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.observe(1)->>'state'='erased' AND pg_temp.observe(1)->>'recordPresent'='false','read erased original receipt');
SELECT pg_temp.check(pg_temp.observe(2)->>'state'='erased' AND pg_temp.observe(2)->>'recordPresent'='true','head deletion never claims record absent');
SELECT pg_temp.check(public.finalize_interview_save(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',
 jsonb_set(pg_temp.packet(1),'{turns}','"invalid"'),NULL)='{"state":"erased"}','erased body resend stops before digest comparison');
SELECT pg_temp.check(public.reserve_interview_save(pg_temp.uid(1),pg_temp.uid(1,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(1)->'intent'->>'sessionId')::uuid,(pg_temp.packet(1)->'intent'->>'contentGeneration')::uuid,
 pg_temp.uid(1,5),7,decode(repeat('ab',32),'hex'),pg_temp.uid(1,4),'now','en','es',false)->>'state'='erased','reserve cannot rebind erased NULL');
RESET ROLE;
SELECT pg_temp.reject($q$UPDATE public.interview_work_contracts SET snapshot_digest=decode(repeat('ab',32),'hex') WHERE owner_id=pg_temp.uid(1)$q$,'42501','identity_is_fixed');

-- Late owned RED after parent deletion still protects a surviving record.
INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
 VALUES(pg_temp.uid(104,6),pg_temp.uid(4),'p','o','synthetic-local',false,'red',1,'interview_probe','server_verified');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.probe(4,'credited','fact',true,104)='session_closed','late erased-work verdict cannot recreate session');
RESET ROLE;
SELECT pg_temp.check((SELECT interview_ai_hold FROM public.records WHERE user_id=pg_temp.uid(4))
 AND (SELECT prompt_hash='' AND output_hash='' FROM public.ai_audit_log WHERE id=pg_temp.uid(104,6))
 AND NOT EXISTS(SELECT 1 FROM public.interview_sessions WHERE owner_id=pg_temp.uid(4)), 'late erased-work RED protects surviving record and erases hash');

-- Reserved digest also erases on session/fold/discard/profile/Auth paths.
DELETE FROM public.interview_sessions WHERE owner_id=pg_temp.uid(9);
SELECT public.fold_interview_session((pg_temp.packet(10)->'intent'->>'sessionId')::uuid,'left');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(public.discard_interview_work(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(11)->'intent'->>'sessionId')::uuid,(pg_temp.packet(11)->'intent'->>'contentGeneration')::uuid)='discarded','actual work discard');
SELECT pg_temp.check(public.close_interview_work(pg_temp.uid(12),pg_temp.uid(12,2),clock_timestamp()+interval '1 hour',
 (pg_temp.packet(12)->'intent'->>'sessionId')::uuid,(pg_temp.packet(12)->'intent'->>'contentGeneration')::uuid,'user_end',0,0)='closed','close preserves savable original intent');
SELECT pg_temp.check(pg_temp.finish(12)->>'state'='committed','ended is still savable');
RESET ROLE;
DELETE FROM public.users WHERE id=pg_temp.uid(13);
DELETE FROM auth.users WHERE id=pg_temp.uid(14);
SELECT pg_temp.check((SELECT count(*)=4 AND bool_and(snapshot_digest IS NULL AND session_state IN ('erased','folded','discarded')) FROM public.interview_work_contracts
 WHERE owner_id IN(pg_temp.uid(9),pg_temp.uid(10),pg_temp.uid(11),pg_temp.uid(13))),'unsaved digests erased without a receipt');
SELECT pg_temp.check((SELECT sum(created)=1 FROM public.interview_session_starts WHERE owner_id=pg_temp.uid(11)),'discard never refunds original start');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(public.open_interview_work(pg_temp.uid(11),pg_temp.uid(11,2),clock_timestamp()+interval '1 hour',
 pg_temp.uid(11,3),pg_temp.uid(11,4),'now','en','es',false)->>'state'='closed','same original key cannot reopen discarded work');
RESET ROLE;

-- Sweeper uses frozen rule even with zero verdicts, and clears reserved digest.
UPDATE public.interview_sessions SET last_seen_at=clock_timestamp()-interval '7 hours' WHERE owner_id=pg_temp.uid(15);
SELECT pg_temp.check(public.sweep_interview_sessions(5000)=1,'actual stale sweep');
SELECT pg_temp.check((SELECT session_state='folded' AND snapshot_digest IS NULL FROM public.interview_work_contracts WHERE owner_id=pg_temp.uid(15)),'sweep terminal hash erasure');
SET LOCAL ROLE service_role;
SELECT pg_temp.check(pg_temp.finish(15)->>'state'='closed','fold terminal before packet rebind');
-- Barrier is not deletion: a committed fact remains inspectable, pending saves close.
SELECT public.begin_interview_content_wipe(pg_temp.uid(7),pg_temp.uid(7,2),clock_timestamp()+interval '1 hour',pg_temp.uid(7,8),
 (pg_temp.packet(7)->'intent'->>'contentGeneration')::uuid,'records-v1');
SELECT pg_temp.check(pg_temp.observe(7)->>'state'='committed','committed lookup after generation rotation');
SELECT pg_temp.check(pg_temp.finish(7)->'receipt'=pg_temp.observe(7)->'receipt','same commit retry does no new I/O');
SELECT public.begin_interview_content_wipe(pg_temp.uid(16),pg_temp.uid(16,2),clock_timestamp()+interval '1 hour',pg_temp.uid(16,8),
 (pg_temp.packet(16)->'intent'->>'contentGeneration')::uuid,'records-v1');
SELECT pg_temp.check(pg_temp.finish(16)->>'state'='closed','old reserved intent cannot save across wipe');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id=pg_temp.uid(16)),'wipe rejected save writes no record');
ROLLBACK;
