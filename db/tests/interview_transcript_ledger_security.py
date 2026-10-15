"""D6 R4 security regressions against disposable local PostgreSQL clones.

Run after the numbered migrations: python this_file.py --template postgres.
External model calls and production databases are never used.
"""
import argparse
import concurrent.futures
from pathlib import Path
import re
import uuid

from interview_transcript_ledger_concurrency import Connection, fixture, ordered, sql, wait_blocked


def owner(db):
    user = str(uuid.uuid4())
    sql(db, f"""SET session_replication_role=replica;
      INSERT INTO auth.users(id,email) VALUES('{user}','{user}@example.com');
      SET session_replication_role=origin;
      INSERT INTO public.users(id,email,birth_date,locale)
      VALUES('{user}','{user}@example.com','1990-01-01','en');""")
    return user


def auth(user, service=False):
    role = 'service_role' if service else 'authenticated'
    return f"SET LOCAL request.jwt.claim.role='{role}'; SET LOCAL request.jwt.claim.sub='{user}';"


def red_call(db, f, user, invalid=False):
    audit = str(uuid.uuid4())
    sql(db, f"""INSERT INTO public.ai_audit_log
      (id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
      VALUES('{audit}','{user}','red-p','red-o','test',false,'red',1,'interview_probe','server_verified');""")
    probe = f['probe'].replace(f['audit'], audit)
    if invalid:
        probe = probe.replace("'r0'", "'invalid'")
    return audit, probe


def held(db, f):
    return sql(db, f"SELECT interview_ai_hold FROM public.records WHERE id='{f['record']}';").stdout.strip() == 't'


def invalid_red(db):
    user = owner(db)
    f = fixture(db, pending=True, owner=user)
    audit, probe = red_call(db, f, user, invalid=True)
    result = sql(db, 'BEGIN;' + auth(user, True) + probe + 'COMMIT;')
    assert result.stdout.strip() == 'interview_rule_set_locked', result.stdout
    assert sql(db, f"SELECT prompt_hash='' AND output_hash='' FROM public.ai_audit_log WHERE id='{audit}';").stdout.strip() == 't'
    sql(db, 'BEGIN;' + auth(user) + f['commit'] + 'COMMIT;')
    assert held(db, f), 'owned invalid red lost its hold before commit'
    assert sql(db, f"SELECT count(*) FROM public.interview_coverage WHERE user_id='{user}';").stdout.strip() == '0'


def late_red(db):
    for parent in (None, 'session', 'head', 'turn'):
        for invalid in (False, True):
            user = owner(db)
            f = fixture(db, pending=True, owner=user)
            sql(db, 'BEGIN;' + auth(user) + f['commit'] + 'COMMIT;')
            before = sql(db, f"SELECT answers FROM public.interview_coverage WHERE user_id='{user}';").stdout
            assert before.strip() == '1', 'fixture must have one previously committed credit'
            if parent:
                table, column, value = {
                    'session': ('interview_sessions', 'id', f['session']),
                    'head': ('interview_transcripts', 'session_id', f['session']),
                    'turn': ('interview_transcript_turns', 'user_id', user),
                }[parent]
                sql(db, 'BEGIN;' + auth(user) + f"DELETE FROM public.{table} WHERE {column}='{value}'; COMMIT;")
            audit, probe = red_call(db, f, user, invalid)
            sql(db, 'BEGIN;' + auth(user, True) + probe + 'COMMIT;')
            assert held(db, f), f'late red failed after {parent or "commit"}, invalid={invalid}'
            assert sql(db, f"SELECT count(*) FROM public.interview_transcripts WHERE record_id='{f['record']}' AND NOT ai_hold;").stdout.strip() == '0'
            assert sql(db, f"SELECT count(*) FROM public.interview_transcript_turns WHERE user_id='{user}' AND NOT ai_hold;").stdout.strip() == '0'
            # Credits already committed are historical totals, never decremented.
            assert sql(db, f"SELECT answers FROM public.interview_coverage WHERE user_id='{user}';").stdout == before
            sql(db, 'BEGIN;' + auth(user, True) + f['probe'] + 'COMMIT;')
            assert held(db, f), 'later green call cleared hold'
            if parent == 'session' or invalid:
                assert sql(db, f"SELECT prompt_hash='' AND output_hash='' FROM public.ai_audit_log WHERE id='{audit}';").stdout.strip() == 't'


