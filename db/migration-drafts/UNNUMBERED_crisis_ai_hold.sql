-- D4 (2026-10-07 01:20): keep the person's record, skip later AI processing.
-- Standalone application is D4's server half: held-record vector cleanup and
-- AI-only views. 0225 and 0263 must already be applied. Known RED/interview-held
-- records are held immediately, including new writes from old apps; no dormant
-- switch. Reader/writer wiring and UI are separate PRs, not a full D4 rollout.
-- No screen code changes; held records leave vector search/related results.
-- No raw text scan, external request, new content copy, or unhold operation.
SET LOCAL lock_timeout = '10s';

DO $prerequisites$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.records'::regclass
      AND attname = 'interview_ai_hold' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'crisis_ai_hold: 0225 interview hold is required';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = 'public.records'::regclass AND NOT t.tgisinternal
        AND t.tgenabled = 'O' AND (
          (t.tgname = 'zz_records_embedding_delete_guard'
            AND p.oid = pg_catalog.to_regprocedure('public.guard_record_embedding_delete()') AND t.tgtype = 19)
          OR (t.tgname = 'zz_records_embedding_write_guard'
            AND p.oid = pg_catalog.to_regprocedure('public.guard_record_embedding_write()') AND t.tgtype = 23)
        )) <> 2 THEN
    RAISE EXCEPTION 'crisis_ai_hold: active 0263 record embedding guards are required';
  END IF;
END;
$prerequisites$;

ALTER TABLE public.records ADD COLUMN IF NOT EXISTS ai_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS ai_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS ai_hold boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.records.ai_hold IS
  'Monotonic D4 AI hold. Does not remove access to the original record or permit automatic release.';
COMMENT ON COLUMN public.sources.ai_hold IS
  'Monotonic D4 AI hold. Raw clipping and user export remain available.';
COMMENT ON COLUMN public.wiki_pages.ai_hold IS
  'Monotonic D4 AI hold. AI readers also check a linked source hold.';

-- INVOKER: no extra owner or service privileges. Existing table RLS still
-- applies. A client may raise its own hold, never lower an existing hold.
-- Trusted writers and old clients obey the same lifetime rule. A future release
-- requires a separately reviewed contract; no bypass flag is introduced here.
CREATE OR REPLACE FUNCTION public.guard_record_ai_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.ai_hold IS NULL THEN
    RAISE EXCEPTION 'record_ai_hold_must_be_boolean' USING ERRCODE = '22004';
  END IF;
  NEW.ai_hold := NEW.ai_hold
    OR (TG_OP = 'UPDATE' AND OLD.ai_hold)
    OR NEW.interview_ai_hold
    OR COALESCE(NEW.ai_followup ->> 'zone' = 'red', false);
  IF NEW.ai_hold THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_record_ai_hold() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_record_ai_hold ON public.records;
CREATE TRIGGER guard_record_ai_hold BEFORE INSERT OR UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_ai_hold();

