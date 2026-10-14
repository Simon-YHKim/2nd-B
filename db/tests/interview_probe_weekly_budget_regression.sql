\set ON_ERROR_STOP on

-- 0259: the interview seat (interview_probe) has a daily ceiling and a rolling seven-day budget; every other
-- seat is as 0185 made it. Run on the CI scratch database after the numbered migrations. Rolled back at the end.
BEGIN;

CREATE FUNCTION pg_temp.w_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'w59 regression failed: %', p_what;
  END IF;
END
$$;
-- One proxy call: "allowed/used/limit".
CREATE FUNCTION pg_temp.w_call(p_user uuid, p_purpose text) RETURNS text
LANGUAGE sql AS $$
  SELECT q.allowed::text || '/' || q.used || '/' || q.quota_limit
    FROM public.consume_llm_proxy_purpose_quota(p_user, 'openai', p_purpose) AS q
$$;
-- n calls in a row; the answer of the last one.
CREATE FUNCTION pg_temp.w_calls(p_user uuid, p_purpose text, p_n integer) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_last text;
BEGIN
  FOR i IN 1..p_n LOOP
    v_last := pg_temp.w_call(p_user, p_purpose);
  END LOOP;
  RETURN v_last;
END
$$;
CREATE FUNCTION pg_temp.w_today(p_user uuid, p_purpose text) RETURNS integer
LANGUAGE sql AS $$
  SELECT COALESCE((SELECT d.count FROM public.llm_proxy_purpose_daily AS d
                    WHERE d.user_id = p_user AND d.purpose = p_purpose
                      AND d.kst_day = (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date), 0)
$$;

SELECT (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date AS today \gset

-- The vanilla PostgreSQL auth stub lacks production trigger columns.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('26101459-0000-4000-8000-000000000001', 'w59-free@example.com'),
  ('26101459-0000-4000-8000-000000000002', 'w59-free-history@example.com'),
  ('26101459-0000-4000-8000-000000000003', 'w59-soma@example.com'),
  ('26101459-0000-4000-8000-000000000004', 'w59-free-roundtrip@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale) VALUES
  ('26101459-0000-4000-8000-000000000001', 'w59-free@example.com', DATE '1990-01-01', 'en'),
  ('26101459-0000-4000-8000-000000000002', 'w59-free-history@example.com', DATE '1990-01-01', 'en'),
  ('26101459-0000-4000-8000-000000000003', 'w59-soma@example.com', DATE '1990-01-01', 'en'),
  ('26101459-0000-4000-8000-000000000004', 'w59-free-roundtrip@example.com', DATE '1990-01-01', 'en');
-- The tier column is written the way billing writes it (service side, not a signed-in request).
SET LOCAL session_replication_role = replica;
UPDATE public.users SET subscription_tier = 'soma' WHERE id = '26101459-0000-4000-8000-000000000003';
SET LOCAL session_replication_role = origin;
SELECT pg_temp.w_assert(public.effective_subscription_tier('26101459-0000-4000-8000-000000000003') = 'soma'
                        AND public.effective_subscription_tier('26101459-0000-4000-8000-000000000001') = 'free',
                        'the tiers the cases stand on are not what they need');

-- Signed-in requests still cannot spend or read the counter.
SET LOCAL request.jwt.claim.role = 'authenticated';
DO $w59_denied$
BEGIN
  BEGIN
    PERFORM public.consume_llm_proxy_purpose_quota('26101459-0000-4000-8000-000000000001', 'openai', 'interview_probe');
    RAISE EXCEPTION 'w59 regression failed: a signed-in request spent an interview question';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$w59_denied$;
SELECT pg_temp.w_assert(NOT has_function_privilege('authenticated', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE')
                        AND NOT has_function_privilege('anon', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE')
                        AND has_function_privilege('service_role', 'public.consume_llm_proxy_purpose_quota(uuid, text, text)', 'EXECUTE'),
                        'the quota function is open to an application role, or closed to the proxies');

SET LOCAL request.jwt.claim.role = 'service_role';

-- 1. Free, nothing before today: sixty questions a day, the sixty-first is the daily ceiling.
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000001', 'interview_probe') = 'true/1/60',
                        'the first interview question of a free account is not one of sixty');
SELECT pg_temp.w_assert(pg_temp.w_calls('26101459-0000-4000-8000-000000000001', 'interview_probe', 59) = 'true/60/60',
                        'a free account did not get its sixtieth interview question of the day');
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000001', 'interview_probe') = 'false/60/60'
                        AND pg_temp.w_today('26101459-0000-4000-8000-000000000001', 'interview_probe') = 60,
                        'the sixty-first interview question of the day was not refused at the daily ceiling, or it was counted');

-- 2. Free, with the week mostly spent: 100 in the last six days, and 60 on the day before that (outside the
--    window, so it must not count). Forty more today, then the week refuses: (false, 140, 140).
INSERT INTO public.llm_proxy_purpose_daily (user_id, kst_day, purpose, count) VALUES
  ('26101459-0000-4000-8000-000000000002', :'today'::date - 1, 'interview_probe', 50),
  ('26101459-0000-4000-8000-000000000002', :'today'::date - 3, 'interview_probe', 30),
  ('26101459-0000-4000-8000-000000000002', :'today'::date - 6, 'interview_probe', 20),
  ('26101459-0000-4000-8000-000000000002', :'today'::date - 7, 'interview_probe', 60),
  ('26101459-0000-4000-8000-000000000002', :'today'::date - 1, 'ops_recommend', 20);
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'interview_probe') = 'true/1/60',
                        'the day before the seven-day window was counted, or the window lost a day');
SELECT pg_temp.w_assert(pg_temp.w_calls('26101459-0000-4000-8000-000000000002', 'interview_probe', 39) = 'true/40/60',
                        'the week ran out before 140, or the day ceiling cut in first');
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'interview_probe') = 'false/140/140'
                        AND pg_temp.w_today('26101459-0000-4000-8000-000000000002', 'interview_probe') = 40,
                        'the 141st question of the week was not refused with the week''s numbers, or it was counted');
