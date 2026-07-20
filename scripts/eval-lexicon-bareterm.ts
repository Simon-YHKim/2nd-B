// Bare-term lexicon decision harness (session ai, 2026-07-21; cowork 발주 03:35).
//
// Question: should "우울증" / "진단" be added to the safety lexicon, and if so
// at which tier? This script produces the MEASURED half of that judgment:
// it runs the real classifyInput() over a labeled synthetic corpus
// (scripts/eval-lexicon-bareterm.corpus.json) and simulates each candidate
// configuration WITHOUT modifying src/lib/safety/lexicon.ts (the actual list
// change is a human decision - stop condition per the order).
//
// Configurations compared per sample:
//   current   - lexicon as checked in (CRISIS red / FORBIDDEN yellow)
//   A bare-red    - 우울증+진단 added to CRISIS_TERMS (both short-circuit red)
//   B bare-yellow - 우울증+진단 added to FORBIDDEN_TERMS (yellow, no routing)
//   D colloc-red  - targeted crisis collocations added instead of bare terms
//                   (candidates: "약을 모", "뛰어내리" - the first is ALREADY a
//                   marker in the Flash classifier prompt, so today layer-1
//                   (lexicon) and layer-2 (semantic) disagree on it)
//
// Simulation fidelity: matchesTerm's ko path is substring over an
// NFC-normalized, lower-cased, whitespace-collapsed haystack; the same
// normalization is replicated here (normKo). Zone precedence mirrors
// classifyInput: crisis beats forbidden beats green.
//
// Also measured: CI blast radius. FORBIDDEN and ANALYSIS additions feed
// scripts/check-forbidden-lexicon.ts, which scans ROOT_DIRS below. For each
// candidate term this script counts the non-allowlisted files that would be
// flagged (FORBIDDEN = file-granular unconditional; ANALYSIS = line-granular
// with the guardrail-negation filter, replicated here for the estimate).
//
// Run from the repo root:  npx tsx scripts/eval-lexicon-bareterm.ts
// Deterministic, offline, zero LLM calls (C1/C3 untouched).
//
// BASELINE SHIFT NOTE (2026-07-21, after the bare-term round): Simon adopted
// recommendation #2 - "우울증" is now in FORBIDDEN_TERMS.ko (yellow). The
// `current` column therefore reads yellow (not green) for every 우울증-bearing
// sample on post-adoption checkouts. To reproduce the original decision table
// (PR #1118), run this script on the #1118 merge commit. FP/FN counts are
// unaffected (yellow is not crisis routing).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { classifyInput } from "../src/lib/safety/classifier";
import { isLexiconScanAllowed } from "../src/lib/safety/lexicon";

type Truth = "red" | "normal";
interface Sample {
  id: string;
  term: "우울증" | "진단" | "both";
  truth: Truth;
  text: string;
  note?: string;
}

const BARE_TERMS = ["우울증", "진단"] as const;
const COLLOC_TERMS = ["약을 모", "뛰어내리"] as const;

function normKo(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}
function koIncludes(text: string, term: string): boolean {
  return normKo(text).includes(normKo(term));
}

type Zone = "green" | "yellow" | "red";
interface Verdicts {
  current: Zone;
  bareRed: Zone;
  bareYellow: Zone;
  collocRed: Zone;
}

function verdicts(text: string): Verdicts {
  const current = classifyInput(text, "ko").zone;
  const hasBare = BARE_TERMS.some((t) => koIncludes(text, t));
  const hasColloc = COLLOC_TERMS.some((t) => koIncludes(text, t));
  return {
    current,
    bareRed: current === "red" || hasBare ? "red" : current,
    bareYellow: current === "red" ? "red" : hasBare ? "yellow" : current,
    collocRed: current === "red" || hasColloc ? "red" : current,
  };
}

// --- CI blast-radius walk (mirrors scripts/check-forbidden-lexicon.ts) ------
const ROOT = process.cwd();
const ROOT_DIRS = ["src", "supabase/functions", "locales", "db", "docs"];
const ROOT_FILES = ["README.md"];
const EXT_OK = /\.(?:ts|tsx|js|jsx|json|sql|md)$/;
const IGNORE_DIRS = new Set([
  "node_modules", ".expo", "dist", "ios", "android", "coverage", ".git", "__tests__", "clone-audit",
]);
// ko guardrail-negation line filter, copied from check-forbidden-lexicon.ts
// (a line that PROHIBITS a term is policy enforcement, not a violation).
const KO_GUARDRAIL = /않|안 |안된|안 된|금지|아님|아닙|아니|없(?:는|습|음|이|다)|말 것|말것|마세요|지 마|지마/;

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

