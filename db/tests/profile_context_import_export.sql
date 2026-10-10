-- G4-05: run after the 0239/0242 fixture in the disposable loopback harness.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^profile_import_test[a-z0-9_]*$'
    OR current_user !~ '^profile_import_[a-z0-9_]+$'
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'G4 export requires the disposable loopback fixture';
  END IF;
END $$;
CREATE TEMP TABLE g4export_checks(label text);
CREATE FUNCTION pg_temp.g4export_assert(ok boolean,label text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'G4 export assertion: %',label; END IF;
  INSERT INTO pg_temp.g4export_checks VALUES(label);
END $$;
CREATE FUNCTION pg_temp.g4export_denied(query text,label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE query;
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.g4export_assert(true,label);
    RETURN;
  END;
  RAISE EXCEPTION 'G4 export expected permission denied: %',label;
END $$;

-- Snapshot effective client permissions (including inherited PUBLIC grants),
-- the table ACL, RLS flags/policies and each column ACL before applying 0243.
CREATE TEMP TABLE g4export_client_acl AS
SELECT role_name,a.attname,privilege,
  has_column_privilege(role_name,a.attrelid,a.attnum,privilege) AS allowed
FROM pg_attribute a CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE a.attrelid='public.profile_context_imports'::regclass AND a.attnum>0 AND NOT a.attisdropped;
CREATE TEMP TABLE g4export_relation_before AS
SELECT relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.profile_context_imports'::regclass;
CREATE TEMP TABLE g4export_columns_before AS
SELECT attname,attacl FROM pg_attribute WHERE attrelid='public.profile_context_imports'::regclass AND attnum>0 AND NOT attisdropped;
CREATE TEMP TABLE g4export_policies_before AS SELECT * FROM pg_policies
WHERE schemaname='public' AND tablename='profile_context_imports';
SELECT pg_temp.g4export_assert(NOT has_any_column_privilege('service_role','public.profile_context_imports','SELECT'),
  '0239/0242 deny every service column before 0243');

-- Two owners, a timestamp tie, and a withdrawn row. Only synthetic data.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('26101043-0000-4000-8000-000000000001','g4export-owner@example.invalid',now()),
('26101043-0000-4000-8000-000000000002','g4export-other@example.invalid',now());
INSERT INTO public.users(id,email,birth_date) SELECT id,email,'1990-01-01'::date FROM auth.users
WHERE id IN ('26101043-0000-4000-8000-000000000001','26101043-0000-4000-8000-000000000002');
INSERT INTO public.profile_context_imports(id,user_id,request_id,request_digest,status,item_count,profile_change_count,
  document,profile_restored,created_at,withdrawn_at)
SELECT ('26101043-0000-4000-8000-00000000001'||n)::uuid,
  CASE WHEN n=4 THEN '26101043-0000-4000-8000-000000000002'::uuid ELSE '26101043-0000-4000-8000-000000000001'::uuid END,
  gen_random_uuid(),'synthetic-internal-digest',CASE WHEN n=3 THEN 'withdrawn' ELSE 'active' END,2,1,
  CASE WHEN n=3 THEN NULL ELSE '{}'::jsonb END,n=3,'2026-10-10T00:00:00Z',
  CASE WHEN n=3 THEN '2026-10-10T01:00:00Z'::timestamptz ELSE NULL END
FROM generate_series(1,4) n;

\ir ../migrations/0243_profile_context_import_export_grant.sql
SELECT pg_temp.g4export_assert(NOT has_table_privilege('service_role','public.profile_context_imports','SELECT'),
  'no table-wide SELECT');
SELECT pg_temp.g4export_assert(NOT EXISTS (
  SELECT 1 FROM pg_temp.g4export_client_acl b JOIN pg_attribute a ON a.attname=b.attname
  WHERE a.attrelid='public.profile_context_imports'::regclass
    AND has_column_privilege(b.role_name,a.attrelid,a.attnum,b.privilege) IS DISTINCT FROM b.allowed
), 'authenticated and anon effective column ACL unchanged');
SELECT pg_temp.g4export_assert((SELECT ROW(relacl,relrowsecurity,relforcerowsecurity) FROM pg_class
  WHERE oid='public.profile_context_imports'::regclass) IS NOT DISTINCT FROM
  (SELECT ROW(relacl,relrowsecurity,relforcerowsecurity) FROM pg_temp.g4export_relation_before),
  'table ACL and forced RLS unchanged');
SELECT pg_temp.g4export_assert(NOT EXISTS (
  (SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='profile_context_imports'
    EXCEPT SELECT * FROM pg_temp.g4export_policies_before)
  UNION ALL
  (SELECT * FROM pg_temp.g4export_policies_before EXCEPT SELECT * FROM pg_policies
    WHERE schemaname='public' AND tablename='profile_context_imports')
), 'owner policies unchanged');

SET LOCAL ROLE service_role;
DO $$ DECLARE col text; BEGIN
  FOREACH col IN ARRAY ARRAY['id','user_id','created_at','item_count','profile_change_count','status','withdrawn_at','profile_restored'] LOOP
    EXECUTE format('SELECT %I FROM public.profile_context_imports LIMIT 1',col);
    PERFORM pg_temp.g4export_assert(true,'service reads '||col);
  END LOOP;
  FOREACH col IN ARRAY ARRAY['request_digest','request_id','document','confirmed_ids','profile_before',
    'profile_patch','profile_predecessors','field_undo','applied_revision','source_id'] LOOP
    PERFORM pg_temp.g4export_denied(format('SELECT %I FROM public.profile_context_imports LIMIT 1',col),'service denied '||col);
  END LOOP;
END $$;
SELECT pg_temp.g4export_denied('SELECT * FROM public.profile_context_imports','wildcard denied');
SELECT pg_temp.g4export_denied('UPDATE public.profile_context_imports SET status=status','service UPDATE denied');
SELECT pg_temp.g4export_denied('DELETE FROM public.profile_context_imports WHERE false','service DELETE denied');
SELECT pg_temp.g4export_assert((SELECT count(*)=3 FROM public.profile_context_imports
  WHERE user_id='26101043-0000-4000-8000-000000000001'), 'service exact count works with column grants');
SELECT pg_temp.g4export_assert((SELECT count(*)=2 FROM (
  SELECT id,user_id,created_at,item_count,profile_change_count,status,withdrawn_at,profile_restored
  FROM public.profile_context_imports WHERE user_id='26101043-0000-4000-8000-000000000001'
  ORDER BY created_at,id LIMIT 2 OFFSET 0
) first_page), 'combined export projection and pagination work with column grants');
SELECT pg_temp.g4export_assert((SELECT array_agg(id ORDER BY created_at,id)=ARRAY[
  '26101043-0000-4000-8000-000000000011'::uuid,'26101043-0000-4000-8000-000000000012'::uuid,
  '26101043-0000-4000-8000-000000000013'::uuid]
  FROM public.profile_context_imports WHERE user_id='26101043-0000-4000-8000-000000000001'),
  'service owner predicate with timestamp tie and withdrawn history');
SELECT pg_temp.g4export_assert((SELECT status='withdrawn' AND profile_restored AND withdrawn_at IS NOT NULL
  AND item_count=2 AND profile_change_count=1 FROM public.profile_context_imports
  WHERE id='26101043-0000-4000-8000-000000000013'), 'withdrawn counts and restoration flag exported');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='26101043-0000-4000-8000-000000000001';
SELECT pg_temp.g4export_assert((SELECT count(*)=3 FROM public.profile_context_imports), 'authenticated owner history unchanged');
SELECT pg_temp.g4export_assert((SELECT count(*)=0 FROM public.profile_context_imports
  WHERE user_id='26101043-0000-4000-8000-000000000002'), 'authenticated other owner remains hidden');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.g4export_denied('SELECT id FROM public.profile_context_imports','anon still denied');
RESET ROLE;

\ir ../migrations/rollback/0243_down.sql
SELECT pg_temp.g4export_assert(NOT has_any_column_privilege('service_role','public.profile_context_imports','SELECT'),
  'rollback revokes every export column');
SELECT pg_temp.g4export_assert(NOT EXISTS (
  SELECT 1 FROM pg_temp.g4export_columns_before b JOIN pg_attribute a ON a.attname=b.attname
  WHERE a.attrelid='public.profile_context_imports'::regclass
    AND coalesce(a.attacl,'{}') IS DISTINCT FROM coalesce(b.attacl,'{}')
), 'rollback restores original column ACL');
SELECT pg_temp.g4export_assert((SELECT count(*)=4 FROM public.profile_context_imports
  WHERE user_id IN ('26101043-0000-4000-8000-000000000001','26101043-0000-4000-8000-000000000002')),
  'rollback retains all history');
SELECT 'G4 export SQL assertions: '||count(*) FROM pg_temp.g4export_checks;
ROLLBACK;
