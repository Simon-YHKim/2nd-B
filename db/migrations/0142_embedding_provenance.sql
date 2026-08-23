-- 0142_embedding_provenance.sql
-- Record WHICH model produced each stored vector, and stop search mixing spaces.
--
-- ── THE PROBLEM THIS EXISTS FOR ──────────────────────────────────────────────
--
-- Cosine similarity between vectors from two different embedding models is
-- meaningless. That is not a theory here - 0068 lived it. When Google retired
-- text-embedding-004 the only available fix was to NULL every stored vector for
-- every user and rebuild from scratch, because there was no way to tell which
-- rows were in which space.
--
-- 2026-08-24 added EXPO_PUBLIC_EMBED_VENDOR so embeddings can leave Gemini
-- before Google stops accepting Standard keys in September. That switch makes
-- the same situation reachable again, and without this migration it would be
-- WORSE than a clean break: during a partial re-index the table holds two
-- spaces at once, and search keeps returning results the whole time. Not
-- errors - plausible, confidently-ranked, unrelated results. Nobody would
-- report it as a bug; it reads as "the search got worse".
--
-- ── WHAT THIS BUYS ───────────────────────────────────────────────────────────
--
-- 1. A half-migrated table becomes DETECTABLE (group by embedding_model).
-- 2. Re-indexing becomes incremental: null only the stale space, not everyone's
--    entire index. On a large corpus that is the difference between a cutover
--    and an outage.
-- 3. Search can refuse to mix, which is the part that matters while the
--    re-index is still running.
--
-- ── WHY THE FILTER IS OPTIONAL AND NOT MANDATORY ─────────────────────────────
--
-- p_embedding_model defaults to NULL = no filtering = exactly today's
-- behaviour. That is deliberate ordering, not timidity: migrations apply BEFORE
-- the client that knows about them ships. A required argument would break
-- search for every already-installed build between those two moments, which is
-- a real outage traded for a hypothetical one. Today every non-null vector is
-- in one space, so unfiltered is correct today; the filter earns its keep at
-- the cutover, and by then the clients that matter will be passing it.
--
-- ── ⚠ THE OVERLOAD TRAP ──────────────────────────────────────────────────────
--
-- Adding a defaulted parameter to an existing function CREATES A SECOND
-- OVERLOAD unless the old signature is dropped. PostgREST then cannot choose
-- and answers PGRST203 - every search fails. So each function is DROPped by its
-- exact old signature first. This repo hit that shape in 0137.
--
-- Idempotent, forward-only. Safe to re-apply.

BEGIN;

SET LOCAL lock_timeout = '10s';

----------------------------------------------------------------------
-- 1. The column
----------------------------------------------------------------------
-- Nullable, and NULL means "unknown space" rather than "no embedding". The
-- backfill below is what makes NULL meaningful: after it, a NULL model with a
-- non-null vector can only be a row written by a client that predates this
-- migration, which is itself worth being able to see.

ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE public.records    ADD COLUMN IF NOT EXISTS embedding_model text;

COMMENT ON COLUMN public.wiki_pages.embedding_model IS
  'Model that produced `embedding`. Vectors from different models are not '
  'comparable, so search filters on this. NULL = written before 0142.';
COMMENT ON COLUMN public.records.embedding_model IS
  'Model that produced `embedding`. See wiki_pages.embedding_model.';

----------------------------------------------------------------------
-- 2. Backfill the one space that exists today
----------------------------------------------------------------------
-- Every surviving non-null vector was produced by gemini-embedding-2: 0068
-- nulled the text-embedding-004 generation outright, so there is no third
-- possibility to guess at. Rows with no vector are left NULL - claiming a model
-- for a row that has no embedding would make the column lie.

UPDATE public.wiki_pages
   SET embedding_model = 'gemini-embedding-2'
 WHERE embedding IS NOT NULL AND embedding_model IS NULL;

UPDATE public.records
   SET embedding_model = 'gemini-embedding-2'
 WHERE embedding IS NOT NULL AND embedding_model IS NULL;

----------------------------------------------------------------------
-- 3. Let search refuse to mix spaces
----------------------------------------------------------------------
-- DROP first, by the exact old signature. See the overload note above.

DROP FUNCTION IF EXISTS public.match_wiki_pages(uuid, vector, int, uuid);

CREATE OR REPLACE FUNCTION public.match_wiki_pages(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL,
  p_embedding_model text DEFAULT NULL
)
RETURNS TABLE (id uuid, slug text, title text, kind text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT w.id, w.slug, w.title, w.kind,
         (1 - (w.embedding <=> query_embedding))::real AS similarity
  FROM wiki_pages w
  WHERE w.user_id = p_user_id
    AND w.embedding IS NOT NULL
    AND (exclude_id IS NULL OR w.id <> exclude_id)
    -- NULL = no filter = pre-0142 behaviour, for clients that predate it.
    AND (p_embedding_model IS NULL OR w.embedding_model IS NOT DISTINCT FROM p_embedding_model)
  ORDER BY w.embedding <=> query_embedding
  LIMIT match_count;
$$;

DROP FUNCTION IF EXISTS public.match_records(uuid, vector, int, uuid);

CREATE OR REPLACE FUNCTION public.match_records(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL,
  p_embedding_model text DEFAULT NULL
)
RETURNS TABLE (id uuid, kind text, topic text, summary text, similarity real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT r.id, r.kind::text, r.topic, r.summary,
         (1 - (r.embedding <=> query_embedding))::real AS similarity
  FROM records r
  WHERE r.user_id = p_user_id
    AND r.embedding IS NOT NULL
    AND (exclude_id IS NULL OR r.id <> exclude_id)
    AND (p_embedding_model IS NULL OR r.embedding_model IS NOT DISTINCT FROM p_embedding_model)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

----------------------------------------------------------------------
-- 4. Grants (kept at the end of the file on purpose)
----------------------------------------------------------------------
-- check:definer-grants Rule A scans without stripping comments and matches
-- across statement boundaries, so a GRANT followed by prose containing a bare
-- "to" and a later "public." is a false positive.
--
-- Both functions are SECURITY INVOKER, so the caller's own RLS applies and
-- authenticated is the right and only grantee. DROP removed the old grants
-- along with the old signatures, so these are required rather than tidy.

REVOKE ALL     ON FUNCTION public.match_wiki_pages(uuid, vector, int, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, int, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.match_wiki_pages(uuid, vector, int, uuid, text) TO authenticated;

REVOKE ALL     ON FUNCTION public.match_records(uuid, vector, int, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_records(uuid, vector, int, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.match_records(uuid, vector, int, uuid, text) TO authenticated;

COMMIT;