-- BEFORE row triggers run by name, and WHEN sees changes from earlier triggers:
-- guard_record_ai_hold -> zz_records_embedding_delete_guard (0263 restores an
-- allowed adult's complete OLD pair) -> zz_records_embedding_write_guard -> us.
-- 0263 has no hold exception: do not spoof consent/age/owner, replace its
-- functions, or disable/rebind its triggers to manufacture an allowed delete.
-- Keep all of its checks, then narrow the final row to D4's held subset only.
-- INVOKER, no table lookup/update, no recursive write or new locking order.
CREATE OR REPLACE FUNCTION public.guard_record_ai_hold_embedding()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.ai_hold THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_record_ai_hold_embedding() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS zzz_records_ai_hold_embedding_guard ON public.records;
CREATE TRIGGER zzz_records_ai_hold_embedding_guard BEFORE INSERT OR UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.guard_record_ai_hold_embedding();

CREATE OR REPLACE FUNCTION public.guard_source_ai_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.ai_hold IS NULL THEN
    RAISE EXCEPTION 'source_ai_hold_must_be_boolean' USING ERRCODE = '22004';
  END IF;
  NEW.ai_hold := NEW.ai_hold OR (TG_OP = 'UPDATE' AND OLD.ai_hold);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_source_ai_hold() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_source_ai_hold ON public.sources;
CREATE TRIGGER guard_source_ai_hold BEFORE INSERT OR UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION public.guard_source_ai_hold();

CREATE OR REPLACE FUNCTION public.guard_wiki_page_ai_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.ai_hold IS NULL THEN
    RAISE EXCEPTION 'wiki_page_ai_hold_must_be_boolean' USING ERRCODE = '22004';
  END IF;
  NEW.ai_hold := NEW.ai_hold OR (TG_OP = 'UPDATE' AND OLD.ai_hold);
  -- A source page inherits its parent's hold. Missing/foreign parents are not
  -- evidence of eligibility. Repointing a page cannot release a previous hold.
  IF NEW.source_id IS NOT NULL THEN
    NEW.ai_hold := NEW.ai_hold OR NOT EXISTS (
      SELECT 1 FROM public.sources s
      WHERE s.id = NEW.source_id AND s.user_id = NEW.user_id AND NOT s.ai_hold
    );
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_id IS NOT NULL THEN
    NEW.ai_hold := NEW.ai_hold OR NOT EXISTS (
      SELECT 1 FROM public.sources s
      WHERE s.id = OLD.source_id AND s.user_id = OLD.user_id AND NOT s.ai_hold
    );
  END IF;
  IF NEW.ai_hold THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_wiki_page_ai_hold() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_wiki_page_ai_hold ON public.wiki_pages;
CREATE TRIGGER guard_wiki_page_ai_hold BEFORE INSERT OR UPDATE ON public.wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.guard_wiki_page_ai_hold();

-- Existing authoritative record flags, not a new interpretation of raw text.
-- No source/page backfill is inferred from tags, titles, or prose. Also repair
-- residual vectors left on already-held rows by an earlier draft + 0263.
-- The normal updated_at trigger remains active: changed rows get the backfill
-- transaction time. Do not bypass ordinary writes or the 0263 consent guards.
UPDATE public.records SET ai_hold = true
WHERE (ai_hold OR interview_ai_hold OR ai_followup ->> 'zone' = 'red')
  AND (NOT ai_hold OR embedding IS NOT NULL OR embedding_model IS NOT NULL);

-- These views are for future AI readers only. The user's own detail/export
-- readers must keep using the original tables. Missing views must fail closed;
-- there is no fallback to an unfiltered table.
-- Explicit AI projections only; system_tags and unrelated columns must not
-- become view dependencies (0218 rollback drops records.system_tags).
-- Reader/column evidence and the remaining tag-aware wiring are in the design.
CREATE OR REPLACE VIEW public.records_ai_eligible
WITH (security_invoker = true, security_barrier = true) AS
SELECT r.id, r.user_id, r.kind, r.topic, r.body, r.summary, r.structured,
       r.prompt, r.audit_period, r.tags, r.ai_followup, r.created_at,
       r.embedding, r.embedding_model
FROM public.records r WHERE NOT r.ai_hold AND NOT r.interview_ai_hold;
CREATE OR REPLACE VIEW public.sources_ai_eligible
WITH (security_invoker = true, security_barrier = true) AS
SELECT s.id, s.user_id, s.kind, s.title, s.source_url, s.storage_path,
       s.frontmatter, s.tags, s.ingested, s.captured_at
FROM public.sources s WHERE NOT s.ai_hold;
CREATE OR REPLACE VIEW public.wiki_pages_ai_eligible
WITH (security_invoker = true, security_barrier = true) AS
SELECT w.id, w.user_id, w.slug, w.kind, w.title, w.body_md, w.frontmatter,
       w.tags, w.source_id, w.created_at, w.updated_at, w.embedding, w.embedding_model
FROM public.wiki_pages w
WHERE NOT w.ai_hold
  AND (w.source_id IS NULL OR EXISTS (
    SELECT 1 FROM public.sources s
    WHERE s.id = w.source_id AND s.user_id = w.user_id AND NOT s.ai_hold
  ));

REVOKE ALL ON public.records_ai_eligible, public.sources_ai_eligible, public.wiki_pages_ai_eligible
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.records_ai_eligible, public.sources_ai_eligible, public.wiki_pages_ai_eligible
  TO authenticated, service_role;
