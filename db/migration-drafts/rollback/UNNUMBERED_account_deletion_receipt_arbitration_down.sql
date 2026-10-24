-- PRE-ACTIVATION ONLY. Never remove arbitration while any receipt exists.
-- Preserve both ledgers and every existing 0192/0225 function and trigger.
-- Once terminal is installed, its down only revokes admission. Retiring the
-- retained lifecycle and its lookup dependencies requires a separate migration.
BEGIN;
LOCK TABLE deletion_receipt_private.accepted_requests,
  public.account_deletion_tombstones IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $rollback_guard$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE = '25000', MESSAGE = 'receipt_arbitration_requires_read_committed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='deletion_receipt_private.accepted_requests'::regclass
      AND attname='admission_expires_at' AND NOT attisdropped)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='deletion_receipt_private.accepted_requests'::regclass
        AND conname='receipt_terminal_shape') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_arbitration_terminal_requires_retirement';
  END IF;
  IF EXISTS (SELECT 1 FROM deletion_receipt_private.accepted_requests) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'receipt_arbitration_rollback_requires_empty_ledger';
  END IF;
END;
$rollback_guard$;
DROP TRIGGER IF EXISTS receipt_admission_arbitration ON deletion_receipt_private.accepted_requests;
DROP TRIGGER IF EXISTS legacy_admission_arbitration ON public.account_deletion_tombstones;
DROP FUNCTION IF EXISTS deletion_receipt_private.guard_receipt_admission();
DROP FUNCTION IF EXISTS deletion_receipt_private.guard_legacy_admission();
COMMIT;
