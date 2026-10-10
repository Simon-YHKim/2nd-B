-- Forward repair: never restore withdrawn output or remove the withdrawal
-- triggers. No attempt/audit rows are deleted. Requires Simon GO.
-- Deploy the prior dashboard Edge first (0236 RPC signatures still work), then
-- revoke only these new entry points in a transaction. W1 remains enabled.
SET LOCAL lock_timeout = '10s';
REVOKE ALL ON FUNCTION public.dashboard_generation_audit_attempt(uuid,uuid,text,text,text,boolean),
  public.dashboard_generation_audit_result(uuid,uuid,text,text,integer,text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
-- Resume the new Edge only after regranting the two service_role EXECUTEs.
-- The old Edge retains its pre-0244 audit gap; this is an emergency code rollback,
-- not a resolution of G2-02/03. Prefer a reviewed forward Edge repair.
