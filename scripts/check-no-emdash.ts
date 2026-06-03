// DESIGN.md: no em dashes (U+2014) in user-facing strings. This guards the
// locale bundles — every value there is user-visible — so an em dash can't slip
// back in (the 2026-06-03 audit found several and noted no CI guard caught them).
// Use a regular hyphen + space, or restructure the sentence.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");
const EM_DASH = "—";

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) jsonFiles(full, out);
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

function walk(value: unknown, path: string, file: string, hits: string[]): void {
  if (typeof value === "string") {
    if (value.includes(EM_DASH)) hits.push(`${relative(ROOT, file)} :: ${path}`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, file, hits);
    }
  }
}

const hits: string[] = [];
for (const file of jsonFiles(LOCALES)) {
  walk(JSON.parse(readFileSync(file, "utf8")), "", file, hits);
}

if (hits.length > 0) {
  console.error(
    "Em dash (U+2014) found in locale strings - DESIGN.md forbids em dashes in UI strings. Use a hyphen + space:",
  );
  for (const h of hits) console.error("  - " + h);
  process.exit(1);
}
console.log("DESIGN PASS  no em dashes (U+2014) in locale strings");
