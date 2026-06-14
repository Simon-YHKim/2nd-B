// D-19 CI gate: user-facing locale copy must read as a scaffolded-reflection tool, not a
// companion bot. Scans every string value in locales/**/*.json against ANTHRO_FORBIDDEN.
// Native fs walk (no globby) to stay tsx-compatible, mirroring check-forbidden-lexicon.ts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { ANTHRO_FORBIDDEN, findAnthroViolations } from "../src/lib/safety/anthro";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");

function jsonFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) jsonFiles(full, out);
    else if (stat.isFile() && name.endsWith(".json")) out.push(full);
  }
}

function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === "object") for (const v of Object.values(value)) yield* strings(v);
}

const files: string[] = [];
jsonFiles(LOCALES, files);

const failures: { file: string; text: string; ids: string[] }[] = [];
let scanned = 0;
for (const file of files) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Anti-anthropomorphism check: cannot parse ${relative(ROOT, file)}: ${(e as Error).message}`);
    process.exit(1);
  }
  for (const text of strings(data)) {
    scanned++;
    const ids = findAnthroViolations(text);
    if (ids.length > 0) failures.push({ file: relative(ROOT, file), text, ids });
  }
}

if (failures.length > 0) {
  console.error("Anti-anthropomorphism check FAILED (D-19: scaffolded-reflection, not companion):");
  for (const { file, text, ids } of failures) {
    console.error(`  - ${file} [${ids.join(", ")}]: ${text.slice(0, 90)}`);
  }
  console.error("\nRewrite companion / over-claiming copy.");
  console.error("Patterns: src/lib/safety/anthro.ts. Allowlist a genuinely-benign exact string in ANTHRO_ALLOWLIST.");
  process.exit(1);
}

console.log(
  `Anti-anthropomorphism PASS  scanned ${scanned} locale strings across ${files.length} files ` +
    `(${ANTHRO_FORBIDDEN.length} patterns)`,
);
