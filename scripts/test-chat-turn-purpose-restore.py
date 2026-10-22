#!/usr/bin/env python3
"""T40 F: real PostgreSQL, fixed loopback clones, bounded races and mutations.

Reuses S's transport/lock observer, never its main() or baseline mutations.
No dotenv, remote URL, database drop, package install or production connection.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('t40_evidence', ROOT/'scripts/test-chat-turn-refund-evidence.py')
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
pg.DB = 't40_purpose_test_ci'
pg.MUTANT = 't40_purpose_mutant_test_ci'
# S's Python defaults captured its database name at import time. Bind every
# transport entrypoint to F's clone explicitly; shared race helpers resolve
# these entrypoints from their module globals and keep the same safety checks.
_args, _run, _value, _check = pg.args, pg.run, pg.value, pg.check
pg.args = lambda db=None: _args(pg.DB if db is None else db)
pg.run = lambda sql=None, **kwargs: _run(sql, **{'db': pg.DB, **kwargs})
pg.value = lambda sql, db=None: _value(sql, pg.DB if db is None else db)
pg.check = lambda sql, label, db=None: _check(sql, label, pg.DB if db is None else db)
MIGRATIONS = pg.MIGRATIONS
TEST_DIR = pg.TESTS
DRAFT = pg.DRAFT
UP = MIGRATIONS/'0267_chat_turn_purpose_restore.sql'
DOWN = MIGRATIONS/'rollback/0267_down.sql'
TESTS = TEST_DIR/'chat-turn-purpose-restore.sql'
E1 = (MIGRATIONS/'0265_chat_turn_attempt_with_quota.sql').read_text(encoding='utf8')
S = (MIGRATIONS/'0266_chat_turn_refund_evidence.sql').read_text(encoding='utf8')
SOURCE = UP.read_text(encoding='utf8')
DOWN_SOURCE = DOWN.read_text(encoding='utf8')
ADMIT = 'begin_chat_turn_attempt_with_quota'
BUMP = 'bump_chat_usage_for_turn'
REFUND = 'refund_chat_turn_after_output_swap'
STATIC_MUTANTS = []
SQL_MUTANTS = []
APPLY_SCHEDULES = []
WARM_REFUND_SCHEDULES = []
FK_ORDERS = []
NOWAIT_CHECKS = []


def static_check(source):
    """F widens S's writers only for the purpose decrement, never dynamic SQL."""
    writers = {
        ADMIT: {'chat_turn_reservations'}, BUMP: {'chat_turn_reservations'},
        REFUND: {'chat_turn_reservations', 'chat_turn_refunds', 'chat_usage', 'llm_proxy_purpose_daily'},
    }
    calls = {ADMIT: ['billing_request_role', 'begin_chat_turn_attempt', 'consume_llm_proxy_purpose_quota'],
             BUMP: ['bump_chat_usage_if_under_cap'], REFUND: []}
    for name in writers:
        body = pg.definition(source, name).split('AS $$', 1)[1]
        body = re.sub(r'--[^\n]*', '', body)
        targets = re.findall(r'\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.(\w+)', body, re.I)
        if set(targets) - writers[name]:
            raise ValueError('F STATIC: unexpected write target '+name)
        if re.search(r'\b(?:EXECUTE|CALL)\b', body, re.I):
            raise ValueError('F STATIC: dynamic write path '+name)
        # Remove table insertion syntax before finding calls, including calls in IF/SELECT.
        expressions = re.sub(r'INSERT\s+INTO\s+public\.\w+\s*\(', '(', body, flags=re.I)
        if re.findall(r'\bpublic\.(\w+)\s*\(', expressions) != calls[name]:
            raise ValueError('F STATIC: unexpected function call '+name)


def source_contract(source=SOURCE, down=DOWN_SOURCE):
    """Removing explicitly marked additive F blocks must recover reviewed bytes."""
    static_check(source)
    static_check(down)
    for name, baseline in [(ADMIT, E1), (BUMP, S), (REFUND, S)]:
        actual = pg.definition(source, name)
        recovered = re.sub(r'^-- F-BEGIN\n[\s\S]*?^-- F-END\n', '', actual, flags=re.M)
        if recovered != pg.definition(baseline, name):
            raise ValueError('F SOURCE DRIFT: '+name)
    for name, baseline in [(ADMIT, E1), (REFUND, S)]:
        if pg.definition(down, name) != pg.definition(baseline, name):
            raise ValueError('F DOWN DRIFT: '+name)
    if pg.definition(down, BUMP) != pg.definition(source, BUMP):
        raise ValueError('F DOWN RETENTION DRIFT')
    fn = pg.definition(source, ADMIT)
    anchors = ["v_quota_before := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;",
               "FROM public.consume_llm_proxy_purpose_quota(p_user_id, p_provider, 'secondb_chat') AS q;",
               "v_quota_after := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;",
               'IF v_quota_before IS DISTINCT FROM v_quota_after THEN']
    positions = [fn.find(anchor) for anchor in anchors]
    if -1 in positions or positions != sorted(positions):
        raise ValueError('F CLOCK CONTRACT')
    lock = fn.find('FOR KEY SHARE')
    registration = fn.find('v_registered := public.begin_chat_turn_attempt')
    if not 0 <= lock < registration or 'IF v_before = 0 THEN' not in fn:
        raise ValueError('F PARENT LOCK CONTRACT')
    for text in (source, down):
        locks = re.findall(r'LOCK TABLE ([^;]+);', re.sub(r'--[^\n]*', '', text))
        if locks != ['public.chat_turn_refunds, public.chat_turn_reservations IN ACCESS EXCLUSIVE MODE']:
            raise ValueError('F MIGRATION LOCK CONTRACT')


