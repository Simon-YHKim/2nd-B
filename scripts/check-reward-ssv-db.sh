#!/usr/bin/env bash
set -euo pipefail

# This regression suite is deliberately pinned to the job-local Postgres. It
# must never inherit a production database URL or Supabase project reference.
psql_local() {
  psql -X -qAt -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

if [[ "${REWARD_SSV_DB_TEST:-}" != 'github-actions-only' \
   || "${GITHUB_ACTIONS:-}" != 'true' \
   || "${CI:-}" != 'true' ]]; then
  echo 'reward SSV DB test is restricted to its GitHub Actions scratch database' >&2
  exit 64
fi

db_identity="$(psql_local -c \
  "SELECT current_database() || '|' || current_user || '|' || inet_server_port() || '|' || inet_server_addr()")"
if [[ ! "$db_identity" =~ ^postgres\|postgres\|5432\|(127\.0\.0\.1|::1)$ ]]; then
  echo "refusing unexpected reward SSV DB target: $db_identity" >&2
  exit 64
fi

readonly test_user='7e770000-0000-4000-8000-000000000001'
readonly exact_ticket='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
readonly chat_ticket='1212121212121212121212121212121212121212121212121212121212121212'
readonly expired_ticket='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
readonly race_ticket='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
readonly old_ticket='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
readonly stale_ticket='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
readonly active_ticket='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
readonly failure_ticket='9999999999999999999999999999999999999999999999999999999999999999'
test_dir="$(mktemp -d)"

cleanup() {
  set +e
  psql_local <<SQL >/dev/null 2>&1
DROP TRIGGER IF EXISTS reward_ssv_ci_forced_failure ON public.rewarded_ssv_txns;
DROP FUNCTION IF EXISTS public.reward_ssv_ci_forced_failure();
DELETE FROM public.users WHERE id = '$test_user';
DELETE FROM auth.users WHERE id = '$test_user';
SQL
  rm -f -- \
    "$test_dir/lock-ready" \
    "$test_dir/lock-holder.out" \
    "$test_dir/consume-1.out" \
    "$test_dir/consume-2.out" \
    "$test_dir"/admit-*.out
  rmdir -- "$test_dir" 2>/dev/null
}
trap cleanup EXIT

# The numbered baseline deliberately excludes drafts. Apply this draft only to
# the guarded job-local scratch database so the functional checks can exercise it.
psql_local <<'SQL'
BEGIN;
\i db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql
COMMIT;
SQL

# A second transactional application must succeed. Rolling back the replay
# keeps the first application's schema untouched while exercising replay safety.
psql_local <<'SQL'
BEGIN;
\i db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql
ROLLBACK;
SQL

psql_local <<SQL
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES ('$test_user', 'reward-ssv-ci@example.invalid', clock_timestamp());

INSERT INTO public.users (id, email, birth_date, locale, privacy_prefs)
VALUES (
  '$test_user',
  'reward-ssv-ci@example.invalid',
  DATE '1990-01-01',
  'en',
  '{"ads":true}'::jsonb
);

SET request.jwt.claim.role = 'service_role';

DO \$reward_contract\$
DECLARE
  retry_after integer;
  result_count integer;
  result_kind text;
  earned integer;
BEGIN
  FOR attempt IN 1..10 LOOP
    retry_after := public.claim_reward_ssv_issue_rate_limit('$test_user');
    IF retry_after <> 0 THEN
      RAISE EXCEPTION 'rate limiter rejected allowed attempt % with %', attempt, retry_after;
    END IF;
  END LOOP;

  retry_after := public.claim_reward_ssv_issue_rate_limit('$test_user');
  IF retry_after NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'rate limiter did not reject attempt 11: %', retry_after;
  END IF;

  IF NOT public.issue_reward_ssv_ticket(
    '$test_user', 'reasoning', '$exact_ticket', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'eligible exact-retry ticket was not issued';
  END IF;

  IF public.claim_reward_ssv_callback_attempt(
    '$exact_ticket', 'reward-ci-exact', 'wrong-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'mismatched callback contract was admitted';
  END IF;
  FOR attempt IN 1..6 LOOP
    IF NOT public.claim_reward_ssv_callback_attempt(
      '$exact_ticket', 'reward-ci-exact', 'ci-ad-unit', 2, 'reasoning credit'
    ) THEN
      RAISE EXCEPTION 'callback attempt % of six was rejected', attempt;
    END IF;
  END LOOP;
  IF public.claim_reward_ssv_callback_attempt(
    '$exact_ticket', 'reward-ci-exact', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'callback attempt seven was not rejected';
  END IF;

  SELECT reward_kind, reward_total
    INTO result_kind, earned
    FROM public.settle_reward_ssv_ticket_v2(
      '$exact_ticket', 'reward-ci-exact', 'ci-ad-unit', 2, 'reasoning credit'
    );
  GET DIAGNOSTICS result_count = ROW_COUNT;
  IF result_count <> 1 OR result_kind <> 'reasoning' OR earned <> 2 THEN
    RAISE EXCEPTION 'opaque ticket did not settle its server-owned reward';
  END IF;

  UPDATE public.reward_ssv_tickets
     SET expires_at = now() - make_interval(mins => 1)
   WHERE token_hash = '$exact_ticket';

  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$exact_ticket', 'reward-ci-exact', 'ci-ad-unit', 2, 'reasoning credit'
    );
  IF result_count <> 1 THEN
    RAISE EXCEPTION 'exact Google retry stopped settling after ticket expiry';
  END IF;

  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$exact_ticket', 'reward-ci-replay', 'ci-ad-unit', 2, 'reasoning credit'
    );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'different transaction replay consumed an already-bound ticket';
  END IF;

  IF NOT public.issue_reward_ssv_ticket(
    '$test_user', 'chat', '$chat_ticket', 'ci-ad-unit', 2, 'chat credit'
  ) THEN
    RAISE EXCEPTION 'eligible chat ticket was not issued';
  END IF;
  IF NOT public.claim_reward_ssv_callback_attempt(
    '$chat_ticket', 'reward-ci-chat', 'ci-ad-unit', 2, 'chat credit'
  ) THEN
    RAISE EXCEPTION 'active chat callback ticket was not admitted';
  END IF;

  SELECT reward_kind, reward_total
    INTO result_kind, earned
    FROM public.settle_reward_ssv_ticket_v2(
      '$chat_ticket', 'reward-ci-chat', 'ci-ad-unit', 2, 'chat credit'
    );
  GET DIAGNOSTICS result_count = ROW_COUNT;
  IF result_count <> 1 OR result_kind <> 'chat' OR earned <> 2 THEN
    RAISE EXCEPTION 'chat ticket did not settle its server-owned reward';
  END IF;

  UPDATE public.reward_ssv_tickets
     SET expires_at = now() - make_interval(secs => 1)
   WHERE token_hash = '$chat_ticket';
  IF NOT public.claim_reward_ssv_callback_attempt(
    '$chat_ticket', 'reward-ci-chat', 'ci-ad-unit', 2, 'chat credit'
  ) THEN
    RAISE EXCEPTION 'expired exact consumed callback retry was not admitted';
  END IF;
  IF public.claim_reward_ssv_callback_attempt(
    '$chat_ticket', 'reward-ci-chat-other', 'ci-ad-unit', 2, 'chat credit'
  ) THEN
    RAISE EXCEPTION 'different consumed callback transaction was admitted';
  END IF;

  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$chat_ticket', 'reward-ci-chat', 'ci-ad-unit', 2, 'chat credit'
    );
  IF result_count <> 1
     OR (SELECT chat_ad_credits
           FROM public.usage_counters
          WHERE user_id = '$test_user'
            AND month_bucket = to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')) <> 2
     OR (SELECT ad_bonus
           FROM public.chat_usage
          WHERE user_id = '$test_user'
            AND day = (now() AT TIME ZONE 'Asia/Seoul')::date) <> 2
     OR (SELECT count(*)
           FROM public.rewarded_ssv_txns
          WHERE transaction_id = 'reward-ci-chat') <> 1 THEN
    RAISE EXCEPTION 'chat reward was not exactly-once across replay';
  END IF;

  IF NOT public.issue_reward_ssv_ticket(
    '$test_user', 'reasoning', '$expired_ticket', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'expiry test ticket was not issued';
  END IF;
  UPDATE public.reward_ssv_tickets
     SET expires_at = now() - make_interval(secs => 1)
   WHERE token_hash = '$expired_ticket';
  IF public.claim_reward_ssv_callback_attempt(
    '$expired_ticket', 'reward-ci-expired', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'expired callback ticket was admitted';
  END IF;
  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$expired_ticket', 'reward-ci-expired', 'ci-ad-unit', 2, 'reasoning credit'
    );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'new transaction consumed an expired ticket';
  END IF;

  INSERT INTO public.reward_ssv_tickets (
    token_hash, user_id, reward_kind, expected_ad_unit_id,
    expected_reward_amount, expected_reward_item, expires_at,
    consumed_transaction_id, consumed_at
  ) VALUES
    (
      '$old_ticket', '$test_user', 'reasoning', 'ci-ad-unit', 2,
      'reasoning credit', now() - make_interval(days => 2),
      'reward-ci-old', now() - make_interval(days => 2)
    ),
    (
      '$stale_ticket', '$test_user', 'reasoning', 'ci-ad-unit', 2,
      'reasoning credit', now() - make_interval(mins => 1), NULL, NULL
    ),
    (
      '$active_ticket', '$test_user', 'reasoning', 'ci-ad-unit', 2,
      'reasoning credit', now() + make_interval(mins => 20), NULL, NULL
    );

  PERFORM public.prune_reward_ssv_tickets();
  IF EXISTS (
       SELECT 1 FROM public.reward_ssv_tickets
        WHERE token_hash IN ('$old_ticket', '$stale_ticket')
     ) OR NOT EXISTS (
       SELECT 1 FROM public.reward_ssv_tickets WHERE token_hash = '$active_ticket'
     ) THEN
    RAISE EXCEPTION 'bounded retention removed the wrong ticket set';
  END IF;
END
\$reward_contract\$;

-- Force the grant phase to fail after the ticket UPDATE. The caught exception
-- rolls its PL/pgSQL subtransaction back; a surviving consumed marker would
-- prove that settlement was split across transaction boundaries.
CREATE FUNCTION public.reward_ssv_ci_forced_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS \$\$
BEGIN
  IF NEW.transaction_id = 'reward-ci-forced-failure' THEN
    RAISE EXCEPTION 'forced settlement failure';
  END IF;
  RETURN NEW;
END;
\$\$;

CREATE TRIGGER reward_ssv_ci_forced_failure
  BEFORE INSERT ON public.rewarded_ssv_txns
  FOR EACH ROW EXECUTE FUNCTION public.reward_ssv_ci_forced_failure();

DO \$settlement_rollback\$
DECLARE
  failed boolean := false;
BEGIN
  IF NOT public.issue_reward_ssv_ticket(
    '$test_user', 'reasoning', '$failure_ticket', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'failure-injection ticket was not issued';
  END IF;

  BEGIN
    PERFORM * FROM public.settle_reward_ssv_ticket_v2(
      '$failure_ticket', 'reward-ci-forced-failure', 'ci-ad-unit', 2, 'reasoning credit'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'forced settlement failure' THEN
      RAISE;
    END IF;
    failed := true;
  END;

  IF NOT failed THEN
    RAISE EXCEPTION 'forced settlement failure did not reach caller';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reward_ssv_tickets
     WHERE token_hash = '$failure_ticket'
       AND (consumed_transaction_id IS NOT NULL OR consumed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ticket consumption survived failed settlement';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.rewarded_ssv_txns
     WHERE transaction_id = 'reward-ci-forced-failure'
  ) THEN
    RAISE EXCEPTION 'reward ledger survived failed settlement';
  END IF;
END
\$settlement_rollback\$;

DROP TRIGGER reward_ssv_ci_forced_failure ON public.rewarded_ssv_txns;
DROP FUNCTION public.reward_ssv_ci_forced_failure();

DO \$race_seed\$
BEGIN
  IF NOT public.issue_reward_ssv_ticket(
    '$test_user', 'reasoning', '$race_ticket', 'ci-ad-unit', 2, 'reasoning credit'
  ) THEN
    RAISE EXCEPTION 'concurrency ticket was not issued';
  END IF;
END
\$race_seed\$;
SQL

# Ten independent Edge-isolate equivalents race the same ticket. The database
# counter, not process memory, must admit exactly Google's six total deliveries.
claim_callback_attempt() {
  local output_path="$1"
  PGAPPNAME='reward-ssv-callback-admission' psql_local <<SQL >"$output_path"
SET request.jwt.claim.role = 'service_role';
SELECT CASE WHEN public.claim_reward_ssv_callback_attempt(
  '$active_ticket', 'reward-ci-admission', 'ci-ad-unit', 2, 'reasoning credit'
) THEN 1 ELSE 0 END;
SQL
}

admission_pids=()
for attempt in $(seq 1 10); do
  claim_callback_attempt "$test_dir/admit-$attempt.out" &
  admission_pids+=("$!")
done
for admission_pid in "${admission_pids[@]}"; do
  wait "$admission_pid"
done

admission_total=0
for attempt in $(seq 1 10); do
  admission_result="$(tr -d '[:space:]' <"$test_dir/admit-$attempt.out")"
  if [[ ! "$admission_result" =~ ^[01]$ ]]; then
    echo "invalid callback admission result: $admission_result" >&2
    exit 1
  fi
  admission_total=$((admission_total + admission_result))
done
if (( admission_total != 6 )); then
  echo "callback admission was not atomic across processes: $admission_total / 6" >&2
  exit 1
fi
admission_counter="$(psql_local -c \
  "SELECT verification_attempts FROM public.reward_ssv_tickets WHERE token_hash = '$active_ticket'")"
if [[ "$admission_counter" != '6' ]]; then
  echo "verification attempt counter did not stop at six: $admission_counter" >&2
  exit 1
fi

# Hold the ticket row while two different transactions queue. PostgreSQL must
# recheck the UPDATE predicate after the lock wait so exactly one can consume.
PGAPPNAME='reward-ssv-lock-holder' psql_local <<SQL >"$test_dir/lock-holder.out" &
BEGIN;
SELECT token_hash
  FROM public.reward_ssv_tickets
 WHERE token_hash = '$race_ticket'
 FOR UPDATE;
\! touch "$test_dir/lock-ready"
SELECT pg_sleep(5);
COMMIT;
SQL
lock_pid=$!

for _attempt in $(seq 1 100); do
  if [[ -f "$test_dir/lock-ready" ]]; then
    break
  fi
  sleep 0.05
done
if [[ ! -f "$test_dir/lock-ready" ]]; then
  echo 'reward SSV lock holder did not become ready' >&2
  exit 1
fi

settle_ticket() {
  local transaction_id="$1"
  local app_name="$2"
  PGAPPNAME="$app_name" psql_local <<SQL
SET request.jwt.claim.role = 'service_role';
SELECT count(*)
  FROM public.settle_reward_ssv_ticket_v2(
    '$race_ticket', '$transaction_id', 'ci-ad-unit', 2, 'reasoning credit'
  );
SQL
}

settle_ticket 'reward-ci-race-1' 'reward-ssv-consumer-1' >"$test_dir/consume-1.out" &
consume_pid_1=$!
settle_ticket 'reward-ci-race-2' 'reward-ssv-consumer-2' >"$test_dir/consume-2.out" &
consume_pid_2=$!

contention_observed=0
for _attempt in $(seq 1 80); do
  waiting_count="$(psql_local -c "
    SELECT count(*)
      FROM pg_catalog.pg_stat_activity
     WHERE application_name LIKE 'reward-ssv-consumer-%'
       AND wait_event_type = 'Lock'
  ")"
  if [[ "$waiting_count" == '2' ]]; then
    contention_observed=1
    break
  fi
  sleep 0.05
done
if (( contention_observed != 1 )); then
  echo 'both reward SSV consumers did not contend on the ticket row' >&2
  exit 1
fi

set +e
wait "$lock_pid"
lock_status=$?
wait "$consume_pid_1"
consume_status_1=$?
wait "$consume_pid_2"
consume_status_2=$?
set -e

if (( lock_status != 0 || consume_status_1 != 0 || consume_status_2 != 0 )); then
  echo "reward SSV concurrency process failed: $lock_status / $consume_status_1 / $consume_status_2" >&2
  exit 1
fi

result_1="$(tr -d '[:space:]' <"$test_dir/consume-1.out")"
result_2="$(tr -d '[:space:]' <"$test_dir/consume-2.out")"
if [[ ! "$result_1" =~ ^[01]$ || ! "$result_2" =~ ^[01]$ ]] \
   || (( result_1 + result_2 != 1 )); then
  echo "different transactions did not converge to one consumer: $result_1 / $result_2" >&2
  exit 1
fi

if [[ "$result_1" == '1' ]]; then
  winner='reward-ci-race-1'
  loser='reward-ci-race-2'
else
  winner='reward-ci-race-2'
  loser='reward-ci-race-1'
fi

psql_local <<SQL
SET request.jwt.claim.role = 'service_role';
DO \$race_verify\$
DECLARE
  result_count integer;
BEGIN
  IF (SELECT consumed_transaction_id FROM public.reward_ssv_tickets
       WHERE token_hash = '$race_ticket') IS DISTINCT FROM '$winner' THEN
    RAISE EXCEPTION 'stored transaction did not match the winning consumer';
  END IF;

  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$race_ticket', '$winner', 'ci-ad-unit', 2, 'reasoning credit'
    );
  IF result_count <> 1 THEN
    RAISE EXCEPTION 'winning transaction was not exactly retriable';
  END IF;

  SELECT count(*) INTO result_count
    FROM public.settle_reward_ssv_ticket_v2(
      '$race_ticket', '$loser', 'ci-ad-unit', 2, 'reasoning credit'
    );
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'losing transaction replay consumed the ticket';
  END IF;
END
\$race_verify\$;
SQL
