-- INACTIVE DRAFT (c)+(d). Apply contract -> arbitration -> terminal, together.
-- No dispatch, legacy-fence adoption/release, public endpoint, scheduler or caller.
-- A start is an exclusive reservation, NOT permission to send destructive I/O.
-- Future execution must bind its own fence and drain writes before observation.
-- REQUIRED BEFORE O ACTIVATION: audited executing reconciliation (including
-- operator recovery for lost execution IDs) with proof no external I/O remains.
-- A timeout or direct ledger DELETE is not a recovery contract.
BEGIN;
LOCK TABLE deletion_receipt_private.accepted_requests,
  public.account_deletion_tombstones IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $$ BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'receipt_terminal_requires_read_committed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('deletion_receipt_private.accepted_requests'::regclass, 'receipt_admission_arbitration',
        pg_catalog.to_regprocedure('deletion_receipt_private.guard_receipt_admission()')),
      ('public.account_deletion_tombstones'::regclass, 'legacy_admission_arbitration',
        pg_catalog.to_regprocedure('deletion_receipt_private.guard_legacy_admission()'))
    ) AS required(table_id, trigger_name, function_id)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=required.table_id AND t.tgname=required.trigger_name
        AND t.tgfoid=required.function_id AND t.tgtype=23
        AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal
        AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''::pg_catalog.int2vector)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_terminal_requires_arbitration';
  END IF;
END $$;
ALTER TABLE deletion_receipt_private.accepted_requests
  DROP CONSTRAINT IF EXISTS accepted_requests_phase_check,
  DROP CONSTRAINT IF EXISTS accepted_requests_owner_id_key,
  ADD COLUMN IF NOT EXISTS admission_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_id uuid,
  ADD COLUMN IF NOT EXISTS execution_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS observations jsonb NOT NULL DEFAULT
    '{"auth":"unknown","profile":"unknown","raw":"unknown","photos":"unknown"}'::jsonb;
-- The old admission trigger permits this backfill only without a legacy fence.
UPDATE deletion_receipt_private.accepted_requests
  SET admission_expires_at = accepted_at + interval '10 minutes' WHERE admission_expires_at IS NULL;
ALTER TABLE deletion_receipt_private.accepted_requests
  ALTER COLUMN admission_expires_at SET DEFAULT (pg_catalog.clock_timestamp() + interval '10 minutes'),
  ALTER COLUMN admission_expires_at SET NOT NULL;
ALTER TABLE deletion_receipt_private.accepted_requests DROP CONSTRAINT IF EXISTS receipt_terminal_shape;
ALTER TABLE deletion_receipt_private.accepted_requests ADD CONSTRAINT receipt_terminal_shape CHECK (
  phase IN ('accepted','executing','completed','failed','abandoned')
  AND admission_expires_at > accepted_at
  AND (execution_id IS NULL) = (execution_started_at IS NULL)
  AND (execution_started_at IS NULL OR execution_started_at >= accepted_at)
  AND ((phase IN ('accepted','executing') AND finished_at IS NULL AND receipt_expires_at IS NULL)
    OR (phase IN ('completed','failed','abandoned') AND finished_at IS NOT NULL AND receipt_expires_at IS NOT NULL AND finished_at >= accepted_at
      AND receipt_expires_at = finished_at + CASE WHEN phase='completed' THEN interval '365 days' ELSE interval '30 days' END))
  AND (phase <> 'accepted' OR execution_id IS NULL)
  AND (phase NOT IN ('executing','completed') OR execution_id IS NOT NULL)
  AND (phase NOT IN ('failed','abandoned') OR execution_id IS NULL)
  AND observations IN (
    '{"auth":"unknown","profile":"unknown","raw":"unknown","photos":"unknown"}'::jsonb,
    '{"auth":"absent","profile":"absent","raw":"empty","photos":"empty"}'::jsonb)
  AND ((phase='completed' AND observed_at IS NOT NULL AND observed_at >= execution_started_at AND observed_at <= finished_at
      AND observations='{"auth":"absent","profile":"absent","raw":"empty","photos":"empty"}'::jsonb)
    OR (phase<>'completed' AND observed_at IS NULL AND
      observations='{"auth":"unknown","profile":"unknown","raw":"unknown","photos":"unknown"}'::jsonb))
);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_one_active_owner
  ON deletion_receipt_private.accepted_requests(owner_id) WHERE phase IN ('accepted','executing');

