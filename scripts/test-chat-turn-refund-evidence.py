#!/usr/bin/env python3
"""T40 S: bounded real-PG tests, only fixed disposable clones on loopback.

Requires the CI numbered replay in postgres. Never reads dotenv, accepts a URL,
or drops a database. Start with a fresh cluster/clone for each invocation.
"""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
DRAFT = ROOT / 'db/migration-drafts'
DB = 't40_evidence_test_ci'
MUTANT = 't40_evidence_mutant_test_ci'
PORT = os.environ.get('PGPORT', '5432')
if not PORT.isdigit() or not 1 <= int(PORT) <= 65535:
    raise ValueError('invalid local PostgreSQL port')
ENV = {k: v for k, v in os.environ.items()
       if not k.upper().startswith('PG') or k.upper() == 'PGPASSWORD'}
ENV.update(PGCONNECT_TIMEOUT='5', PGCLIENTENCODING='UTF8',
           PGOPTIONS='-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000')
LOG = Path(tempfile.mkdtemp(prefix='t40-evidence-'))
CHECKS = []
COUNTER = 0


def args(db=DB):
    if db not in (DB, MUTANT, 'template1'):
        raise ValueError('refusing non-test database')
    return ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT,
            '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']


def run(sql=None, *, file=None, db=DB, transaction=False, check=True):
    global COUNTER
    COUNTER += 1
    cmd = args(db) + (['--single-transaction'] if transaction else [])
    if file:
        cmd += ['-f', str(file)]
    result = subprocess.run(cmd, input=sql, text=True, encoding='utf8',
                            capture_output=True, cwd=ROOT, env=ENV, timeout=35)
    (LOG / f'{COUNTER:04}.log').write_text(result.stdout + result.stderr, encoding='utf8')
    if check and result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result


def value(sql, db=DB):
    return run(sql, db=db).stdout.strip()


def expect(ok, label):
    CHECKS.append({'ok': bool(ok), 'label': label})
    if not ok:
        raise AssertionError(label)
    print('T40 RUNNER PASS:', label, flush=True)


def check(sql, label, db=DB):
    run("SELECT t40.check((" + sql + "), '" + label.replace("'", "''") + "');", db=db)
    expect(True, label)


def definition(source, name):
    return re.search(r'CREATE OR REPLACE FUNCTION public\.' + name + r'\([\s\S]*?\n\$\$;', source)[0]


def static_check(source):
    """S owns exactly these writers; any purpose/other DML fails closed."""
    code = re.sub(r'--[^\n]*', '', source)
    targets = re.findall(r'\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.(\w+)', code, re.I)
    if not targets or set(targets) - {'chat_turn_reservations', 'chat_turn_refunds', 'chat_usage'}:
        raise ValueError('T40 STATIC: unexpected write target')
    if re.search(r'\b(?:EXECUTE|CALL)\b', re.sub(r'(?:GRANT|REVOKE)[^;]*;', '', code), re.I):
        raise ValueError('T40 STATIC: dynamic write path')
    # Only one existing public function call is allowed (the original bump cap).
    for name in ('bump_chat_usage_for_turn', 'begin_chat_turn_attempt',
                 'claim_chat_turn_for_audit', 'refund_chat_turn_after_output_swap'):
        body = definition(code, name).split('AS $$', 1)[1]
        calls = re.findall(r'(?:PERFORM|:=|FROM)\s+public\.(\w+)\s*\(', body, re.I)
        if calls != (['bump_chat_usage_if_under_cap'] if name == 'bump_chat_usage_for_turn' else []):
            raise ValueError('T40 STATIC: unexpected function call')


def schema_snapshot():
    return json.loads(value("""SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(proname,replace(prosrc,E'\\r',''),proargnames,
    prorettype::regtype::text,prosecdef,provolatile,proconfig,proacl::text) ORDER BY proname)
    FROM pg_proc WHERE oid IN ('public.bump_chat_usage_for_turn(uuid,date)'::regprocedure,
    'public.begin_chat_turn_attempt(uuid,uuid,uuid)'::regprocedure,
    'public.claim_chat_turn_for_audit(uuid,uuid,uuid)'::regprocedure,
    'public.refund_chat_turn_after_output_swap(uuid)'::regprocedure,
    'public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text)'::regprocedure)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,
    pg_get_expr(adbin,adrelid)) ORDER BY attname) FROM pg_attribute LEFT JOIN pg_attrdef
    ON attrelid=adrelid AND attnum=adnum WHERE attrelid='public.chat_turn_reservations'::regclass
    AND attnum>0 AND NOT attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname)
    FROM pg_constraint WHERE conrelid IN ('public.chat_turn_reservations'::regclass,'public.chat_turn_refunds'::regclass)),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relacl::text,obj_description(oid,'pg_class')) FROM pg_class
    WHERE oid='public.chat_turn_reservations'::regclass));"""))


