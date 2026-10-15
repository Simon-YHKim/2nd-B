\set ON_ERROR_STOP on
-- CI/local scratch only, after numbered 0261. Every fixture rolls back.
BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email) VALUES
 ('94400000-0000-4000-8000-000000000001','ssv-helper-acl@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users(id,email,birth_date,locale) VALUES
 ('94400000-0000-4000-8000-000000000001','ssv-helper-acl@example.com',DATE '1990-01-01','en');
UPDATE public.users SET privacy_prefs = privacy_prefs || '{"ads":"true"}'::jsonb
 WHERE id = '94400000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claim.role = 'service_role';

-- Direct calls really run under service_role, before any ticket exists.
SET LOCAL ROLE service_role;
DO $direct_denied$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'wrong test role'; END IF;
  BEGIN
    PERFORM public.grant_reward_credits_ssv('94400000-0000-4000-8000-000000000001',
      to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM'),2,'helper-direct-reasoning');
    RAISE EXCEPTION 'direct reasoning grant was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.grant_chat_ad_bonus_ssv('94400000-0000-4000-8000-000000000001','helper-direct-chat');
    RAISE EXCEPTION 'direct chat grant was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$direct_denied$;
RESET ROLE;
DO $no_effects_and_tickets$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rewarded_ssv_txns WHERE user_id='94400000-0000-4000-8000-000000000001')
     OR EXISTS (SELECT 1 FROM public.reward_ssv_tickets WHERE user_id='94400000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'denied direct calls changed reward state';
  END IF;
  IF NOT public.issue_reward_ssv_ticket('94400000-0000-4000-8000-000000000001','reasoning',
    repeat('d1',32),'ci-helper-unit',2,'reasoning credit')
     OR NOT public.issue_reward_ssv_ticket('94400000-0000-4000-8000-000000000001','chat',
    repeat('d2',32),'ci-helper-unit',2,'chat credit') THEN
    RAISE EXCEPTION 'ticket issue failed';
  END IF;
END
$no_effects_and_tickets$;
SET LOCAL ROLE service_role;
DO $settlement$
DECLARE
  v_now bigint := (extract(epoch FROM now()) * 1000)::bigint;
  v_count integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.settle_reward_ssv_ticket_v3(
    repeat('d1',32),'helper-stale','ci-helper-unit',2,'reasoning credit',v_now-172800000);
  IF v_count <> 0 THEN RAISE EXCEPTION 'stale callback paid'; END IF;
  SELECT count(*) INTO v_count FROM public.settle_reward_ssv_ticket_v3(
    repeat('d1',32),'helper-wrong-unit','wrong-unit',2,'reasoning credit',v_now);
  IF v_count <> 0 THEN RAISE EXCEPTION 'mismatched ticket paid'; END IF;
  SELECT count(*),max(reward_total) INTO v_count,v_total FROM public.settle_reward_ssv_ticket_v3(
    repeat('d1',32),'helper-good-reasoning','ci-helper-unit',2,'reasoning credit',v_now);
  IF v_count <> 1 OR v_total IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'reasoning chain failed'; END IF;
  SELECT count(*),max(reward_total) INTO v_count,v_total FROM public.settle_reward_ssv_ticket_v3(
    repeat('d1',32),'helper-good-reasoning','ci-helper-unit',2,'reasoning credit',v_now);
  IF v_count <> 1 OR v_total IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'reasoning retry duplicated credit'; END IF;
  SELECT count(*),max(reward_total) INTO v_count,v_total FROM public.settle_reward_ssv_ticket_v3(
    repeat('d2',32),'helper-good-chat','ci-helper-unit',2,'chat credit',v_now);
  IF v_count <> 1 OR v_total IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'chat chain failed'; END IF;
  SELECT count(*),max(reward_total) INTO v_count,v_total FROM public.settle_reward_ssv_ticket_v3(
    repeat('d2',32),'helper-good-chat','ci-helper-unit',2,'chat credit',v_now);
  IF v_count <> 1 OR v_total IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'chat retry duplicated credit'; END IF;
END
$settlement$;
RESET ROLE;
DO $ledger$
BEGIN
  IF (SELECT count(*) FROM public.rewarded_ssv_txns WHERE user_id='94400000-0000-4000-8000-000000000001') <> 2
     OR (SELECT count(*) FROM public.reward_ssv_tickets
          WHERE user_id='94400000-0000-4000-8000-000000000001' AND consumed_at IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'unexpected settlement ledger effects';
  END IF;
END
$ledger$;
ROLLBACK;
