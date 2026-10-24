-- INACTIVE DRAFT, T06 / Q-261013-79. Do not number or enable from this PR.
-- Contract: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
-- GoTrue c3348e8f1cb31454e9783e4eb9eab1e71ad9652f:
-- internal/hooks/hookserrors accepts http_code + message, NOT error.code.
-- HTTP 403 serializes as code="unknown", message="polascope_signup_refused".
-- Before User Created runs outside the user transaction; the PG hook transaction
-- commits BEFORE its JSON error is interpreted. Counters survive a refusal.
--
-- Activation is deliberately locked off. The official event has no trusted
-- device identity. IP limiting below is NOT a substitute for the device control
-- required by Legal. See docs/qa/T06-SIGNUP-HOOK.md for all activation blockers.
-- Apply the whole file in one transaction. No rejected email, DOB, input JSON,
-- or raw IP is persisted or explicitly logged here. Platform logging must also
-- be verified before activation; function code cannot redact upstream logs.
-- The 0113 function, trigger, and canonicalizer are never changed.

CREATE TABLE public.signup_hook_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  hash_key text NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text),
  budget_window timestamptz NOT NULL DEFAULT '-infinity',
  budget_count integer NOT NULL DEFAULT 0 CHECK (budget_count BETWEEN 0 AND 1001)
);
INSERT INTO public.signup_hook_policy (singleton) VALUES (true);

CREATE TABLE public.signup_hook_attempts (
  window_start timestamptz NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('ip', 'mailbox')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 1001),
  PRIMARY KEY (window_start, dimension, key_hash)
);
ALTER TABLE public.signup_hook_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_hook_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE public.signup_hook_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_hook_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signup_hook_policy, public.signup_hook_attempts
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;

CREATE FUNCTION public.prune_signup_hook_attempts()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.signup_hook_attempts
    WHERE window_start < date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2000-01-01 UTC')
      - interval '10 minutes';
$$;
REVOKE ALL ON FUNCTION public.prune_signup_hook_attempts()
  FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin;
-- Owner-only maintenance. A tested one-minute scheduler is an activation
-- prerequisite; request-time pruning alone would retain hashes while idle.