def late_red_races(db):
    for red_first in (True, False):
        user = owner(db)
        f = fixture(db, pending=True, owner=user)
        _, probe = red_call(db, f, user)
        red = auth(user, True) + probe
        commit = auth(user) + f['commit']
        if red_first:
            ordered(db, red, commit, 'committed')
        else:
            ordered(db, commit, red, 'session_committed')
        assert held(db, f)
        expected = '0' if red_first else '1'
        assert sql(db, f"SELECT COALESCE(sum(answers),0) FROM public.interview_coverage WHERE user_id='{user}';").stdout.strip() == expected


def owner_and_record_link(db):
    user, other = owner(db), owner(db)
    f = fixture(db, pending=True, owner=user)
    foreign = fixture(db, pending=True, owner=other)
    audit, probe = red_call(db, f, user, invalid=True)
    # Even a malformed payload cannot attach red to somebody else's session.
    sql(db, 'BEGIN;' + auth(user, True) + probe.replace(f['session'], foreign['session']) + 'COMMIT;')
    assert not held(db, foreign) and not held(db, f)
    assert sql(db, f"SELECT count(*) FROM public.interview_session_audit_ids WHERE audit_id='{audit}';").stdout.strip() == '0'
    audit, probe = red_call(db, foreign, other)
    sql(db, 'BEGIN;' + auth(user, True) + probe.replace(other, user).replace(foreign['session'], f['session']) + 'COMMIT;')
    assert not held(db, f)
    assert sql(db, f"SELECT prompt_hash<>'' AND output_hash<>'' FROM public.ai_audit_log WHERE id='{audit}';").stdout.strip() == 't'
    sql(db, 'BEGIN;' + auth(user) + f['commit'] + 'COMMIT;')
    sql(db, 'GRANT SELECT, UPDATE ON public.records TO authenticated;')
    for key in ('NULL', "'different-session'"):
        result = sql(db, 'BEGIN;' + auth(user) + f"SET LOCAL ROLE authenticated; UPDATE public.records SET client_request_id={key} WHERE id='{f['record']}'; COMMIT;", check=False)
        assert result.returncode != 0 and 'interview_record_session_key_is_fixed' in result.stderr, result.stderr
    # User-editable tags and kind cannot sever the durable session link either.
    sql(db, 'BEGIN;' + auth(user) + f"SET LOCAL ROLE authenticated; UPDATE public.records SET kind='note',system_tags='{{}}' WHERE id='{f['record']}'; DELETE FROM public.interview_sessions WHERE id='{f['session']}'; COMMIT;")
    _, probe = red_call(db, f, user)
    sql(db, 'BEGIN;' + auth(user, True) + probe + 'COMMIT;')
    assert held(db, f), 'editing display metadata or deleting the session bypassed late hold'


def profile_only_delete(db):
    user = owner(db)
    f = fixture(db, pending=True, owner=user)
    sql(db, 'BEGIN;' + auth(user, True) + f['blocks'] + 'COMMIT;')
    assert sql(db, f"SELECT count(*) FROM public.interview_session_starts WHERE owner_id='{user}';").stdout.strip() == '1'
    result = sql(db, f"DELETE FROM public.users WHERE id='{user}';", check=False)
    assert result.returncode == 0, result.stderr
    assert sql(db, f"SELECT count(*) FROM auth.users WHERE id='{user}';").stdout.strip() == '1'
    assert sql(db, f"SELECT count(*) FROM public.users WHERE id='{user}';").stdout.strip() == '0'
    assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE owner_id='{user}';").stdout.strip() == '0', 'profile-only delete left an auth-owned session behind'
    assert sql(db, f"SELECT count(*) FROM public.interview_probe_verdicts WHERE session_id='{f['session']}';").stdout.strip() == '0', 'profile-only delete left a digest behind'
    assert sql(db, f"SELECT count(*) FROM public.interview_session_starts WHERE owner_id='{user}';").stdout.strip() == '0'
    assert sql(db, f"SELECT count(*) FROM public.ai_audit_context_blocks WHERE user_id='{user}';").stdout.strip() == '0'
    sql(db, f"DELETE FROM auth.users WHERE id='{user}';")
    assert sql(db, f"SELECT count(*) FROM public.interview_probe_verdicts WHERE session_id='{f['session']}';").stdout.strip() == '0'
    assert sql(db, f"SELECT prompt_hash='' AND output_hash='' FROM public.ai_audit_log WHERE id='{f['audit']}';").stdout.strip() == 't'


