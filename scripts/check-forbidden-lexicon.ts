// Blueprint §3: forbidden vocabulary must not appear in product surfaces.
// Scans repo source (excluding the lexicon definition itself, the constraints
// doc that documents the policy, and obvious build artifacts).
//
// Native fs walk (no globby) to keep the script tsx-compatible.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { FORBIDDEN_TERMS, LEXICON_SCAN_ALLOWLIST } from "../src/lib/safety/lexicon";
import { containsForbiddenLexicon } from "../src/lib/safety/classifier";

const ROOT = process.cwd();

const ROOT_DIRS = ["src", "app", "components", "locales", "db", "docs"];
const ROOT_FILES = ["README.md"];

const EXT_OK = /\.(?:ts|tsx|js|jsx|json|sql|md)$/;
const IGNORE_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  "ios",
  "android",
  "coverage",
  ".git",
  "__tests__",
]);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile() && EXT_OK.test(name)) out.push(full);
  }
}

function isAllowed(relPath: string): boolean {
  const normalized = relPath.split(sep).join("/");
  return LEXICON_SCAN_ALLOWLIST.some((p) => {
    if (p.endsWith("/**")) return normalized.startsWith(p.slice(0, -3));
    return normalized === p;
  });
}

const files: string[] = [];
for (const d of ROOT_DIRS) walk(join(ROOT, d), files);
for (const f of ROOT_FILES) {
  const full = join(ROOT, f);
  try {
    if (statSync(full).isFile()) files.push(full);
  } catch {
    // not present
  }
}

const failures: { file: string; locale: "en" | "ko"; hits: string[] }[] = [];
let scanned = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;
  scanned++;
  const content = readFileSync(file, "utf8");
  const enHits = containsForbiddenLexicon(content, "en");
  const koHits = containsForbiddenLexicon(content, "ko");
  if (enHits.length > 0) failures.push({ file: rel, locale: "en", hits: enHits });
  if (koHits.length > 0) failures.push({ file: rel, locale: "ko", hits: koHits });
}

if (failures.length > 0) {
  console.error("Forbidden lexicon check FAILED:");
  for (const { file, locale, hits } of failures) {
    console.error(`  - ${file} [${locale}]: ${hits.join(", ")}`);
  }
  console.error(`\nDefine policy in src/lib/safety/lexicon.ts.`);
  console.error(`Whitelist legitimate uses by adding the path to LEXICON_SCAN_ALLOWLIST.`);
  process.exit(1);
}

console.log(
  `Forbidden lexicon PASS  scanned ${scanned} files ` +
    `(${FORBIDDEN_TERMS.en.length} EN terms, ${FORBIDDEN_TERMS.ko.length} KO terms)`,
);
