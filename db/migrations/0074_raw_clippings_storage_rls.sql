-- 0074_raw_clippings_storage_rls.sql
-- Version-control the raw-clippings bucket + its access boundary.
--
-- Until now the bucket and its Row Level Security lived ONLY as a manual Supabase
-- Dashboard step (documented in src/lib/wiki/storage.ts). So the app's most
-- PII-rich content -- the user's raw clipped markdown at
-- raw-clippings/<userId>/<slug>.md -- had its access boundary OUTSIDE
-- migrations, CI, and review: a bucket accidentally left public, or a policy
-- silently dropped, would go undetected (audit W14). This migration makes the
-- private bucket + the owner-scoped policies part of the schema so a broken
-- boundary fails loudly.
--
-- Path convention (src/lib/wiki/storage.ts rawClippingPath): the object name is
-- <userId>/<slug>.md, so the owner is the first path segment:
--   (storage.foldername(name))[1] = auth.uid()::text
-- The delete-account / export-account edge functions use the service_role, which
-- bypasses RLS, so these policies do not affect account erasure/export.

-- 1. Ensure the bucket exists and is private (idempotent; also repairs a bucket
--    that was accidentally created public).
insert into storage.buckets (id, name, public)
values ('raw-clippings', 'raw-clippings', false)
on conflict (id) do update set public = false;

-- 2. Owner-scoped RLS on storage.objects for this bucket. RLS is already enabled
--    on storage.objects by Supabase; these policies restrict every operation to
--    the user whose id is the first path segment.
drop policy if exists "raw_clippings_owner_select" on storage.objects;
create policy "raw_clippings_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'raw-clippings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "raw_clippings_owner_insert" on storage.objects;
create policy "raw_clippings_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'raw-clippings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "raw_clippings_owner_update" on storage.objects;
create policy "raw_clippings_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'raw-clippings'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'raw-clippings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "raw_clippings_owner_delete" on storage.objects;
create policy "raw_clippings_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'raw-clippings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
