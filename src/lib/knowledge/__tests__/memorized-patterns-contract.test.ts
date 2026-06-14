// memorized_patterns read/write field contract.
//
// createRecord writes rows through buildMemorizedPattern(), and buildPersona reads
// those rows back to build the persona pattern histogram. This pins that seam so
// a future column rename/drop fails CI instead of silently emptying persona cues.

import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

function personaMemorizedPatternReadFields(): string[] {
  const src = readSrc("../../persona/build.ts");
  const at = src.indexOf('.from("memorized_patterns")');
  if (at === -1) throw new Error('build.ts no longer reads .from("memorized_patterns")');
  const block = src.slice(at);
  const select = block.match(/\.select\(\s*"([^"]*)"/);
  if (!select) throw new Error("memorized_patterns read has no .select(...) in build.ts");
  return [...new Set(select[1].split(",").map((f) => f.trim()).filter(Boolean))];
}

function memorizedPatternBuilderFields(): string[] {
  const src = readSrc("../engines.ts");
  const at = src.indexOf("export function buildMemorizedPattern");
  if (at === -1) throw new Error("buildMemorizedPattern not found in engines.ts");
  const fn = src.slice(at);
  const returned = fn.match(/return\s*\{([\s\S]*?)\n\s*\};/);
  if (!returned) throw new Error("could not parse buildMemorizedPattern return object");
  return [...returned[1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
}

function createRecordWritesBuilderPayload(): boolean {
  const src = readSrc("../../records/create.ts");
  return (
    src.includes("buildMemorizedPattern({") &&
    /\.from\(\s*"memorized_patterns"\s*\)\.insert\(\s*pattern\s*\)/.test(src)
  );
}

// The database creates these columns; buildMemorizedPattern should not write them.
const DB_MANAGED = new Set(["id", "created_at"]);

describe("memorized_patterns read/write field contract", () => {
  test("createRecord inserts the buildMemorizedPattern payload read by buildPersona", () => {
    expect(createRecordWritesBuilderPayload()).toBe(true);

    const readFields = personaMemorizedPatternReadFields();
    const written = new Set(memorizedPatternBuilderFields());
    expect(readFields).toContain("pattern_kind"); // guards the current persona histogram key

    const offenders = readFields.filter((field) => !written.has(field) && !DB_MANAGED.has(field));
    expect(offenders).toEqual([]);
  });
});
