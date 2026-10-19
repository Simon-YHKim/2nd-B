-- 0263_records_embedding_consent_guard.sql
-- Server-first; operational application is Relay-owned and pending approval.
-- Successful allowed -> disallowed user changes atomically clear both record
-- columns. Candidate writes lock/read the current user, including service_role.
-- Only READ COMMITTED is supported for withdrawal/non-NULL candidate writes.
-- Deadlocks/timeouts abort the whole transaction; no exception is swallowed.
-- Installation does NOT scan/clean existing rows. See docs/ops/records-embedding-consent-0263.md.
-- The current app's direct cleanup stays. App cutover is blocked until server
-- installation, residual=0, and the 100,000-row/production timeout gates pass.
-- Local PG16/pgvector, full replay, 2 CPU/768 MiB, synthetic 768-dim/HNSW:
-- 100,000-row withdrawal = 3140.204 ms; WAL = 437792776 bytes; guard calls = 0;
-- existing updated_at calls = 100001. 0/1k/10k = 6.471/26.504/223.935 ms.
-- One local sample, not a production bound. Proposed initial cap=50k, alert=40k;
-- cutover requires 5 production-scale samples <=min(request_timeout/3, timeout-5s)
-- and operational count alerts. See runbook; no app direct deletion removed here.
-- R2-02: an embedding-only UPDATE over an existing model retains that model.
-- A row-image trigger cannot distinguish omitted from explicitly repeated model;
-- provenance of legacy partial writes is not guaranteed. No model is invented.
-- PERMANENT COMPATIBILITY: after any app omits direct deletion, production DOWN
-- removing/disabling either trigger is forbidden, even after an app rollback.
-- Use a reviewed forward fix, or keep withdrawal and NULL every write candidate.
-- The DOWN file is for disposable local structure tests only; erased data is lost.
-- CLI owns the transaction; no top-level BEGIN/COMMIT here.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.clear_record_embeddings_on_privacy_change()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
  IF COALESCE(
    (OLD.privacy_prefs -> 'records_embedding' = 'true'::jsonb)
    AND OLD.minor_tier = 'adult'
    AND OLD.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date, false
  ) AND NOT COALESCE(
    (NEW.privacy_prefs -> 'records_embedding' = 'true'::jsonb)
    AND NEW.minor_tier = 'adult'
    AND NEW.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date, false
  ) THEN
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'records_embedding_requires_read_committed' USING ERRCODE = '25000';
    END IF;
    UPDATE public.records
       SET embedding = NULL, embedding_model = NULL
     WHERE user_id = NEW.id
       AND (embedding IS NOT NULL OR embedding_model IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_record_embedding_write()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.embedding IS NULL) <> (NEW.embedding_model IS NULL) THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    RETURN NEW;
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'records_embedding_requires_read_committed' USING ERRCODE = '25000';
  END IF;

  -- Filter ONLY by identity: evaluate permission on the row returned after the
  -- wait, not a pre-lock snapshot. KEY SHARE would not serialize prefs updates.
  SELECT u.* INTO v_user
    FROM public.users AS u
   WHERE u.id = NEW.user_id
   FOR SHARE;
  IF NOT FOUND OR NOT COALESCE(
    (v_user.privacy_prefs -> 'records_embedding' = 'true'::jsonb)
    AND v_user.minor_tier = 'adult'
    AND v_user.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date, false
  ) THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.clear_record_embeddings_on_privacy_change() OWNER TO postgres;
ALTER FUNCTION public.guard_record_embedding_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.clear_record_embeddings_on_privacy_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_record_embedding_write() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_records_embedding_consent_changed ON public.users;
CREATE TRIGGER zz_records_embedding_consent_changed
  AFTER UPDATE OF privacy_prefs, birth_date, minor_tier ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.clear_record_embeddings_on_privacy_change();

DROP TRIGGER IF EXISTS zz_records_embedding_write_guard ON public.records;
CREATE TRIGGER zz_records_embedding_write_guard
  BEFORE INSERT OR UPDATE ON public.records
  FOR EACH ROW
  WHEN (NEW.embedding IS NOT NULL OR NEW.embedding_model IS NOT NULL)
  EXECUTE FUNCTION public.guard_record_embedding_write();

-- Fail the installation transaction on a partial or unexpectedly privileged
-- installation. row_security=off alone cannot bypass FORCE ROW LEVEL SECURITY.
DO $verify$
DECLARE
  v_owner oid;
  v_fn record;
  v_role text;
  v_columns text[];
BEGIN
  SELECT oid INTO v_owner FROM pg_catalog.pg_roles
   WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '0263 postgres must bypass FORCE RLS';
  END IF;
  FOR v_fn IN
    SELECT p.* FROM pg_catalog.pg_proc AS p WHERE p.oid IN (
      'public.clear_record_embeddings_on_privacy_change()'::regprocedure,
      'public.guard_record_embedding_write()'::regprocedure
    )
  LOOP
    IF v_fn.proowner <> v_owner OR NOT v_fn.prosecdef OR v_fn.provolatile <> 'v'
       OR NOT (COALESCE(v_fn.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""', 'row_security=off']) THEN
      RAISE EXCEPTION '0263 invalid function owner/settings: %', v_fn.proname;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(v_fn.proacl, pg_catalog.acldefault('f', v_owner))) AS a
       WHERE a.grantee <> v_owner
    ) THEN
      RAISE EXCEPTION '0263 unexpected non-owner function ACL: %', v_fn.proname;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_fn.oid, 'EXECUTE') THEN
        RAISE EXCEPTION '0263 effective EXECUTE leaked: % %', v_role, v_fn.proname;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.users'::regclass AND relrowsecurity AND NOT relforcerowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.records'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION '0263 unexpected users/records RLS state';
  END IF;
  IF NOT pg_catalog.has_table_privilege('postgres', 'public.users', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('postgres', 'public.users', 'UPDATE')
     OR NOT pg_catalog.has_table_privilege('postgres', 'public.records', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('postgres', 'public.records', 'embedding', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('postgres', 'public.records', 'embedding_model', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.users', 'privacy_prefs', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.users', 'id', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.records', 'id', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.records', 'embedding_model', 'SELECT') THEN
    RAISE EXCEPTION '0263 required owner/client privileges missing';
  END IF;
  SELECT array_agg(a.attname::text ORDER BY a.attname) INTO v_columns
    FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = t.tgrelid AND a.attnum = ANY(t.tgattr)
   WHERE t.tgrelid = 'public.users'::regclass AND t.tgname = 'zz_records_embedding_consent_changed';
  IF v_columns IS DISTINCT FROM ARRAY['birth_date', 'minor_tier', 'privacy_prefs']
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.users'::regclass
        AND tgname = 'zz_records_embedding_consent_changed' AND NOT tgisinternal
        AND tgtype = 17 AND tgenabled = 'O' AND tgqual IS NULL
        AND tgfoid = 'public.clear_record_embeddings_on_privacy_change()'::regprocedure
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.records'::regclass
        AND tgname = 'zz_records_embedding_write_guard' AND NOT tgisinternal
        AND tgtype = 23 AND tgenabled = 'O' AND tgattr = ''::int2vector
        AND pg_catalog.pg_get_triggerdef(oid) LIKE '%WHEN (((new.embedding IS NOT NULL) OR (new.embedding_model IS NOT NULL)))%'
        AND tgfoid = 'public.guard_record_embedding_write()'::regprocedure
     ) THEN
    RAISE EXCEPTION '0263 trigger binding/columns/WHEN/enablement mismatch';
  END IF;
END;
$verify$;
