-- 0083_index_unindexed_fks.sql
-- Wave-3 perf (get_advisors unindexed_foreign_keys): add covering indexes for
-- foreign keys that had none. An unindexed FK forces a sequential scan of the
-- child table on parent delete/update and on joins - which notably slows the
-- delete-account cascade and the wiki graph joins. All additive
-- (CREATE INDEX IF NOT EXISTS), no behavior change.

CREATE INDEX IF NOT EXISTS ingest_log_survivor_id_idx ON public.ingest_log (survivor_id);
CREATE INDEX IF NOT EXISTS ops_routine_logs_source_sample_id_idx ON public.ops_routine_logs (source_sample_id);
CREATE INDEX IF NOT EXISTS peer_observations_informant_consent_id_idx ON public.peer_observations (informant_consent_id);
CREATE INDEX IF NOT EXISTS persona_reasoning_trace_user_id_idx ON public.persona_reasoning_trace (user_id);
CREATE INDEX IF NOT EXISTS persona_relation_user_id_idx ON public.persona_relation (user_id);
CREATE INDEX IF NOT EXISTS records_self_context_id_idx ON public.records (self_context_id);
CREATE INDEX IF NOT EXISTS sources_dedup_of_idx ON public.sources (dedup_of);
CREATE INDEX IF NOT EXISTS srs_reviews_card_id_idx ON public.srs_reviews (card_id);
CREATE INDEX IF NOT EXISTS wiki_links_from_page_user_idx ON public.wiki_links (from_page, user_id);
CREATE INDEX IF NOT EXISTS wiki_links_to_page_user_idx ON public.wiki_links (to_page, user_id);
CREATE INDEX IF NOT EXISTS wiki_pages_source_id_idx ON public.wiki_pages (source_id);
