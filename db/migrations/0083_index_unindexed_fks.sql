-- 0083_index_unindexed_fks.sql
-- Wave-3 perf (get_advisors unindexed_foreign_keys): add covering indexes for
-- foreign keys that had none. An unindexed FK forces a sequential scan of the
-- child table on parent delete/update and on joins - which notably slows the
-- delete-account cascade and the wiki graph joins. All additive
-- (CREATE INDEX IF NOT EXISTS), no behavior change.
--
-- Each index is guarded by a to_regclass() table-existence check: a couple of the
-- flagged tables (persona_reasoning_trace, persona_relation) exist in prod but
-- have no committed migration file (pre-existing schema drift), so an unguarded
-- CREATE INDEX would fail when the CI applies migrations against a fresh DB. The
-- guard makes each index a no-op when its table is absent, and idempotent
-- (IF NOT EXISTS) when present.

DO $mig$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT * FROM (VALUES
      ('ingest_log_survivor_id_idx',              'public.ingest_log',              '(survivor_id)'),
      ('ops_routine_logs_source_sample_id_idx',   'public.ops_routine_logs',        '(source_sample_id)'),
      ('peer_observations_informant_consent_id_idx','public.peer_observations',     '(informant_consent_id)'),
      ('persona_reasoning_trace_user_id_idx',      'public.persona_reasoning_trace', '(user_id)'),
      ('persona_relation_user_id_idx',             'public.persona_relation',        '(user_id)'),
      ('records_self_context_id_idx',              'public.records',                 '(self_context_id)'),
      ('sources_dedup_of_idx',                     'public.sources',                 '(dedup_of)'),
      ('srs_reviews_card_id_idx',                  'public.srs_reviews',             '(card_id)'),
      ('wiki_links_from_page_user_idx',            'public.wiki_links',              '(from_page, user_id)'),
      ('wiki_links_to_page_user_idx',              'public.wiki_links',              '(to_page, user_id)'),
      ('wiki_pages_source_id_idx',                 'public.wiki_pages',              '(source_id)')
    ) AS t(idx_name, tbl, cols)
  LOOP
    IF to_regclass(idx.tbl) IS NOT NULL THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s %s', idx.idx_name, idx.tbl, idx.cols);
    END IF;
  END LOOP;
END $mig$;
