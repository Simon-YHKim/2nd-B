\set ON_ERROR_STOP on
-- Run only on a fresh full-schema clone, before applying this draft.
-- psql -X -h 127.0.0.1 -U postgres -d account_export_grants_test_ci -f <this file>
-- The transaction rolls back fixtures, role setup, grants and rollback together.
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_database() !~ '^account_export_grants_test_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'disposable account export grants test database required';
  END IF;
END $$;

-- CI's vanilla role lacks Supabase's BYPASSRLS. Model it only inside this
-- rolled-back test transaction; the draft must not change any role attribute.
ALTER ROLE service_role BYPASSRLS;

CREATE TEMP TABLE export_columns (table_name text PRIMARY KEY, columns text[]);
INSERT INTO export_columns VALUES
  ('llm_consent_receipts', ARRAY['consent_record_id','user_id','contract_revision','service_action','recorded_at']),
  ('weather_consent_state', ARRAY['user_id','enabled','contract','locale','updated_at']),
  ('weather_access_events', ARRAY['id','user_id','event','recipient','contract','created_at']),
  ('dashboard_generation_settings', ARRAY['user_id','timezone','locale','last_active_at']);
GRANT SELECT ON export_columns TO service_role, authenticated, anon;

-- Expand ACLs so NULL and an empty ACL after REVOKE mean the same thing.
-- Cover every public column, not just the four target tables.
CREATE TEMP VIEW export_column_acl AS
SELECT c.oid AS relation_id, a.attnum, x.grantor, x.grantee, x.privilege_type, x.is_grantable
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN LATERAL aclexplode(a.attacl) x
WHERE n.nspname = 'public';
CREATE TEMP TABLE export_column_before AS TABLE export_column_acl;
CREATE TEMP TABLE export_column_expected AS
SELECT c.oid AS relation_id, a.attnum, c.relowner AS grantor,
       'service_role'::regrole::oid AS grantee, 'SELECT'::text AS privilege_type,
       false AS is_grantable
FROM export_columns e JOIN pg_class c ON c.oid = ('public.' || e.table_name)::regclass
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = ANY(e.columns);

-- Table/sequence grants, functions, policies, role attributes and memberships
-- must be identical before/up/down. Client effective rights are checked too.
CREATE TEMP VIEW export_unchanged AS
SELECT 'relation' AS kind, c.oid::text AS key,
       jsonb_build_array(c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity) AS value
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'function', p.oid::text, jsonb_build_array(p.proowner, p.proacl, p.prosecdef)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'policy', p.oid::text, to_jsonb(p) FROM pg_policy p
UNION ALL
SELECT 'role', r.oid::text, jsonb_build_array(r.rolsuper, r.rolinherit, r.rolcreaterole,
       r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls) FROM pg_roles r
UNION ALL
SELECT 'membership', m.roleid || ':' || m.member || ':' || m.grantor, to_jsonb(m) FROM pg_auth_members m
UNION ALL
SELECT 'client-column', r.name || ':' || c.oid || ':' || a.attnum || ':' || p.name,
       to_jsonb(has_column_privilege(r.name, c.oid, a.attnum, p.name))
