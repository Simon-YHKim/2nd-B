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
  LEXICON_SCAN_ALLOWLIST,
  type Locale,
} from "../src/lib/safety/lexicon";
import {
  containsAnalysisForbidden,
  containsForbiddenLexicon,
} from "../src/lib/safety/classifier";

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

// Analysis-lexicon scan (ANALYSIS_UNIVERSAL_FORBIDDEN) is line-granular with
// a guardrail-context filter: a line that PROHIBITS a term is policy
// enforcement, not a violation. Without this, the safety prompts themselves
// ("Never diagnose…" in knowledge/loader.ts + knowledge/retrieve.ts and the
// interview guardrails in interview/probe.ts) would fail their own gate.
// Line granularity keeps the filter surgical: an affirmative claim elsewhere
// in the same file is still caught.
const GUARDRAIL_LINE: Record<Locale, RegExp> = {
  en: /\b(?:never|not|no(?:n)?-|don'?t|doesn'?t|do not|does not|avoid|forbidden|banned|prohibited|without)\b/i,
  // 지 마/지마: imperative prohibition ("쓰지 마", "하지마") — the LLM prompt
  // guardrails phrase bans this way.
  ko: /않|안 |안된|안 된|금지|아님|아닙|아니|없(?:는|습|음|이|다)|말 것|말것|마세요|지 마|지마/,
};

function analysisHits(content: string, locale: Locale): string[] {
  const hits = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (GUARDRAIL_LINE[locale].test(line)) continue;
    for (const term of containsAnalysisForbidden(line, locale)) hits.add(term);
  }
  return [...hits];
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
  const enHits = containsForbiddenLexicon(content, "en");
  const koHits = containsForbiddenLexicon(content, "ko");
  if (enHits.length > 0) failures.push({ file: rel, locale: "en", list: "forbidden", hits: enHits });
  if (koHits.length > 0) failures.push({ file: rel, locale: "ko", list: "forbidden", hits: koHits });
  const enAnalysis = analysisHits(content, "en");
  const koAnalysis = analysisHits(content, "ko");
  if (enAnalysis.length > 0) failures.push({ file: rel, locale: "en", list: "analysis", hits: enAnalysis });
  if (koAnalysis.length > 0) failures.push({ file: rel, locale: "ko", list: "analysis", hits: koAnalysis });
}

if (failures.length > 0) {
  console.error("Forbidden lexicon check FAILED:");
  for (const { file, locale, list, hits } of failures) {
    console.error(`  - ${file} [${locale}/${list}]: ${hits.join(", ")}`);
  }
  console.error(`\nDefine policy in src/lib/safety/lexicon.ts.`);
  console.error(`Whitelist legitimate uses by adding the path to LEXICON_SCAN_ALLOWLIST.`);
  console.error(`Guardrail lines that PROHIBIT a term are auto-skipped (GUARDRAIL_LINE).`);
  process.exit(1);
}

console.log(
  `Forbidden lexicon PASS  scanned ${scanned} files ` +
    `(${FORBIDDEN_TERMS.en.length} EN terms, ${FORBIDDEN_TERMS.ko.length} KO terms; ` +
    `analysis floor ${ANALYSIS_UNIVERSAL_FORBIDDEN.en.length} EN + ${ANALYSIS_UNIVERSAL_FORBIDDEN.ko.length} KO)`,
);
