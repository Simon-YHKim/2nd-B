"""T07: disposable loopback PG, real SQL assertions and killed SQL mutants.

python scripts/test-unconfirmed-signup-cleanup.py 55487 t07_cleanup_test_ci
Run as postgres; never reads dotenv, accepts remote targets or drops databases.
"""
import os
from pathlib import Path
import re
import subprocess
import sys
import queue
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
DRAFT = ROOT / "db/migration-drafts/UNNUMBERED_unconfirmed_signup_cleanup.sql"
FIXTURES = ROOT / "db/migration-drafts/tests"
PORT, DATABASE = sys.argv[1:]
if not re.fullmatch(r"[0-9]{4,5}", PORT) or int(PORT) > 65535 or not re.fullmatch(r"t07_cleanup_test[a-z0-9_]*", DATABASE):
    raise SystemExit("Use an explicit loopback port and fresh t07_cleanup_test* database")
ENV = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG") or key == "PGPASSWORD"}


def run(sql, *, database=DATABASE, success=True):
    result = subprocess.run(
        ["psql", "-X", "--no-password", "-h", "127.0.0.1", "-p", PORT,
         "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
        input="\\set VERBOSITY verbose\nSET statement_timeout='20s'; SET client_min_messages='log';\n" + sql,
        text=True, encoding="utf-8", capture_output=True, env=ENV, timeout=60,
    )
    if success and result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result


def expand(path):
    return re.sub(r"^\\ir (.+)$", lambda match: expand((path.parent / match[1].strip()).resolve()),
                  path.read_text(encoding="utf-8"), flags=re.M)


def require_failure(sql, needle):
    result = run(sql, success=False)
    if result.returncode == 0 or needle not in result.stderr:
        raise RuntimeError("Expected assertion did not fail: " + result.stdout + result.stderr)


run(f'CREATE DATABASE "{DATABASE}";', database="postgres")
run(expand(FIXTURES / "unconfirmed-signup-cleanup-bootstrap.sql"))
signup_snapshot_sql = """SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid), p.proacl::text
  FROM pg_proc p WHERE p.oid IN ('public.enforce_user_age_tier()'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure)
  ORDER BY p.oid::regprocedure::text;"""
signup_before = run(signup_snapshot_sql).stdout
installer = DRAFT.read_text(encoding="utf-8")
behavior = expand(FIXTURES / "unconfirmed-signup-cleanup.sql")
# PostgreSQL rolls back failed installations in these explicit transactions.
require_failure("BEGIN; ALTER TABLE auth.users DROP COLUMN confirmation_sent_at;\n" + installer,
                "requires auth.users.confirmation_sent_at")
require_failure("BEGIN; ALTER TABLE auth.users DROP COLUMN recovery_sent_at;\n" + installer,
                "requires auth.users.recovery_sent_at")
for _ in range(2):
    run("BEGIN;\n" + installer + "\nCOMMIT;")
    if run(signup_snapshot_sql).stdout != signup_before:
        raise RuntimeError("Installation changed existing C10/signup functions/config/ACL")


def assert_diagnostics(result):
    if not re.search(r"WARNING: [^\n]*T07 cleanup: deleted=1 skipped=1 failed=1; retry next run", result.stderr):
        raise AssertionError("T07_DIAGNOSTICS: missing failure WARNING counts")
    if not re.search(r"LOG: [^\n]*T07 cleanup: deleted=1 skipped=1 failed=1", result.stderr):
        raise AssertionError("T07_DIAGNOSTICS: missing execution LOG counts")
    if "synthetic deletion failure" in result.stderr or "fixture-" in result.stderr:
        raise AssertionError("T07_DIAGNOSTICS: row or exception data leaked")


assert_diagnostics(run(behavior))
print("PASS: behavior, private ACL, real age gate, no cron, installer twice, missing column refusal", flush=True)
print("PASS: 54 birthday cases across 3 session timezones; C10/signup definitions/config/ACL unchanged", flush=True)

# Every mutant is installed in a transaction. Only the suite's P0707 semantic
# assertion kills it; SQL syntax, transport, timeout and unrelated failures fail
# the runner. ROLLBACK leaves the real installer intact for the next mutation.
mutations = [
    ("confirmed", "a.email_confirmed_at IS NULL", "true"),
    ("issuance threshold", "interval '600 seconds'", "interval '0 seconds'"),
    ("retention 22 hours", "interval '22 hours'", "interval '1 day'"),
    ("recovery clock", "AND (a.recovery_sent_at IS NULL OR a.recovery_sent_at <= $1)", ""),
    ("recovery inclusive", "a.recovery_sent_at <= $1", "a.recovery_sent_at < $1"),
    ("inclusive boundary", "a.confirmation_sent_at <= $1", "a.confirmation_sent_at < $1"),
    ("OAuth identity", "i.provider IS DISTINCT FROM 'email'", "false"),
    ("OAuth metadata", "AND a.raw_app_meta_data -> 'providers' = '[\"email\"]'::jsonb", ""),
    ("profile", "AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)", ""),
    ("registry", "' AND NOT EXISTS (SELECT 1 FROM public.%I owned WHERE owned.%I = a.id)'",
     "' AND NOT EXISTS (SELECT 1 FROM public.%I owned WHERE owned.%I = a.id AND false)'"),
    ("storage", "OR pg_catalog.to_jsonb(o) ->> 'owner_id' = a.id::text", ""),
    ("sessions", "AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = a.id)", ""),
    ("limit", "LIMIT $2 FOR UPDATE", "LIMIT 1000 FOR UPDATE"),
    ("user DOB", "NEW.raw_user_meta_data := public.scrub_under14_signup_birth_date(NEW.raw_user_meta_data);", "NULL;"),
    ("identity DOB", "NEW.identity_data := public.scrub_under14_signup_birth_date(NEW.identity_data);", "NULL;"),
    ("14 boundary", "interval '14 years'", "interval '15 years'"),
    ("private ACL", "-- postgres (owner) alone", "GRANT EXECUTE ON FUNCTION public.purge_unconfirmed_signups(integer) TO authenticated;\n-- postgres (owner) alone"),
    ("UTC scrubber", "LANGUAGE plpgsql STABLE\nSET search_path = ''",
     "LANGUAGE plpgsql STABLE\nSET search_path = ''\nSET timezone = 'UTC'"),
    ("KST scrubber", "LANGUAGE plpgsql STABLE\nSET search_path = ''",
     "LANGUAGE plpgsql STABLE\nSET search_path = ''\nSET timezone = 'Asia/Seoul'"),
    ("UTC cleanup", "SET row_security = off", "SET row_security = off\nSET timezone = 'UTC'"),
    ("KST cleanup", "SET row_security = off", "SET row_security = off\nSET timezone = 'Asia/Seoul'"),
    ("failed count", "failed := failed + 1;", "failed := failed;"),
    ("skipped count", "skipped := skipped + (1 - v_count);", "skipped := skipped;"),
]
for routine in [
    "enforce_user_age_tier()", "complete_verified_email_signup()",
    "complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)",
]:
    mutations.append(("C10 timezone unchanged: " + routine.split("(")[0],
                      "-- Inherit session current_date",
                      f"ALTER FUNCTION public.{routine} SET timezone = 'Asia/Seoul';\n-- Inherit session current_date"))
for label, before, after in mutations:
    if installer.count(before) != 1:
        raise RuntimeError("Mutation anchor drift: " + label)
    mutant = installer.replace(before, after)
    # Avoid nested BEGIN and rollback before assertions finish.
    probe = behavior.replace("BEGIN;", "", 1).replace("ROLLBACK;", "", 1)
    require_failure("BEGIN;\n" + mutant + "\n" + probe + "\nROLLBACK;", "P0707: T07_ASSERT:")
    print("KILLED: " + label, flush=True)
run(behavior)
print(f"PASS: {len(mutations)}/{len(mutations)} semantic SQL mutants killed; real SQL restored", flush=True)
for label, before, after in [
    ("failure warning", "RAISE WARNING 'T07 cleanup:", "RAISE NOTICE 'T07 cleanup:"),
    ("execution counts", "RAISE LOG 'T07 cleanup: deleted=% skipped=% failed=%', deleted, skipped, failed;", "NULL;"),
]:
    if installer.count(before) != 1:
        raise RuntimeError("Mutation anchor drift: " + label)
    result = run("BEGIN;\n" + installer.replace(before, after) + "\n" + probe + "\nROLLBACK;")
    try:
        assert_diagnostics(result)
    except AssertionError as error:
        if not str(error).startswith("T07_DIAGNOSTICS: missing"):
            raise
        print("KILLED diagnostics: " + label, flush=True)
    else:
        raise RuntimeError("Diagnostic mutant survived: " + label)
assert_diagnostics(run(behavior))
print("PASS: 2/2 diagnostic mutants killed; counts and WARNING restored", flush=True)
down = (ROOT / "db/migration-drafts/rollback/UNNUMBERED_unconfirmed_signup_cleanup_down.sql").read_text(encoding="utf-8")
run("BEGIN;\n" + down + "\nCOMMIT;")
if run(signup_snapshot_sql).stdout != signup_before:
    raise RuntimeError("Rollback changed existing signup functions/config/ACL")
if "t" not in run("SELECT to_regprocedure('public.purge_unconfirmed_signups(integer)') IS NULL;").stdout.splitlines():
    raise RuntimeError("Rollback left the cleanup function installed")
run("BEGIN;\n" + installer + "\nCOMMIT;")
run(behavior)
print("PASS: schema rollback and reapply without cron", flush=True)


class Session:
    """A bounded psql session; stdout markers confirm real database progress."""

    def __init__(self, name):
        self.lines = queue.Queue()
        self.process = subprocess.Popen(
            ["psql", "-X", "--no-password", "-h", "127.0.0.1", "-p", PORT,
             "-U", "postgres", "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-At"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", env=ENV, bufsize=1,
        )
        def collect():
            for line in self.process.stdout:
                self.lines.put(line.rstrip())
        self.reader = threading.Thread(target=collect, daemon=True)
        self.reader.start()
        self.send(f"SET application_name='{name}'; SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='20s';")

    def send(self, sql):
        self.process.stdin.write(sql + "\n")
        self.process.stdin.flush()

    def until(self, marker):
        lines = []
        deadline = time.monotonic() + 18
        while time.monotonic() < deadline:
            try:
                line = self.lines.get(timeout=0.2)
            except queue.Empty:
                if self.process.poll() is not None:
                    break
                continue
            lines.append(line)
            if line == marker:
                return lines
        raise RuntimeError("Session did not reach " + marker + ": " + "\n".join(lines))

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()  # EOF rolls back an unfinished transaction.
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=3)
        self.process.stdout.close()


race_id = "07000000-0000-0000-0000-000000009001"


def race_fixture():
    run(f"""DELETE FROM auth.users WHERE id='{race_id}';
        INSERT INTO auth.users(id,email,confirmation_sent_at)
        VALUES('{race_id}','race@example.invalid',now()-interval '3 days');
        INSERT INTO auth.identities(user_id,provider) VALUES('{race_id}','email');""")


first_writers = [
    ("confirmation", f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{race_id}'", "0|0|0"),
    ("resend", f"UPDATE auth.users SET confirmation_sent_at=now() WHERE id='{race_id}'", "0|0|0"),
    ("new OAuth", f"INSERT INTO auth.identities(user_id,provider) VALUES('{race_id}','apple')", "0|0|0"),
    ("existing identity", f"UPDATE auth.identities SET provider='apple' WHERE user_id='{race_id}'", "0|0|1"),
    ("profile", f"INSERT INTO public.users(id,email,birth_date) VALUES('{race_id}','race@example.invalid','1990-01-01')", "0|0|0"),
    ("recovery/magic link", f"UPDATE auth.users SET recovery_sent_at=now() WHERE id='{race_id}'", "0|0|0"),
]
for label, writer, expected in first_writers:
    race_fixture()
    leader = Session("t07_writer")
    try:
        leader.send("BEGIN; " + writer + "; SELECT 'writer-held';")
        leader.until("writer-held")
        result = run("SELECT * FROM public.purge_unconfirmed_signups();").stdout.splitlines()
        if expected not in result:
            raise RuntimeError(f"Writer-first {label}: unexpected cleanup {result}")
        leader.send("COMMIT; SELECT 'writer-committed';")
        leader.until("writer-committed")
        if "0|0|0" not in run("SELECT * FROM public.purge_unconfirmed_signups();").stdout.splitlines():
            raise RuntimeError("Committed writer must exclude account: " + label)
        print("PASS race writer-first: " + label, flush=True)
    finally:
        leader.close()

# Cleanup first: a later confirmation or identity link actually waits on the
# deleting transaction. Observe pg_blocking_pids; no fixed-delay success proof.
for label, writer in [("confirmation", first_writers[0][1]), ("new OAuth", first_writers[2][1])]:
    race_fixture()
    leader, follower = Session("t07_cleaner"), Session("t07_follower")
    try:
        leader.send("BEGIN; SELECT * FROM public.purge_unconfirmed_signups(); SELECT 'cleaner-held';")
        lines = leader.until("cleaner-held")
        if "1|0|0" not in lines:
            raise RuntimeError("Cleanup leader did not delete exactly one")
        follower.send(writer + "; SELECT 'follower-finished';")
        deadline = time.monotonic() + 8
        while True:
            observation = run("""SELECT count(*) FROM pg_stat_activity f
                JOIN pg_stat_activity l ON l.pid=ANY(pg_blocking_pids(f.pid))
                WHERE f.application_name='t07_follower' AND l.application_name='t07_cleaner';""").stdout.splitlines()
            if "1" in observation:
                break
            if time.monotonic() > deadline:
                raise RuntimeError("No observed cleanup-first lock wait: " + label)
            time.sleep(0.05)
        leader.send("COMMIT; SELECT 'cleaner-committed';")
        leader.until("cleaner-committed")
        if label == "confirmation":
            if "UPDATE 0" not in follower.until("follower-finished"):
                raise RuntimeError("Confirmation revived a deleted row")
        else:
            follower.process.wait(timeout=5)
            follower.reader.join(timeout=1)
            output = "\n".join(list(follower.lines.queue))
            if follower.process.returncode == 0 or "foreign key constraint" not in output:
                raise RuntimeError("OAuth link did not fail its parent FK: " + output)
        print("PASS race cleanup-first (observed blocking): " + label, flush=True)
    finally:
        follower.close()
        leader.close()
print("PASS: 8 concurrency schedules", flush=True)
