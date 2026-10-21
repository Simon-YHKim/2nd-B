#!/usr/bin/env bash
# Disposable full-schema clones only. PGPORT selects a private local cluster for
# reproduction; CI uses its PG16 service. No URL, dotenv, or remote host input.
set -euo pipefail
started=$SECONDS
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') db=t39_admission_test_ci ;;
  --mutant) db=t39_admission_mutant_test_ci ;;
  *) echo 'Only the default CI clone or --mutant is supported' >&2; exit 1 ;;
esac
if [[ "$db" = t39_admission_mutant_test_ci ]]; then
  [[ $# = 2 ]]
else
  [[ $# = 0 ]]
fi
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS
export PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c statement_timeout=20000 -c idle_in_transaction_session_timeout=30000'
psql=(psql -X -qAt -h 127.0.0.1 -p "${PGPORT:-5432}" -U postgres -d "$db"
  -v ON_ERROR_STOP=1 -v VERBOSITY=verbose)
work=$(mktemp -d "${TMPDIR:-/tmp}/t39-races.XXXXXX")
tag="t39_race_$$"
leader_pid='' follower_pid='' leader_in='' leader_out=''
close_leader_pipes() {
  if [[ -n "$leader_in" ]]; then exec {leader_in}>&-; leader_in=''; fi
  if [[ -n "$leader_out" ]]; then exec {leader_out}<&-; leader_out=''; fi
}
reap_client() {
  local pid=$1 signal deadline
  [[ -n "$pid" ]] || return 0
  # EOF normally ends psql. Bound both the grace period and TERM fallback;
  # KILL is needed if the client cannot respond (even after backend termination).
  for signal in TERM KILL; do
    deadline=$((SECONDS + 2))
    while kill -0 "$pid" 2>/dev/null && (( SECONDS < deadline )); do sleep 0.05; done
    kill -0 "$pid" 2>/dev/null || break
    kill -"$signal" "$pid" 2>/dev/null || true
  done
  wait "$pid" || true
}
cleanup() {
  local status=$?
  trap - EXIT
  # Print evidence BEFORE any teardown can fail or wait. Killing a backend does
  # not wake a psql client blocked on stdin; close its last writer as well.
  if (( status != 0 )); then
    for file in "$work"/*.log; do
      [[ -f "$file" ]] || continue
      echo "T39 log: $file" >&2
      cat "$file" >&2
    done
  fi
  echo "T39 race logs: $work"
  close_leader_pipes
  # Cancel only this invocation's two named backends, including a failed psql's
  # open transaction. Do not leave locks behind on assertion/timeout/SIGTERM.
  "${psql[@]}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '$db' AND application_name IN ('${tag}_leader','${tag}_follower');" >/dev/null || true
  reap_client "$leader_pid"
  reap_client "$follower_pid"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# A pipe keeps the leader transaction open until the observer proves that the
# follower is blocked. No fixed sleep decides when to commit.
start_leader() {
  # Both last-slot callers must use the same server KST day. Defer a schedule
  # near midnight; the 120s window exceeds the bounded connection/SQL waits.
  # Fixtures cover the adjacent day if this polling crosses midnight.
  local deadline=$((SECONDS + 125)) ready
  while true; do
    ready=$("${psql[@]}" -c "SELECT extract(epoch FROM
      (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') + interval '1 day'
       - (now() AT TIME ZONE 'Asia/Seoul'))) >= 120;")
    [[ "${ready%$'\r'}" != t ]] || break
    (( SECONDS < deadline )) || { echo 'No stable KST day window' >&2; return 1; }
    sleep 1
  done
  coproc LEADER { exec "${psql[@]}" 2>"$work/leader-error.log"; }
  leader_pid=$LEADER_PID
  exec {leader_in}>&"${LEADER[1]}" {leader_out}<&"${LEADER[0]}"
  # Keep only the duplicates: an extra coproc writer would prevent stdin EOF.
  local coproc_in=${LEADER[1]} coproc_out=${LEADER[0]}
  exec {coproc_in}>&- {coproc_out}<&-
  leader "SET application_name = '${tag}_leader';"
}
leader() {
  printf '%s\n\\echo T39_READY\n' "$1" >&"$leader_in"
  local line
  while IFS= read -r -t 25 line <&"$leader_out"; do
    line=${line%$'\r'}
    [[ "$line" != T39_READY ]] || return 0
    printf '%s\n' "$line" >>"$work/leader-output.log"
  done
  echo 'Leader exited or timed out before completing its assertion' >&2
  return 1
}
stop_leader() {
  printf '\\q\n' >&"$leader_in"
  close_leader_pipes
  wait "$leader_pid"
  leader_pid=''
}
follower() {
  "${psql[@]}" -f - >"$work/follower.log" 2>&1 <<<"SET application_name = '${tag}_follower'; $1" &
  follower_pid=$!
}
observe_wait() {
  local event=$1 deadline=$((SECONDS + 15)) evidence
  while (( SECONDS < deadline )); do
    evidence=$("${psql[@]}" -c "SELECT a.wait_event_type || '/' || a.wait_event || ' follower=' || a.pid || ' leader=' || b.pid
      FROM pg_stat_activity a JOIN pg_stat_activity b ON b.pid = ANY(pg_blocking_pids(a.pid))
      WHERE a.datname = '$db' AND b.datname = '$db'
        AND a.application_name = '${tag}_follower' AND b.application_name = '${tag}_leader'
        AND a.state = 'active' AND b.state = 'idle in transaction'
        AND a.wait_event_type = 'Lock' AND a.wait_event = '$event';")
    if [[ -n "$evidence" ]]; then
      echo "T39 WAIT $case_name: $evidence"
      return 0
    fi
    # Only polling backoff; progression requires the observed blocker and event.
    sleep 0.05
  done
  echo "No expected Lock/$event from the leader in $case_name" >&2
  return 1
}
service="SET LOCAL ROLE service_role; SET LOCAL request.jwt.claim.role = 'service_role';"
auth() {
  printf "SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.role = 'authenticated'; SET LOCAL request.jwt.claim.sub = '%s';" \
    "26102239-0000-4000-8001-$(printf '%012d' "$1")"
}
admit() {
  printf "SELECT t39_race.check(t39_race.admit(%s,'%s',%s) = t39_race.reply('%s',%s), '%s');" \
    "$1" "$2" "$3" "$4" "${5:-NULL}" "$case_name"
}
finish_race() {
  leader 'COMMIT;'
  stop_leader
  # wait must retain psql's nonzero status, never mask a background SQL failure.
  wait "$follower_pid"
  follower_pid=''
  echo "T39 SCHEDULE PASS: $case_name"
}

# Four attempts=0 schedules share the same deliberate stale-read opportunity.
# Without the outer lock, the follower reads 0 before blocking in nested begin.
zero_attempt_race() {
  case_name=$1
  local n first_intent next_intent next_kind next_reason=NULL attempts=2
  case "$case_name" in
    zero-first-first) n=1; first_intent=first; next_intent=first; next_kind=rejected; next_reason="'first_already_registered'"; attempts=1 ;;
    zero-reask-reask) n=7; first_intent=reask; next_intent=reask; next_kind=reask ;;
    zero-first-reask) n=8; first_intent=first; next_intent=reask; next_kind=reask ;;
    zero-reask-first) n=9; first_intent=reask; next_intent=first; next_kind=rejected; next_reason="'first_already_registered'"; attempts=1 ;;
    *) echo "Unknown zero-attempt schedule: $case_name" >&2; return 1 ;;
  esac
  start_leader
  leader "BEGIN; $service SELECT pg_advisory_xact_lock(hashtextextended('chat_turn_bump:' || t39_race.id($n)::text,0));"
  follower "BEGIN; $service $(admit "$n" "$next_intent" 4 "$next_kind" "$next_reason") COMMIT;"
  observe_wait advisory
  leader "$(admit "$n" "$first_intent" 3 first)"
  finish_race
  "${psql[@]}" -c "SELECT t39_race.state($n,$attempts,1);"
}
zero_schedules=(zero-first-first zero-reask-reask zero-first-reask zero-reask-first)

if [[ "$db" = t39_admission_mutant_test_ci ]]; then
  # The parent installs fixtures once. Each child owns a distinct user so a
  # failed assertion cannot hide any of the other three mutation results.
  zero_attempt_race "$2"
  exit 0
else
  # Clone BEFORE committing any race fixtures. The mutant never replaces the
  # original draft in this DB or in the numbered replay database.
  "${psql[@]}" -d template1 -c 'CREATE DATABASE t39_admission_mutant_test_ci TEMPLATE t39_admission_test_ci'
fi
"${psql[@]}" -f db/migration-drafts/tests/chat-turn-admission-race-fixture.sql

for schedule in "${zero_schedules[@]}"; do zero_attempt_race "$schedule"; done

case_name=one-reask-reask
start_leader
leader "BEGIN; $service SELECT pg_advisory_xact_lock(hashtextextended('chat_turn_bump:' || t39_race.id(2)::text,0));"
follower "BEGIN; $service $(admit 2 reask 5 rejected "'reask_ineligible'") COMMIT;"
observe_wait advisory
leader "$(admit 2 reask 4 reask)"
finish_race
"${psql[@]}" -c 'SELECT t39_race.state(2,2,2);'

# Both orders at the last purpose slot. Ordinary consume does not take the chat
# advisory lock, so these races must observe a real row transactionid wait.
case_name=consume-before-admission
start_leader
leader "BEGIN; $service SELECT t39_race.consume(3,true);"
follower "BEGIN; $service SELECT t39_race.check(t39_race.quota_denied(3), 'T3901 from competing last slot'); COMMIT;"
observe_wait transactionid
finish_race
"${psql[@]}" -c 'SELECT t39_race.state(3,0,9);'

case_name=admission-before-consume
start_leader
leader "BEGIN; $service $(admit 4 first 3 first)"
follower "BEGIN; $service SELECT t39_race.consume(4,false); COMMIT;"
observe_wait transactionid
finish_race
"${psql[@]}" -c 'SELECT t39_race.state(4,1,9);'

case_name=bump-before-reask
start_leader
leader "BEGIN; $(auth 5) SELECT t39_race.bump(5);"
follower "BEGIN; $service $(admit 5 reask 4 rejected "'reask_ineligible'") COMMIT;"
observe_wait advisory
finish_race
"${psql[@]}" -c 'SELECT t39_race.state(5,0,2,true);'

case_name=reask-before-bump
start_leader
leader "BEGIN; $service $(admit 6 reask 4 reask)"
follower "BEGIN; $(auth 6) SELECT t39_race.bump(6); COMMIT;"
observe_wait advisory
finish_race
"${psql[@]}" -c 'SELECT t39_race.state(6,0,2,true);'
echo 'T39 RACES PASS: 9 schedules, 9 observed lock waits'

# Delete exactly the outer user-lock statement in a disposable COPY. Fail if
# the source shape changed; do not silently run an unmutated or broad rewrite.
node --input-type=module - "$work/no-user-lock.sql" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync('db/migration-drafts/UNNUMBERED_chat_turn_attempt_with_quota.sql', 'utf8').replace(/\r\n/g, '\n');
const lock = "  PERFORM pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended('chat_turn_bump:' || p_user_id::text, 0));";
if (source.split(lock).length !== 2) throw new Error('Expected exactly one T39 user lock');
writeFileSync(process.argv[2], source.replace(lock, ''));
JS
"${psql[@]}" -d t39_admission_mutant_test_ci --single-transaction -f "$work/no-user-lock.sql"
"${psql[@]}" -d t39_admission_mutant_test_ci -f db/migration-drafts/tests/chat-turn-admission-race-fixture.sql
for schedule in "${zero_schedules[@]}"; do
  mutation_status=0
  mutation_log="$work/mutant-$schedule.log"
  bash scripts/test-chat-turn-admission-races.sh --mutant "$schedule" >"$mutation_log" 2>&1 || mutation_status=$?
  cat "$mutation_log"
  [[ "$mutation_status" = 3 ]] # psql SQL failure, not timeout/connection failure
  grep -q "T39 WAIT $schedule: Lock/advisory" "$mutation_log"
  grep -q 'ERROR:  *55000: chat_admission_invalid_state' "$mutation_log"
  if grep -q 'T39 SCHEDULE PASS:' "$mutation_log"; then
    echo "User-lock mutant survived $schedule" >&2
    exit 1
  fi
  echo "T39 MUTATION CAUGHT: removed user lock, $schedule failed with 55000"
done
echo 'T39 MUTATIONS PASS: 4/4'
echo "T39 race lane elapsed: $((SECONDS - started))s"
