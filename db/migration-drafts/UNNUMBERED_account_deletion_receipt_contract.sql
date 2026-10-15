-- INACTIVE DRAFT: service-only, accepted-only receipt contract. No executor,
-- public Edge endpoint, token issuer, retention job, or client is connected.
-- Reserve a migration number immediately before coordinator push/rollout.
-- The dedicated schema must never be added to the Data API exposed schemas.
CREATE SCHEMA IF NOT EXISTS deletion_receipt_private;
REVOKE ALL ON SCHEMA deletion_receipt_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA deletion_receipt_private TO service_role;

CREATE TABLE IF NOT EXISTS deletion_receipt_private.accepted_requests (
  operation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  receipt_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  key_version text NOT NULL CHECK (key_version ~ '^[A-Za-z0-9_-]{1,32}$'),
  lookup_hash bytea NOT NULL CHECK (pg_catalog.octet_length(lookup_hash) = 32),
  recovery_hash bytea NOT NULL CHECK (pg_catalog.octet_length(recovery_hash) = 32),
  accepted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  phase text NOT NULL DEFAULT 'accepted' CHECK (phase = 'accepted'),
  scope_version text NOT NULL DEFAULT 'account-delete-v1' CHECK (scope_version = 'account-delete-v1'),
  CHECK (lookup_hash <> recovery_hash),
  UNIQUE (owner_id, request_id)
);
-- Deliberately no Auth/profile FK: deleting either must not destroy the receipt.
-- No body, email, JWT, plaintext capability, IP, arbitrary error, or result count.
ALTER TABLE deletion_receipt_private.accepted_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_receipt_private.accepted_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE deletion_receipt_private.accepted_requests
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION deletion_receipt_private.begin_request(
  p_owner_id uuid, p_session_id uuid, p_issued_at timestamptz, p_request_id uuid,
  p_key_version text, p_lookup_hash bytea, p_recovery_hash bytea
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $begin_receipt$
DECLARE
  v_row deletion_receipt_private.accepted_requests%ROWTYPE;
  v_role text := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
BEGIN
  -- The service caller authenticates the user; client body owner/session/iat
  -- are not trusted. Recheck the exact live DB session below as defense in depth.
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_service_required';
  END IF;
  IF p_owner_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL
     OR p_issued_at IS NULL OR p_key_version IS NULL
     OR p_key_version !~ '^[A-Za-z0-9_-]{1,32}$'
     OR p_lookup_hash IS NULL OR pg_catalog.octet_length(p_lookup_hash) <> 32
     OR p_recovery_hash IS NULL OR pg_catalog.octet_length(p_recovery_hash) <> 32
     OR p_lookup_hash = p_recovery_hash THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt_invalid_input';
  END IF;

  -- Match 0192/0225 account -> user row order; never wait for account while
  -- holding a receipt row. This serializes same/different request IDs per owner.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text, 260913));
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_owner_unavailable';
  END IF;
  -- Reject stale requests after account/profile waits. The final session row
  -- lock below can also wait, so these facts must be checked again afterward.
  IF p_issued_at < pg_catalog.clock_timestamp() - interval '5 minutes'
     OR p_issued_at > pg_catalog.clock_timestamp() + interval '1 minute'
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_owner_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_fresh_session_required';
  END IF;
  PERFORM 1 FROM auth.sessions s WHERE s.id = p_session_id AND s.user_id = p_owner_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_fresh_session_required';
  END IF;
  -- R1 M1: session-row contention can age a valid iat or permit an Auth soft
  -- delete after the earlier check. Re-observe both AFTER the final lock wait.
  -- Keep account -> user -> session order; no new Auth row lock is acquired.
  IF p_issued_at < pg_catalog.clock_timestamp() - interval '5 minutes'
     OR p_issued_at > pg_catalog.clock_timestamp() + interval '1 minute'
     OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_owner_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_fresh_session_required';
  END IF;
  -- An existing legacy fence is not evidence of this new operation's claim.
  IF EXISTS (SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id = p_owner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_legacy_fence_unresolved';
  END IF;

  SELECT * INTO v_row FROM deletion_receipt_private.accepted_requests r WHERE r.owner_id = p_owner_id;
  IF FOUND THEN
    IF v_row.request_id <> p_request_id THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_request_in_progress';
    END IF;
    IF v_row.session_id <> p_session_id OR v_row.key_version <> p_key_version
       OR v_row.lookup_hash <> p_lookup_hash OR v_row.recovery_hash <> p_recovery_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt_request_binding_mismatch';
    END IF;
  ELSE
    INSERT INTO deletion_receipt_private.accepted_requests
      (owner_id, session_id, request_id, key_version, lookup_hash, recovery_hash)
    VALUES (p_owner_id, p_session_id, p_request_id, p_key_version, p_lookup_hash, p_recovery_hash)
    RETURNING * INTO v_row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('version', 1, 'receiptId', v_row.receipt_id,
    'state', 'accepted', 'acceptedAt', v_row.accepted_at, 'scopeVersion', v_row.scope_version,
    'expiresAt', NULL, 'observations', pg_catalog.jsonb_build_object(
      'auth', 'unknown', 'profile', 'unknown', 'raw', 'unknown', 'photos', 'unknown'));
END;
$begin_receipt$;

CREATE OR REPLACE FUNCTION deletion_receipt_private.lookup_request(
  p_receipt_id uuid, p_key_version text, p_lookup_hash bytea
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $lookup_receipt$
DECLARE
  v_row deletion_receipt_private.accepted_requests%ROWTYPE;
  v_role text := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'receipt_service_required';
  END IF;
  IF p_receipt_id IS NULL OR p_key_version IS NULL
     OR p_key_version !~ '^[A-Za-z0-9_-]{1,32}$'
     OR p_lookup_hash IS NULL OR pg_catalog.octet_length(p_lookup_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt_invalid_input';
  END IF;
  SELECT * INTO v_row FROM deletion_receipt_private.accepted_requests r
    WHERE r.receipt_id = p_receipt_id AND r.key_version = p_key_version AND r.lookup_hash = p_lookup_hash;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('version', 1, 'state', 'not_found');
  END IF;
  RETURN pg_catalog.jsonb_build_object('version', 1, 'receiptId', v_row.receipt_id,
    'state', 'accepted', 'acceptedAt', v_row.accepted_at, 'scopeVersion', v_row.scope_version,
    'expiresAt', NULL, 'observations', pg_catalog.jsonb_build_object(
      'auth', 'unknown', 'profile', 'unknown', 'raw', 'unknown', 'photos', 'unknown'));
END;
$lookup_receipt$;

-- PostgREST-compatible service-only facades. Privilege elevation stays private.
CREATE OR REPLACE FUNCTION public.begin_account_deletion_receipt(
  p_owner_id uuid, p_session_id uuid, p_issued_at timestamptz, p_request_id uuid,
  p_key_version text, p_lookup_hash bytea, p_recovery_hash bytea
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $facade$ SELECT deletion_receipt_private.begin_request(
  p_owner_id, p_session_id, p_issued_at, p_request_id, p_key_version, p_lookup_hash, p_recovery_hash); $facade$;

CREATE OR REPLACE FUNCTION public.lookup_account_deletion_receipt(
  p_receipt_id uuid, p_key_version text, p_lookup_hash bytea
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $facade$ SELECT deletion_receipt_private.lookup_request(p_receipt_id, p_key_version, p_lookup_hash); $facade$;

REVOKE ALL ON FUNCTION deletion_receipt_private.begin_request(uuid, uuid, timestamptz, uuid, text, bytea, bytea),
  deletion_receipt_private.lookup_request(uuid, text, bytea),
  public.begin_account_deletion_receipt(uuid, uuid, timestamptz, uuid, text, bytea, bytea),
  public.lookup_account_deletion_receipt(uuid, text, bytea) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletion_receipt_private.begin_request(uuid, uuid, timestamptz, uuid, text, bytea, bytea),
  deletion_receipt_private.lookup_request(uuid, text, bytea),
  public.begin_account_deletion_receipt(uuid, uuid, timestamptz, uuid, text, bytea, bytea),
  public.lookup_account_deletion_receipt(uuid, text, bytea) TO service_role;

COMMENT ON TABLE deletion_receipt_private.accepted_requests IS
  'Inactive accepted-only receipt draft. No executor, completion evidence, retention policy, or production activation.';
