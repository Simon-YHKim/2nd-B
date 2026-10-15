-- Actual schema validation of the exact JSON candidate, without activating it.
BEGIN;
CREATE TEMP TABLE authority_erasure_candidate AS SELECT * FROM public.erasure_registry WITH NO DATA;
INSERT INTO authority_erasure_candidate(table_name,owner_column,class,reason)
SELECT key,value->>'owner',value->>'class',value->>'reason'
FROM jsonb_each((/* AUTHORITY_ERASURE_JSON */)->'tables');
DO $check$
DECLARE r record;
BEGIN
  IF (SELECT count(*) FROM authority_erasure_candidate)<>3 THEN RAISE EXCEPTION 'candidate cardinality'; END IF;
  FOR r IN SELECT * FROM authority_erasure_candidate LOOP
    IF r.class<>'retained' OR r.delete_order IS NOT NULL OR r.owner_column<>'owner_id' THEN
      RAISE EXCEPTION 'candidate retention class';
    END IF;
    IF EXISTS(SELECT 1 FROM public.erasure_registry e WHERE e.table_name=r.table_name) THEN
      RAISE EXCEPTION 'S1 must not install registry candidate';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=r.owner_column
      JOIN pg_constraint f ON f.conrelid=c.oid AND f.contype='f' AND f.conkey=ARRAY[a.attnum]
      WHERE n.nspname='public' AND c.relname=r.table_name AND c.relrowsecurity AND c.relforcerowsecurity
        AND a.atttypid='uuid'::regtype AND f.confrelid='auth.users'::regclass AND f.confdeltype='c') THEN
      RAISE EXCEPTION 'candidate actual owner/RLS/cascade mismatch';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.interview_work_contracts'::regclass
    AND contype='f' AND confrelid='public.interview_sessions'::regclass) THEN
    RAISE EXCEPTION 'work must survive session deletion';
  END IF;
END;
$check$;
ROLLBACK;
