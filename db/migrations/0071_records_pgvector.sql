-- 0071_records_pgvector.sql
-- Phase 2 (D-27 / Simon D5): records-side semantic embedding, mirroring 0047's
-- wiki_pages path. Adds a 768-dim embedding column + HNSW cosine index on
-- records, and a match_records kNN RPC (owner-scoped, SECURITY INVOKER).
-- Additive + idempotent.
--
-- SCHEMA-ONLY foundation: this migration changes no behavior on its own. The
-- embedding GENERATION (embed-and-store on record write) and CONSUMPTION
-- (related-records kNN) ship separately, gated behind opt-in + consent + a
-- spend cap (Simon D5: "opt-in+consent+cap 전제로 진행"). An all-NULL embedding
-- column + an unused RPC touch no user data and cost nothing until that gated
-- wiring lands. The model boundary stays Gemini text-embedding-004 (768-dim)
-- via src/lib/llm/gemini.ts, same as 0047. records content is more sensitive
-- than wiki_pages, so the generation path MUST honor the red-zone / consent
-- holds already in src/lib/wiki/embeddings.ts before this column is populated.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE records
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- HNSW cosine index over the embedded rows only (matches 0047).
CREATE INDEX IF NOT EXISTS records_embedding_hnsw
  ON records USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- kNN RPC: the user's records most similar to a query embedding. SECURITY
-- INVOKER so the caller's records_owner_all RLS (0009_rls_policies.sql) applies;
-- the p_user_id predicate also lets the planner scope before the vector scan.
-- Returns cosine similarity in 0..1. kind is cast to text for a stable shape.
CREATE OR REPLACE FUNCTION match_records(
  p_user_id uuid,
  query_embedding vector(768),
  match_count int DEFAULT 8,
  exclude_id uuid DEFAULT NULL
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
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