CREATE OR REPLACE FUNCTION deletion_receipt_private.receipt_response(r deletion_receipt_private.accepted_requests)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object('version',1,'receiptId',r.receipt_id,'state',r.phase,
    'acceptedAt',r.accepted_at,'scopeVersion',r.scope_version,'expiresAt',r.receipt_expires_at,
    'observations',r.observations);
$$;

CREATE OR REPLACE FUNCTION deletion_receipt_private.expire_unstarted(p_owner_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE v_now timestamptz;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'receipt_terminal_requires_read_committed';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text,260913));
  v_now := pg_catalog.clock_timestamp();
  -- An unstarted reservation ended at its admission deadline, not at this visit.
  UPDATE deletion_receipt_private.accepted_requests SET phase='abandoned', finished_at=admission_expires_at,
    receipt_expires_at=admission_expires_at + interval '30 days'
    WHERE owner_id=p_owner_id AND phase='accepted' AND execution_id IS NULL AND admission_expires_at <= v_now;
END;
$$;

CREATE OR REPLACE FUNCTION deletion_receipt_private.guard_receipt_admission()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='25000', MESSAGE='receipt_admission_requires_read_committed';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.owner_id,NEW.operation_id,NEW.receipt_id,NEW.session_id,NEW.request_id,NEW.key_version,
        NEW.lookup_hash,NEW.recovery_hash,NEW.accepted_at,NEW.admission_expires_at,NEW.scope_version)
      IS DISTINCT FROM
       (OLD.owner_id,OLD.operation_id,OLD.receipt_id,OLD.session_id,OLD.request_id,OLD.key_version,
        OLD.lookup_hash,OLD.recovery_hash,OLD.accepted_at,OLD.admission_expires_at,OLD.scope_version) THEN
      RAISE EXCEPTION 'receipt_binding_immutable';
    END IF;
    IF OLD.phase IN ('completed','failed','abandoned') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'receipt_terminal_immutable';
    END IF;
    IF OLD.phase='executing' AND (NEW.phase NOT IN ('executing','completed') OR
      (NEW.execution_id,NEW.execution_started_at) IS DISTINCT FROM (OLD.execution_id,OLD.execution_started_at)) THEN
      RAISE EXCEPTION 'receipt_execution_unresolved';
    END IF;
    IF OLD.phase='accepted' AND NEW.phase NOT IN ('accepted','executing','failed','abandoned') THEN
      RAISE EXCEPTION 'receipt_start_required';
    END IF;
  ELSIF NEW.phase <> 'accepted' OR NEW.execution_id IS NOT NULL THEN
    RAISE EXCEPTION 'receipt_must_start_accepted';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text,260913));
  -- Terminal transitions do not adopt, modify or remove any legacy fence.
  IF NEW.phase IN ('accepted','executing') AND EXISTS
    (SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id=NEW.owner_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_legacy_fence_unresolved';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION deletion_receipt_private.guard_legacy_admission()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='25000', MESSAGE='receipt_admission_requires_read_committed';
  END IF;
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'receipt_owner_binding_immutable';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text,260913));
  PERFORM deletion_receipt_private.expire_unstarted(NEW.user_id);
  IF EXISTS(SELECT 1 FROM deletion_receipt_private.accepted_requests r
    WHERE r.owner_id=NEW.user_id AND r.phase IN ('accepted','executing')) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_request_in_progress';
  END IF;
  RETURN NEW;