def rollback_coverage(db):
    user = owner(db)
    sql(db, f"INSERT INTO public.interview_coverage(user_id,period,layer,answers) VALUES('{user}','now','fact',3);")
    rollback = (Path(__file__).resolve().parents[1] / 'migrations/rollback/0225_down.sql').read_text(encoding='utf-8')
    sql(db, 'BEGIN;\n' + rollback + '\nCOMMIT;')
    for count in (3, 4):
        sql(db, 'BEGIN;' + auth(user) + f"SET LOCAL ROLE authenticated; UPDATE public.interview_coverage SET answers={count} WHERE user_id='{user}'; COMMIT;")
    for change in ('answers=2', "layer='feeling'", "period='school'"):
        result = sql(db, 'BEGIN;' + auth(user) + f"SET LOCAL ROLE authenticated; UPDATE public.interview_coverage SET {change} WHERE user_id='{user}'; COMMIT;", check=False)
        assert result.returncode != 0, f'rollback allowed {change}'


def account_delete_races(db, after_rollback=False):
    cases = []
    for table in ('interview_sessions', 'interview_transcripts', 'interview_transcript_turns'):
        for account_first in (True, False):
            user = owner(db)
            f = fixture(db, pending=True, owner=user)
            sql(db, 'BEGIN;' + auth(user) + f['commit'] + 'COMMIT;')
            cases.append((table, account_first, user, f))
    if after_rollback:
        rollback = (Path(__file__).resolve().parents[1] / 'migrations/rollback/0225_down.sql').read_text(encoding='utf-8')
        sql(db, 'BEGIN;\n' + rollback + '\nCOMMIT;')
    for table, account_first, user, f in cases:
        column = 'owner_id' if table == 'interview_sessions' else 'user_id'
        delete = f"DELETE FROM public.{table} WHERE {column}='{user}';"
        account_delete = f"DELETE FROM auth.users WHERE id='{user}';"
        holder = Connection(db)
        try:
            if account_first:
                # The account boundary owns the account key and audit row before FK cascades.
                holder.query(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('{user}',260913)); UPDATE public.ai_audit_log SET prompt_hash='',output_hash='' WHERE id='{f['audit']}';")
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    app = 'd6_r4_delete_' + uuid.uuid4().hex
                    future = pool.submit(sql, db, 'BEGIN;' + auth(user) + delete + 'COMMIT;', app, False)
                    # A safe row trigger refuses immediately with 40001, before touching audit rows.
                    result = future.result(timeout=3)
                    assert result.returncode != 0 and '40001' in result.stderr and 'interview_account_busy_retry' in result.stderr, result.stderr
                    holder.query(account_delete + 'COMMIT;')
            else:
                holder.query('BEGIN;' + auth(user) + delete)
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    app = 'd6_r4_account_' + uuid.uuid4().hex
                    future = pool.submit(sql, db, account_delete, app, False)
                    try:
                        wait_blocked(db, app, future)
                    finally:
                        holder.query('COMMIT;')
                    result = future.result(timeout=15)
                    assert result.returncode == 0, result.stderr
        finally:
            holder.close()
        assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE owner_id='{user}';").stdout.strip() == '0'
        assert sql(db, f"SELECT user_id IS NULL AND prompt_hash='' AND output_hash='' FROM public.ai_audit_log WHERE id='{f['audit']}';").stdout.strip() == 't'


def account_delete_races_after_rollback(db):
    account_delete_races(db, after_rollback=True)


