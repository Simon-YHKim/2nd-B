-- 0068: reset wiki_pages.embedding (P0-2, D-26 A19 / docs/LLM-ROUTING.md).
--
-- WHY: every stored vector was produced by text-embedding-004, which Google
-- SHUT DOWN on 2026-01-14 — the live embedding path has been dead since, so
-- these vectors are stale artifacts of a retired model. The replacement
-- (gemini-embedding-2 @ 768-dim MRL) lives in a DIFFERENT embedding space:
-- cosine similarity between an 004 vector and an embedding-2 vector is
-- meaningless, so mixing generations would silently corrupt kNN
-- (match_wiki_pages) and the inferred-link proposals built on it.
--
-- Embeddings are DERIVED data — fully regenerable from title+body via the
-- deep-space Data screen "build index" backfill (now a single batched call).
-- Clearing them also un-sticks red-zone zero-vector rows, which the backfill
-- previously skipped forever as "already embedded".
--
-- The column/type/index from 0047 are unchanged (embedding-2 is sliced to the
-- same 768 dims), so this is data-only: no schema change, no RLS change.
--
-- Recovery path (wired in the same PR): the deep-space Research screen's
-- "연결 제안 찾기" button runs backfillEmbeddings (batched) before proposing,
-- so users rebuild their index with one tap.
--
-- The updated_at touch trigger is suspended for this UPDATE: clearing a
-- derived column must not stamp every embedded page as "just edited" (the
-- wiki list, backfill scan order, and prompt windows all sort by updated_at).

BEGIN;
ALTER TABLE wiki_pages DISABLE TRIGGER trg_wiki_pages_updated_at;
UPDATE wiki_pages SET embedding = NULL WHERE embedding IS NOT NULL;
ALTER TABLE wiki_pages ENABLE TRIGGER trg_wiki_pages_updated_at;
COMMIT;