END;
$$;
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

  PERFORM deletion_receipt_private.expire_unstarted(p_owner_id);
  SELECT * INTO v_row FROM deletion_receipt_private.accepted_requests r
    WHERE r.owner_id=p_owner_id AND r.request_id=p_request_id;
  IF FOUND THEN
    IF v_row.session_id <> p_session_id OR v_row.key_version <> p_key_version
       OR v_row.lookup_hash <> p_lookup_hash OR v_row.recovery_hash <> p_recovery_hash THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'receipt_request_binding_mismatch';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM deletion_receipt_private.accepted_requests r
      WHERE r.owner_id=p_owner_id AND r.phase IN ('accepted','executing')) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_request_in_progress';
    END IF;
    INSERT INTO deletion_receipt_private.accepted_requests
      (owner_id, session_id, request_id, key_version, lookup_hash, recovery_hash)
    VALUES (p_owner_id, p_session_id, p_request_id, p_key_version, p_lookup_hash, p_recovery_hash)
    RETURNING * INTO v_row;
  END IF;
  RETURN deletion_receipt_private.receipt_response(v_row);
END;
$begin_receipt$;
CREATE OR REPLACE FUNCTION deletion_receipt_private.lookup_request(
  p_receipt_id uuid, p_key_version text, p_lookup_hash bytea
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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
  PERFORM deletion_receipt_private.expire_unstarted(v_row.owner_id);
  SELECT * INTO v_row FROM deletion_receipt_private.accepted_requests WHERE receipt_id=p_receipt_id;
  IF NOT FOUND OR v_row.receipt_expires_at <= pg_catalog.clock_timestamp() THEN
    RETURN pg_catalog.jsonb_build_object('version',1,'state','not_found');
  END IF;
  RETURN deletion_receipt_private.receipt_response(v_row);
END;
$lookup_receipt$;

-- Trusted server-only transition boundary. Caller attests Storage API observations
-- and write quiescence for this exact execution; SQL independently checks Auth/profile.
-- O remains disconnected until the gateway, fence binding and drain gates are proven.
CREATE OR REPLACE FUNCTION deletion_receipt_private.transition_request(
  p_operation_id uuid, p_owner_id uuid, p_execution_id uuid, p_action text,
  p_observed_at timestamptz DEFAULT NULL, p_raw_empty boolean DEFAULT false,
  p_photos_empty boolean DEFAULT false, p_writes_drained boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
DECLARE
  r deletion_receipt_private.accepted_requests%ROWTYPE;
  v_now timestamptz;
  v_role text := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb ->> 'role');
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='receipt_service_required';
  END IF;
  IF p_operation_id IS NULL OR p_owner_id IS NULL OR p_action IS NULL
    OR p_action NOT IN ('start','completed','failed','abandoned') THEN
    RAISE EXCEPTION 'receipt_invalid_input';
  END IF;
  PERFORM deletion_receipt_private.expire_unstarted(p_owner_id);
  SELECT * INTO r FROM deletion_receipt_private.accepted_requests
    WHERE operation_id=p_operation_id AND owner_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_operation_not_found'; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF r.phase IN ('completed','failed','abandoned') THEN
    -- No replay can restart or revise a retained receipt. Expiry is also final.
    RETURN deletion_receipt_private.receipt_response(r);
  END IF;
  IF p_action='start' THEN
    IF p_execution_id IS NULL THEN RAISE EXCEPTION 'receipt_execution_required'; END IF;
    IF r.phase='executing' THEN
      IF r.execution_id IS DISTINCT FROM p_execution_id THEN RAISE EXCEPTION 'receipt_execution_mismatch'; END IF;
      RETURN deletion_receipt_private.receipt_response(r);
    END IF;
    -- Recheck after the row lock, not transaction-start time.
    IF r.admission_expires_at <= v_now THEN RAISE EXCEPTION 'receipt_admission_expired'; END IF;
    UPDATE deletion_receipt_private.accepted_requests SET phase='executing', execution_id=p_execution_id,
      execution_started_at=v_now WHERE operation_id=p_operation_id RETURNING * INTO r;
  ELSIF p_action IN ('failed','abandoned') THEN
    -- A server refusal/cancellation before reservation proves no dispatch.
    -- Unknown, timeout, HTTP error or a live profile after start never proves failure.
    IF r.phase <> 'accepted' OR r.execution_id IS NOT NULL THEN RAISE EXCEPTION 'receipt_execution_unresolved'; END IF;
    UPDATE deletion_receipt_private.accepted_requests SET phase=p_action, finished_at=v_now,
      receipt_expires_at=v_now + interval '30 days' WHERE operation_id=p_operation_id RETURNING * INTO r;
  ELSE
    IF r.phase <> 'executing' OR p_execution_id IS DISTINCT FROM r.execution_id THEN
      RAISE EXCEPTION 'receipt_execution_mismatch';
    END IF;
    IF p_observed_at IS NULL OR p_observed_at < r.execution_started_at OR p_observed_at > v_now
      OR p_raw_empty IS DISTINCT FROM true OR p_photos_empty IS DISTINCT FROM true
      OR p_writes_drained IS DISTINCT FROM true
      OR EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner_id)
      OR EXISTS(SELECT 1 FROM public.users WHERE id=p_owner_id) THEN
      RAISE EXCEPTION 'receipt_completion_unconfirmed';
    END IF;
    UPDATE deletion_receipt_private.accepted_requests SET phase='completed', observed_at=p_observed_at,
      observations='{"auth":"absent","profile":"absent","raw":"empty","photos":"empty"}'::jsonb,
      finished_at=v_now, receipt_expires_at=v_now + interval '365 days'
      WHERE operation_id=p_operation_id RETURNING * INTO r;
  END IF;
  RETURN deletion_receipt_private.receipt_response(r);
