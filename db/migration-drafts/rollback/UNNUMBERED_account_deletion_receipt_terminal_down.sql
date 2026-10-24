-- Pre-activation rollback closes new admission/transition without destroying
-- evidence or removing arbitration. Lookup and expiry release remain available.
BEGIN;
LOCK TABLE deletion_receipt_private.accepted_requests,
  public.account_deletion_tombstones IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $rollback_guard$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'receipt_terminal_requires_read_committed';
  END IF;
  IF EXISTS (SELECT 1 FROM deletion_receipt_private.accepted_requests WHERE phase='executing') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='receipt_terminal_rollback_execution_unresolved';
  END IF;
END;
$rollback_guard$;
REVOKE ALL ON FUNCTION
  public.begin_account_deletion_receipt(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.begin_request(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.transition_request(uuid,uuid,uuid,text,timestamptz,boolean,boolean,boolean),
  deletion_receipt_private.purge_terminal_requests()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