CREATE FUNCTION public.before_user_created_signup(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_enabled boolean;
  v_secret text;
  v_window timestamptz;
  v_crypto_schema name;
  v_address inet;
  v_ip text;
  v_email text;
  v_id uuid;
  v_canon text;
  v_hash bytea;
  v_count integer;
  v_budget integer;
BEGIN
  SELECT enabled, hash_key INTO v_enabled, v_secret
    FROM public.signup_hook_policy WHERE singleton FOR UPDATE;
  -- Installation alone cannot expose the new account-existence signal.
  IF v_enabled IS DISTINCT FROM true THEN RETURN '{}'::jsonb; END IF;
  -- Sample after the lock: a waiter must never rewind the global window.
  v_window := date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2000-01-01 UTC');

  PERFORM public.prune_signup_hook_attempts();

  -- Read only Auth-owned request IP and user id; no age or user_metadata branch.
  -- Malformed values return a fixed response instead of an uncaught cast error.
  BEGIN
    v_address := (event #>> '{metadata,ip_address}')::inet;
    -- IPv6 privacy/interface addresses in one /64 share a budget. IPv4 keeps
    -- its host address; IPv4-mapped IPv6 uses that same IPv4 bucket as well.
    IF family(v_address) = 6 AND v_address <<= inet '::ffff:0.0.0.0/96' THEN
      v_address := inet '0.0.0.0' + (v_address - inet '::ffff:0.0.0.0');
    END IF;
    v_ip := CASE WHEN family(v_address) = 6 THEN network(set_masklen(v_address, 64))::text
      ELSE host(v_address) END;
    v_id := (event #>> '{user,id}')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN '{"error":{"http_code":400,"message":"signup_request_invalid"}}'::jsonb;
  END;
  IF v_ip IS NULL OR v_id IS NULL THEN
    RETURN '{"error":{"http_code":400,"message":"signup_request_invalid"}}'::jsonb;
  END IF;
  SELECT n.nspname INTO v_crypto_schema FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto';
  -- pgcrypto's schema differs between vanilla PG and hosted Supabase. Only the
  -- catalog-owned identifier is interpolated; request values are bound parameters.
  EXECUTE format('SELECT %I.hmac($1, $2, ''sha256'')', v_crypto_schema)
    INTO v_hash USING 'ip:' || extract(epoch FROM v_window)::bigint::text || ':' || v_ip, v_secret;
  -- The singleton lock covers this read and all writes below. Already-limited
  -- sources must not spend the global budget or allocate another mailbox key.
  SELECT attempts INTO v_count FROM public.signup_hook_attempts
    WHERE window_start = v_window AND dimension = 'ip' AND key_hash = v_hash;
  IF v_count >= 10 THEN
    UPDATE public.signup_hook_attempts SET attempts = LEAST(attempts + 1, 1001)
      WHERE window_start = v_window AND dimension = 'ip' AND key_hash = v_hash;
    RETURN '{"error":{"http_code":429,"message":"signup_request_limited"}}'::jsonb;
  END IF;

  -- Only IP-eligible attempts spend budget, still BEFORE any key allocation.
  -- At most 1,000 eligible requests allocate two keys each in one window.
  UPDATE public.signup_hook_policy
    SET budget_count = CASE WHEN budget_window = v_window THEN LEAST(budget_count + 1, 1001) ELSE 1 END,
        budget_window = v_window
    WHERE singleton RETURNING budget_count INTO v_budget;
  IF v_budget > 1000 THEN
    RETURN '{"error":{"http_code":429,"message":"signup_request_limited"}}'::jsonb;
  END IF;

  INSERT INTO public.signup_hook_attempts AS a VALUES (v_window, 'ip', v_hash, 1)
    ON CONFLICT (window_start, dimension, key_hash)
    DO UPDATE SET attempts = LEAST(a.attempts + 1, 1001) RETURNING attempts INTO v_count;
  IF v_count > 10 THEN
    RETURN '{"error":{"http_code":429,"message":"signup_request_limited"}}'::jsonb;
  END IF;

  v_email := event #>> '{user,email}';
  -- Match 0113 exactly: NULL skips; an empty address still canonicalizes.
  IF v_email IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_canon := public.email_canonical(v_email);
  EXECUTE format('SELECT %I.hmac($1, $2, ''sha256'')', v_crypto_schema)
    INTO v_hash USING 'mailbox:' || extract(epoch FROM v_window)::bigint::text || ':' || v_canon, v_secret;
  INSERT INTO public.signup_hook_attempts AS a VALUES (v_window, 'mailbox', v_hash, 1)
    ON CONFLICT (window_start, dimension, key_hash)
    DO UPDATE SET attempts = LEAST(a.attempts + 1, 1001) RETURNING attempts INTO v_count;
  -- Legal's repeat-attempt record must drive a rule, including alias attempts
  -- spread over different IPs. Apply before existence lookup for every mailbox.
  IF v_count > 10 THEN
    RETURN '{"error":{"http_code":429,"message":"signup_request_limited"}}'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.deleted_at IS NULL
      AND a.email_confirmed_at IS NOT NULL
      AND a.id IS DISTINCT FROM v_id
      AND public.email_canonical(a.email) = v_canon
  ) OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id IS DISTINCT FROM v_id
      AND public.email_canonical(u.email::text) = v_canon
  ) THEN
    RETURN '{"error":{"http_code":403,"message":"polascope_signup_refused"}}'::jsonb;
  END IF;
  RETURN '{}'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION public.before_user_created_signup(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.before_user_created_signup(jsonb) TO supabase_auth_admin;
