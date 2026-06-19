// Structural guard for db/migrations/0047_wiki_pgvector.sql (wiki STEP 4).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0047_wiki_pgvector.sql"),
  "utf8",
);

describe("0047_wiki_pgvector.sql — structure", () => {
  test("enables pgvector idempotently", () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/);
  });

  test("adds a 768-dim embedding column", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS embedding vector\(768\)/);
  });

  test("creates an HNSW cosine index", () => {
    expect(sql).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
  });

  test("defines the kNN RPC, scoped to the user and SECURITY INVOKER", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION match_wiki_pages/);
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).toMatch(/w\.user_id = p_user_id/);
    expect(sql).toMatch(/ORDER BY w\.embedding <=> query_embedding/);
  });
});
