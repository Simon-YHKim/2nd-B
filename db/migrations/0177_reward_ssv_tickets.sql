-- 0177_reward_ssv_tickets.sql
-- Integration candidate only: run a fresh remote/local migration scan
-- immediately before push; renumber again if precedence or reservations changed.
-- Bind each signed AdMob callback to a short-lived capability issued only after
-- Supabase Auth verified the requesting user. Raw tickets never enter the DB;
-- only SHA-256 digests are stored. Exact AdMob retries may reuse the same ticket
-- with the same transaction id, while a different transaction is rejected.

-- 최상위 BEGIN/COMMIT 을 두지 않는다. Supabase CLI 가 이 파일을 자기
-- 트랜잭션으로 감싸므로 여기서 또 열면 중첩된다(supabase-dry-run.yml 이
-- 0147 이상에 대해 막는다). 아래 SET LOCAL 은 그 CLI 트랜잭션 안에서
-- 그대로 유효하다.

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.reward_ssv_tickets (
  token_hash              text PRIMARY KEY
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id                 uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reward_kind             text NOT NULL CHECK (reward_kind IN ('reasoning', 'chat')),
  expected_ad_unit_id     text NOT NULL,
  expected_reward_amount  integer NOT NULL,
  expected_reward_item    text NOT NULL,
  issued_at               timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL,
  consumed_transaction_id text,
  consumed_at             timestamptz,
  CHECK (
    (consumed_transaction_id IS NULL AND consumed_at IS NULL)
    OR
    (consumed_transaction_id IS NOT NULL AND consumed_at IS NOT NULL)
  ),
  CHECK (
    consumed_transaction_id IS NULL
    OR length(consumed_transaction_id) BETWEEN 1 AND 256
  )
);

-- Development databases may already have the earlier provisional 0177. Those
-- tickets did not bind an ad contract and cannot be upgraded safely, so remove
-- them instead of inventing trusted values for attacker-influenced callbacks.
ALTER TABLE public.reward_ssv_tickets
  ADD COLUMN IF NOT EXISTS expected_ad_unit_id text,
  ADD COLUMN IF NOT EXISTS expected_reward_amount integer,
  ADD COLUMN IF NOT EXISTS expected_reward_item text;

DELETE FROM public.reward_ssv_tickets
 WHERE expected_ad_unit_id IS NULL
    OR expected_reward_amount IS NULL
    OR expected_reward_item IS NULL;

ALTER TABLE public.reward_ssv_tickets
  ALTER COLUMN expected_ad_unit_id SET NOT NULL,
  ALTER COLUMN expected_reward_amount SET NOT NULL,
  ALTER COLUMN expected_reward_item SET NOT NULL;

ALTER TABLE public.reward_ssv_tickets
  DROP CONSTRAINT IF EXISTS reward_ssv_tickets_expected_ad_unit_id_valid,
  DROP CONSTRAINT IF EXISTS reward_ssv_tickets_expected_reward_amount_valid,
  DROP CONSTRAINT IF EXISTS reward_ssv_tickets_expected_reward_item_valid;

ALTER TABLE public.reward_ssv_tickets
  ADD CONSTRAINT reward_ssv_tickets_expected_ad_unit_id_valid CHECK (
    char_length(expected_ad_unit_id) BETWEEN 1 AND 256
    AND expected_ad_unit_id !~ '[[:cntrl:]]'
  ),
  ADD CONSTRAINT reward_ssv_tickets_expected_reward_amount_valid CHECK (
    expected_reward_amount BETWEEN 1 AND 2147483647
  ),
  ADD CONSTRAINT reward_ssv_tickets_expected_reward_item_valid CHECK (
    char_length(expected_reward_item) BETWEEN 1 AND 256
    AND expected_reward_item !~ '[[:cntrl:]]'
  );

CREATE INDEX IF NOT EXISTS reward_ssv_tickets_user_active_idx
  ON public.reward_ssv_tickets (user_id, expires_at DESC)
  WHERE consumed_transaction_id IS NULL;

ALTER TABLE public.reward_ssv_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_ssv_tickets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_ssv_tickets
  FROM PUBLIC, anon, authenticated, service_role;

-- The provisional three-argument overloads did not bind the signed reward
-- configuration. They must disappear rather than remain callable by accident.
DROP FUNCTION IF EXISTS public.issue_reward_ssv_ticket(uuid, text, text);
DROP FUNCTION IF EXISTS public.consume_reward_ssv_ticket(text, uuid, text);

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

  -- Serialize the small per-user active-ticket count without exposing a row
  -- that an authenticated client could lock or mutate directly.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 535356)
  );

  DELETE FROM public.reward_ssv_tickets AS tickets
   WHERE tickets.user_id = p_user_id
     AND (
       tickets.expires_at < now()
       OR tickets.consumed_at < now() - make_interval(days => 1)
     );

  -- Ticket issuance repeats the current server-owned eligibility gate. The
  -- grant RPC checks again at callback time, so a later consent/tier change is
  -- also fail-closed.
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
     p_reward_amount, p_reward_item, now() + make_interval(mins => 10))
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

  -- PostgreSQL rechecks this predicate after a concurrent row-lock wait. One
  -- transaction id wins; only Google's exact retry can observe the same row.
  RETURN QUERY
  UPDATE public.reward_ssv_tickets AS tickets
     SET consumed_transaction_id = coalesce(tickets.consumed_transaction_id, p_txn_id),
         consumed_at = coalesce(tickets.consumed_at, now())
   WHERE tickets.token_hash = p_token_hash
     AND tickets.user_id = p_callback_user_id
     AND tickets.expected_ad_unit_id = p_ad_unit_id
     AND tickets.expected_reward_amount = p_reward_amount
     AND tickets.expected_reward_item = p_reward_item
     AND tickets.expires_at >= now()
     AND (
       tickets.consumed_transaction_id IS NULL
       OR tickets.consumed_transaction_id = p_txn_id
     )
  RETURNING tickets.user_id, tickets.reward_kind;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_reward_ssv_ticket(uuid, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consume_reward_ssv_ticket(text, uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_reward_ssv_ticket(uuid, text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_reward_ssv_ticket(text, uuid, text, text, integer, text) TO service_role;

DO $verify$
BEGIN
  IF NOT COALESCE((
       SELECT c.relrowsecurity AND c.relforcerowsecurity
         FROM pg_catalog.pg_class AS c
        WHERE c.oid = 'public.reward_ssv_tickets'::regclass
     ), false)
     OR to_regclass('public.reward_ssv_tickets_user_active_idx') IS NULL
     OR has_table_privilege(
       'anon',
       'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'authenticated',
       'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR has_table_privilege(
       'service_role',
       'public.reward_ssv_tickets',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
     OR to_regprocedure('public.issue_reward_ssv_ticket(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.consume_reward_ssv_ticket(text,uuid,text)') IS NOT NULL
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
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_reward_ssv_ticket(text,uuid,text,text,integer,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'reward SSV ticket ACL verification failed'
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

