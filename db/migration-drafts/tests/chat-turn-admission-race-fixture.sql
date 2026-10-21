\set ON_ERROR_STOP on
-- Committed fixtures only in the disposable t39_admission[_mutant]_test_ci DBs.
-- Each schedule owns a different synthetic user. No production function changes.
CREATE SCHEMA t39_race;
GRANT USAGE ON SCHEMA t39_race TO authenticated, service_role;

CREATE FUNCTION t39_race.id(n integer, slot integer DEFAULT 1) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('26102239-0000-4000-800' || slot || '-' || lpad(n::text, 12, '0'))::uuid
$$;

CREATE FUNCTION t39_race.check(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'T39 RACE FAIL: %', label; END IF;
  RAISE NOTICE 'T39 RACE PASS: %', label;
END;
$$;

CREATE FUNCTION t39_race.reply(kind text, reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'allowed', kind <> 'rejected', 'kind', kind,
    'attempt', CASE kind WHEN 'first' THEN 1 WHEN 'reask' THEN 2 ELSE NULL END,
    'quotaCharged', kind = 'first', 'bindingEligible', kind IN ('first', 'reask'),
    'reaskAvailable', kind = 'first', 'error', reason)
$$;

CREATE FUNCTION t39_race.admit(n integer, intent text, slot integer) RETURNS jsonb
LANGUAGE sql VOLATILE AS $$
  SELECT public.begin_chat_turn_attempt_with_quota(
    t39_race.id(n), t39_race.id(n, slot), t39_race.id(n, 2), 'openai', intent)
$$;

-- Catch ONLY the expected quota rejection, in a subtransaction. Unexpected SQL
-- errors (including the lock mutant's 55000) still abort psql with ON_ERROR_STOP.
CREATE FUNCTION t39_race.quota_denied(n integer) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM t39_race.admit(n, 'first', 3);
  RETURN false;
EXCEPTION WHEN SQLSTATE 'T3901' THEN RETURN true;
END;
$$;

CREATE FUNCTION t39_race.consume(n integer, granted boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE q record;
BEGIN
  SELECT * INTO STRICT q FROM public.consume_llm_proxy_purpose_quota(
    t39_race.id(n), 'openai', 'secondb_chat');
  PERFORM t39_race.check(q.allowed = granted AND q.used = 5 AND q.quota_limit = 5,
    'last purpose slot ordinary consume ' || granted);
END;
$$;

CREATE FUNCTION t39_race.bump(n integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.bump_chat_usage_for_turn(t39_race.id(n),
    (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date);
  PERFORM t39_race.check((r->>'count')::int = 2 AND (r->>'turnId')::uuid <> t39_race.id(n,2),
    'bump counts once and issues a new turn');
END;
$$;

-- The runner defers each race near KST midnight: seed both server days in case
-- that wait crosses midnight. The predicate below bounds this to two days.
CREATE TABLE t39_race.clock AS
SELECT (clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date AS day;
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email)
SELECT t39_race.id(n), 't39-race-' || n || '@example.invalid' FROM generate_series(1,9) n;
SET LOCAL session_replication_role = origin;
INSERT INTO public.users(id,email,birth_date,locale)
SELECT t39_race.id(n), 't39-race-' || n || '@example.invalid', DATE '1990-01-01', 'en'
FROM generate_series(1,9) n;
INSERT INTO public.chat_usage(user_id,day,count)
SELECT t39_race.id(n), day + offset_day, 1
FROM generate_series(1,9) n CROSS JOIN t39_race.clock CROSS JOIN generate_series(0,1) offset_day;
INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at,
  attempts,attempt1_audit_id,attempted_at)
SELECT t39_race.id(n,2), t39_race.id(n), day, clock_timestamp() - interval '1 second',
  CASE WHEN n IN (2,5,6) THEN 1 ELSE 0 END,
  CASE WHEN n IN (2,5,6) THEN t39_race.id(n,3) END,
  CASE WHEN n IN (2,5,6) THEN clock_timestamp() - interval '1 second' END
FROM generate_series(1,9) n CROSS JOIN t39_race.clock;
INSERT INTO public.llm_proxy_purpose_daily(user_id,kst_day,purpose,count)
SELECT t39_race.id(n), day + offset_day, 'secondb_chat', CASE WHEN n IN (3,4) THEN 4 ELSE 1 END
FROM generate_series(2,6) n CROSS JOIN t39_race.clock CROSS JOIN generate_series(0,1) offset_day;
COMMIT;

CREATE FUNCTION t39_race.state(n integer, attempts_want integer, quota_sum integer, bumped boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM t39_race.check((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date
    BETWEEN (SELECT day FROM t39_race.clock) AND (SELECT day + 1 FROM t39_race.clock), 'fixture clock bounded');
  PERFORM t39_race.check((SELECT count(*) = 1 AND bool_and(attempts = attempts_want)
    FROM public.chat_turn_reservations WHERE user_id = t39_race.id(n)), 'reservation count and attempts ' || n);
  PERFORM t39_race.check((SELECT sum(count) = quota_sum FROM public.llm_proxy_purpose_daily
    WHERE user_id = t39_race.id(n) AND purpose = 'secondb_chat'), 'purpose total ' || n);
  PERFORM t39_race.check((SELECT sum(count) = CASE WHEN bumped THEN 3 ELSE 2 END
    FROM public.chat_usage WHERE user_id = t39_race.id(n)), 'chat total ' || n);
  IF bumped THEN
    PERFORM t39_race.check(NOT EXISTS (SELECT 1 FROM public.chat_turn_reservations
      WHERE turn_id = t39_race.id(n,2)), 'bump retired prior reservation ' || n);
  ELSE
    PERFORM t39_race.check((SELECT
      attempt1_audit_id IS NOT DISTINCT FROM CASE WHEN attempts_want > 0 THEN t39_race.id(n,3) END
      AND attempt2_audit_id IS NOT DISTINCT FROM CASE WHEN attempts_want = 2 THEN t39_race.id(n,4) END
      AND (attempted_at IS NULL) = (attempts_want = 0) AND state = 'counted' AND audit_id IS NULL
      FROM public.chat_turn_reservations WHERE turn_id = t39_race.id(n,2)), 'audit slots and rollback ' || n);
  END IF;
END;
$$;
