-- Pre-activation rollback closes new admission/transition without destroying
-- evidence or removing arbitration. Lookup and expiry release remain available.
BEGIN;
LOCK TABLE deletion_receipt_private.accepted_requests,
  public.account_deletion_tombstones IN ACCESS EXCLUSIVE MODE NOWAIT;
REVOKE ALL ON FUNCTION
  public.begin_account_deletion_receipt(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.begin_request(uuid,uuid,timestamptz,uuid,text,bytea,bytea),
  deletion_receipt_private.transition_request(uuid,uuid,uuid,text,timestamptz,boolean,boolean,boolean),
  deletion_receipt_private.purge_terminal_requests()
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