def cron_scope(db, migration):
    """Real pg_cron only; execute the actual migration scheduling block twice."""
    source = Path(migration).read_text(encoding='utf-8')
    schedule = source[source.index('DO $schedule$'):source.index('$schedule$;') + len('$schedule$;')]
    result = sql(db, f"""BEGIN;
      DO $$ BEGIN
        IF current_setting('cron.launch_active_jobs') <> 'off'
           OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
          RAISE EXCEPTION 'use real pg_cron with job execution disabled on a local scratch database';
        END IF;
      END $$;
      CREATE ROLE d6_r4_cron_other LOGIN;
      GRANT USAGE ON SCHEMA cron TO d6_r4_cron_other;
      SET LOCAL ROLE d6_r4_cron_other;
      SELECT cron.schedule('sweep-interview-sessions','0 0 * * *','SELECT 42;');
      SELECT cron.schedule('prune-interview-ledgers','0 0 * * *','SELECT 43;');
      RESET ROLE;
      CREATE TEMP TABLE cron_other_before ON COMMIT DROP AS SELECT * FROM cron.job WHERE username='d6_r4_cron_other';
      {schedule}
      {schedule}
      DO $$ BEGIN
        IF (SELECT count(*) FROM cron.job WHERE username=current_user AND database=current_database()
            AND jobname IN ('sweep-interview-sessions','prune-interview-ledgers')) <> 2
          OR EXISTS ((TABLE cron_other_before) EXCEPT (SELECT * FROM cron.job WHERE username='d6_r4_cron_other')) THEN
          RAISE EXCEPTION 'D6R4-05: foreign-owner job changed or own scheduling was not idempotent';
        END IF;
      END $$;
      SELECT cron.schedule_in_database('sweep-interview-sessions','0 0 * * *','SELECT 44;','template1',current_user,false);
      CREATE TEMP TABLE cron_all_before ON COMMIT DROP AS TABLE cron.job;
      DO $test$ BEGIN
        BEGIN
          EXECUTE $migration${schedule}$migration$;
          RAISE EXCEPTION 'D6R4-05: foreign-database conflict was accepted';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM <> '0225: cleanup cron name belongs to another database' THEN RAISE; END IF;
        END;
        IF EXISTS ((TABLE cron_all_before) EXCEPT (TABLE cron.job))
           OR EXISTS ((TABLE cron.job) EXCEPT (TABLE cron_all_before)) THEN
          RAISE EXCEPTION 'D6R4-05: a foreign-database conflict changed jobs';
        END IF;
      END $test$;
      ROLLBACK;
    """)
    assert result.returncode == 0, result.stderr
    print('PASS cron_scope: real pg_cron, other owner preserved, same scope idempotent, other database fails without changes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', required=True)
    tests = (invalid_red, late_red, late_red_races, owner_and_record_link, profile_only_delete,
             rollback_coverage, account_delete_races, account_delete_races_after_rollback)
    parser.add_argument('--case', choices=[test.__name__ for test in tests])
    parser.add_argument('--cron-only', action='store_true', help='exercise actual pg_cron in the template inside a rolled-back transaction')
    parser.add_argument('--migration', default=str(Path(__file__).resolve().parents[1] / 'migrations/0225_interview_transcript_ledger.sql'))
    options = parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9_]*', options.template):
        parser.error('template must be a simple local database name')
    if options.cron_only:
        cron_scope(options.template, options.migration)
        raise SystemExit(0)
    failures = []
    for test in tests:
        if options.case and test.__name__ != options.case:
            continue
        db = 'd6_r4_' + uuid.uuid4().hex[:12]
        sql('postgres', f'CREATE DATABASE {db} TEMPLATE {options.template};')
        try:
            test(db)
            print('PASS', test.__name__, flush=True)
        except Exception as error:
            failures.append(test.__name__)
            print('FAIL', test.__name__, repr(error), flush=True)
        finally:
            sql('postgres', f'DROP DATABASE {db} WITH (FORCE);')
    if failures:
        raise SystemExit('Failed: ' + ', '.join(failures))
