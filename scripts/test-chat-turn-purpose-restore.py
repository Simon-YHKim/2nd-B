#!/usr/bin/env python3
"""T40 F: real PostgreSQL, fixed loopback clones, bounded races and mutations.

Reuses S's transport/lock observer, never its main() or baseline mutations.
No dotenv, remote URL, database drop, package install or production connection.
"""
import importlib.util
import json
from pathlib import Path
import re
import sys

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
DRAFT = pg.DRAFT
UP = DRAFT/'UNNUMBERED_chat_turn_purpose_restore.sql'
DOWN = DRAFT/'rollback/UNNUMBERED_chat_turn_purpose_restore_down.sql'
TESTS = DRAFT/'tests/chat-turn-purpose-restore.sql'
E1 = (DRAFT/'UNNUMBERED_chat_turn_attempt_with_quota.sql').read_text(encoding='utf8')
S = (DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql').read_text(encoding='utf8')
SOURCE = UP.read_text(encoding='utf8')
DOWN_SOURCE = DOWN.read_text(encoding='utf8')
ADMIT = 'begin_chat_turn_attempt_with_quota'
BUMP = 'bump_chat_usage_for_turn'
REFUND = 'refund_chat_turn_after_output_swap'
STATIC_MUTANTS = []
SQL_MUTANTS = []


def source_contract(source=SOURCE, down=DOWN_SOURCE):
    """Removing explicitly marked additive F blocks must recover reviewed bytes."""
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
    ]:
        try:
            source_contract(source,down)
        except ValueError:
            STATIC_MUTANTS.append(label)
        else:
            raise AssertionError('F static mutant survived: '+label)
    pg.run('CREATE DATABASE '+pg.DB+' TEMPLATE postgres;', db='template1')
    pg.run(file=DRAFT/'UNNUMBERED_chat_turn_attempt_with_quota.sql',transaction=True)
    pg.run(file=DRAFT/'UNNUMBERED_chat_turn_refund_evidence.sql',transaction=True)
    baseline=pg.schema_snapshot()
    pg.run(file=DRAFT/'tests/chat-turn-refund-evidence-fixture.sql')
    pg.run('SELECT t40.setup(5100,1); SELECT t40.audit(5100); SELECT t40.claim(5100);')
    for _ in range(2): pg.run(file=UP,transaction=True)
    pg.check('SELECT quota_day IS NULL AND purpose_restored_day IS NULL FROM public.chat_turn_reservations WHERE turn_id=t40.id(5100,2)', 'F apply never backfills old receipts')
    pg.run(file=DRAFT/'tests/chat-turn-purpose-restore-fixture.sql')
    pg.run('CREATE DATABASE '+pg.MUTANT+' TEMPLATE '+pg.DB+';',db='template1')
    result=pg.run(file=TESTS)
    count=result.stderr.count('T40 PASS:')
    pg.expect(count >= 45, 'F sequential assertions: '+str(count))
    # S behavior and E1-S remain valid on the actual final installed F functions.
    pg.run(file=DRAFT/'tests/chat-turn-refund-evidence.sql')
    pg.run(file=DRAFT/'tests/chat-turn-attempt-with-quota.sql')
    # Exact S/E1 function/ACL restoration, with the explicitly retained cap state.
    pg.run('SELECT t40f.pair(5101); SELECT t40.refund(5101);')
    before=pg.value('SELECT t40.snapshot(5101);')
    pg.run(file=DOWN,transaction=True)
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
    pg.expect(pg.value('SELECT t40.snapshot(5101);')==before,'F down preserves every settled data value')
    pg.run(file=DRAFT/'tests/chat-turn-attempt-with-quota.sql')
    pg.run(file=DRAFT/'tests/chat-turn-refund-evidence.sql')
    pg.run("UPDATE public.chat_turn_reservations SET issued_at=clock_timestamp()-interval '3 days' WHERE turn_id=t40.id(5101,2); SELECT t40.bump(5101,t40f.today()+1);")
    pg.check('t40f.markers(5101)=1','F down bump retains cap')
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
    sql_mutant('green',REFUND,"a.safety_zone IN ('red', 'yellow')","a.safety_zone IN ('red', 'yellow', 'green')",'F green first prevents purpose restore')
    sql_mutant('pending_delivery',REFUND,'attempt.delivered AND a.user_id = v_user','true AND a.user_id = v_user','F audited but undelivered second prevents restore')
    sql_mutant('old_day_cap',REFUND,'v_row.quota_day = v_restore_day','v_row.quota_day IS NOT NULL','F previous-day refund does not spend today cap')
    sql_mutant('p_day_cleanup',BUMP,"(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date",'p_day','F malicious p_day cannot erase today marker')
    sql_mutant('marker_cleanup',BUMP,"AND (r.purpose_restored_day IS NULL OR r.purpose_restored_day <\n          (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date)",'AND true','F malicious p_day cannot erase today marker')
    sql_mutant('counted_day',ADMIT,'SET quota_day = v_quota_before','SET quota_day = counted_day','F attempt-zero reask records actual debit day')
    sql_mutant('missing_receipt',ADMIT,'IF v_registered THEN\n    UPDATE public.chat_turn_reservations SET quota_day', 'IF false THEN\n    UPDATE public.chat_turn_reservations SET quota_day','F first receipt is server today')
    sql_mutant('cap_collision_handler',REFUND,"IF v_hit IS DISTINCT FROM 'chat_turn_reservations_purpose_restore_day_key' THEN RAISE; END IF;",
               'RAISE;', 'F daily index conflict keeps chat transaction')
    result=pg.run('BEGIN; SELECT t40f.pair(7100); SELECT t40.refund(7100);\n'+DOWN_SOURCE+
                  "\nUPDATE public.chat_turn_reservations SET purpose_restored_day=NULL;\n"
                  "SELECT t40.check(t40f.markers(7100)=1,'F down must preserve cap marker'); ROLLBACK;",
                  db=pg.MUTANT,check=False)
    pg.expect(result.returncode!=0 and 'P0040: T40 FAIL: F down must preserve cap marker' in result.stderr,
              'F mutation killed down_cap_reset')
    SQL_MUTANTS.append('down_cap_reset')
    clock_boundary()
    clock_boundary(remove_guard=True)
    races()
    summary={'runner_assertions':len(pg.CHECKS),'sequential_assertions':count,
             'sql_mutants_killed':len(SQL_MUTANTS),'sql_mutants':SQL_MUTANTS,
             'static_mutants_killed':len(STATIC_MUTANTS),'static_mutants':STATIC_MUTANTS,
             'race_schedules':len(pg.RACE_SCHEDULES),'races':pg.RACE_SCHEDULES,
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