-- The week holds whatever the day ceiling says.
SELECT pg_temp.w_assert(pg_temp.w_calls('26101459-0000-4000-8000-000000000002', 'interview_probe', 5) = 'false/140/140',
                        'the week let another question through');

-- 3. Other seats are as 0185 made them: the interview week does not touch them, and their daily share is the old one.
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'ops_recommend') = 'true/1/20',
                        'the interview week reached another seat, or a day before today was counted for it');
SELECT pg_temp.w_assert(pg_temp.w_calls('26101459-0000-4000-8000-000000000002', 'ops_recommend', 19) = 'true/20/20'
                        AND pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'ops_recommend') = 'false/20/20',
                        'another seat of the group the interview seat left lost or gained its daily share of twenty');
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'axis_estimate') = 'true/1/5',
                        'a seat with its own share changed');

-- 4. Soma: a day ceiling of 150 and a week of 350. 349 in the last six days: one more today, then the week.
INSERT INTO public.llm_proxy_purpose_daily (user_id, kst_day, purpose, count) VALUES
  ('26101459-0000-4000-8000-000000000003', :'today'::date - 1, 'interview_probe', 150),
  ('26101459-0000-4000-8000-000000000003', :'today'::date - 2, 'interview_probe', 150),
  ('26101459-0000-4000-8000-000000000003', :'today'::date - 4, 'interview_probe', 49);
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000003', 'interview_probe') = 'true/1/150',
                        'a soma account''s daily ceiling is not 150');
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000003', 'interview_probe') = 'false/350/350',
                        'a soma account''s week is not 350');

-- 4b. A week already past its budget (a lowered number, or rows from before 0259) is refused with what was
--     really used, which the proxies accept (a refusal has used >= limit), and nothing more is counted.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES ('26101459-0000-4000-8000-000000000005', 'w59-free-over@example.com');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users (id, email, birth_date, locale)
VALUES ('26101459-0000-4000-8000-000000000005', 'w59-free-over@example.com', DATE '1990-01-01', 'en');
INSERT INTO public.llm_proxy_purpose_daily (user_id, kst_day, purpose, count) VALUES
  ('26101459-0000-4000-8000-000000000005', :'today'::date - 1, 'interview_probe', 60),
  ('26101459-0000-4000-8000-000000000005', :'today'::date - 2, 'interview_probe', 60),
  ('26101459-0000-4000-8000-000000000005', :'today'::date - 3, 'interview_probe', 30);
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000005', 'interview_probe') = 'false/150/140'
                        AND pg_temp.w_today('26101459-0000-4000-8000-000000000005', 'interview_probe') = 0,
                        'a week past its budget was not refused with what was really used, or the refusal was counted');

-- 5. The way back: 0259's down file brings 0185's function back (the interview seat is twenty a day again,
--    with no week), and 0259 applies again over it.
\ir ../migrations/rollback/0259_down.sql
SELECT pg_temp.w_assert(pg_temp.w_calls('26101459-0000-4000-8000-000000000004', 'interview_probe', 20) = 'true/20/20'
                        AND pg_temp.w_call('26101459-0000-4000-8000-000000000004', 'interview_probe') = 'false/20/20',
                        'the down file did not bring back the daily share of twenty');
-- Without 0259 the old daily share speaks: forty today is already past twenty, and no week is read.
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'interview_probe') = 'false/40/20',
                        'the down file left a week, or not the old daily share');
\ir ../migrations/0259_interview_probe_weekly_budget.sql
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000004', 'interview_probe') = 'true/21/60',
                        '0259 did not apply again over the down file');
SELECT pg_temp.w_assert(pg_temp.w_call('26101459-0000-4000-8000-000000000002', 'interview_probe') = 'false/140/140',
                        'the week did not come back with 0259');

ROLLBACK;
