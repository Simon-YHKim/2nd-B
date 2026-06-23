// sources read/write field contract.
//
// The live `sources.created_at` -> `captured_at` P0 was the home screen ordering the
// sources query by a column that does not exist on `sources`. jest's Supabase mock did
// not catch it. This static-source contract pins it: every `sources` field index.tsx
// SELECTs or ORDERs by must be a field createSource WRITES, or a DB-managed column.
//
// Static parse (no DB / no mock), the same technique as scripts/check-constraints.ts:
// it reads the real source files so a read/write rename is caught at CI.

import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

// Read side: the canonical home sources query. Legacy UI track removed 2026-06-23:
// src/app/index.tsx is now a thin deep-space wrapper and no longer reads `sources`.
// The home aggregate sources read moved to src/app/trinity.tsx (the Brain-Trinity home
// screen), with the same field shape the legacy index used (id, captured_at, title,
// tags ordered by captured_at) — so this contract still pins the created_at/captured_at
// P0 on the surviving canonical reader.
function indexSourcesReadFields(): string[] {
  const src = readSrc("../../../app/trinity.tsx");
  const at = src.indexOf('.from("sources")');
  if (at === -1) throw new Error('trinity.tsx no longer queries .from("sources") — update this contract');
  const block = src.slice(at);
  const select = block.match(/\.select\(\s*"([^"]*)"/);
  const order = block.match(/\.order\(\s*"([^"]+)"/);
  const fields = select ? select[1].split(",").map((f) => f.trim()) : [];
  if (order) fields.push(order[1].trim());
  return [...new Set(fields.filter(Boolean))];
}

// Write side: the fields createSource writes (CreateSourceInput in wiki/queries.ts).
function createSourceWriteFields(): string[] {
  const src = readSrc("../queries.ts");
  const m = src.match(/interface CreateSourceInput\s*\{([^}]*)\}/);
  if (!m) throw new Error("CreateSourceInput not found in wiki/queries.ts");
  return [...m[1].matchAll(/^\s*(\w+)\s*[?:]/gm)].map((x) => x[1]);
}

// Columns the database manages — index.tsx may read/order these even though
// createSource never writes them (id is a uuid default, captured_at a timestamp default).
const DB_MANAGED = new Set(["id", "captured_at", "user_id"]);

describe("sources read/write field contract", () => {
  test("every sources field index.tsx reads/orders is written by createSource or DB-managed", () => {
    const readFields = indexSourcesReadFields();
    const written = new Set(createSourceWriteFields());
    expect(readFields.length).toBeGreaterThan(0);

    const offenders = readFields.filter((f) => !written.has(f) && !DB_MANAGED.has(f));
    // An offender = the home screen reads/orders a sources column that is neither
    // written by createSource nor DB-managed — exactly the created_at/captured_at P0.
    expect(offenders).toEqual([]);
  });
});
