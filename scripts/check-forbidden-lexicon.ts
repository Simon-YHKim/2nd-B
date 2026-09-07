// Blueprint §3: forbidden vocabulary must not appear in product surfaces.
// Scans repo source (excluding the lexicon definition itself, the constraints
// doc that documents the policy, and obvious build artifacts).
//
// Native fs walk (no globby) to keep the script tsx-compatible.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  ANALYSIS_UNIVERSAL_FORBIDDEN,
  FORBIDDEN_TERMS,
  isLexiconScanAllowed,
} from "../src/lib/safety/lexicon";
import { findCopyLexiconHits } from "./lib/lexicon-copy";

const ROOT = process.cwd();

// "src" covers src/app + src/components (the real code roots). "supabase/functions"
// is included so deployed edge functions (gemini-proxy, oauth-naver) — which ship
// prompt-assembly + user-facing strings — are scanned too. Seed exclusions are
// handled by LEXICON_SCAN_ALLOWLIST.
const ROOT_DIRS = ["src", "supabase/functions", "locales", "db", "docs"];
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
  // Vendored rev2 design reference bundle (web prototype source) — foreign
  // deliverable, not app copy; its strings are not product surfaces to lint.
  "clone-audit",
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
  return isLexiconScanAllowed(relPath.split(sep).join("/"));
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

const failures: { file: string; locale: "en" | "ko"; list: "forbidden" | "analysis"; hits: string[] }[] = [];
let scanned = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  if (isAllowed(rel)) continue;
  scanned++;
  const content = readFileSync(file, "utf8");
  const { forbidden: enHits, analysis: enAnalysis } = findCopyLexiconHits(content, "en");
  const { forbidden: koHits, analysis: koAnalysis } = findCopyLexiconHits(content, "ko");
  if (enHits.length > 0) failures.push({ file: rel, locale: "en", list: "forbidden", hits: enHits });
  if (koHits.length > 0) failures.push({ file: rel, locale: "ko", list: "forbidden", hits: koHits });
  if (enAnalysis.length > 0) failures.push({ file: rel, locale: "en", list: "analysis", hits: enAnalysis });
  if (koAnalysis.length > 0) failures.push({ file: rel, locale: "ko", list: "analysis", hits: koAnalysis });
}

if (failures.length > 0) {
  console.error("Forbidden lexicon check FAILED:");
  for (const { file, locale, list, hits } of failures) {
    console.error(`  - ${file} [${locale}/${list}]: ${hits.join(", ")}`);
  }
  console.error(`\nDefine policy in src/lib/safety/lexicon.ts.`);
  console.error(`Review the matched claim or add a tested, precise non-clinical context in that policy.`);
  console.error(`Explicit prohibitions apply only to their clause; other claims in the same file are still checked.`);
  process.exit(1);
}

console.log(
  `Forbidden lexicon PASS  scanned ${scanned} files ` +
    `(${FORBIDDEN_TERMS.en.length} EN terms, ${FORBIDDEN_TERMS.ko.length} KO terms; ` +
    `analysis floor ${ANALYSIS_UNIVERSAL_FORBIDDEN.en.length} EN + ${ANALYSIS_UNIVERSAL_FORBIDDEN.ko.length} KO)`,
);