def down_checks(file, n, db=None, check=True):
    """The real down file and its mutated copy share exactly the same oracle."""
    db = pg.DB if db is None else db
    before = pg.value(f'SELECT t40.snapshot({n});', db=db)
    pg.run(file=file, transaction=True, db=db)
    return pg.run(f"""
SELECT t40.check(t40.snapshot({n})=$snapshot${before}$snapshot$::jsonb, 'F down preserves settled rollback fixture');
UPDATE public.chat_turn_reservations SET issued_at=clock_timestamp()-interval '3 days' WHERE turn_id=t40.id({n},2);
SELECT t40.bump({n},t40f.today()+1);
SELECT t40.check(t40f.markers({n})=1, 'F down bump retains cap');
""", db=db, check=check)


def sql_mutant(label, name, old, new, assertion, prefix=''):
    original = pg.definition(SOURCE, name)
    pg.expect(original.count(old) == 1, 'F mutation anchor '+label)
    pg.run(prefix+original.replace(old, new), db=pg.MUTANT)
    result = pg.run(file=TESTS, db=pg.MUTANT, check=False)
    pg.expect(result.returncode != 0 and 'P0040: T40 FAIL: '+assertion in result.stderr,
              'F mutation killed '+label)
    SQL_MUTANTS.append(label)
    pg.run(original, db=pg.MUTANT)
    if prefix:
        pg.run("CREATE UNIQUE INDEX chat_turn_reservations_purpose_restore_day_key ON public.chat_turn_reservations(user_id,purpose_restored_day) WHERE purpose_restored_day IS NOT NULL;", db=pg.MUTANT)


def clock_boundary(remove_guard=False):
    # Only the TWO wrapper samples are instrumented. The actual quota function
    # and actual transaction/exception semantics run unchanged in PostgreSQL.
    fn = pg.definition(SOURCE, ADMIT)
    fn = fn.replace("v_quota_before := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date;",
                    "v_quota_before := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date - 1;")
    if remove_guard:
        fn = fn.replace('IF v_quota_before IS DISTINCT FROM v_quota_after THEN', 'IF false THEN')
    sql = """BEGIN;
SELECT t40.setup(7001,0);
SELECT t40.snapshot(7001) AS before_clock \\gset
"""+fn+"""
SELECT t40.check(t40.error('SELECT t40.admit(7001,''first'',3)')='55000', 'F injected midnight mismatch refuses');
SELECT t40.check(t40.snapshot(7001)=:'before_clock'::jsonb, 'F injected midnight rolls back debit and registration');
ROLLBACK;
"""
    result = pg.run(sql, db=pg.MUTANT, check=not remove_guard)
    if remove_guard:
        pg.expect(result.returncode != 0 and 'P0040: T40 FAIL: F injected midnight mismatch refuses' in result.stderr,
                  'F mutation killed midnight_guard')
        SQL_MUTANTS.append('midnight_guard')
    else:
        pg.expect(True, 'F instrumented midnight mismatch: real PG rollback, not real wall-clock midnight')


