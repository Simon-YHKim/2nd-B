\set ON_ERROR_STOP on
-- Relay-owned, manually approved execution only. One user / <=500 rows / commit.
-- Supply -v after_user='' for a new sweep, then the returned next_user each call.
-- Advance EVEN WHEN cleared=0. At end_of_sweep, inventory and begin another sweep
-- if residuals remain; locked rows are not proof of completion. No infinite loop.
\if :{?after_user}
\else
  \echo 'required: -v after_user=<last UUID or empty string>'
  DO $$ BEGIN RAISE EXCEPTION 'after_user is required'; END $$;
\endif
BEGIN;
SET LOCAL search_path = '';
SET LOCAL row_security = off;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SELECT pg_catalog.set_config('embedding_cleanup.after_user', :'after_user', true);
CREATE TEMP TABLE embedding_cleanup_result(next_user uuid, cleared integer, end_of_sweep boolean) ON COMMIT DROP;
DO $cleanup$
DECLARE
  v_user uuid;
  v_after uuid := NULLIF(pg_catalog.current_setting('embedding_cleanup.after_user'), '')::uuid;
  v_count integer;
BEGIN
  IF current_user <> 'postgres'
     OR pg_catalog.row_security_active('public.users'::regclass)
     OR pg_catalog.row_security_active('public.records'::regclass) THEN
    RAISE EXCEPTION 'cleanup requires the reviewed administrative role';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.users'::regclass
        AND tgname = 'zz_records_embedding_consent_changed' AND NOT tgisinternal
        AND tgtype = 17 AND tgenabled = 'O' AND tgattr = ''::int2vector AND tgqual IS NULL
        AND tgfoid = 'public.clear_record_embeddings_on_privacy_change()'::regprocedure
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.users'::regclass
        AND tgname = 'zz_records_embedding_consent_cas' AND NOT tgisinternal
        AND tgtype = 23 AND tgenabled = 'O' AND tgattr = ''::int2vector AND tgqual IS NULL
        AND tgfoid = 'public.guard_records_embedding_consent()'::regprocedure
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.records'::regclass
        AND tgname = 'zz_records_embedding_write_guard' AND NOT tgisinternal
        AND tgtype = 23 AND tgenabled = 'O' AND tgattr = ''::int2vector
        AND pg_catalog.pg_get_triggerdef(oid) LIKE '%WHEN (((new.embedding IS NOT NULL) OR (new.embedding_model IS NOT NULL)))%'
        AND tgfoid = 'public.guard_record_embedding_write()'::regprocedure
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.records'::regclass
        AND tgname = 'zz_records_embedding_delete_guard' AND NOT tgisinternal
        AND tgtype = 19 AND tgenabled = 'O' AND tgattr = ''::int2vector
        AND pg_catalog.pg_get_triggerdef(oid) LIKE '%WHEN (((old.embedding IS NOT NULL) AND (old.embedding_model IS NOT NULL) AND (new.embedding IS NULL) AND (new.embedding_model IS NULL) AND (NOT (old.user_id IS DISTINCT FROM new.user_id))))%'
        AND tgfoid = 'public.guard_record_embedding_delete()'::regprocedure
     ) THEN
    RAISE EXCEPTION 'install and verify 0263 before cleanup';
  END IF;
  SELECT u.id INTO v_user FROM public.users AS u
   WHERE (v_after IS NULL OR u.id > v_after) AND EXISTS (
     SELECT 1 FROM public.records AS r WHERE r.user_id = u.id
       AND (r.embedding IS NOT NULL OR r.embedding_model IS NOT NULL)
       AND (NOT COALESCE((u.privacy_prefs -> 'records_embedding' = 'true'::jsonb)
         AND u.minor_tier = 'adult'
         AND u.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date, false)
         OR (r.embedding IS NULL) <> (r.embedding_model IS NULL))
   ) ORDER BY u.id LIMIT 1 FOR UPDATE OF u SKIP LOCKED;
  IF NOT FOUND THEN
    INSERT INTO pg_temp.embedding_cleanup_result VALUES(NULL, 0, true);
    RETURN;
  END IF;
  WITH picked AS (
    SELECT r.id FROM public.records AS r JOIN public.users AS u ON u.id = r.user_id
     WHERE u.id = v_user AND (r.embedding IS NOT NULL OR r.embedding_model IS NOT NULL)
       AND (NOT COALESCE((u.privacy_prefs -> 'records_embedding' = 'true'::jsonb)
         AND u.minor_tier = 'adult'
         AND u.birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date, false)
         OR (r.embedding IS NULL) <> (r.embedding_model IS NULL))
     ORDER BY r.id LIMIT 500 FOR UPDATE OF r SKIP LOCKED
  )
  UPDATE public.records AS r SET embedding = NULL, embedding_model = NULL
    FROM picked WHERE r.id = picked.id AND r.user_id = v_user;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- R2-06: an entirely locked user's zero-row batch still moves the cursor.
  INSERT INTO pg_temp.embedding_cleanup_result VALUES(v_user, v_count, false);
END;
$cleanup$;
SELECT pg_catalog.row_to_json(r) FROM pg_temp.embedding_cleanup_result AS r;
COMMIT;
