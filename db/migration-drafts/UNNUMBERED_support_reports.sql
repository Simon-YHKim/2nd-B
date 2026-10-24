-- INACTIVE T53 / Z74 draft. Number -> Relay -> privacy publication -> client flag.
-- No Edge required: authenticated RPC derives the owner and serializes quotas.
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.support_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('inquiry','bug')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000 AND octet_length(body) <= 8000),
  metadata jsonb NOT NULL CHECK (
    jsonb_typeof(metadata) = 'object'
    AND metadata ?& ARRAY['app_version','screen_path','locale']
    AND metadata - ARRAY['app_version','screen_path','locale'] = '{}'::jsonb
    AND jsonb_typeof(metadata->'app_version') = 'string'
    AND (metadata->>'app_version') ~ '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$'
    AND jsonb_typeof(metadata->'screen_path') = 'string'
    AND metadata->>'screen_path' = '/support'
    AND jsonb_typeof(metadata->'locale') = 'string'
    AND metadata->>'locale' IN ('ko','en','es','pt','id')
  ),
  consent_version text NOT NULL CHECK (consent_version = 'support-v1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(user_id, request_id)
);
CREATE INDEX support_reports_owner_time ON public.support_reports(user_id, created_at);
CREATE INDEX support_reports_retention ON public.support_reports(created_at);
ALTER TABLE public.support_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_reports FORCE ROW LEVEL SECURITY;
-- RPC-only writes. No client table grants/policies: even the owner cannot read
-- or bypass quotas with a direct INSERT. Operator access uses service_role.
REVOKE ALL ON public.support_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.support_reports TO service_role;

CREATE FUNCTION public.submit_support_report(
  p_request_id uuid, p_kind text, p_body text, p_metadata jsonb, p_consent_version text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_now timestamptz;
  v_existing public.support_reports%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'support_auth_required' USING ERRCODE='42501'; END IF;
  -- Same owner row for every report. Waiters count committed rows after lock.
  -- Profile/account erasure takes this row too; the FK removes all reports.
  PERFORM 1 FROM public.users WHERE id = v_owner FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.account_deletion_tombstones WHERE user_id = v_owner) THEN
    RAISE EXCEPTION 'support_account_closed' USING ERRCODE='42501';
  END IF;
  v_now := clock_timestamp();
  IF p_request_id IS NULL OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000
    OR octet_length(p_body) > 8000 OR p_kind IS NULL OR p_kind NOT IN ('inquiry','bug')
    OR p_consent_version IS DISTINCT FROM 'support-v1' THEN
    RAISE EXCEPTION 'support_invalid_input' USING ERRCODE='22023';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
    OR NOT (p_metadata ?& ARRAY['app_version','screen_path','locale'])
    OR p_metadata - ARRAY['app_version','screen_path','locale'] <> '{}'::jsonb
    OR jsonb_typeof(p_metadata->'app_version') IS DISTINCT FROM 'string'
    OR (p_metadata->>'app_version') !~ '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$'
    OR jsonb_typeof(p_metadata->'screen_path') IS DISTINCT FROM 'string'
    OR p_metadata->>'screen_path' IS DISTINCT FROM '/support'
    OR jsonb_typeof(p_metadata->'locale') IS DISTINCT FROM 'string'
    OR (p_metadata->>'locale') NOT IN ('ko','en','es','pt','id') THEN
    RAISE EXCEPTION 'support_invalid_metadata' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_existing FROM public.support_reports WHERE user_id=v_owner AND request_id=p_request_id;
  IF FOUND THEN
    IF (v_existing.kind,v_existing.body,v_existing.metadata,v_existing.consent_version)
      IS DISTINCT FROM (p_kind,btrim(p_body),p_metadata,p_consent_version) THEN
      RAISE EXCEPTION 'support_request_conflict' USING ERRCODE='22023';
    END IF;
    RETURN v_existing.id;
  END IF;
  IF (SELECT count(*) FROM public.support_reports WHERE user_id=v_owner AND created_at > v_now-interval '1 minute') >= 2
    OR (SELECT count(*) FROM public.support_reports WHERE user_id=v_owner AND created_at > v_now-interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'support_rate_limited' USING ERRCODE='P0053';
  END IF;
  INSERT INTO public.support_reports(user_id,request_id,kind,body,metadata,consent_version,created_at)
    VALUES(v_owner,p_request_id,p_kind,btrim(p_body),p_metadata,p_consent_version,v_now) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_support_report(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_support_report(uuid,text,text,jsonb,text) TO authenticated;

CREATE FUNCTION public.purge_support_reports() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.support_reports WHERE created_at <= clock_timestamp()-interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.purge_support_reports() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_support_reports() TO service_role;
-- Fail closed if retention cannot be scheduled. The SQL fixture supplies a
-- catalog-compatible cron stub; Relay must verify a real enabled pg_cron job.
SELECT cron.schedule('purge-support-reports','17 * * * *','SELECT public.purge_support_reports()');

-- Draft overlay only. Promotion must also update db/erasure-registry.json and
-- its generated forward, and move the export classification into PENDING_EXPORT.
INSERT INTO public.erasure_registry(table_name,owner_column,class,delete_order,cascades_from,reason)
VALUES ('support_reports','user_id','account_delete_only',NULL,NULL,
  'Support submissions: account deletion cascades; content wipe keeps reports and quotas; hourly purge after 30 days.');