def start_client(label, sql):
    name = f't40_{os.getpid()}_{label}'
    # Windows argv uses the local codepage; UTF-8 files preserve migration comments.
    file = pg.LOG/(label+'.sql')
    file.write_text(sql, encoding='utf8')
    process = subprocess.Popen(pg.args()+['-f', str(file)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding='utf8', env={**pg.ENV, 'PGAPPNAME': name})
    return name, process


def wait_for_lock(name, blockers, process):
    deadline = time.monotonic()+8
    while time.monotonic() < deadline:
        names = ','.join("'"+x+"'" for x in blockers)
        if pg.value(f"""SELECT EXISTS(SELECT 1 FROM pg_stat_activity f JOIN pg_stat_activity l
          ON l.pid=ANY(pg_blocking_pids(f.pid)) WHERE f.application_name='{name}'
          AND l.application_name IN ({names}) AND f.wait_event_type='Lock');""") == 't':
            pg.expect(True, name+' observed real lock wait')
            return
        if process.poll() is not None:
            out, err = process.communicate(timeout=3)
            (pg.LOG/(name+'.failed.log')).write_text(out+err, encoding='utf8')
            raise AssertionError('client exited before lock wait: '+name+' '+err[-1000:])
        time.sleep(.04)
    raise AssertionError('lock wait not observed: '+name)


def finish_client(label, process):
    out, err = process.communicate(timeout=20)
    (pg.LOG/(label+'.log')).write_text(out+err, encoding='utf8')
    pg.expect(process.returncode == 0, label+' completed without SQL/connection/timeout error: '+err[-300:])
    return out.strip()


def close_clients(sessions, clients):
    pg.run(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{pg.DB}' AND application_name LIKE 't40_{os.getpid()}_%';", check=False)
    for process in clients:
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=3)
    for session in sessions:
        session.close()


def apply_races():
    # Pause at the reservation boundary of a live admission, then execute the
    # ENTIRE unmodified migration file. Its lock wait must not block consume.
    for i, (direction, file) in enumerate([('up', UP), ('down', DOWN)]):
        for missing in (False, True):
            n = 6200+i*2+int(missing)
            pg.run(file=UP, transaction=True)
            if direction == 'up':
                pg.run(file=DOWN, transaction=True)
            pg.run(f'SELECT t40.setup({n},0);')
            if missing:
                pg.run(f'DELETE FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id({n});')
            label = f'F_apply_{direction}_missing_{missing}'
            leader = pg.Session(label+'_admission')
            migration = None
            try:
                leader.send(f'BEGIN; SELECT turn_id FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2) FOR UPDATE;')
                leader.ready()
                name, migration = start_client(label, 'BEGIN;\n'+file.read_text(encoding='utf8')+'\nCOMMIT;')
                wait_for_lock(name, [leader.name], migration)
                leader.send(f"SELECT t40.check((t40.admit({n},'first',3)->>'allowed')::boolean,'F apply live admission succeeds'); COMMIT;")
                leader.ready()
                finish_client(label, migration)
                pg.check(f"t40f.quota({n})={1 if missing else 4} AND (SELECT attempts=1 FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2))", label+' preserves admission')
                APPLY_SCHEDULES.append(label)
            finally:
                close_clients([leader], [] if migration is None else [migration])
    pg.run(file=UP, transaction=True)


def warm_refund_race(direction, timeout, n, mutant=False):
    # A new backend compiles reservations%ROWTYPE before reading refunds and
    # masks the inversion. Prime the REAL refund on this same backend, rollback
    # its changes, then keep the backend alive across the migration lock wait.
    pg.run(file=UP, transaction=True)
    pg.run(f'SELECT t40f.setup({n});')
    if direction == 'up':
        pg.run(file=DOWN, transaction=True)
    source = SOURCE if direction == 'up' else DOWN_SOURCE
    if mutant:
        source = source.replace(
            'LOCK TABLE public.chat_turn_refunds, public.chat_turn_reservations',
            'LOCK TABLE public.chat_turn_reservations, public.chat_turn_refunds')
    label = f'F_warm_refund_{direction}_{timeout}_mutant_{mutant}'
    holder = pg.Session(label+'_holder')
    refund = pg.Session(label+'_refund')
    clients = []
    try:
        refund.send(f"SET deadlock_timeout='{timeout}ms'; BEGIN; SELECT t40.refund({n}); ROLLBACK;")
        refund.ready()
        holder.send('BEGIN; LOCK TABLE public.chat_turn_reservations IN ACCESS SHARE MODE;')
        holder.ready()
        mname, migration = start_client(label, f"SET deadlock_timeout='{timeout}ms'; BEGIN;\n"+source+'\nCOMMIT;')
        clients.append(migration)
        wait_for_lock(mname, [holder.name], migration)
        refund.send(f"SELECT COALESCE(t40.error('SELECT t40.refund({n})'), 'OK');")
        wait_for_lock(refund.name, [mname], refund.process)
        holder.send('COMMIT;')
        holder.ready()
        status = refund.lines.get(timeout=20)
        refund.ready()
        out, err = migration.communicate(timeout=20)
        (pg.LOG/(label+'.log')).write_text('refund='+status+'\n'+out+err, encoding='utf8')
        pg.expect(status in ('OK', '40P01') and
                  (migration.returncode == 0 or '40P01:' in err), label+' bounded SQLSTATEs')
        ok = status == 'OK' and migration.returncode == 0
        assertion = 'F warm refund survives '+direction
        result = pg.run(f"SELECT t40.check({str(ok).lower()},'{assertion}');", check=not mutant)
        if mutant:
            pg.expect(status == '40P01' or '40P01:' in err, label+' actual 40P01 reproduced')
            pg.expect(result.returncode != 0 and 'P0040: T40 FAIL: '+assertion in result.stderr,
                      'F mutation killed '+label)
            SQL_MUTANTS.append(label)
        else:
            pg.check(f"(SELECT state='refunded' FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2)) "
                     f"AND (SELECT count=1 FROM public.chat_usage WHERE user_id=t40.id({n})) "
                     f"AND (SELECT count(*)=1 FROM public.chat_turn_refunds WHERE audit_id=t40.id({n},3))",
                     label+' commits refund and ledger exactly once')
            WARM_REFUND_SCHEDULES.append(label)
    finally:
        close_clients([holder, refund], clients)


def warm_refund_races():
    original_db = pg.DB
    try:
        for mutant in (False, True):
            pg.DB = pg.MUTANT if mutant else original_db
            for i, direction in enumerate(('up', 'down')):
                for j, timeout in enumerate((1000, 200)):
                    warm_refund_race(direction, timeout, 6500+i*2+j, mutant)
            pg.run(file=UP, transaction=True)
    finally:
        pg.DB = original_db


def nowait_admissions(mutant=False):
    # The actual 0242 routine, not merely a synthetic parent SELECT.
    versions = [('F', SOURCE.replace('IF v_before = 0 THEN', "IF p_attempt_intent = 'first' OR v_before = 0 THEN"))] if mutant else [('E1-S', E1), ('F', SOURCE)]
    for version, source in versions:
        pg.run(pg.definition(source, ADMIT))
        for i, (label, attempts, intent, slot, missing) in enumerate([
            ('first_existing', 0, 'first', 3, False), ('first_new', 0, 'first', 3, True),
            ('second', 1, 'reask', 4, False), ('duplicate_first', 1, 'first', 4, False),
            ('rejected_reask', 2, 'reask', 5, False), ('attempt_zero_reask', 0, 'reask', 3, False),
            ('unbound_first', None, 'first', 3, False),
        ]):
            if mutant and label != 'unbound_first':
                continue
            n = 6300+(0 if version == 'E1-S' else 10)+i
            pg.run(f"""SELECT t40.setup({n},{attempts or 0});
INSERT INTO public.profile_context_imports(id,user_id,request_id,request_digest,item_count,profile_change_count,document)
VALUES(t40.id({n},8),t40.id({n}),t40.id({n},9),'fixture',1,0,'{{}}');""")
            if attempts is None:
                pg.run(f'DELETE FROM public.chat_turn_reservations WHERE user_id=t40.id({n});')
            if missing:
                pg.run(f'DELETE FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id({n});')
            holder = pg.Session('nowait_'+version+'_'+label)
            try:
                holder.send(f"BEGIN; SELECT t40.admit({n},'{intent}',{slot});")
                holder.ready()
                conflict = missing or (version == 'F' and attempts == 0)
                predicate = "='55P03'" if conflict else ' IS NULL'
                assertion = f'F 0242 {version} {label} '+('55P03' if conflict else 'success')
                result = pg.run(f"SELECT t40.check(t40.error('SELECT public.withdraw_profile_import_internal(t40.id({n},8),false)'){predicate},'{assertion}');", check=not mutant)
                if mutant:
                    pg.expect(result.returncode != 0 and 'P0040: T40 FAIL: '+assertion in result.stderr,
                              'F mutation killed unbound_parent_lock')
                    pg.check(f"t40.error('SELECT public.withdraw_profile_import_internal(t40.id({n},8),false)')='55P03'", 'F mutant actual 0242 conflict')
                    SQL_MUTANTS.append('unbound_parent_lock')
                else:
                    pg.expect(True, assertion)
                    NOWAIT_CHECKS.append({'version': version, 'path': label, 'result': '55P03' if conflict else 'success'})
            finally:
                holder.send('ROLLBACK;')
                holder.ready()
                holder.close()
    pg.run(pg.definition(SOURCE, ADMIT))


def cascade_orders():
    # Recreate the three real FK constraints in three orders; PostgreSQL orders
    # their DELETE triggers by name. Preserve every constraint definition.
    constraints = json.loads(pg.value("""SELECT json_agg(json_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid)))
FROM pg_constraint WHERE contype='f' AND confrelid='public.users'::regclass
AND conrelid IN ('public.chat_usage'::regclass,'public.llm_proxy_purpose_daily'::regclass,'public.chat_turn_reservations'::regclass);"""))
    pg.expect(len(constraints) == 3, 'F three real cascade constraints')
    for order in [('chat_usage', 'llm_proxy_purpose_daily', 'chat_turn_reservations'),
                  ('llm_proxy_purpose_daily', 'chat_turn_reservations', 'chat_usage'),
                  ('chat_turn_reservations', 'chat_usage', 'llm_proxy_purpose_daily')]:
        for table in order:
            relation, name, definition = next(c for c in constraints if c[0].split('.')[-1] == table)
            pg.run(f'ALTER TABLE {relation} DROP CONSTRAINT {name}; ALTER TABLE {relation} ADD CONSTRAINT {name} {definition};', transaction=True)
        actual = json.loads(pg.value("""SELECT json_agg(c.conrelid::regclass::text ORDER BY t.tgname)
FROM pg_trigger t JOIN pg_constraint c ON c.oid=t.tgconstraint
WHERE t.tgrelid='public.users'::regclass AND t.tgfoid='pg_catalog."RI_FKey_cascade_del"()'::regprocedure
AND c.conrelid IN ('public.chat_usage'::regclass,'public.llm_proxy_purpose_daily'::regclass,'public.chat_turn_reservations'::regclass);"""))
        pg.expect([t.split('.')[-1] for t in actual] == list(order), 'F actual FK trigger order '+','.join(order))
        FK_ORDERS.append({'database': pg.DB, 'order': actual})
        yield order


def cascade_admission(order, n, mutant=False, path='first'):
    # Existing purpose row is intentional: restricting parent locking to INSERT
    # cannot prevent this reservation/purpose inversion with account deletion.
    pg.run(f'SELECT t40.setup({n},{2 if path == "rejected_reask" else 0});')
    if path == 'unbound_first':
        pg.run(f'DELETE FROM public.chat_turn_reservations WHERE user_id=t40.id({n});')
    intent = 'reask' if path in ('attempt_zero_reask', 'rejected_reask') else 'first'
    first = 'chat_turn_reservations' if order[0] == 'chat_turn_reservations' else 'llm_proxy_purpose_daily'
    if path == 'unbound_first':
        first = 'llm_proxy_purpose_daily'
    holder = pg.Session('cascade_holder_'+str(n))
    clients = []
    try:
        holder.send(f'BEGIN; SELECT user_id FROM public.{first} WHERE user_id=t40.id({n}) FOR UPDATE;')
        holder.ready()
        dname, delete = start_client('cascade_delete_'+str(n), f"SELECT t40.error('DELETE FROM public.users WHERE id=t40.id({n})');")
        clients.append(delete)
        wait_for_lock(dname, [holder.name], delete)
        aname, admit = start_client('cascade_admit_'+str(n), f"SELECT t40.error('SELECT t40.admit({n},''{intent}'',3)');")
        clients.append(admit)
        admitted = None
        if path != 'rejected_reask':
            wait_for_lock(aname, [dname, holder.name], admit)
        else:
            admitted = finish_client(aname, admit)
            pg.expect(admitted == '', 'F rejected reask needs no child write')
        holder.send('COMMIT;')
        holder.ready()
        deleted = finish_client(dname, delete)
        if admitted is None:
            admitted = finish_client(aname, admit)
        # Infrastructure errors never count as a killed mutation.
        pg.expect(deleted in ('', '40P01') and admitted in ('', '23503', '40P01'), 'F cascade SQLSTATEs bounded')
        ok = deleted == '' and admitted == ('' if path == 'rejected_reask' else '23503')
        result = pg.run(f"SELECT t40.check({str(ok).lower()},'F parent lock prevents cascade deadlock');", check=not mutant)
        if mutant:
            pg.expect('40P01' in (deleted, admitted), 'F M34 actual deadlock reproduced with existing quota')
            pg.expect(result.returncode != 0 and 'P0040: T40 FAIL: F parent lock prevents cascade deadlock' in result.stderr, 'F mutation killed M34_parent_key_share')
            SQL_MUTANTS.append('M34_parent_key_share')
        else:
            pg.check(f'NOT EXISTS(SELECT 1 FROM public.users WHERE id=t40.id({n})) AND NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id({n})) AND t40f.quota({n})=0', 'F cascade removes all children '+str(n))
            pg.RACE_SCHEDULES.append('F_cascade_'+path+'_'+','.join(order))
    finally:
        close_clients([holder], clients)


def parent_lock_races():
    for i, order in enumerate(cascade_orders()):
        for j, path in enumerate(('first', 'attempt_zero_reask', 'unbound_first', 'rejected_reask')):
            cascade_admission(order, 6400+i*4+j, path=path)
    # First order produces the inverse two-child acquisition without the parent.
    # Exercise the changed function in the mutant clone, not a toy lock model.
    original_db = pg.DB
    pg.DB = pg.MUTANT
    try:
        for order in cascade_orders():
            fn = pg.definition(SOURCE, ADMIT)
            pg.run(fn.replace('PERFORM 1 FROM public.users WHERE id = p_user_id FOR KEY SHARE;',
                              'PERFORM 1 FROM public.users WHERE id = p_user_id;'))
            try:
                cascade_admission(order, 6450, mutant=True)
            finally:
                pg.run(fn)
            break
    finally:
        pg.DB = original_db


def races():
    pg.run('SELECT t40f.pair(6001);')
    pg.race('F_two_reservations_same_day', 'SELECT t40.refund(6001);', 'SELECT t40.refund(6001,5);',
            "t40f.quota(6001)=3 AND t40f.markers(6001)=1 AND (SELECT count=2 FROM public.chat_usage WHERE user_id=t40.id(6001) AND day=t40f.today()) AND (SELECT count(*)=2 FROM public.chat_turn_reservations WHERE user_id=t40.id(6001) AND state='refunded')")
    for n, first in [(6002, True), (6003, False)]:
        pg.run(f'SELECT t40f.setup({n}); UPDATE public.llm_proxy_purpose_daily SET count=5 WHERE user_id=t40.id({n});')
        refund = f'SELECT t40.check(t40.refund({n})=1,\'F race chat\');'
        consume = f'SELECT t40.check(t40f.consume({n})={str(first).lower()},\'F race last slot\');'
        pg.race('F_last_slot_'+('refund_first' if first else 'consume_first'),
                refund if first else consume, consume if first else refund,
                f't40f.quota({n})={5 if first else 4} AND t40f.markers({n})=1')
    # Delete-at-one races: consume must not resurrect a zero row or lose a debit.
    for n, first in [(6004,True),(6005,False)]:
        pg.run(f'SELECT t40f.setup({n});')
        refund=f'SELECT t40.refund({n});'
        consume=f'SELECT t40.check(t40f.consume({n}),\'F race consume one\');'
        pg.race('F_count_one_'+('refund_first' if first else 'consume_first'),
                refund if first else consume, consume if first else refund,
                f't40f.quota({n})=1 AND t40f.markers({n})=1')
    for n, first in [(6006,True),(6007,False)]:
        pg.run(f'SELECT t40f.pair({n}); SELECT t40.refund({n}); UPDATE public.chat_turn_reservations SET issued_at=clock_timestamp()-interval \'3 days\' WHERE turn_id=t40.id({n},2);')
        bump=f'SELECT t40.bump({n},t40f.today()+1);'
        refund=f'SELECT t40.refund({n},5);'
        pg.race('F_bump_late_refund_'+str(first),bump if first else refund,refund if first else bump,
                f't40f.quota({n})=3 AND t40f.markers({n})=1')
    for n, first in [(6008,True),(6009,False)]:
        pg.run(f'SELECT t40f.setup({n}); SELECT t40.admit({n},\'reask\',4); SELECT t40.audit({n},4,\'green\');')
        claim=f'SELECT t40.claim({n},4);'
        refund=f'SELECT t40.refund({n});'
        pg.race('F_green_claim_refund_'+str(first),claim if first else refund,refund if first else claim,
                f't40f.quota({n})=1 AND t40f.markers({n})=0')
    for n, first in [(6010,True),(6011,False)]:
        pg.run(f'SELECT t40f.setup({n});')
        begin=f'SELECT t40.admit({n},\'reask\',4);'
        refund=f'SELECT t40.refund({n});'
        pg.race('F_begin_refund_'+str(first),begin if first else refund,refund if first else begin,
                f't40f.quota({n})={1 if first else 0} AND t40f.markers({n})={0 if first else 1}')
    for n, first in [(6012,True),(6013,False)]:
        pg.run(f'SELECT t40f.setup({n});')
        delete=f'DELETE FROM public.users WHERE id=t40.id({n});'
        refund=f'SELECT t40.refund({n});'
        pg.race('F_delete_refund_'+str(first),delete if first else refund,refund if first else delete,
                f'NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id({n})) AND t40f.quota({n})=0')
    for n, first in [(6014,True),(6015,False)]:
        pg.run(f'SELECT t40.setup({n},0);')
        delete=f'DELETE FROM public.users WHERE id=t40.id({n});'
        admit=f'SELECT t40.admit({n},\'first\',3);'
        if first:
            admit=f"SELECT t40.check(t40.error('SELECT t40.admit({n},''first'',3)')='23503','F deleted admission refuses');"
        pg.race('F_delete_admission_'+str(first),delete if first else admit,admit if first else delete,
                f'NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id({n})) AND t40f.quota({n})=0')


def main():
    source_contract()
    for label, source, down in [
        ('e1_copy_drift', SOURCE.replace("'first_already_registered'", "'silently_changed'"), DOWN_SOURCE),
        ('e1_down_drift', SOURCE, DOWN_SOURCE.replace("'first_already_registered'", "'silently_changed'")),
        ('clock_now', SOURCE.replace('v_quota_before := (pg_catalog.clock_timestamp()', 'v_quota_before := (pg_catalog.now()'), DOWN_SOURCE),
        ('clock_statement', SOURCE.replace('v_quota_after := (pg_catalog.clock_timestamp()', 'v_quota_after := (pg_catalog.statement_timestamp()'), DOWN_SOURCE),
        ('parent_key_share_missing', SOURCE.replace('FOR KEY SHARE;', ';', 1), DOWN_SOURCE),
        ('refund_other_writer', SOURCE.replace('    v_restore_day :=', '    UPDATE public.users SET locale=locale;\n    v_restore_day :='), DOWN_SOURCE),
        ('refund_execute', SOURCE.replace('    v_restore_day :=', "    EXECUTE 'SELECT 1';\n    v_restore_day :="), DOWN_SOURCE),
        ('refund_call', SOURCE.replace('    v_restore_day :=', '    CALL public.unexpected();\n    v_restore_day :='), DOWN_SOURCE),
        ('refund_consume', SOURCE.replace('    v_restore_day :=', "    PERFORM public.consume_llm_proxy_purpose_quota(v_user,'openai','secondb_chat');\n    v_restore_day :="), DOWN_SOURCE),
        ('apply_lock_order', SOURCE.replace('LOCK TABLE public.chat_turn_refunds, public.chat_turn_reservations', 'LOCK TABLE public.chat_turn_reservations, public.chat_turn_refunds'), DOWN_SOURCE),
        ('down_lock_order', SOURCE, DOWN_SOURCE.replace('LOCK TABLE public.chat_turn_refunds, public.chat_turn_reservations', 'LOCK TABLE public.chat_turn_reservations, public.chat_turn_refunds')),
        ('parent_lock_unbound', SOURCE.replace('IF v_before = 0 THEN', "IF p_attempt_intent = 'first' OR v_before = 0 THEN"), DOWN_SOURCE),
    ]:
        try:
            source_contract(source,down)
        except ValueError:
            STATIC_MUTANTS.append(label)
        else:
            raise AssertionError('F static mutant survived: '+label)
    pg.run('CREATE DATABASE '+pg.DB+' TEMPLATE t39_t40_before_0267;', db='template1')
    baseline=pg.schema_snapshot()
    pg.run(file=TEST_DIR/'chat-turn-refund-evidence-fixture.sql')
    pg.run('SELECT t40.setup(5100,1); SELECT t40.audit(5100); SELECT t40.claim(5100);')
    for _ in range(2): pg.run(file=UP,transaction=True)
    pg.check('SELECT quota_day IS NULL AND purpose_restored_day IS NULL FROM public.chat_turn_reservations WHERE turn_id=t40.id(5100,2)', 'F apply never backfills old receipts')
    pg.run(file=TEST_DIR/'chat-turn-purpose-restore-fixture.sql')
    pg.run('CREATE DATABASE '+pg.MUTANT+' TEMPLATE '+pg.DB+';',db='template1')
    result=pg.run(file=TESTS)
    count=result.stderr.count('T40 PASS:')
    pg.expect(count == 53, 'F sequential assertions: '+str(count))
    # S behavior and E1-S remain valid on the actual final installed F functions.
    pg.run(file=TEST_DIR/'chat-turn-refund-evidence.sql')
    pg.run(file=TEST_DIR/'chat-turn-attempt-with-quota.sql')
    # Exact S/E1 function/ACL restoration, with the explicitly retained cap state.
    pg.run('SELECT t40f.pair(5101); SELECT t40.refund(5101);')
    down_checks(DOWN, 5101)
    after=pg.schema_snapshot()
    for key in ('functions','columns','indexes'):
        expected=baseline[key]
        actual=after[key]
        if key=='functions':
            # Even the retained bump must match every captured header/ACL field;
            # only its explicitly pinned F body replaces the S baseline body.
            retained_body=pg.definition(SOURCE,BUMP).split('AS $$',1)[1].split('$$;',1)[0]
            expected=[[x[0],retained_body,*x[2:]] if x[0]==BUMP else x for x in expected]
        elif key=='columns':
            actual=[x for x in actual if x[0] not in ('quota_day','purpose_restored_day')]
        else:
            actual=[x for x in actual if x[0]!='chat_turn_reservations_purpose_restore_day_key']
        pg.expect(actual==expected, 'F down exact S baseline '+key+' except declared retained cap extension')
    for key in ('constraints','triggers','registry'):
        pg.expect(after[key]==baseline[key], 'F down unchanged S '+key)
    pg.expect(after['rls'][:2]==baseline['rls'][:2] and 'F rollback retains these markers' in after['rls'][2],
              'F down unchanged S RLS and ACL; retained extension comment remains accurate')
    refused = pg.run(file=MIGRATIONS/'rollback/0266_down.sql', transaction=True, check=False)
    pg.expect(refused.returncode != 0 and '55000:' in refused.stderr
              and 'unexpected installed definition public.bump_chat_usage_for_turn' in refused.stderr,
              'F down then historical S down refuses retained bump')
    pg.expect(pg.schema_snapshot() == after, 'F refused S down leaves catalog unchanged')
    pg.run(file=TEST_DIR/'chat-turn-attempt-with-quota.sql')
    pg.run(file=TEST_DIR/'chat-turn-refund-evidence.sql')
    pg.run(file=UP,transaction=True)
    pg.run('SELECT t40.refund(5101,5);')
    pg.check('t40f.quota(5101)=3 AND t40f.markers(5101)=1','F down reapply never resets cap')
    pg.run(file=TESTS)
    # Wrong base body, wrong column/index shape and unexpected SQL errors fail closed.
    for label,change,message in [
        ('installed_e1_drift',pg.definition(E1,ADMIT).replace("'first_already_registered'","'changed'"),'unexpected installed definition'),
        ('date_default',"ALTER TABLE public.chat_turn_reservations ALTER COLUMN quota_day SET DEFAULT CURRENT_DATE;",'expected nullable dates'),
        ('nonunique_index',"DROP INDEX public.chat_turn_reservations_purpose_restore_day_key; CREATE INDEX chat_turn_reservations_purpose_restore_day_key ON public.chat_turn_reservations(user_id,purpose_restored_day) WHERE purpose_restored_day IS NOT NULL;",'expected user daily restore unique index'),
    ]:
        result=pg.run('BEGIN;\n'+change+'\n'+SOURCE+'\nCOMMIT;', db=pg.MUTANT,check=False)
        pg.expect(result.returncode!=0 and '55000: T40 F: '+message in result.stderr,'F fail closed '+label)
    sql_mutant('daily_cap',REFUND,
               'AND NOT EXISTS (SELECT 1 FROM public.chat_turn_reservations\n                        WHERE user_id = v_user AND purpose_restored_day = v_restore_day)',
               'AND true','F user daily cap across reservations',
               'DROP INDEX public.chat_turn_reservations_purpose_restore_day_key;\n')
    sql_mutant('green',REFUND,"a.safety_zone = 'red' AND a.created_at <= v_now)","a.safety_zone IN ('red', 'green') AND a.created_at <= v_now)",'F green first prevents purpose restore')
    sql_mutant('yellow',REFUND,"a.safety_zone = 'red' AND a.created_at <= v_now)","a.safety_zone IN ('red', 'yellow') AND a.created_at <= v_now)",'F yellow first prevents purpose restore')
    sql_mutant('pending_delivery',REFUND,'attempt.delivered AND a.user_id = v_user','true AND a.user_id = v_user','F audited but undelivered second prevents restore')
    sql_mutant('old_day_cap',REFUND,'v_row.quota_day = v_restore_day','v_row.quota_day IS NOT NULL','F previous-day refund does not spend today cap')
    sql_mutant('p_day_cleanup',BUMP,"(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date",'p_day','F malicious p_day cannot erase today marker')
    sql_mutant('marker_cleanup',BUMP,"AND (r.purpose_restored_day IS NULL OR r.purpose_restored_day <\n          (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)",'AND true','F malicious p_day cannot erase today marker')
    sql_mutant('counted_day',ADMIT,'SET quota_day = v_quota_before','SET quota_day = counted_day','F attempt-zero reask records actual debit day')
    sql_mutant('missing_receipt',ADMIT,'IF v_registered THEN\n    UPDATE public.chat_turn_reservations SET quota_day', 'IF false THEN\n    UPDATE public.chat_turn_reservations SET quota_day','F first receipt is server today')
    sql_mutant('cap_collision_handler',REFUND,"IF v_hit IS DISTINCT FROM 'chat_turn_reservations_purpose_restore_day_key' THEN RAISE; END IF;",
               'RAISE;', 'F daily index conflict keeps chat transaction')
    mutant_down = pg.LOG/'UNNUMBERED_chat_turn_purpose_restore_down_cap_reset.sql'
    mutant_down.write_text(DOWN_SOURCE+"\nUPDATE public.chat_turn_reservations SET purpose_restored_day=NULL;\n", encoding='utf8')
    pg.run('SELECT t40f.pair(7100); SELECT t40.refund(7100);', db=pg.MUTANT)
    result = down_checks(mutant_down, 7100, db=pg.MUTANT, check=False)
    pg.expect(result.returncode!=0 and 'P0040: T40 FAIL: F down preserves settled rollback fixture' in result.stderr,
              'F mutation killed down_cap_reset')
    SQL_MUTANTS.append('down_cap_reset')
    pg.run(file=UP, transaction=True, db=pg.MUTANT)
    clock_boundary()
    clock_boundary(remove_guard=True)
    races()
    nowait_admissions()
    original_db = pg.DB
    try:
        pg.DB = pg.MUTANT
        nowait_admissions(mutant=True)
    finally:
        pg.DB = original_db
    apply_races()
    warm_refund_races()
    parent_lock_races()
    summary={'runner_assertions':len(pg.CHECKS),'sequential_assertions':count,
             'sql_mutants_killed':len(SQL_MUTANTS),'sql_mutants':SQL_MUTANTS,
             'static_mutants_killed':len(STATIC_MUTANTS),'static_mutants':STATIC_MUTANTS,
             'race_schedules':len(pg.RACE_SCHEDULES),'races':pg.RACE_SCHEDULES,
             'apply_schedules':len(APPLY_SCHEDULES),'apply_races':APPLY_SCHEDULES,
             'warm_refund_schedules':len(WARM_REFUND_SCHEDULES),'warm_refund_races':WARM_REFUND_SCHEDULES,
             'fk_trigger_orders':FK_ORDERS,
             'withdrawal_nowait_checks':NOWAIT_CHECKS,
             'midnight':'injected wrapper date samples + real PG atomic rollback; wall-clock midnight not observed',
             'logs':str(pg.LOG)}
    (pg.LOG/'result.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
    print(json.dumps(summary),flush=True)


if __name__=='__main__':
    print('T40 F logs:',pg.LOG,flush=True)
    try:
        main()
    finally:
        (pg.LOG/'summary.json').write_text(json.dumps(pg.CHECKS,indent=2),encoding='utf8')
