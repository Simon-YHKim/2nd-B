-- Pre-activation rollback only: remove entrypoints, retain accepted metadata.
-- Once an endpoint/executor ships, rollback must preserve lookup and recovery;
-- this draft rollback must not be reused for that later deployment.
BEGIN;
DROP FUNCTION IF EXISTS public.begin_account_deletion_receipt(uuid, uuid, timestamptz, uuid, text, bytea, bytea);
DROP FUNCTION IF EXISTS public.lookup_account_deletion_receipt(uuid, text, bytea);
DROP FUNCTION IF EXISTS deletion_receipt_private.begin_request(uuid, uuid, timestamptz, uuid, text, bytea, bytea);
DROP FUNCTION IF EXISTS deletion_receipt_private.lookup_request(uuid, text, bytea);
REVOKE ALL ON SCHEMA deletion_receipt_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE deletion_receipt_private.accepted_requests FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
