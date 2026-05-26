// Lock the runtime kind enums against the SQL CHECK constraints so a future
// refactor can't let them drift apart.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SOURCE_KINDS, WIKI_PAGE_KINDS } from "../types";

const sql = readFileSync(join(__dirname, "..", "..", "..", "..", "db", "migrations", "0022_wiki_rag.sql"), "utf8");

describe("SOURCE_KINDS ↔ sources.kind CHECK", () => {
  test("each runtime kind appears in the SQL CHECK list", () => {
    for (const k of SOURCE_KINDS) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  test("8 kinds total, matching the 8 Obsidian clipper templates", () => {
    expect(SOURCE_KINDS).toHaveLength(8);
  });
});

describe("WIKI_PAGE_KINDS ↔ wiki_pages.kind CHECK", () => {
  test("each runtime kind appears in the SQL CHECK list", () => {
    for (const k of WIKI_PAGE_KINDS) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  test("only source/entity/concept", () => {
    expect([...WIKI_PAGE_KINDS].sort()).toEqual(["concept", "entity", "source"]);
  });
});
