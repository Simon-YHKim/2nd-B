-- UNNUMBERED_reward_ssv_hardening.sql
-- LOCAL DRAFT ONLY: reserve the next migration number with a fresh remote scan
-- and push the reservation before this can enter a release candidate.
--
-- Forward-only repair for installations that already applied 0177. This draft
-- intentionally revokes the legacy consume RPC and adds opaque-ticket atomic
-- settlement, bounded ticket retention, and authenticated issuance limits.
-- There is no safe online-compatible DB/Edge ordering: keep REWARD_SSV_ENABLED
-- disabled and the client capability OFF (EXPO_PUBLIC_REWARD_SSV unset/false),
-- apply the numbered promotion, deploy and smoke-test the new Edge function,
-- and only then enable server and client ads.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 아래 SET LOCAL 은 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

DO $preconditions$
BEGIN
  IF to_regclass('public.reward_ssv_tickets') IS NULL
     OR to_regprocedure(
       'public.issue_reward_ssv_ticket(uuid,text,text,text,integer,text)'
     ) IS NULL
     OR to_regprocedure(
       'public.consume_reward_ssv_ticket(text,uuid,text,text,integer,text)'
     ) IS NULL
     OR to_regprocedure('public.grant_chat_ad_bonus_ssv(uuid,text)') IS NULL
     OR to_regprocedure(
       'public.grant_reward_credits_ssv(uuid,text,integer,text)'
     ) IS NULL
     OR COALESCE(has_function_privilege(
       'authenticated',
       'public.grant_chat_ad_bonus(uuid)',
       'EXECUTE'
     ), true)
     OR COALESCE(has_function_privilege(
       'authenticated',
       'public.bump_reward_credits_if_under_cap(uuid,text,integer)',
       'EXECUTE'
     ), true) THEN
    RAISE EXCEPTION 'reward SSV hardening draft requires applied reward migrations 0172 and 0177';
  END IF;
END
$preconditions$;

----------------------------------------------------------------------
-- 1. Seekable, bounded retention for inactive as well as active users
----------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS reward_ssv_tickets_user_consumed_idx
  ON public.reward_ssv_tickets (user_id, consumed_at)
  WHERE consumed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_ssv_tickets_consumed_retention_idx
  ON public.reward_ssv_tickets (consumed_at, token_hash)
  WHERE consumed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_ssv_tickets_expired_retention_idx
  ON public.reward_ssv_tickets (expires_at, token_hash)
  WHERE consumed_at IS NULL;

ALTER TABLE public.reward_ssv_tickets
  ADD COLUMN IF NOT EXISTS verification_attempts smallint NOT NULL DEFAULT 0;

ALTER TABLE public.reward_ssv_tickets
  DROP CONSTRAINT IF EXISTS reward_ssv_tickets_verification_attempts_valid;
ALTER TABLE public.reward_ssv_tickets
  ADD CONSTRAINT reward_ssv_tickets_verification_attempts_valid CHECK (
    verification_attempts BETWEEN 0 AND 6
  );

ALTER TABLE public.reward_ssv_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ssv_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_ssv_tickets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prune_reward_ssv_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_consumed integer;
  v_expired integer;
