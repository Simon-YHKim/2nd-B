-- 0107 — public.users had NO foreign key to auth.users, so deleting an auth
-- user left the profile row behind forever. Because users_email_key is UNIQUE
-- on citext email, that orphan permanently claims the address: the person can
-- never re-register (the signup trigger's ON CONFLICT DO NOTHING swallows the
-- collision, so they end up email-confirmed with no profile and no consent row,
-- routed to /complete-profile, which then fails on the same unique index).
--
-- Two such orphans existed in prod. They are backed up, not discarded, so this
-- migration is reversible.

create table if not exists public.users_orphan_backup_0107 (
  backed_up_at timestamptz not null default now(),
  reason       text        not null,
  row_data     jsonb       not null
);
comment on table public.users_orphan_backup_0107 is
  'Reversal data for migration 0107. public.users rows whose auth.users row was already gone. Restore with: insert into public.users select * from jsonb_populate_record(null::public.users, row_data);';

insert into public.users_orphan_backup_0107 (reason, row_data)
select 'no matching auth.users row before adding users_id_fkey', to_jsonb(u)
from public.users u
where not exists (select 1 from auth.users a where a.id = u.id);

delete from public.users u
where not exists (select 1 from auth.users a where a.id = u.id);

-- Structural guarantee: an auth deletion now takes the profile (and everything
-- cascading off it) with it, so this orphan class cannot recur.
alter table public.users
  add constraint users_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- Billing audit rows were the one user-scoped table with no FK at all. SET NULL
-- (not CASCADE) so revenue history survives an erasure request, matching the
-- existing treatment of revenue_events and ai_audit_log.
alter table public.paddle_webhook_events
  add constraint paddle_webhook_events_user_id_fkey
  foreign key (user_id) references public.users (id) on delete set null;

-- users_email_idx duplicated users_email_key (both plain btree on email); the
-- unique constraint's index already serves every lookup the plain one did.
drop index if exists public.users_email_idx;