END;
$$;

-- No cron is installed. Expire unstarted rows even when their owner never returns.
CREATE OR REPLACE FUNCTION deletion_receipt_private.purge_terminal_requests()
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE v_count bigint; v_owner uuid;
BEGIN
  IF COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='receipt_service_required';
  END IF;
  -- Same owner-first lock order as start/lookup/legacy. Recheck after any wait;
  -- never take a receipt row lock before the advisory lock or expire executing.
  FOR v_owner IN SELECT owner_id FROM deletion_receipt_private.accepted_requests
    WHERE phase='accepted' AND execution_id IS NULL AND admission_expires_at <= pg_catalog.clock_timestamp()
    ORDER BY owner_id
  LOOP
    PERFORM deletion_receipt_private.expire_unstarted(v_owner);
  END LOOP;
  DELETE FROM deletion_receipt_private.accepted_requests
    WHERE phase IN ('completed','failed','abandoned') AND receipt_expires_at <= pg_catalog.clock_timestamp();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_account_deletion_receipt(
  p_receipt_id uuid, p_key_version text, p_lookup_hash bytea
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT deletion_receipt_private.lookup_request(p_receipt_id,p_key_version,p_lookup_hash); $$;

REVOKE ALL ON FUNCTION deletion_receipt_private.receipt_response(deletion_receipt_private.accepted_requests),
  deletion_receipt_private.expire_unstarted(uuid),
  deletion_receipt_private.guard_receipt_admission(), deletion_receipt_private.guard_legacy_admission(),
  deletion_receipt_private.transition_request(uuid,uuid,uuid,text,timestamptz,boolean,boolean,boolean),
  deletion_receipt_private.purge_terminal_requests(), public.lookup_account_deletion_receipt(uuid,text,bytea)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  deletion_receipt_private.transition_request(uuid,uuid,uuid,text,timestamptz,boolean,boolean,boolean),
  deletion_receipt_private.purge_terminal_requests(), public.lookup_account_deletion_receipt(uuid,text,bytea)
  TO service_role;
REVOKE ALL ON FUNCTION
  public.begin_account_deletion_receipt(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.begin_request(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.lookup_request(uuid,text,bytea) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.begin_account_deletion_receipt(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.begin_request(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.lookup_request(uuid,text,bytea) TO service_role;
COMMENT ON TABLE deletion_receipt_private.accepted_requests IS
  'Inactive receipt lifecycle. Retained terminal ledger; see account-deletion-receipt-data-policy.json. No runtime callers.';
COMMIT;
