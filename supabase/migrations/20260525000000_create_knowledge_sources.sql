-- ⚠️ SUPERSEDED / ORPHAN (2026-06-05). DO NOT RUN.
-- This is a divergent, older DDL for knowledge_sources. The CANONICAL schema is
-- `db/migrations/0007_knowledge_sources.sql` (+ 0009 RLS, 0013 extend, 0041 read
-- policy), which is what CI (.github/.../supabase-dry-run.yml globs db/migrations)
-- and the app code/types.gen.ts use. This file is NOT referenced by any runner.
-- It diverges: no added_by/verified_by columns, `age_range NOT NULL`, bare
-- `create table` (no IF NOT EXISTS). Running it via `supabase db push` would
-- conflict or provision a schema the app + RLS do not match. Kept only as history;
-- reconcile/delete once the supabase/migrations CLI path is settled (ops, careful).

-- knowledge_sources: curated, DOI-verified psychology research used by the
-- Advisor engine and life-audit interviews. Schema mirrors the spec in
-- docs/research/psychology-handoff.md ("Project Context" section).

create table public.knowledge_sources (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  authors           text[] not null default '{}',
  doi               text unique,
  url               text,
  framework         text not null,
  age_range         text not null check (age_range in (
                      'child','adolescent','young_adult','adult',
                      'midlife','elderly','lifespan'
                    )),
  locale            text not null check (locale in ('ko','en','both')),
  verified_at       timestamptz,
  summary_ko        text,
  summary_en        text,
  application_notes text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.knowledge_sources.framework is
  'Open vocabulary slug. Examples: big_five, sdt, via, attachment, erikson, levinson, emerging_adulthood, soc, cbt, growth_mindset, self_compassion, jeong, woori, chemyon.';
comment on column public.knowledge_sources.verified_at is
  'Null until a curator has personally opened the DOI and confirmed it resolves.';

create index knowledge_sources_framework_idx on public.knowledge_sources (framework);
create index knowledge_sources_age_range_idx on public.knowledge_sources (age_range);
create index knowledge_sources_locale_idx    on public.knowledge_sources (locale);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

alter table public.knowledge_sources enable row level security;

create policy "knowledge_sources_read_authenticated"
  on public.knowledge_sources
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies → writes require the service role key.