FROM export_columns e JOIN pg_class c ON c.oid = ('public.' || e.table_name)::regclass
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN (VALUES ('authenticated'::text), ('anon'::text)) r(name)
CROSS JOIN (VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(name);
CREATE TEMP TABLE export_unchanged_before AS TABLE export_unchanged;

CREATE FUNCTION pg_temp.assert_export_acl(applied boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS ((TABLE export_unchanged EXCEPT TABLE export_unchanged_before)
             UNION ALL (TABLE export_unchanged_before EXCEPT TABLE export_unchanged)) THEN
    RAISE EXCEPTION 'export grants: unrelated ACL, client rights, roles or RLS changed';
  END IF;
  IF EXISTS (
    WITH expected AS (
      SELECT * FROM export_column_before
      UNION SELECT * FROM export_column_expected WHERE applied
    )
    (TABLE export_column_acl EXCEPT TABLE expected)
    UNION ALL (TABLE expected EXCEPT TABLE export_column_acl)
  ) THEN
    RAISE EXCEPTION 'export grants: column ACL differs from exact expected delta (applied=%)', applied;
  END IF;
END $$;

CREATE FUNCTION pg_temp.export_expect_denied(statement text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN RETURN;
  END;
  RAISE EXCEPTION 'export grants: forbidden statement succeeded for %: %', current_user, statement;
END $$;

DO $$ BEGIN
  IF (SELECT count(*) FROM export_column_expected) <> 20 THEN
    RAISE EXCEPTION 'export grants: all 20 expected columns must exist';
  END IF;
  IF EXISTS (SELECT 1 FROM export_columns e
             WHERE has_any_column_privilege('service_role', 'public.' || e.table_name, 'SELECT')) THEN
    RAISE EXCEPTION 'export grants: baseline already has service SELECT; use a fresh numbered clone';
  END IF;
  IF EXISTS (SELECT 1 FROM export_columns e JOIN pg_class c
               ON c.oid = ('public.' || e.table_name)::regclass WHERE NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'export grants: baseline RLS missing';
  END IF;
END $$;

-- Synthetic weather rows make the existing client owner policies observable.
-- Suppress signup side effects only while creating these two test users.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id, email) VALUES
  ('e2200000-0000-4000-8000-000000000001', 'export-owner@example.invalid'),
  ('e2200000-0000-4000-8000-000000000002', 'export-other@example.invalid');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users(id, email, birth_date, locale) VALUES
  ('e2200000-0000-4000-8000-000000000001', 'export-owner@example.invalid', '1990-01-01', 'en'),
  ('e2200000-0000-4000-8000-000000000002', 'export-other@example.invalid', '1990-01-01', 'en');
INSERT INTO public.weather_consent_state(user_id, contract, locale)
SELECT id, 'weather-v1-261007', 'en' FROM public.users
WHERE id IN ('e2200000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000002');
INSERT INTO public.weather_access_events(user_id, event)
SELECT user_id, 'grant' FROM public.weather_consent_state
WHERE user_id IN ('e2200000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000002');

-- Check clients before, after, and after rollback using the same executable probe.
CREATE FUNCTION pg_temp.export_client_probe() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE e record; actual integer;
BEGIN
  FOR e IN SELECT * FROM export_columns LOOP
    IF current_user = 'authenticated' AND e.table_name IN ('weather_consent_state','weather_access_events') THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IN (%L,%L)', e.table_name,
        'e2200000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000002') INTO actual;
      IF actual <> 1 THEN RAISE EXCEPTION 'export grants: client owner RLS changed: %', e.table_name; END IF;
    ELSE
      PERFORM pg_temp.export_expect_denied(format('SELECT user_id FROM public.%I', e.table_name));
    END IF;
    PERFORM pg_temp.export_expect_denied(format('INSERT INTO public.%I DEFAULT VALUES', e.table_name));
    PERFORM pg_temp.export_expect_denied(format('UPDATE public.%I SET user_id=user_id WHERE false', e.table_name));
    PERFORM pg_temp.export_expect_denied(format('DELETE FROM public.%I WHERE false', e.table_name));
  END LOOP;
END $$;
SET LOCAL request.jwt.claim.sub = 'e2200000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.export_client_probe();
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.export_client_probe();
RESET ROLE;

\ir ../UNNUMBERED_account_export_read_grants.sql
SELECT pg_temp.assert_export_acl(true);
\ir ../UNNUMBERED_account_export_read_grants.sql
SELECT pg_temp.assert_export_acl(true);

SET LOCAL ROLE service_role;
DO $$
DECLARE e record; forbidden record; actual integer;
BEGIN
  FOR e IN SELECT * FROM export_columns LOOP
    EXECUTE format('SELECT %s FROM public.%I', array_to_string(e.columns, ','), e.table_name);
    -- Even tables whose current columns are all exported must have no table grant.
    IF has_table_privilege(current_user, 'public.' || e.table_name, 'SELECT') THEN
      RAISE EXCEPTION 'export grants: table SELECT allows future columns: %', e.table_name;
    END IF;
    FOR forbidden IN SELECT attname FROM pg_attribute
      WHERE attrelid = ('public.' || e.table_name)::regclass
        AND attnum > 0 AND NOT attisdropped AND NOT (attname = ANY(e.columns)) LOOP
      PERFORM pg_temp.export_expect_denied(format('SELECT %I FROM public.%I', forbidden.attname, e.table_name));
    END LOOP;
    PERFORM pg_temp.export_expect_denied(format('INSERT INTO public.%I DEFAULT VALUES', e.table_name));
    PERFORM pg_temp.export_expect_denied(format('UPDATE public.%I SET user_id=user_id WHERE false', e.table_name));
    PERFORM pg_temp.export_expect_denied(format('DELETE FROM public.%I WHERE false', e.table_name));
    PERFORM pg_temp.export_expect_denied(format('TRUNCATE public.%I', e.table_name));
  END LOOP;
  SELECT count(*) INTO actual FROM public.weather_consent_state
    WHERE user_id IN ('e2200000-0000-4000-8000-000000000001', 'e2200000-0000-4000-8000-000000000002');
  IF actual <> 2 THEN RAISE EXCEPTION 'export grants: service SELECT did not read both fixture rows'; END IF;
  PERFORM pg_temp.export_expect_denied('SELECT nextval(''public.llm_consent_receipts_receipt_order_seq'')');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.export_client_probe();
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.export_client_probe();
RESET ROLE;

\ir ../rollback/UNNUMBERED_account_export_read_grants_down.sql
SELECT pg_temp.assert_export_acl(false);
\ir ../rollback/UNNUMBERED_account_export_read_grants_down.sql
SELECT pg_temp.assert_export_acl(false);
SET LOCAL ROLE service_role;
DO $$ DECLARE e record; BEGIN
  FOR e IN SELECT * FROM export_columns LOOP
    PERFORM pg_temp.export_expect_denied(format('SELECT %s FROM public.%I', array_to_string(e.columns, ','), e.table_name));
  END LOOP;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.export_client_probe();
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.export_client_probe();
RESET ROLE;

-- The same draft also works after the rollback, without widening its delta.
\ir ../UNNUMBERED_account_export_read_grants.sql
SELECT pg_temp.assert_export_acl(true);
\ir ../rollback/UNNUMBERED_account_export_read_grants_down.sql
SELECT pg_temp.assert_export_acl(false);
SELECT 'PASS account export grants: 20 columns, roles, writes, RLS, repeat apply and rollback';
ROLLBACK;
