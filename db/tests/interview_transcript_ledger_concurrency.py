"""Two-connection D6 regressions. Local PostgreSQL scratch clones only; no dependencies.

After 0225/0226: PGPORT=54398 python this_file.py --template d6r2_codex
CI uses --template postgres. Each run creates and drops only its own d6_r2_* clone.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import threading
import time
import uuid


PSQL = shutil.which("psql")
if not PSQL and os.name == "nt":
    PSQL = str(Path(os.environ["ProgramFiles"]) / "PostgreSQL/18/bin/psql.exe")
ENV = dict(os.environ, PGHOST="127.0.0.1", PGHOSTADDR="127.0.0.1", PGUSER="postgres",
           PGCLIENTENCODING="UTF8", PGOPTIONS="-c statement_timeout=10000 -c deadlock_timeout=100")
USER = "28000000-0000-4000-8000-000000000001"


def args(db):
    return [PSQL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-d", db]


def sql(db, statement, app="d6_r2_probe", check=True):
    result = subprocess.run(args(db), input=statement, text=True, encoding="utf-8",
                            capture_output=True, env=dict(ENV, PGAPPNAME=app), timeout=15)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


class Connection:
    def __init__(self, db):
        self.p = subprocess.Popen(args(db), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                                  bufsize=1, env=dict(ENV, PGAPPNAME="d6_r2_holder"))
        self.lines = queue.Queue()
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in self.p.stdout:
            self.lines.put(line.rstrip())
        self.lines.put(None)

    def query(self, statement):
        marker = "done_" + uuid.uuid4().hex
        self.p.stdin.write(statement + "\n\\echo " + marker + "\n")
        self.p.stdin.flush()
        result = []
        while True:
            line = self.lines.get(timeout=15)
            if line == marker:
                return "\n".join(result)
            if line is None:
                raise AssertionError("holder failed: " + "\n".join(result))
            result.append(line)

    def close(self):
        if self.p.poll() is None:
            self.p.stdin.write("ROLLBACK;\n\\q\n")
            self.p.stdin.flush()
        self.p.wait(timeout=15)


def auth(service=False):
    role = "service_role" if service else "authenticated"
    return f"SET LOCAL request.jwt.claim.role='{role}'; SET LOCAL request.jwt.claim.sub='{USER}';"


def fixture(db, pending=False, owner=USER):
    session, record, audit, context = [str(uuid.uuid4()) for _ in range(4)]
    turns = json.dumps([dict(n=1, role="user", scene=1, layer="fact", origin="user", text="answer", state="judged")])
    sql(db, f"""
      INSERT INTO public.records(id,user_id,kind,body,audit_period,system_tags,client_request_id)
      VALUES('{record}','{owner}','audit_response','A: answer','now',ARRAY['interview'],'interview:{session}');
      INSERT INTO public.ai_audit_log(id,user_id,prompt_hash,output_hash,model_used,vertex_backend,safety_zone,latency_ms,purpose,event_source)
      VALUES('{audit}','{owner}','p','o','test',false,'green',1,'interview_probe','server_verified'),
            ('{context}','{owner}','p','o','test',false,'green',1,'secondb_chat','server_verified');
    """)
    probe = f"SELECT public.record_interview_probe_verdict('{owner}','{audit}','{session}','now','en',1,1,1,'fact','seed','pass','fact','credited',true,'r0','openai',false,0,3,encode(sha256(convert_to('{session}:1:answer','UTF8')),'hex'));"
    if pending:
        sql(db, "BEGIN;" + auth(True) + probe + "COMMIT;")
    return dict(session=session, record=record, audit=audit, context=context, probe=probe,
                commit=f"SELECT public.commit_interview_session('{session}','{record}','{turns}'::jsonb)->>'status';",
                discard=f"SELECT public.discard_interview_session('{session}');",
                delete=f"DELETE FROM public.records WHERE id='{record}';",
                blocks=f"SELECT public.record_context_blocks('{context}','secondb_chat','r1',ARRAY['record:{record}'],NULL);")


def wait_blocked(db, app, future):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if future.done():
            raise AssertionError("expected serialization, but contender finished: " + future.result().stdout)
        status = sql(db, f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{app}' AND wait_event_type='Lock';").stdout.strip()
        if status == "1":
            return
        time.sleep(0.025)
    raise AssertionError("contender did not reach a database lock")


def ordered(db, first, second, expected, first_service=False, second_service=False):
    holder = Connection(db)
    try:
        holder.query("BEGIN;" + auth(first_service) + first)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            app = "d6_r2_" + uuid.uuid4().hex
            future = pool.submit(sql, db, "BEGIN;" + auth(second_service) + second + "COMMIT;", app, False)
            try:
                wait_blocked(db, app, future)
            finally:
                holder.query("COMMIT;")
            result = future.result(timeout=15)
            assert result.returncode == 0, result.stderr
            assert result.stdout.strip() == expected, (expected, result.stdout)
    finally:
        holder.close()


def run(db):
    sql(db, f"""SET session_replication_role=replica;
      INSERT INTO auth.users(id,email) VALUES('{USER}','d6-race@example.com');
      SET session_replication_role=origin;
      INSERT INTO public.users(id,email,birth_date,locale) VALUES('{USER}','d6-race@example.com','1990-01-01','en');""")
    f = fixture(db)
    ordered(db, f['discard'], f['probe'], 'session_closed', second_service=True)
    f = fixture(db)
    ordered(db, f['probe'], f['discard'], 'discarded', first_service=True)
    f = fixture(db)
    ordered(db, f['discard'], f['commit'], 'session_closed')
    f = fixture(db)
    ordered(db, f['commit'], f['discard'], 'already_committed')
    print('PASS R2 D6-01/52: first verdict, discard and commit in both orders')

    f = fixture(db, pending=True)
    ordered(db, f['commit'], f['delete'], '')
    assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE id='{f['session']}';").stdout.strip() == '0'
    f = fixture(db, pending=True)
    holder = Connection(db)
    try:
        # Pause DELETE at its unavoidable row-lock boundary, before its BEFORE ROW trigger.
        holder.query(f"BEGIN; SELECT id FROM public.records WHERE id='{f['record']}' FOR UPDATE;")
        result = sql(db, "BEGIN;" + auth() + f['commit'] + "COMMIT;", check=False)
        assert result.returncode != 0 and '40001' in result.stderr and 'interview_record_busy_retry' in result.stderr, result.stderr
        holder.query(f['delete'] + 'COMMIT;')
        assert sql(db, "BEGIN;" + auth() + f['commit'] + "COMMIT;").stdout.strip() == 'session_closed'
    finally:
        holder.close()
    print('PASS R2 D6-05: commit/delete in both orders, bounded retry instead of deadlock')

    f = fixture(db, pending=True)
    sql(db, f"UPDATE public.interview_sessions SET last_seen_at=now()-INTERVAL '7 hours' WHERE id='{f['session']}';")
    holder = Connection(db)
    try:
        holder.query("BEGIN;" + auth() + f"SELECT pg_advisory_xact_lock(hashtextextended('interview_session:{f['session']}',0));")
        result = sql(db, "BEGIN;" + auth(True) + "SELECT public.sweep_interview_sessions(); COMMIT;")
        assert result.stdout.strip() == '0', result.stdout
        holder.query(f['commit'] + 'COMMIT;')
        assert sql(db, "BEGIN;" + auth(True) + "SELECT public.sweep_interview_sessions(); COMMIT;").stdout.strip() == '0'
        assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE id='{f['session']}' AND committed_at IS NOT NULL;").stdout.strip() == '1'
    finally:
        holder.close()
    print('PASS R2 D6-05: sweep skips an occupied session key and preserves the later commit')

    f = fixture(db)
    ordered(db, f['blocks'], f['delete'], '', first_service=True)
    assert sql(db, f"SELECT count(*) FROM public.ai_audit_context_blocks WHERE audit_id='{f['context']}';").stdout.strip() == '0'
    f = fixture(db)
    ordered(db, f['delete'], f['blocks'], 'record_mismatch', second_service=True)
    assert sql(db, f"SELECT count(*) FROM public.ai_audit_context_blocks WHERE audit_id='{f['context']}';").stdout.strip() == '0'
    print('PASS R2 D6-53: context writer/delete in both orders')

    f = fixture(db)
    other = str(uuid.uuid4())
    ordered(db, f['probe'], f['probe'].replace(f['session'], other), 'audit_mismatch', True, True)
    assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE id='{other}';").stdout.strip() == '0'
    print('PASS R2 D6-09: one audit id raced across two session ids')

    # D6R3-55: close starts first but acquires the session key after a newer verdict commits.
    f = fixture(db)
    holder = Connection(db)
    try:
        holder.query('BEGIN;' + auth() + 'SELECT now();')
        assert sql(db, 'BEGIN;' + auth(True) + f['probe'] + 'COMMIT;').stdout.strip() == 'recorded'
        assert holder.query(f"SELECT public.close_interview_session('{f['session']}','now','en','complete',0,0);") == 'closed'
        assert holder.query(f"""SELECT v.created_at>s.ended_at FROM public.interview_probe_verdicts v
          JOIN public.interview_sessions s ON s.id=v.session_id WHERE s.id='{f['session']}';""") == 't'
        holder.query('COMMIT;')
    finally:
        holder.close()
    result = sql(db, 'BEGIN;' + auth() + f['commit'].replace("->>'status'", "->>'cells_added'") + 'COMMIT;')
    assert result.stdout.strip() == '1', 'D6R3-55: pre-close credit lost: ' + result.stdout
    print('PASS D6R3-55: a later-started verdict before close adds exactly one cell')

    # D6R3-54: deletion and sweep take account -> session -> row locks in either order.
    for deletion_first in (True, False):
        owner = str(uuid.uuid4())
        sql(db, f"""SET session_replication_role=replica;
          INSERT INTO auth.users(id,email) VALUES('{owner}','{owner}@example.com');
          SET session_replication_role=origin;
          INSERT INTO public.users(id,email,birth_date,locale) VALUES('{owner}','{owner}@example.com','1990-01-01','en');""")
        f = fixture(db, pending=True, owner=owner)
        sql(db, f"UPDATE public.interview_sessions SET last_seen_at=now()-INTERVAL '7 hours' WHERE id='{f['session']}';")
        delete = f"DELETE FROM auth.users WHERE id='{owner}';"
        if deletion_first:
            holder = Connection(db)
            try:
                # Pause exactly after the account BEFORE trigger's key and audit-row locks.
                holder.query(f"""BEGIN;
                  SELECT pg_advisory_xact_lock(hashtextextended('{owner}',260913));
                  UPDATE public.ai_audit_log SET prompt_hash='',output_hash='' WHERE id='{f['audit']}';""")
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    app = 'd6_r3_sweep_' + uuid.uuid4().hex
                    future = pool.submit(sql, db, 'BEGIN;' + auth(True) + 'SELECT public.sweep_interview_sessions(); COMMIT;', app, False)
                    try:
                        deadline = time.monotonic() + 5
                        while not future.done():
                            if sql(db, f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{app}' AND wait_event_type='Lock';").stdout.strip() == '1':
                                break
                            assert time.monotonic() < deadline, 'D6R3-54: sweep did not finish or reach a lock'
                            time.sleep(0.025)
                        # An unfenced sweep now holds the session row and waits for our audit row:
                        # this cascade closes that old deadlock cycle. A fenced sweep already skipped.
                        holder.query(delete + 'COMMIT;')
                        result = future.result(timeout=15)
                        assert result.returncode == 0 and result.stdout.strip() == '0', result.stderr or result.stdout
                    finally:
                        holder.close()
            finally:
                holder.close()
        else:
            ordered(db, 'SELECT public.sweep_interview_sessions();', delete, '', first_service=True)
        assert sql(db, f"SELECT count(*) FROM public.interview_sessions WHERE id='{f['session']}';").stdout.strip() == '0'
        assert sql(db, f"SELECT count(*) FROM public.ai_audit_log WHERE id='{f['audit']}' AND user_id IS NULL AND prompt_hash='' AND output_hash='';").stdout.strip() == '1'
    print('PASS D6R3-54: sweep/account deletion in both orders without deadlock or leftover hashes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', required=True, help='local scratch database after 0225/0226')
    template = parser.parse_args().template
    if not re.fullmatch(r'[a-z][a-z0-9_]*', template):
        parser.error('template must be a simple local database name')
    db = 'd6_r2_' + uuid.uuid4().hex[:12]
    sql('postgres', f'CREATE DATABASE {db} TEMPLATE {template};')
    try:
        run(db)
    finally:
        sql('postgres', f'DROP DATABASE {db} WITH (FORCE);')
