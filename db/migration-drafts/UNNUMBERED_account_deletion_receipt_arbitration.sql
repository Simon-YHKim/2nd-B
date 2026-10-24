-- INACTIVE DRAFT. Apply after UNNUMBERED_account_deletion_receipt_contract.sql.
-- Admission arbitration only: no executor, fence adoption/release, dispatch,
-- terminal state, retention job, public endpoint, or app activation.
-- Before numbering/rollout, drain legacy HTTP requests and reconcile existing
-- ownerless tombstones. This cannot recall requests already sent to Auth/Storage.
-- Both admission paths use 0192's owner lock. Only READ COMMITTED may admit a
-- new row: a transaction snapshot taken before a lock wait could miss its winner.
LOCK TABLE deletion_receipt_private.accepted_requests,
  public.account_deletion_tombstones IN SHARE ROW EXCLUSIVE MODE NOWAIT;

DO $preflight$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25000', MESSAGE = 'receipt_arbitration_requires_read_committed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM deletion_receipt_private.accepted_requests r
    JOIN public.account_deletion_tombstones t ON t.user_id = r.owner_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_arbitration_reconciliation_required';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION deletion_receipt_private.guard_receipt_admission()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $receipt_guard$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25000', MESSAGE = 'receipt_admission_requires_read_committed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_owner_binding_immutable';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text, 260913));
  -- Separate statement AFTER the wait: observe a committed legacy fence.
  IF EXISTS (SELECT 1 FROM public.account_deletion_tombstones t WHERE t.user_id = NEW.owner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_legacy_fence_unresolved';
  END IF;
  RETURN NEW;
END;
$receipt_guard$;

CREATE OR REPLACE FUNCTION deletion_receipt_private.guard_legacy_admission()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off
AS $legacy_guard$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25000', MESSAGE = 'receipt_admission_requires_read_committed';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_owner_binding_immutable';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 260913));
  -- 0192 begin and its compatibility wrapper reach this BEFORE any durable
  -- fence is written. Raising aborts admission; no successful boolean escapes.
  IF EXISTS (SELECT 1 FROM deletion_receipt_private.accepted_requests r WHERE r.owner_id = NEW.user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_request_in_progress';
  END IF;
  RETURN NEW;
END;
$legacy_guard$;

REVOKE ALL ON FUNCTION deletion_receipt_private.guard_receipt_admission(),
  deletion_receipt_private.guard_legacy_admission() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS receipt_admission_arbitration ON deletion_receipt_private.accepted_requests;
CREATE TRIGGER receipt_admission_arbitration BEFORE INSERT OR UPDATE
  ON deletion_receipt_private.accepted_requests
  FOR EACH ROW EXECUTE FUNCTION deletion_receipt_private.guard_receipt_admission();
DROP TRIGGER IF EXISTS legacy_admission_arbitration ON public.account_deletion_tombstones;
CREATE TRIGGER legacy_admission_arbitration BEFORE INSERT OR UPDATE
  ON public.account_deletion_tombstones
  FOR EACH ROW EXECUTE FUNCTION deletion_receipt_private.guard_legacy_admission();
