-- INACTIVE DRAFT: T07 / Q-261013-48 (2026-10-13 19:43 and 20:29).
-- Numbering, Relay approval/application and policy publication are separate.
-- Before numbering, the coordinator must confirm production Auth OTP and
-- confirmation email expiry are both 600 seconds (supabase/config.toml agrees
-- locally; it does not prove production settings). See T07-unconfirmed-signup-cleanup.md.
-- Publication PR: do not merge before NNNN applied. Number -> Relay apply ->
-- verify pg_cron registration and first run -> update PRIVACY_POLICY_VERSION,
-- effective date and Article 12 history together in that separate PR.
-- Apply the entire file in one transaction, as postgres. No new data ledger.
-- Auth columns: https://github.com/supabase/auth/blob/master/internal/models/user.go
-- Signup copies Data into identity_data too: internal/api/signup.go.

DO $preflight$
DECLARE v_routine regprocedure;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'T07 requires postgres';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'auth.users'::regclass AND attname = 'recovery_sent_at'
      AND atttypid = 'timestamptz'::regtype AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'T07 requires auth.users.recovery_sent_at timestamptz';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'auth.users'::regclass AND attname = 'confirmation_sent_at'
      AND atttypid = 'timestamptz'::regtype AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'T07 requires auth.users.confirmation_sent_at timestamptz; no created_at fallback';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erasure_registry) THEN
    RAISE EXCEPTION 'T07 requires the populated erasure registry';
  END IF;
  -- Preserve the existing bodies/ACLs. Refuse an unexpected timezone override
  -- rather than silently replacing it; down restores the prior unset option.
  FOREACH v_routine IN ARRAY ARRAY[
    'public.enforce_user_age_tier()'::regprocedure,
    'public.complete_verified_email_signup()'::regprocedure,
    'public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, unnest(p.proconfig) c
      WHERE p.oid = v_routine AND lower(split_part(c, '=', 1)) = 'timezone'
        AND (c <> 'TimeZone=Asia/Seoul'
          OR pg_catalog.to_regprocedure('public.scrub_under14_signup_birth_date(jsonb)') IS NULL)) THEN
      RAISE EXCEPTION 'T07 unexpected signup timezone override';
    END IF;
  END LOOP;
END
$preflight$;

-- The existing server gates use current_date. Pin all signup paths and the
-- scrubber to the same KST transaction date, including transactions at midnight.
ALTER FUNCTION public.enforce_user_age_tier() SET timezone = 'Asia/Seoul';
ALTER FUNCTION public.complete_verified_email_signup() SET timezone = 'Asia/Seoul';
ALTER FUNCTION public.complete_profile_signup_consent(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean)
  SET timezone = 'Asia/Seoul';

