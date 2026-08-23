// 0142: every stored vector records which model produced it, and search will
// not compare across models.
//
// The failure this prevents does not look like a failure. During a partial
// re-index the table holds two embedding spaces at once; an unfiltered kNN
// ranks them together and returns confident, plausible, unrelated pages. Not
// an error - a search that quietly "got worse". 0068's header already says
// cosine similarity across models is meaningless, and back then the only fix
// available was nulling every vector for every user, because nothing recorded
// which rows were in which space.
//
// The sharpest assertion here is that neither side uses the EMBED_MODEL
// CONSTANT. The constant is the client's default; the proxy reports what it
// actually used, and the moment EXPO_PUBLIC_EMBED_VENDOR moves those two stop
// agreeing. A column stamped from the constant would lie at exactly the moment
// it exists to be trusted.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CR = String.fromCharCode(13);
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split(CR).join("");

const SQL = read("db/migrations/0142_embedding_provenance.sql");
const EXEC = SQL.replace(/^\s*--.*$/gm, "");
const RAG = read("src/lib/chat/rag.ts");
const WIKI = read("src/lib/wiki/embeddings.ts");
const RECORDS = read("src/lib/records/records-embeddings.ts");

describe("the column exists and means something", () => {
  test("both embedding tables get it", () => {
    // Whitespace-tolerant: the two ALTERs are column-aligned in the file for
    // readability, so an exact-string match would be asserting the formatting
    // rather than the schema change.
    for (const t of ["wiki_pages", "records"]) {
      expect(EXEC).toMatch(
        new RegExp(`ALTER TABLE public\\.${t}\\s+ADD COLUMN IF NOT EXISTS embedding_model text;`),
      );
    }
  });

  test("existing vectors are backfilled to the one space that exists", () => {
    // 0068 nulled the text-embedding-004 generation outright, so every
    // surviving non-null vector is gemini-embedding-2. There is no third
    // possibility to guess at.
    expect(EXEC).toMatch(/UPDATE public\.wiki_pages\s*\n\s*SET embedding_model = 'gemini-embedding-2'/);
    expect(EXEC).toMatch(/UPDATE public\.records\s*\n\s*SET embedding_model = 'gemini-embedding-2'/);
  });

  test("rows with no vector are left NULL", () => {
    // Claiming a model for a row that has no embedding would make the column
    // lie about what is indexed.
    const updates = EXEC.match(/UPDATE public\.\w+[\s\S]*?;/g) ?? [];
    expect(updates.length).toBe(2);
    for (const u of updates) expect(u).toContain("WHERE embedding IS NOT NULL");
  });
});

describe("search can refuse to mix spaces", () => {
  test("both match functions take the model", () => {
    for (const fn of ["match_wiki_pages", "match_records"]) {
      expect(EXEC).toMatch(new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?p_embedding_model text DEFAULT NULL`));
    }
  });

  test("NULL means no filter, which is the pre-0142 behaviour", () => {
    // Deliberate: migrations apply BEFORE the client that knows about them
    // ships. A required argument would break search for every installed build
    // in between - a real outage traded for a hypothetical one.
    const filters = EXEC.match(/p_embedding_model IS NULL OR \w+\.embedding_model IS NOT DISTINCT FROM p_embedding_model/g) ?? [];
    expect(filters).toHaveLength(2);
  });

  test("⚠ the old signatures are DROPPED, not left as overloads", () => {
    // Adding a defaulted parameter creates a SECOND overload unless the old
    // one goes. PostgREST then cannot choose and answers PGRST203 - every
    // search fails. This repo hit that shape in 0137.
    expect(EXEC).toContain("DROP FUNCTION IF EXISTS public.match_wiki_pages(uuid, vector, int, uuid);");
    expect(EXEC).toContain("DROP FUNCTION IF EXISTS public.match_records(uuid, vector, int, uuid);");
    for (const fn of ["match_wiki_pages", "match_records"]) {
      const drop = EXEC.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const create = EXEC.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
      expect(drop).toBeGreaterThan(-1);
      expect(drop).toBeLessThan(create);
    }
  });

  test("the DROP took the grants with it, so they are re-issued", () => {
    for (const sig of [
      "public.match_wiki_pages(uuid, vector, int, uuid, text)",
      "public.match_records(uuid, vector, int, uuid, text)",
    ]) {
      expect(EXEC).toContain(`GRANT  EXECUTE ON FUNCTION ${sig} TO authenticated;`);
      expect(EXEC).toContain(`REVOKE EXECUTE ON FUNCTION ${sig} FROM anon;`);
    }
  });
});

describe("the client stamps and filters by the REAL model, never the constant", () => {
  test("writers use the audit's modelUsed", () => {
    // The constant is the client's default. The proxy reports what it really
    // used, and after the vendor switch moves they diverge.
    expect(WIKI).toContain("embedding_model: embeddingModel");
    expect(RECORDS).toContain("embedding_model: embeddingModel");
    expect(WIKI).toMatch(/storeWikiPageEmbedding\(userId, page\.id, vec, audit\.modelUsed\)/);
    expect(RECORDS).toMatch(/storeRecordEmbedding\(userId, record\.id, vec, audit\.modelUsed\)/);
  });

  test("the RAG reader filters by the model that made ITS query vector", () => {
    expect(RAG).toContain("p_embedding_model: audit.modelUsed");
  });

  test("the record reader filters by the space its stored query row is in", () => {
    // No fresh embed call there - the query IS a stored vector, so the space
    // to match is that row's.
    expect(RECORDS).toContain("p_embedding_model: storedModel");
    expect(RECORDS).toContain('.select("embedding, embedding_model")');
  });

  test("no site stamps or filters by EMBED_MODEL", () => {
    // The assertion that would catch the subtle version of this bug.
    for (const src of [WIKI, RECORDS, RAG]) {
      const exec = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(exec).not.toMatch(/embedding_model: EMBED_MODEL/);
      expect(exec).not.toMatch(/p_embedding_model: EMBED_MODEL/);
    }
  });

  test("clearing a vector clears its provenance", () => {
    // A model name on a row with no embedding would misreport what is indexed.
    expect(RECORDS).toContain("embedding: null, embedding_model: null");
  });
});
