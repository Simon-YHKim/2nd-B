-- 0047_wiki_pgvector.sql
-- Wiki STEP 4 (docs/wiki-system-upgrade.md): semantic search over wiki pages
-- with pgvector + Gemini text-embedding-004 (768-dim). Additive + idempotent.
--
-- Populated lazily by the client (src/lib/wiki/embeddings.ts embedAndStorePage
-- / backfillEmbeddings) through the LLM boundary, so $0/mo + C1/C3/C9 hold. The
-- column is nullable; rows without an embedding are simply skipped by kNN.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE wiki_pages
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW cosine index for fast nearest-neighbour. Built over the (sparse) column;
-- rows with NULL embedding are ignored by the index.
CREATE INDEX IF NOT EXISTS wiki_pages_embedding_idx
  ON wiki_pages USING hnsw (embedding vector_cosine_ops);

-- kNN RPC: the user's pages most similar to a query embedding. SECURITY INVOKER
-- so the caller's RLS (owner-only) applies; the p_user_id predicate also lets
-- the planner scope before the vector scan. Returns cosine similarity in 0..1.
CREATE OR REPLACE FUNCTION match_wiki_pages(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL
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
  ORDER BY w.embedding <=> query_embedding
  LIMIT match_count;
$$;
