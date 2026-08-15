-- 0105_fk_covering_indexes.sql
-- Covering indexes for the three FKs the linter reports as unindexed
-- (unindexed_foreign_keys, 2026-08-07 advisor run). Column lists were read
-- from pg_constraint on the live database, not assumed:
--
--   rewarded_ssv_txns_user_fk  (user_id)
--   wiki_links_from_fk         (user_id, from_page)   -- composite
--   wiki_links_to_fk           (user_id, to_page)     -- composite
--
-- wiki_links sits on the graph read path, and FK indexes also make user-row
-- deletes (delete-account) stop sequential-scanning these tables.
-- Existing (from_page, user_id)-ordered indexes do not satisfy the linter's
-- leading-column check, hence the FK-ordered ones here. Tables are tiny;
-- plain CREATE INDEX (transactional) over CONCURRENTLY is deliberate.

create index if not exists rewarded_ssv_txns_user_fk_idx
  on public.rewarded_ssv_txns (user_id);

create index if not exists wiki_links_from_fk_idx
  on public.wiki_links (user_id, from_page);

create index if not exists wiki_links_to_fk_idx
  on public.wiki_links (user_id, to_page);
