-- 0113: two review findings on the 0107/0108 hardening (Codex, PR #1187).
--
-- (1) users_orphan_backup_0107 stores full users rows (email, birth date,
--     subscription state) but was created without RLS, so default public-schema
--     grants exposed it to any authenticated PostgREST client. Lock it to
--     service_role only: enable RLS (no policies = deny) and revoke the
--     table-level grants outright.
alter table public.users_orphan_backup_0107 enable row level security;
revoke all on table public.users_orphan_backup_0107 from anon, authenticated, public;

-- (2) block_alias_duplicate_signup treated every non-deleted auth row as a
--     mailbox reservation, letting an UNCONFIRMED signup (attacker or abandoned
--     form) permanently squat a canonical mailbox and lock out its real owner.
--     Only confirmed accounts now reserve the mailbox; the users_email_canon_uidx
--     unique index still backstops the profile layer either way.
create or replace function public.block_alias_duplicate_signup()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_canon text;
begin
  if new.email is null then
    return new;
  end if;
  v_canon := public.email_canonical(new.email::text);
  if exists (
    select 1 from auth.users a
    where a.deleted_at is null
      and a.email_confirmed_at is not null
      and a.id is distinct from new.id
      and public.email_canonical(a.email) = v_canon
  ) or exists (
    select 1 from public.users u
    where u.id is distinct from new.id
      and public.email_canonical(u.email::text) = v_canon
  ) then
    raise exception 'an account already exists for this mailbox (alias variants count as the same mailbox)'
      using errcode = '23505';
  end if;
  return new;
end;
$fn$;
-- definer-grants-lint: trigger-only block_alias_duplicate_signup runs solely as
-- a BEFORE INSERT trigger on auth.users (executed by supabase_auth_admin); it is
-- never exposed as an RPC, so there is no anon EXECUTE grant to revoke.
