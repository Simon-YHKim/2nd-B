-- 0108 -- One account per real mailbox.
--
-- users.email is citext UNIQUE, so case is already deduped. Sub-addressing is
-- not: simon@gmail.com / si.mon@gmail.com / simon+a@gmail.com are three distinct
-- citext values that all deliver to ONE inbox. This was not theoretical -- prod
-- held three profiles canonicalising to the same mailbox. Each one is a fresh
-- free tier: its own gemini_spend_daily row, its own usage_counters reward
-- ceiling, its own once-only XP grants.
--
-- Gmail is the only provider whose dots are documented as insignificant, so dot
-- folding is scoped to gmail.com / googlemail.com. Plus-tag stripping is applied
-- everywhere, which is the standard subaddressing convention (RFC 5233).

create or replace function public.email_canonical(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_email is null or btrim(p_email) = '' or position('@' in p_email) = 0
      then lower(btrim(coalesce(p_email, '')))
    when lower(split_part(btrim(p_email), '@', 2)) in ('gmail.com', 'googlemail.com')
      then replace(split_part(lower(split_part(btrim(p_email), '@', 1)), '+', 1), '.', '')
           || '@gmail.com'
    else split_part(lower(split_part(btrim(p_email), '@', 1)), '+', 1)
         || '@' || lower(split_part(btrim(p_email), '@', 2))
  end
$$;

comment on function public.email_canonical(text) is
  'Folds an address to the mailbox it actually reaches: lowercase, strip +tag, and strip dots for gmail/googlemail. IMMUTABLE so it can back a unique index.';

-- Backstop: even if an account is somehow created, it cannot hold a second
-- profile for a mailbox that already has one.
create unique index if not exists users_email_canon_uidx
  on public.users (public.email_canonical(email::text));

-- Primary gate: reject the duplicate at signup, before an auth account exists,
-- so the person gets an immediate error instead of a confirmed-but-profileless
-- account that strands on /complete-profile.
create or replace function public.block_alias_duplicate_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  v_canon text;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;  -- anonymous / phone-only sign-in: nothing to dedupe on
  END IF;

  v_canon := public.email_canonical(NEW.email);

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE public.email_canonical(u.email::text) = v_canon
  ) OR EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.deleted_at IS NULL
      AND a.id IS DISTINCT FROM NEW.id
      AND public.email_canonical(a.email) = v_canon
  ) THEN
    RAISE EXCEPTION
      'email_alias_already_registered: an account already exists for this mailbox (%)', v_canon
      USING ERRCODE = 'unique_violation',
            HINT = 'Sign in to the existing account or use password reset.';
  END IF;

  RETURN NEW;
END;
$$;

drop trigger if exists trg_block_alias_duplicate_signup on auth.users;
create trigger trg_block_alias_duplicate_signup
  before insert on auth.users
  for each row
  execute function public.block_alias_duplicate_signup();

-- definer-grants-lint: trigger-only block_alias_duplicate_signup runs solely as
-- a BEFORE INSERT trigger on auth.users (executed by supabase_auth_admin); it is
-- never exposed as an RPC, so there is no anon EXECUTE grant to revoke.
