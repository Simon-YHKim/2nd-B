// Static structural assertions for db/migrations/0046_wiki_link_relation_type.sql.
// Guards the wiki STEP 2 edge-type/confidence columns + constraints from drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "..", "..", "..", "..", "db", "migrations", "0046_wiki_link_relation_type.sql"),
  "utf8",
);

describe("0046_wiki_link_relation_type.sql — structure", () => {
  test("adds relation_type + confidence columns idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS relation_type text NOT NULL DEFAULT 'wikilink'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS confidence\s+real NOT NULL DEFAULT 1/);
  });

  test("relation_type is constrained to the three canon values", () => {
    expect(sql).toMatch(/relation_type IN \('wikilink', 'inferred', 'ratified'\)/);
  });

  test("confidence is range-checked 0..1", () => {
    expect(sql).toMatch(/confidence >= 0 AND confidence <= 1/);
  });

  test("constraints are guarded against re-run (duplicate_object)", () => {
    expect(sql).toMatch(/EXCEPTION WHEN duplicate_object THEN NULL/);
  });

  test("indexes the (user_id, relation_type) worklist lookup", () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS wiki_links_relation_type_idx\s+ON wiki_links \(user_id, relation_type\)/);
  });
});
