// Contract guard: every write path that mutates the `records` table must drop
// the per-user domain-levels cache (load-domain-levels.ts), or the home
// constellation shows stale brightness until the TTL. The a2z audit (07-11)
// found the DELETE half of this contract missing while the create half was
// instrumented — this scan keeps the two halves from drifting apart again.

import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");

describe("records write paths invalidate the domain-levels cache", () => {
  test("create.ts: createRecord and deleteRecord both invalidate", () => {
    const src = read("create.ts");
    const fns = ["export async function createRecord", "export async function deleteRecord"];
    for (const marker of fns) {
      const start = src.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
      // Function body ends at the next exported declaration.
      const end = src.indexOf("\nexport ", start + marker.length);
      const body = src.slice(start, end === -1 ? undefined : end);
      expect(body).toContain("invalidateDomainLevels(");
    }
  });

  test("delete-bulk.ts: every records-table delete helper invalidates", () => {
    const src = read("delete-bulk.ts");
    // Split on exported functions and check each one that touches .from("records").
    const chunks = src.split(/\nexport /).filter((c) => c.includes('.from("records")'));
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    for (const chunk of chunks) {
      expect(chunk).toContain("invalidateDomainLevels(");
    }
  });
});