class Session:
    def __init__(self, label):
        self.name = f't40_{os.getpid()}_{label}'
        self.err = (LOG / (label + '.err')).open('w', encoding='utf8')
        self.process = subprocess.Popen(args(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.err, text=True, encoding='utf8', env={**ENV, 'PGAPPNAME': self.name})
        self.lines = queue.Queue()
        self.thread = threading.Thread(target=self.read, daemon=True)
        self.thread.start()

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.strip())

    def send(self, sql):
        self.process.stdin.write(sql + '\n')
        self.process.stdin.flush()

    def ready(self):
        self.send("SELECT 'T40_READY';")
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                if self.lines.get(timeout=.1) == 'T40_READY':
                    return
            except queue.Empty:
                if self.process.poll() is not None:
                    break
        raise RuntimeError('leader not ready: ' + self.name)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        self.process.stdout.close()
        self.thread.join(timeout=1)
        self.err.close()


def race(label, leader_sql, follower_sql, final_sql):
    leader = Session(label + '_leader')
    follower = None
    try:
        leader.send('BEGIN; ' + leader_sql)
        leader.ready()
        name = f't40_{os.getpid()}_{label}_follower'
        follower = subprocess.Popen(args() + ['-c', 'BEGIN; ' + follower_sql + ' COMMIT;'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                    encoding='utf8', env={**ENV, 'PGAPPNAME': name})
        deadline = time.monotonic() + 8
        blocked = False
        while time.monotonic() < deadline:
            blocked = value(f"""SELECT EXISTS(SELECT 1 FROM pg_stat_activity f JOIN pg_stat_activity l
              ON l.pid=ANY(pg_blocking_pids(f.pid)) WHERE f.application_name='{name}'
              AND l.application_name='{leader.name}' AND f.wait_event_type='Lock');""") == 't'
            if blocked or follower.poll() is not None:
                break
            time.sleep(.04)
        expect(blocked, label + ' observed real lock wait')
        leader.send('COMMIT;')
        leader.ready()
        out, err = follower.communicate(timeout=20)
        (LOG / (label + '.log')).write_text(out + err, encoding='utf8')
        expect(follower.returncode == 0, label + ' follower completed: ' + err[-200:])
        check(final_sql, label + ' final state')
    finally:
        # Only our named sessions, only this disposable clone. Close on every failure.
        run(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{DB}' AND application_name LIKE 't40_{os.getpid()}_%';", check=False)
        if follower is not None:
            if follower.poll() is None:
                follower.kill()
            follower.communicate(timeout=3)
        leader.close()


def setup(n, attempts=1):
    run(f'SELECT t40.setup({n},{attempts}); SELECT t40.audit({n},3); SELECT t40.audit({n},4);')


def races():
    # Same audit, different attempts, claim/refund in both orders, bump and late claim.
    setup(101); run('SELECT t40.claim(101);')
    race('same_audit_refund', 'SELECT t40.check(t40.refund(101)=1,\'first refund\');',
         'SELECT t40.check(t40.refund(101) IS NULL,\'second refund\');',
         'SELECT count=1 FROM public.chat_usage WHERE user_id=t40.id(101)')
    for n, label, first, second in [
        (102,'claim2_before_refund1','SELECT t40.claim(102,4);','SELECT t40.check(t40.refund(102,3)=1,\'first evidence refunded\');'),
        (103,'refund1_before_claim2','SELECT t40.refund(103,3);','SELECT t40.check(NOT t40.claim(103,4),\'terminal claim\');'),
        (104,'refund_two_attempts','SELECT t40.refund(104,4);','SELECT t40.check(t40.refund(104,3) IS NULL,\'one per reservation\');')]:
        setup(n,2); run(f'SELECT t40.claim({n},3);')
        if n==104: run(f'SELECT t40.claim({n},4);')
        race(label,first,second,f"SELECT state='refunded' AND (SELECT count=1 FROM public.chat_usage WHERE user_id=t40.id({n})) FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2)")
    setup(105)
    race('bump_before_late_claim','SELECT t40.bump(105);','SELECT t40.check(NOT t40.claim(105),\'closed false\');',
         "SELECT binding_closed AND attempt1_delivered AND audit_id IS NULL FROM public.chat_turn_reservations WHERE turn_id=t40.id(105,2)")
    check('t40.refund(105)=2','closed late red refund after race')
    setup(106); run('SELECT t40.bump(106); SELECT t40.claim(106);')
    race('closed_refund_before_bump','SELECT t40.check(t40.refund(106)=2,\'closed refund\');',
         'SELECT t40.bump(106);',"SELECT state='refunded' AND audit_id IS NULL FROM public.chat_turn_reservations WHERE turn_id=t40.id(106,2)")
    setup(107,2)
    race('two_answers_one_turn','SELECT t40.check(t40.claim(107,4),\'a=true\');',
         'SELECT t40.check(NOT t40.claim(107,3),\'b=false\');',
         'SELECT audit_id=t40.id(107,4) AND attempt1_delivered AND attempt2_delivered FROM public.chat_turn_reservations WHERE turn_id=t40.id(107,2)')
    setup(108)
    run("INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,attempts,attempt1_audit_id,attempted_at) SELECT t40.id(108,6),user_id,counted_day,1,attempt1_audit_id,attempted_at FROM public.chat_turn_reservations WHERE turn_id=t40.id(108,2);")
    race('one_answer_two_turns','SELECT t40.claim(108);',
         'SELECT t40.check(NOT public.claim_chat_turn_for_audit(t40.id(108),t40.id(108,3),t40.id(108,6)),\'collision\');',
         'SELECT NOT attempt1_delivered AND audit_id IS NULL FROM public.chat_turn_reservations WHERE turn_id=t40.id(108,6)')
    check('t40.refund(108) IS NULL','duplicate registered audit not refundable')
    setup(114); run('SELECT t40.claim(114);')
    race('same_audit_repeatable_read','SELECT t40.refund(114);',
         "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ; SELECT t40.check(t40.error('SELECT t40.refund(114)')='40001','repeatable read retries');",
         'SELECT count=1 FROM public.chat_usage WHERE user_id=t40.id(114)')
    check('t40.refund(114) IS NULL','fresh retry after 40001 cannot refund twice')
    setup(115)
    race('claim_before_bump','SELECT t40.check(t40.claim(115),\'bind first\');','SELECT t40.bump(115);',
         'SELECT binding_closed AND attempt1_delivered AND audit_id=t40.id(115,3) FROM public.chat_turn_reservations WHERE turn_id=t40.id(115,2)')
    setup(116); run('SELECT t40.claim(116);')
    race('two_retries_one_answered_turn','SELECT t40.check(t40.begin_attempt(116,4),\'one reask\');',
         'SELECT t40.check(NOT t40.begin_attempt(116,5),\'third attempt denied\');',
         'SELECT attempts=2 AND attempt2_audit_id=t40.id(116,4) AND audit_id=t40.id(116,3) FROM public.chat_turn_reservations WHERE turn_id=t40.id(116,2)')
    # FK cascade order cannot deadlock either direction. Actual users deletion.
    setup(109); run('SELECT t40.claim(109);')
    race('refund_before_account_delete','SELECT t40.refund(109);',
         'DELETE FROM public.users WHERE id=t40.id(109);',
         'NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id(109))')
    setup(110); run('SELECT t40.claim(110);')
    race('account_delete_before_refund','DELETE FROM public.users WHERE id=t40.id(110);',
         'SELECT t40.check(t40.refund(110) IS NULL,\'deleted owner\');',
         'NOT EXISTS(SELECT 1 FROM public.chat_usage WHERE user_id=t40.id(110))')
    setup(111)
    race('bump_before_account_delete','SELECT t40.bump(111);',
         'DELETE FROM public.users WHERE id=t40.id(111);',
         'NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE user_id=t40.id(111))')
    # begin/claim MUST NOT acquire users KEY SHARE: 0242's FOR UPDATE NOWAIT can proceed.
    for n, call in [(112,'begin_attempt'),(113,'claim')]:
        setup(n,0 if n==112 else 1)
        s=Session('nowait_'+str(n))
        try:
            s.send(f'BEGIN; SELECT t40.{call}({n});'); s.ready()
            run(f'BEGIN; SELECT id FROM public.users WHERE id=t40.id({n}) FOR UPDATE NOWAIT; ROLLBACK;')
            expect(True,call+' does not block parent NOWAIT')
        finally: s.close()
    # All nine original T39 schedules, with S's changed bump expectations.
    schedules=[(201,0,'first','first','first','rejected'),(202,0,'reask','reask','first','reask'),
               (203,0,'first','reask','first','reask'),(204,0,'reask','first','first','rejected'),
               (205,1,'reask','reask','reask','rejected')]
    for n, attempts, a,b,ka,kb in schedules:
        setup(n,attempts)
        race('admit_'+str(n),f"SELECT t40.check(t40.admit({n},'{a}',{4 if attempts else 3})->>'kind'='{ka}','leader admission');",
             f"SELECT t40.check(t40.admit({n},'{b}',{5 if attempts else 4})->>'kind'='{kb}','follower admission');",
             f"SELECT attempts={2 if attempts or kb=='reask' else 1} AND (SELECT count={3 if attempts else 4} FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id({n})) FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2)")
    for n, reverse in [(206,False),(207,True)]:
        setup(n,0); run(f'UPDATE public.llm_proxy_purpose_daily SET count=4 WHERE user_id=t40.id({n});')
        consume=f"SET LOCAL request.jwt.claim.role='service_role'; SELECT allowed FROM public.consume_llm_proxy_purpose_quota(t40.id({n}),'openai','secondb_chat');"
        admit=f"SELECT t40.check(t40.admit({n},'first',3)->>'kind'='first','last slot admission');"
        denied=f"SELECT t40.check(t40.error('SELECT t40.admit({n},''first'',3)')='T3901','quota rollback');"
        race('last_slot_'+str(n),consume if reverse else admit,denied if reverse else consume,
             f"SELECT attempts={0 if reverse else 1} AND (SELECT count=5 FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id({n})) FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2)")
    for n, reverse in [(208,False),(209,True)]:
        setup(n)
        bump=f'SELECT t40.bump({n});'
        admit=f"SELECT t40.check(t40.admit({n},'reask',4)->>'kind'='{'reask' if reverse else 'rejected'}','bump reask ordering');"
        race('bump_reask_'+str(n),admit if reverse else bump,bump if reverse else admit,
             f"SELECT binding_closed AND attempts={2 if reverse else 1} AND attempt1_audit_id=t40.id({n},3) AND attempt2_audit_id IS NOT DISTINCT FROM {'t40.id('+str(n)+',4)' if reverse else 'NULL::uuid'} AND (SELECT count(*)=1 FROM public.chat_turn_reservations WHERE user_id=t40.id({n}) AND NOT binding_closed AND attempts=0) AND (SELECT count=3 FROM public.chat_usage WHERE user_id=t40.id({n})) AND (SELECT count=3 FROM public.llm_proxy_purpose_daily WHERE user_id=t40.id({n})) FROM public.chat_turn_reservations WHERE turn_id=t40.id({n},2)")


def main():
    source=(DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql').read_text(encoding='utf8')
    static_check(source)
    run('CREATE DATABASE '+DB+' TEMPLATE postgres;',db='template1')
    run(file=DRAFT/'UNNUMBERED_chat_turn_attempt_with_quota.sql',transaction=True)
    baseline=schema_snapshot()
    run(file=DRAFT/'tests/chat-turn-refund-evidence-fixture.sql')
    # Existing answered/refunded + newest ties, before S is installed.
    for n in (301,302,303,304): setup(n)
    run("SELECT t40.claim(301); SELECT t40.claim(302); SELECT t40.refund(302); "
        "INSERT INTO public.chat_turn_reservations(turn_id,user_id,counted_day,issued_at,attempts,attempt1_audit_id,attempted_at) "
        "SELECT t40.id(303,6),user_id,counted_day,issued_at,1,t40.id(303,5),attempted_at FROM public.chat_turn_reservations WHERE turn_id=t40.id(303,2);")
    for _ in range(2): run(file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql',transaction=True)
    check('SELECT bool_and(attempt1_delivered AND NOT attempt2_delivered) FROM public.chat_turn_reservations WHERE user_id IN(t40.id(301),t40.id(302))','answered/refunded backfill only representative')
    check('SELECT bool_and(binding_closed) FROM public.chat_turn_reservations WHERE user_id=t40.id(303)','all newest ties closed')
    check('SELECT NOT binding_closed AND NOT attempt1_delivered FROM public.chat_turn_reservations WHERE user_id=t40.id(304)','unique newest stays open')
    candidate=json.loads((DRAFT/'chat-turn-refund-evidence-erasure-revision.json').read_text(encoding='utf8'))['tables']['chat_turn_reservations']
    actual=json.loads(value("SELECT jsonb_build_object('owner',owner_column,'class',class,'previousReason',reason) FROM public.erasure_registry WHERE table_name='chat_turn_reservations';"))
    expect(all(candidate[k]==v for k,v in actual.items()),'registry revision matches current owner class and previous reason')
    check("EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.chat_turn_reservations'::regclass AND confrelid='public.users'::regclass AND contype='f' AND confdeltype='c')",'registry candidate account cascade unchanged')
    result=run(file=DRAFT/'tests/chat-turn-refund-evidence.sql')
    count=result.stderr.count('T40 PASS:')
    expect(count==72,'sequential S assertions: '+str(count))
    run(file=DRAFT/'tests/chat-turn-attempt-with-quota.sql')
    # Rollback with S-only closed/refunded data, and exact function/ACL/schema comparison.
    setup(305); run('SELECT t40.bump(305); SELECT t40.claim(305); SELECT t40.refund(305);')
    before=value("SELECT (t40.snapshot(305)-'r')::text;")
    run(file=DRAFT/'rollback/UNNUMBERED_chat_turn_refund_evidence_down.sql',transaction=True)
    expect(schema_snapshot()==baseline,'down restores exact 0255 plus E1-S definitions ACL columns constraints RLS')
    expect(value("SELECT (t40.snapshot(305)-'r')::text;")==before,'down preserves settled counters and ledger')
    check('NOT EXISTS(SELECT 1 FROM public.chat_turn_reservations WHERE turn_id=t40.id(305,2))','down removes unrepresentable closed row without synthetic answer')
    run(file=DRAFT/'tests/chat-turn-attempt-with-quota.sql')
    run(file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql',transaction=True)
    run(file=DRAFT/'tests/chat-turn-refund-evidence.sql')
    # Every mutation is installed in the dedicated clone; only P0040 assertion
    # failures kill mutants. Syntax/connectivity/timeout errors NEVER count.
    run('CREATE DATABASE '+MUTANT+' TEMPLATE '+DB+';',db='template1')
    for change, message in [
        (definition(source,'begin_chat_turn_attempt').replace('RETURN v_done IS NOT NULL;', 'RETURN false;'), 'unexpected installed definition'),
        ('DROP FUNCTION public.begin_chat_turn_attempt_with_quota(uuid,uuid,uuid,text,text);', 'apply E1-S first'),
        ('ALTER TABLE public.chat_turn_reservations ALTER COLUMN attempt1_delivered SET DEFAULT true;', 'expected three default-false booleans')]:
        result=run('BEGIN;\n'+change+'\n'+source+'\nCOMMIT;',db=MUTANT,check=False)
        expect(result.returncode!=0 and '55000: T40 S: '+message in result.stderr,'migration fails closed: '+message)
    mutations=[
        ('delivery', 'refund_chat_turn_after_output_swap', 'AND v_row.attempt1_delivered', 'AND true', 'undelivered answered refuses without writes'),
        ('closed', 'begin_chat_turn_attempt', 'AND NOT r.binding_closed', '', 'closed stays closed after newer row disappears'),
        ('bump_delete', 'bump_chat_usage_for_turn', "(r.state = 'counted' AND r.attempts = 0)", "(r.state = 'counted')", 'bump preserves attempted reservation'),
        ('purpose_write', 'refund_chat_turn_after_output_swap', 'RETURN v_count;', "UPDATE public.llm_proxy_purpose_daily SET count=count+1 WHERE user_id=v_user; RETURN v_count;", 'S purpose table unchanged')]
    for label,name,old,new,assertion in mutations:
        original=definition(source,name)
        expect(original.count(old)==1,'mutation anchor '+label)
        mutant=original.replace(old,new)
        if label=='purpose_write':
            try: static_check(source.replace(original,mutant))
            except ValueError as exc: expect(str(exc)=='T40 STATIC: unexpected write target','purpose mutation static pin killed')
            else: raise AssertionError('purpose static mutant survived')
        run(mutant,db=MUTANT)
        result=run(file=DRAFT/'tests/chat-turn-refund-evidence.sql',db=MUTANT,check=False)
        expect(result.returncode!=0 and 'P0040: T40 FAIL: '+assertion in result.stderr,'mutation killed '+label)
        run(original,db=MUTANT)
    races()
    print(json.dumps({'assertions':len(CHECKS),'sequential_assertions':count,'mutants_killed':4,'race_schedules':23,'logs':str(LOG)}),flush=True)


if __name__ == '__main__':
    print('T40 logs:',LOG,flush=True)
    try:
        main()
    finally:
        (LOG/'summary.json').write_text(json.dumps(CHECKS,indent=2),encoding='utf8')
