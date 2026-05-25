// Static structural assertions for db/migrations/0022_wiki_rag.sql.
// Cheap regression guard: if someone removes a critical constraint, index, or
// RLS policy from the wiki/RAG migration, this test fails before the schema
// drifts in CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(__dirname, "..", "..", "..", "..", "db", "migrations", "0022_wiki_rag.sql"), "utf8");

describe("0022_wiki_rag.sql — structure", () => {
  test("creates the three core tables", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS sources/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS wiki_pages/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS wiki_links/);
  });

  test("sources.kind has the 8 clipper enum values", () => {
    const kinds = ["inbox", "article", "video", "paper", "reddit", "code", "ai_tool", "self_knowledge"];
    for (const k of kinds) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  test("sources has simon_relevance range and ingested pairing CHECKs", () => {
    expect(sql).toMatch(/sources_relevance_range[\s\S]*?BETWEEN 1 AND 5/);
    expect(sql).toMatch(/sources_ingested_pair[\s\S]*?ingested = false OR ingested_at IS NOT NULL/);
  });

  test("wiki_pages.kind restricted to source/entity/concept", () => {
    expect(sql).toMatch(/wiki_pages[\s\S]*?kind\s+text\s+NOT NULL CHECK \(kind IN \('source', 'entity', 'concept'\)\)/);
  });

  test("wiki_pages requires source_id iff kind='source'", () => {
    expect(sql).toMatch(/wiki_pages_source_kind_pair[\s\S]*?\(kind = 'source'\) = \(source_id IS NOT NULL\)/);
  });

  test("wiki_pages enforces (user_id, slug) uniqueness", () => {
    expect(sql).toMatch(/wiki_pages_user_slug_unique\s+UNIQUE\s*\(user_id,\s*slug\)/);
  });

  test("wiki_pages exposes (user_id, id) as composite-FK target", () => {
    expect(sql).toMatch(/wiki_pages_user_id_unique\s+UNIQUE\s*\(user_id,\s*id\)/);
  });

  test("wiki_links uses composite FKs against wiki_pages (user_id, id)", () => {
    expect(sql).toMatch(/wiki_links_from_fk[\s\S]*?FOREIGN KEY \(user_id, from_page\) REFERENCES wiki_pages \(user_id, id\)/);
    expect(sql).toMatch(/wiki_links_to_fk[\s\S]*?FOREIGN KEY \(user_id, to_page\) REFERENCES wiki_pages \(user_id, id\)/);
  });

  test("wiki_links forbids self-edges and uses (from_page, to_page) as PK", () => {
    expect(sql).toMatch(/wiki_links_no_self[\s\S]*?from_page <> to_page/);
    expect(sql).toMatch(/PRIMARY KEY \(from_page, to_page\)/);
  });

  test("cascade deletes from wiki_pages → wiki_links", () => {
    const fromFk = sql.match(/wiki_links_from_fk[\s\S]*?ON DELETE CASCADE/);
    const toFk = sql.match(/wiki_links_to_fk[\s\S]*?ON DELETE CASCADE/);
    expect(fromFk).not.toBeNull();
    expect(toFk).not.toBeNull();
  });

  test("GIN indexes on tags for sources and wiki_pages", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS sources_tags_gin\s+ON sources USING GIN \(tags\)/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS wiki_pages_tags_gin\s+ON wiki_pages USING GIN \(tags\)/);
  });

  test("backlink index on wiki_links(to_page)", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS wiki_links_to_idx\s+ON wiki_links \(to_page\)/);
  });

  test("wiki_pages has updated_at trigger using the shared set_updated_at function", () => {
    expect(sql).toMatch(/trg_wiki_pages_updated_at[\s\S]*?BEFORE UPDATE ON wiki_pages[\s\S]*?EXECUTE FUNCTION set_updated_at\(\)/);
  });

  test("all three tables have RLS enabled with owner-only policies", () => {
    expect(sql).toMatch(/ALTER TABLE sources\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE wiki_pages\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE wiki_links\s+ENABLE ROW LEVEL SECURITY/);

    for (const name of ["sources_owner_all", "wiki_pages_owner_all", "wiki_links_owner_all"]) {
      expect(sql).toMatch(new RegExp(`CREATE POLICY ${name}[\\s\\S]*?USING \\(user_id = auth\\.uid\\(\\)\\)[\\s\\S]*?WITH CHECK \\(user_id = auth\\.uid\\(\\)\\)`));
    }
  });

  test("users.id cascade — deleting a user purges their sources and wiki_pages", () => {
    expect(sql).toMatch(/user_id\s+uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  });
});
