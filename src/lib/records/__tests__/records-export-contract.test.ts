// records <-> wiki-export field-shape contract.
//
// The recurring runtime bug class is read-side / write-side field drift that the
// Supabase mock does not catch (e.g. the live `sources.created_at` -> `captured_at`
// P0). This test pins the contract between what createRecord WRITES into `records`
// and what exportUserWiki READS back, so a future rename/drop on either side fails
// CI instead of at runtime.
//
// Strategy: a plain `note` save takes no LLM path, so it reaches the insert with
// minimal machinery — stub createRecord's deps, capture the `records` insert
// payload, and assert it covers every field the real export.ts .select(...) reads.

import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("../../supabase/client", () => {
  const captures: Record<string, unknown> = {};
  return {
    getSupabaseClient: () => ({
      from: (table: string) => ({
        insert: (payload: Record<string, unknown>) => {
          captures[table] = payload;
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "r1" }, error: null }) }) };
        },
      }),
    }),
    __captures: captures,
  };
});
jest.mock("../../llm/gemini", () => ({
  callAdvisor: jest.fn(),
  callGemini: jest.fn(),
  classifyRecordTextForCrisis: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../progression/xp", () => ({ awardXpSafe: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../progression/entitlements", () => ({ canUsePremium: () => true }));
jest.mock("../../knowledge/engines", () => ({ buildMemorizedPattern: jest.fn() }));

import { createRecord } from "../create";

const client = require("../../supabase/client") as { __captures: Record<string, Record<string, unknown>> };

// Source-of-truth: the fields exportUserWiki reads from `records`, parsed from the
// real export.ts .select(...) so a read-side query change is caught here too.
function exportRecordFields(): string[] {
  const src = readFileSync(join(__dirname, "../../wiki/export.ts"), "utf8");
  const selects = [...src.matchAll(/\.select\(\s*"([^"]*)"\s*\)/g)].map((m) => m[1]);
  const recordsSelect = selects.find(
    (s) => s.includes("kind") && s.includes("created_at") && s.includes("body"),
  );
  if (!recordsSelect) throw new Error("could not locate the records .select(...) in export.ts");
  return recordsSelect.split(",").map((f) => f.trim());
}

// created_at is DB-defaulted (the column auto-fills); createRecord must NOT write
// it, and every OTHER read field must be in the insert.
const DB_DEFAULTED = new Set(["created_at"]);

describe("records <-> export field-shape contract", () => {
  test("every field exportUserWiki reads is written by createRecord (or DB-defaulted)", async () => {
    await createRecord({ userId: "u1", locale: "en", kind: "note", body: "a note", topic: "t", tags: ["x"] });
    const insert = client.__captures.records;
    expect(insert).toBeDefined();

    const fields = exportRecordFields();
    expect(fields).toContain("created_at"); // guards against the select silently losing it

    for (const field of fields) {
      if (DB_DEFAULTED.has(field)) {
        expect(insert).not.toHaveProperty(field); // DB-managed; a client write would be the drift
      } else {
        expect(insert).toHaveProperty(field); // export reads it => createRecord must write it
      }
    }
  });
});
