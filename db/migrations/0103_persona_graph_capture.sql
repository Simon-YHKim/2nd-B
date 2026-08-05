-- 0103_persona_graph_capture.sql
-- Capture the three persona-graph tables that exist in production but were never
-- written as a migration.
--
-- HOW THIS WAS FOUND: the `sql` CI job replays db/migrations into an empty
-- Postgres. It rejected 0102 at `ALTER POLICY ... ON public.persona_entity`,
-- because that table does not exist in a database built from migrations alone.
-- persona_entity, persona_reasoning_trace and persona_relation were applied by
-- hand against the live project, so the repository has never been able to
-- reproduce the schema it runs on. Anyone rebuilding from scratch - a new
-- environment, a restore drill, a preview branch - would silently lose the whole
-- persona graph.
--
-- EVERY DEFINITION BELOW IS READ FROM THE LIVE DATABASE. Columns, defaults,
-- nullability, check constraints, foreign keys, indexes (including the ivfflat
-- vector index and its lists=100), RLS state and policy expressions were dumped
-- from pg_catalog on 2026-08-04 and transcribed, not invented.
--
-- IT IS A NO-OP AGAINST PRODUCTION. Every statement is IF NOT EXISTS, or a
-- DROP ... IF EXISTS followed by a CREATE inside one transaction. Running it on
-- the live project changes nothing except normalising the three policies into the
-- same (select auth.uid()) form 0102 gives everything else.
--
-- TWO DELIBERATE DIFFERENCES FROM THE LIVE DEFINITIONS, both stated rather than
-- hidden:
--
--   1. user_id references public.users(id), not auth.users(id). The live tables
--      point at auth.users because they were created inside Supabase, where that
--      schema exists. All 99 other migrations reference public.users(id), and the
--      CI harness is a plain Postgres with no auth schema, so auth.users would
--      fail there. public.users.id IS the auth user id - users_self_select is
--      literally `id = auth.uid()` - so the constraint is equivalent.
--
--   2. Nothing else. In particular the policies stay `TO public`, which differs
--      from the `TO authenticated` used everywhere else in this schema. That is
--      worth tightening, but tightening is a behaviour decision and this file is
--      a capture. Mixing the two is how a "just recording what exists" migration
--      quietly becomes a change nobody reviewed. Raise it separately.

begin;

-- 0047 already installs this; repeated here so the file stands alone.
create extension if not exists vector;

-- persona_entity: nodes of the persona graph. embedding is vector(384), which is
-- NOT the 768 used by wiki_pages - a different embedding model. Kept as found.
create table if not exists public.persona_entity (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  label      text not null,
  sublabel   text,
  name       text not null,
  kind       text not null default 'context',
  embedding  vector(384),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint persona_entity_kind_check check (kind = any (array['context'::text, 'connection'::text]))
);

create index if not exists persona_entity_user_idx on public.persona_entity using btree (user_id);
create index if not exists persona_entity_vec_idx  on public.persona_entity using ivfflat (embedding vector_cosine_ops) with (lists = '100');

-- persona_reasoning_trace: why an entity is there. entity_id is ON DELETE SET
-- NULL, not CASCADE - a trace outlives the node it explains.
create table if not exists public.persona_reasoning_trace (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  entity_id  uuid references public.persona_entity(id) on delete set null,
  step       integer not null,
  source     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists persona_reasoning_trace_user_id_idx on public.persona_reasoning_trace using btree (user_id);
create index if not exists persona_trace_entity_idx            on public.persona_reasoning_trace using btree (entity_id);

-- persona_relation: edges. Both endpoints CASCADE, so deleting a node removes the
-- edges that referenced it rather than leaving them dangling.
create table if not exists public.persona_relation (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  src        uuid not null references public.persona_entity(id) on delete cascade,
  dst        uuid not null references public.persona_entity(id) on delete cascade,
  rel_type   text not null,
  weight     real not null default 1.0,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists persona_relation_user_id_idx on public.persona_relation using btree (user_id);
create index if not exists persona_relation_src_idx     on public.persona_relation using btree (src);
create index if not exists persona_relation_dst_idx     on public.persona_relation using btree (dst);

alter table public.persona_entity          enable row level security;
alter table public.persona_reasoning_trace enable row level security;
alter table public.persona_relation        enable row level security;

-- Owner-only, in the post-0102 normal form. DROP + CREATE inside this transaction
-- so re-running is idempotent; there is no instant where the table is unprotected
-- because the whole file is one transaction.
drop policy if exists persona_entity_owner on public.persona_entity;
create policy persona_entity_owner on public.persona_entity
  for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists persona_trace_owner on public.persona_reasoning_trace;
create policy persona_trace_owner on public.persona_reasoning_trace
  for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists persona_relation_owner on public.persona_relation;
create policy persona_relation_owner on public.persona_relation
  for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Post-condition: all three tables exist, all three have RLS on, all three have
-- exactly one policy. If a future edit drops one of those, this fails loudly here
-- instead of quietly in production.
do $check$
declare
  n_tables integer;
  n_rls    integer;
  n_pol    integer;
begin
  select count(*) into n_tables
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('persona_entity', 'persona_reasoning_trace', 'persona_relation');

  select count(*) into n_rls
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relrowsecurity
    and c.relname in ('persona_entity', 'persona_reasoning_trace', 'persona_relation');

  select count(*) into n_pol
  from pg_policies
  where schemaname = 'public'
    and tablename in ('persona_entity', 'persona_reasoning_trace', 'persona_relation');

  if n_tables <> 3 or n_rls <> 3 or n_pol <> 3 then
    raise exception
      '0103: expected 3 tables / 3 with RLS / 3 policies, got % / % / %',
      n_tables, n_rls, n_pol;
  end if;
end
$check$;

commit;
