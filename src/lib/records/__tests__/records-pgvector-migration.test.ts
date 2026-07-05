// Structural guard for db/migrations/0071_records_pgvector.sql — the records-side
// pgvector embedding + kNN, the Phase-2 (Simon D5 / D-27) schema foundation that
// mirrors 0047's wiki_pages path.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0071_records_pgvector.sql"),
  "utf8",
);

describe("0071_records_pgvector.sql — structure", () => {
  test("enables pgvector idempotently", () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/);
  });

  test("adds a 768-dim embedding column to records, idempotently", () => {
    expect(sql).toMatch(/ALTER TABLE records[\s\S]*ADD COLUMN IF NOT EXISTS embedding vector\(768\)/);
  });

  test("creates an HNSW cosine index over embedded rows only", () => {
    expect(sql).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
    expect(sql).toMatch(/WHERE embedding IS NOT NULL/);
  });

  test("defines the match_records kNN RPC, owner-scoped and SECURITY INVOKER", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION match_records/);
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).toMatch(/r\.user_id = p_user_id/);
    expect(sql).toMatch(/ORDER BY r\.embedding <=> query_embedding/);
  });

  test("returns cosine similarity in 0..1", () => {
    expect(sql).toMatch(/\(1 - \(r\.embedding <=> query_embedding\)\)::real AS similarity/);
  });
});
