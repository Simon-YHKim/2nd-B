-- 0112: block_self_tier_change never recognized service_role on the current
-- PostgREST stack. It checked ONLY the legacy per-claim GUC
-- request.jwt.claim.role, which modern PostgREST does not set (claims live in
-- the request.jwt.claims JSON GUC). Result: the paddle-webhook ->
-- apply_billing_event grant path raised 42501 and Paddle got 500s on the
-- FIRST real live purchase (2026-08-08, subscription.created retries).
-- transaction.completed passed only because it never touches users.*.
-- Found by the live E2E; applied to prod 2026-08-08 09:2x KST and verified:
-- the queued retry then granted cortex, and the later cancel revoked it.
--
-- Fix: derive the role from BOTH GUC shapes, and add an explicit
-- transaction-local escape hatch (app.billing_write='1') so trusted DEFINER
-- billing paths and operator sessions can be allowed deliberately -- same
-- pattern as award_xp's app.allow_xp_write (0019/0106 lineage).
create or replace function public.block_self_tier_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_xp_write boolean := current_setting('app.allow_xp_write', true) is not distinct from '1';
  v_billing_write boolean := current_setting('app.billing_write', true) is not distinct from '1';
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
begin
  if v_role = 'service_role' or v_billing_write then
    return new;
  end if;
  if new.subscription_tier is distinct from old.subscription_tier
     or new.subscription_expires_at is distinct from old.subscription_expires_at
     or new.subscription_provider is distinct from old.subscription_provider
     or new.subscription_event_at is distinct from old.subscription_event_at
     or new.judge_mode is distinct from old.judge_mode then
    raise exception 'protected user column may only be changed by service_role'
      using errcode = '42501';
  end if;
  if new.minor_tier is distinct from old.minor_tier
     and new.birth_date is not distinct from old.birth_date then
    raise exception 'minor_tier may only be changed by the age gate (via birth_date) or service_role'
      using errcode = '42501';
  end if;
  if not v_xp_write and (
       new.total_xp is distinct from old.total_xp
       or new.onboarding_quest_completed_at is distinct from old.onboarding_quest_completed_at
     ) then
    raise exception 'total_xp / onboarding_quest_completed_at may only be changed by award_xp'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