BEGIN
  WITH victims AS (
    SELECT token_hash
      FROM public.reward_ssv_tickets
     WHERE consumed_at < v_now - make_interval(days => 1)
     ORDER BY consumed_at, token_hash
     LIMIT 500
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.reward_ssv_tickets AS target
   USING victims
   WHERE target.token_hash = victims.token_hash;
  GET DIAGNOSTICS v_consumed = ROW_COUNT;

  WITH victims AS (
    SELECT token_hash
      FROM public.reward_ssv_tickets
     WHERE consumed_at IS NULL
       AND expires_at < v_now
     ORDER BY expires_at, token_hash
     LIMIT 500
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.reward_ssv_tickets AS target
   USING victims
   WHERE target.token_hash = victims.token_hash;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  RETURN v_consumed + v_expired;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_reward_ssv_tickets_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.prune_reward_ssv_tickets();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reward_ssv_tickets_prune_before_insert
  ON public.reward_ssv_tickets;
CREATE TRIGGER reward_ssv_tickets_prune_before_insert
  BEFORE INSERT ON public.reward_ssv_tickets
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prune_reward_ssv_tickets_on_insert();

REVOKE ALL ON FUNCTION public.prune_reward_ssv_tickets()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_reward_ssv_tickets() TO service_role;
REVOKE ALL ON FUNCTION public.prune_reward_ssv_tickets_on_insert()
  FROM PUBLIC, anon, authenticated, service_role;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'purge-reward-ssv-tickets'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;

    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      INTO v_job_id
      USING
        'purge-reward-ssv-tickets',
        '*/5 * * * *',
        'SELECT public.prune_reward_ssv_tickets();';
  ELSE
    RAISE NOTICE 'reward SSV hardening draft: pg_cron unavailable; insert-trigger retention remains active';
  END IF;
END
$schedule$;

----------------------------------------------------------------------
-- 2. Private, atomic short-window issuance limiter
----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reward_ssv_issue_rate_limits (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_at timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reward_ssv_issue_rate_claims_bounded CHECK (
    cardinality(claimed_at) BETWEEN 0 AND 10
    AND array_position(claimed_at, NULL) IS NULL
  )
);

ALTER TABLE public.reward_ssv_issue_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ssv_issue_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_ssv_issue_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_reward_ssv_issue_rate_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_claims timestamptz[];
  v_retry integer;
  v_updated uuid;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reward_ssv_issue_rate_limits AS limits
    (user_id, claimed_at)
  VALUES
    (p_user_id, '{}'::timestamptz[])
  ON CONFLICT (user_id) DO NOTHING;

  SELECT limits.claimed_at
    INTO v_claims
    FROM public.reward_ssv_issue_rate_limits AS limits
   WHERE limits.user_id = p_user_id
   FOR UPDATE;

  IF v_claims IS NULL THEN
    RAISE EXCEPTION 'rate limit subject unavailable' USING ERRCODE = 'P0001';
  END IF;

  v_now := clock_timestamp();
  SELECT coalesce(array_agg(claimed ORDER BY claimed), '{}'::timestamptz[])
    INTO v_claims
    FROM unnest(v_claims) AS claimed
   WHERE claimed >= v_now - make_interval(secs => 60);

  IF cardinality(v_claims) >= 10 THEN
    v_retry := greatest(
      1,
      least(
        60,
        ceil(extract(epoch FROM (
          v_claims[1] + make_interval(secs => 60) - v_now
        )))::integer
      )
    );
    RETURN v_retry;
  END IF;

  UPDATE public.reward_ssv_issue_rate_limits AS limits
     SET claimed_at = array_append(v_claims, v_now),
         updated_at = v_now
   WHERE limits.user_id = p_user_id
  RETURNING limits.user_id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'rate limit subject unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reward_ssv_issue_rate_limit(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_reward_ssv_issue_rate_limit(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_reward_ssv_issue_rate_limit(uuid) IS
  'Service-only rolling limiter: first 10 authenticated ticket requests per user per 60 seconds return 0; later requests return retry-after seconds.';

-- A callback reaches this function before any verifier-key network fetch. The
-- unsigned ticket and contract values grant nothing: they only prove that an
-- opaque, server-issued capability exists and atomically spend one of the six
-- attempts Google can make (the original callback plus five one-second retries).
-- This counter is database-owned so separate Edge isolates cannot each reset it.
CREATE OR REPLACE FUNCTION public.claim_reward_ssv_callback_attempt(
  p_token_hash text,
  p_txn_id text,
  p_ad_unit_id text,
  p_reward_amount integer,
  p_reward_item text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed text;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_txn_id IS NULL
     OR length(p_txn_id) NOT BETWEEN 1 AND 256
     OR p_txn_id ~ '[[:cntrl:]]'
     OR p_ad_unit_id IS NULL
     OR char_length(p_ad_unit_id) NOT BETWEEN 1 AND 256
     OR p_ad_unit_id ~ '[[:cntrl:]]'
     OR p_reward_amount IS NULL
     OR p_reward_amount NOT BETWEEN 1 AND 2147483647
     OR p_reward_item IS NULL
     OR char_length(p_reward_item) NOT BETWEEN 1 AND 256
     OR p_reward_item ~ '[[:cntrl:]]' THEN
    RETURN false;
  END IF;

  UPDATE public.reward_ssv_tickets AS tickets
     SET verification_attempts = tickets.verification_attempts + 1
   WHERE tickets.token_hash = p_token_hash
     AND tickets.verification_attempts < 6
     AND tickets.expected_ad_unit_id = p_ad_unit_id
     AND tickets.expected_reward_amount = p_reward_amount
     AND tickets.expected_reward_item = p_reward_item
     AND (
       (tickets.consumed_transaction_id IS NULL
        AND tickets.consumed_at IS NULL
        AND tickets.expires_at >= now())
       OR (tickets.consumed_transaction_id = p_txn_id
           AND tickets.consumed_at >= now() - make_interval(days => 1))
     )
  RETURNING tickets.token_hash INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reward_ssv_callback_attempt(
  text, text, text, integer, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_reward_ssv_callback_attempt(
  text, text, text, integer, text
) TO service_role;

COMMENT ON FUNCTION public.claim_reward_ssv_callback_attempt(
  text, text, text, integer, text
) IS
  'Service-only admission before verifier-key retrieval: exact active ticket or exact one-day transaction replay, atomically limited to six total callback attempts.';

----------------------------------------------------------------------
-- 3. Reapply corrected 0177 contracts for databases that ran an older file
----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_reward_ssv_ticket(
  p_user_id uuid,
  p_reward_kind text,
  p_token_hash text,
  p_ad_unit_id text,
  p_reward_amount integer,
  p_reward_item text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active integer;
  v_chat_earned integer;
  v_month text;
  v_rows integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL
     OR p_reward_kind IS NULL
     OR p_reward_kind NOT IN ('reasoning', 'chat')
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_ad_unit_id IS NULL
     OR char_length(p_ad_unit_id) NOT BETWEEN 1 AND 256
     OR p_ad_unit_id ~ '[[:cntrl:]]'
     OR p_reward_amount IS NULL
     OR p_reward_amount NOT BETWEEN 1 AND 2147483647
     OR p_reward_item IS NULL
     OR char_length(p_reward_item) NOT BETWEEN 1 AND 256
     OR p_reward_item ~ '[[:cntrl:]]' THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 535356)
  );

  DELETE FROM public.reward_ssv_tickets AS tickets
   WHERE tickets.user_id = p_user_id
     AND (
       (tickets.consumed_transaction_id IS NULL
        AND tickets.consumed_at IS NULL
        AND tickets.expires_at < now())
       OR (tickets.consumed_at IS NOT NULL
           AND tickets.consumed_at < now() - make_interval(days => 1))
     );

  IF NOT EXISTS (
    SELECT 1
      FROM public.users AS users
     WHERE users.id = p_user_id
       AND users.account_status = 'active'
       AND users.minor_tier = 'adult'
       AND users.privacy_prefs ->> 'ads' = 'true'
       AND public.effective_subscription_tier(users.id) = 'free'
  ) THEN
    RETURN false;
  END IF;

  IF p_reward_kind = 'reasoning'
     AND public.credit_ad_earned_this_month(p_user_id) >= 20 THEN
    RETURN false;
  END IF;
  IF p_reward_kind = 'chat' THEN
    v_month := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
    SELECT coalesce(counters.chat_ad_credits, 0)
      INTO v_chat_earned
      FROM public.usage_counters AS counters
     WHERE counters.user_id = p_user_id
       AND counters.month_bucket = v_month;
    IF coalesce(v_chat_earned, 0) >= 20 THEN
      RETURN false;
    END IF;
  END IF;

  SELECT count(*)
    INTO v_active
    FROM public.reward_ssv_tickets AS tickets
   WHERE tickets.user_id = p_user_id
     AND tickets.consumed_transaction_id IS NULL
     AND tickets.expires_at >= now();
  IF v_active >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.reward_ssv_tickets
    (token_hash, user_id, reward_kind, expected_ad_unit_id,
     expected_reward_amount, expected_reward_item, expires_at)
  VALUES
    (p_token_hash, p_user_id, p_reward_kind, p_ad_unit_id,
     p_reward_amount, p_reward_item, now() + make_interval(mins => 20))
  ON CONFLICT (token_hash) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_reward_ssv_ticket(
  p_token_hash text,
  p_callback_user_id uuid,
  p_txn_id text,
  p_ad_unit_id text,
  p_reward_amount integer,
  p_reward_item text
)
RETURNS TABLE(ticket_user_id uuid, reward_kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_callback_user_id IS NULL
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_txn_id IS NULL
     OR length(p_txn_id) NOT BETWEEN 1 AND 256
     OR p_txn_id ~ '[[:cntrl:]]'
     OR p_ad_unit_id IS NULL
     OR char_length(p_ad_unit_id) NOT BETWEEN 1 AND 256
     OR p_ad_unit_id ~ '[[:cntrl:]]'
     OR p_reward_amount IS NULL
     OR p_reward_amount NOT BETWEEN 1 AND 2147483647
     OR p_reward_item IS NULL
     OR char_length(p_reward_item) NOT BETWEEN 1 AND 256
     OR p_reward_item ~ '[[:cntrl:]]' THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.reward_ssv_tickets AS tickets
     SET consumed_transaction_id = coalesce(tickets.consumed_transaction_id, p_txn_id),
         consumed_at = coalesce(tickets.consumed_at, now())
   WHERE tickets.token_hash = p_token_hash
     AND tickets.user_id = p_callback_user_id
     AND tickets.expected_ad_unit_id = p_ad_unit_id
     AND tickets.expected_reward_amount = p_reward_amount
     AND tickets.expected_reward_item = p_reward_item
     AND (
       (tickets.consumed_transaction_id IS NULL AND tickets.expires_at >= now())
       OR (tickets.consumed_transaction_id = p_txn_id
           AND tickets.consumed_at >= now() - make_interval(days => 1))
     )
  RETURNING tickets.user_id, tickets.reward_kind;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_reward_ssv_ticket_v2(
  p_token_hash text,
  p_txn_id text,
  p_ad_unit_id text,
  p_reward_amount integer,
  p_reward_item text
)
RETURNS TABLE(reward_kind text, reward_total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket public.reward_ssv_tickets%ROWTYPE;
  v_reward_total integer;
BEGIN
  IF public.billing_request_role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role only' USING ERRCODE = '42501';
  END IF;
  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_txn_id IS NULL
     OR length(p_txn_id) NOT BETWEEN 1 AND 256
     OR p_txn_id ~ '[[:cntrl:]]'
     OR p_ad_unit_id IS NULL
     OR char_length(p_ad_unit_id) NOT BETWEEN 1 AND 256
     OR p_ad_unit_id ~ '[[:cntrl:]]'
     OR p_reward_amount IS NULL
     OR p_reward_amount NOT BETWEEN 1 AND 2147483647
     OR p_reward_item IS NULL
     OR char_length(p_reward_item) NOT BETWEEN 1 AND 256
     OR p_reward_item ~ '[[:cntrl:]]' THEN
    RETURN;
  END IF;

  -- This update and the grant below execute in the same RPC transaction. If
  -- any grant statement raises, PostgreSQL rolls the ticket update back too,
  -- so Google's exact retry can settle instead of losing a paid impression.
  UPDATE public.reward_ssv_tickets AS tickets
     SET consumed_transaction_id = coalesce(tickets.consumed_transaction_id, p_txn_id),
         consumed_at = coalesce(tickets.consumed_at, now())
   WHERE tickets.token_hash = p_token_hash
     AND tickets.expected_ad_unit_id = p_ad_unit_id
     AND tickets.expected_reward_amount = p_reward_amount
     AND tickets.expected_reward_item = p_reward_item
     AND (
       (tickets.consumed_transaction_id IS NULL AND tickets.expires_at >= now())
       OR (tickets.consumed_transaction_id = p_txn_id
           AND tickets.consumed_at >= now() - make_interval(days => 1))
     )
  RETURNING tickets.* INTO v_ticket;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_ticket.reward_kind = 'chat' THEN
    v_reward_total := public.grant_chat_ad_bonus_ssv(
      v_ticket.user_id,
      p_txn_id
    );
  ELSIF v_ticket.reward_kind = 'reasoning' THEN
    v_reward_total := public.grant_reward_credits_ssv(
      v_ticket.user_id,
      to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM'),
      p_reward_amount,
      p_txn_id
    );
  ELSE
    RAISE EXCEPTION 'invalid stored reward kind' USING ERRCODE = '22023';
  END IF;

  reward_kind := v_ticket.reward_kind;
  reward_total := v_reward_total;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_reward_ssv_ticket(uuid, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_reward_ssv_ticket(text, uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.consume_reward_ssv_ticket_v2(text, text, text, integer, text);
REVOKE ALL ON FUNCTION public.settle_reward_ssv_ticket_v2(text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_reward_ssv_ticket(uuid, text, text, text, integer, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_reward_ssv_ticket_v2(text, text, text, integer, text)
  TO service_role;

----------------------------------------------------------------------
-- 4. Fail migration if any private boundary or required object drifted
----------------------------------------------------------------------

DO $verify$
BEGIN
  IF NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.reward_ssv_tickets'::regclass
     ), false)
     OR NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.reward_ssv_issue_rate_limits'::regclass
     ), false)
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_attribute AS a
         JOIN pg_catalog.pg_attrdef AS d
           ON d.adrelid = a.attrelid
          AND d.adnum = a.attnum
        WHERE a.attrelid = 'public.reward_ssv_tickets'::regclass
          AND a.attname = 'verification_attempts'
          AND a.attnotnull
          AND a.atttypid = 'pg_catalog.int2'::pg_catalog.regtype
          AND pg_catalog.pg_get_expr(d.adbin, d.adrelid)
              ~ '^''?0''?(::smallint)?$'
          AND NOT a.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint AS c
        WHERE c.conrelid = 'public.reward_ssv_tickets'::regclass
          AND c.conname = 'reward_ssv_tickets_verification_attempts_valid'
          AND c.contype = 'c'
          AND c.convalidated
     )
     OR to_regclass('public.reward_ssv_tickets_user_consumed_idx') IS NULL
     OR to_regclass('public.reward_ssv_tickets_consumed_retention_idx') IS NULL
     OR to_regclass('public.reward_ssv_tickets_expired_retention_idx') IS NULL
     OR has_table_privilege(
       'anon', 'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role', 'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'anon', 'public.reward_ssv_issue_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated', 'public.reward_ssv_issue_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role', 'public.reward_ssv_issue_rate_limits',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_function_privilege(
       'anon', 'public.claim_reward_ssv_issue_rate_limit(uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.claim_reward_ssv_issue_rate_limit(uuid)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.claim_reward_ssv_issue_rate_limit(uuid)', 'EXECUTE'
     )
     OR to_regprocedure(
       'public.claim_reward_ssv_callback_attempt(text,text,text,integer,text)'
     ) IS NULL
     OR has_function_privilege(
       'anon',
       'public.claim_reward_ssv_callback_attempt(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.claim_reward_ssv_callback_attempt(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.claim_reward_ssv_callback_attempt(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.issue_reward_ssv_ticket(uuid,text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.issue_reward_ssv_ticket(uuid,text,text,text,integer,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.issue_reward_ssv_ticket(uuid,text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.consume_reward_ssv_ticket(text,uuid,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.consume_reward_ssv_ticket(text,uuid,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.consume_reward_ssv_ticket(text,uuid,text,text,integer,text)',
       'EXECUTE'
     )
     OR to_regprocedure(
       'public.consume_reward_ssv_ticket_v2(text,text,text,integer,text)'
     ) IS NOT NULL
     OR has_function_privilege(
       'anon',
       'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.settle_reward_ssv_ticket_v2(text,text,text,integer,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.prune_reward_ssv_tickets()', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.prune_reward_ssv_tickets()', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role', 'public.prune_reward_ssv_tickets()', 'EXECUTE'
     )
     OR has_function_privilege(
       'anon', 'public.prune_reward_ssv_tickets_on_insert()', 'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated', 'public.prune_reward_ssv_tickets_on_insert()', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.prune_reward_ssv_tickets_on_insert()', 'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_trigger
        WHERE tgname = 'reward_ssv_tickets_prune_before_insert'
          AND tgrelid = 'public.reward_ssv_tickets'::regclass
          AND tgenabled = 'O'
          AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'reward SSV hardening verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;