-- Only the actual signup key is removed. Other metadata, including consent,
-- remains intact. Malformed/non-date values never abort an Auth transaction.
CREATE OR REPLACE FUNCTION public.scrub_under14_signup_birth_date(p_metadata jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
SET timezone = 'Asia/Seoul'
AS $$
DECLARE
  v_birth date;
  v_today date := current_date;
BEGIN
  IF pg_catalog.jsonb_typeof(p_metadata -> 'signup_birth_date') = 'string'
     AND p_metadata ->> 'signup_birth_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    BEGIN
      v_birth := (p_metadata ->> 'signup_birth_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN p_metadata;
    END;
    IF v_birth <= v_today AND v_birth > (v_today - interval '14 years')::date THEN
      RETURN p_metadata - 'signup_birth_date';
    END IF;
  END IF;
  RETURN p_metadata;
END;
$$;
ALTER FUNCTION public.scrub_under14_signup_birth_date(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.scrub_under14_signup_birth_date(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

-- Same-day removal on both Auth persistence paths, even when profile creation
-- is refused by 0149 or the public.users age gate. No account is deleted here.
CREATE OR REPLACE FUNCTION public.scrub_signup_birth_date_on_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_SCHEMA = 'auth' AND TG_TABLE_NAME = 'users' THEN
    NEW.raw_user_meta_data := public.scrub_under14_signup_birth_date(NEW.raw_user_meta_data);
  ELSIF TG_TABLE_SCHEMA = 'auth' AND TG_TABLE_NAME = 'identities' THEN
    NEW.identity_data := public.scrub_under14_signup_birth_date(NEW.identity_data);
  ELSE
    RAISE EXCEPTION 'T07 unsupported trigger target';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.scrub_signup_birth_date_on_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.scrub_signup_birth_date_on_write()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

DROP TRIGGER IF EXISTS trg_scrub_signup_birth_date ON auth.users;
CREATE TRIGGER trg_scrub_signup_birth_date
  BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.scrub_signup_birth_date_on_write();
DROP TRIGGER IF EXISTS trg_scrub_signup_birth_date ON auth.identities;
CREATE TRIGGER trg_scrub_signup_birth_date
  BEFORE INSERT OR UPDATE OF identity_data ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.scrub_signup_birth_date_on_write();

-- Existing residual DOB values are removed on the application day. This is
-- metadata-only; confirmed/OAuth/app accounts are never deleted by this sweep.
UPDATE auth.users
SET raw_user_meta_data = public.scrub_under14_signup_birth_date(raw_user_meta_data)
WHERE raw_user_meta_data IS DISTINCT FROM public.scrub_under14_signup_birth_date(raw_user_meta_data);
UPDATE auth.identities
SET identity_data = public.scrub_under14_signup_birth_date(identity_data)
WHERE identity_data IS DISTINCT FROM public.scrub_under14_signup_birth_date(identity_data);

CREATE OR REPLACE FUNCTION public.purge_unconfirmed_signups(p_limit integer DEFAULT 100)
RETURNS TABLE(deleted integer, skipped integer, failed integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
SET timezone = 'UTC'
AS $$
DECLARE
  v_id uuid;
  v_entry record;
  v_count integer;
  v_cutoff timestamptz := pg_catalog.statement_timestamp() - interval '600 seconds' - interval '22 hours';
  v_filter text := $filter$
    a.email_confirmed_at IS NULL
    AND a.confirmation_sent_at IS NOT NULL AND a.confirmation_sent_at <= $1
    AND (a.recovery_sent_at IS NULL OR a.recovery_sent_at <= $1)
    AND a.deleted_at IS NULL AND a.invited_at IS NULL
    AND a.last_sign_in_at IS NULL AND a.phone_confirmed_at IS NULL
    AND NULLIF(a.phone, '') IS NULL AND NULLIF(a.email, '') IS NOT NULL
    AND a.is_sso_user IS FALSE AND a.is_anonymous IS FALSE
    AND a.raw_app_meta_data ->> 'provider' = 'email'
    AND a.raw_app_meta_data -> 'providers' = '["email"]'::jsonb
    AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = a.id AND i.provider IS DISTINCT FROM 'email')
    AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE pg_catalog.to_jsonb(o) ->> 'owner' = a.id::text
         OR pg_catalog.to_jsonb(o) ->> 'owner_id' = a.id::text
         OR (o.bucket_id IN ('raw-clippings', 'record-photos')
             AND pg_catalog.split_part(o.name, '/', 1) = a.id::text)
    )
  $filter$;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'T07 batch limit must be 1..1000' USING ERRCODE = '22023';
  END IF;
  deleted := 0; skipped := 0; failed := 0;
  -- A second invocation must not work the same batch concurrently.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(261024, 7) THEN
    RAISE LOG 'T07 cleanup: deleted=0 skipped=0 failed=0 busy=true';
    RETURN NEXT; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erasure_registry) THEN
    RAISE EXCEPTION 'T07 requires the populated erasure registry';
  END IF;
  -- Every class excludes deletion, including retained and account_delete_only.
  -- Identifiers come from the private registry and are quoted, values bound.
  -- Missing tables/columns fail the entire invocation before any deletion.
  FOR v_entry IN SELECT table_name, owner_column FROM public.erasure_registry ORDER BY table_name LOOP
    v_filter := v_filter || pg_catalog.format(
      ' AND NOT EXISTS (SELECT 1 FROM public.%I owned WHERE owned.%I = a.id)',
      v_entry.table_name, v_entry.owner_column);
  END LOOP;
  FOR v_id IN EXECUTE
    'SELECT a.id FROM auth.users a WHERE ' || v_filter ||
    ' ORDER BY a.confirmation_sent_at, a.id LIMIT $2 FOR UPDATE OF a SKIP LOCKED'
    USING v_cutoff, p_limit
  LOOP
    BEGIN
      -- New identities need the parent FK lock already held above. Lock existing
      -- identities too, so a provider update cannot race the final predicate.
      PERFORM 1 FROM auth.identities WHERE user_id = v_id FOR UPDATE NOWAIT;
      -- Re-read all exclusion conditions after locks; a concurrent confirmation
      -- or resend that won first must keep the account.
      EXECUTE 'DELETE FROM auth.users a WHERE a.id = $2 AND ' || v_filter
        USING v_cutoff, v_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      deleted := deleted + v_count;
      skipped := skipped + (1 - v_count);
    EXCEPTION WHEN OTHERS THEN
      -- One FK/trigger/lock failure must not undo other deletions. No identifiers,
      -- email, DOB or exception detail goes to cron logs. The row retries later.
      failed := failed + 1;
    END;
  END LOOP;
  -- pg_cron records the row count, not these returned column values. Emit only
  -- aggregate counts to the PostgreSQL execution log; never log row/error data.
  RAISE LOG 'T07 cleanup: deleted=% skipped=% failed=%', deleted, skipped, failed;
  IF failed > 0 THEN
    RAISE WARNING 'T07 cleanup: deleted=% skipped=% failed=%; retry next run', deleted, skipped, failed;
  END IF;
  RETURN NEXT;
END;
$$;
ALTER FUNCTION public.purge_unconfirmed_signups(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purge_unconfirmed_signups(integer)
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
-- postgres (owner) alone executes the hourly job. No PostgREST caller.

-- Same conditional dynamic registration pattern as 0180/0196/0225. CI does
-- not install pg_cron. Reapplication leaves one job owned by postgres.
DO $schedule$
DECLARE v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron')
     AND pg_catalog.to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    FOR v_job_id IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1'
      USING 'purge-unconfirmed-signups'
    LOOP
      EXECUTE 'SELECT cron.unschedule($1)' USING v_job_id;
    END LOOP;
    EXECUTE 'SELECT cron.schedule($1, $2, $3)' INTO v_job_id
      USING 'purge-unconfirmed-signups', '37 * * * *',
            'SELECT * FROM public.purge_unconfirmed_signups(100);';
  ELSE
    RAISE NOTICE 'T07: pg_cron unavailable; hourly cleanup is NOT scheduled';
  END IF;
END
$schedule$;