function scannedFiles(): string[] {
  const files: string[] = [];
  for (const dir of ROOT_DIRS) walk(join(ROOT, dir), files);
  for (const f of ROOT_FILES) {
    try {
      if (statSync(join(ROOT, f)).isFile()) files.push(join(ROOT, f));
    } catch {
      /* absent */
    }
  }
  return files.filter((f) => !isLexiconScanAllowed(relative(ROOT, f).split(sep).join("/")));
}

function ciImpact(term: string, files: string[]): { forbiddenFiles: number; analysisFiles: number } {
  let forbiddenFiles = 0;
  let analysisFiles = 0;
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (!koIncludes(content, term)) continue;
    forbiddenFiles++; // FORBIDDEN scan is file-granular and unconditional
    const lineHit = content
      .split("\n")
      .some((line) => koIncludes(line, term) && !KO_GUARDRAIL.test(line));
    if (lineHit) analysisFiles++; // ANALYSIS scan is line-granular with negation filter
  }
  return { forbiddenFiles, analysisFiles };
}

// --- report ------------------------------------------------------------------
function main(): void {
  const corpus = JSON.parse(
    readFileSync(join(ROOT, "scripts", "eval-lexicon-bareterm.corpus.json"), "utf8"),
  ) as { samples: Sample[] };
  const samples = corpus.samples;

  // Corpus integrity: every sample must contain its claimed term.
  for (const s of samples) {
    const want = s.term === "both" ? ["우울증", "진단"] : [s.term];
    for (const t of want) {
      if (!koIncludes(s.text, t)) throw new Error(`corpus integrity: ${s.id} lacks "${t}"`);
    }
  }

  const rows = samples.map((s) => ({ s, v: verdicts(s.text) }));

  console.log("| id | truth | current | A bare-red | B bare-yellow | D colloc-red |");
  console.log("|---|---|---|---|---|---|");
  for (const { s, v } of rows) {
    console.log(`| ${s.id} | ${s.truth} | ${v.current} | ${v.bareRed} | ${v.bareYellow} | ${v.collocRed} |`);
  }

  const cfgs = ["current", "bareRed", "bareYellow", "collocRed"] as const;
  console.log("\n| config | FP (normal->red) | FN (red not routed) |");
  console.log("|---|---|---|");
  for (const c of cfgs) {
    const fp = rows.filter(({ s, v }) => s.truth === "normal" && v[c] === "red").length;
    const fn = rows.filter(({ s, v }) => s.truth === "red" && v[c] !== "red").length;
    console.log(`| ${c} | ${fp}/${rows.filter(({ s }) => s.truth === "normal").length} | ${fn}/${rows.filter(({ s }) => s.truth === "red").length} |`);
  }

  const reds = rows.filter(({ s }) => s.truth === "red");
  const alreadyCaught = reds.filter(({ v }) => v.current === "red").length;
  console.log(
    `\nred 샘플 중 기존 문맥 결합 패턴으로 이미 red: ${alreadyCaught}/${reds.length}` +
      ` (${Math.round((100 * alreadyCaught) / reds.length)}%)` +
      ` -> bare-term red 추가의 순증분 = ${reds.length - alreadyCaught}건`,
  );
  const collocCaught = reds.filter(({ v }) => v.collocRed === "red").length;
  console.log(
    `콜로케이션 후보(${COLLOC_TERMS.join(", ")})만 추가 시 red 커버: ${collocCaught}/${reds.length}` +
      ` (FP ${rows.filter(({ s, v }) => s.truth === "normal" && v.collocRed === "red").length}건)`,
  );

  console.log("\nCI 파급 (비허용목록 스캔 파일 중 해당 어휘 포함 파일 수):");
  const files = scannedFiles();
  console.log(`  스캔 대상 파일 수: ${files.length}`);
  for (const t of BARE_TERMS) {
    const { forbiddenFiles, analysisFiles } = ciImpact(t, files);
    console.log(
      `  "${t}": FORBIDDEN 추가 시 ${forbiddenFiles}개 파일 플래그 / ANALYSIS 추가 시(부정문 필터 후) ${analysisFiles}개 파일 플래그`,
    );
  }
}

main();
