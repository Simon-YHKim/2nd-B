// CRISIS-promotion review harness for the two approved candidates
// "약을 모" (ko) and "overdose" (en) — Simon-approved review round
// (cowork 발주1③, 2026-07-21). Same methodology as scripts/eval-lexicon-bareterm.ts:
// run the REAL classifyInput() over a labeled synthetic corpus
// (scripts/eval-crisis-promotion.corpus.json) and simulate each candidate's
// promotion WITHOUT modifying lexicon.ts — the actual promotion is a human
// decision (발주 boundary: 심사 결과까지, 실제 승격은 승인 후).
//
// Corpus design notes:
//   - red samples deliberately avoid every EXISTING CRISIS_TERMS entry, so the
//     candidate's NET rescue is measured directly (no already-caught noise).
//   - yak-r05 is the word-order-split limitation case ("약을 몇 주째 모으고"):
//     the candidate substring does NOT hit it by construction — it is exempt
//     from the corpus containment assertion and stays an HONEST miss in the
//     table (dep-r04 class; the D4 semantic layer's territory).
//   - simulation replicates matchesTerm semantics: ko = substring over
//     NFC/lower/ws-collapsed text; en = word-boundary scan.
//
// Run from the repo root:  npx tsx scripts/eval-crisis-promotion.ts
// Deterministic, offline, zero LLM calls.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyInput } from "../src/lib/safety/classifier";

type Truth = "red" | "normal";
interface Sample {
  id: string;
  term: "약을 모" | "overdose";
  truth: Truth;
  text: string;
  note?: string;
}

const CANDIDATES: Record<"약을 모" | "overdose", { locale: "en" | "ko" }> = {
  "약을 모": { locale: "ko" },
  overdose: { locale: "en" },
};

function normed(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ");
}
function hitsKo(text: string, term: string): boolean {
  return normed(text).includes(normed(term));
}
function hitsEnWord(text: string, term: string): boolean {
  const lower = normed(text);
  const t = normed(term);
  const isBoundary = (ch: string) => /[^a-z0-9]/i.test(ch);
  for (let idx = lower.indexOf(t); idx !== -1; idx = lower.indexOf(t, idx + 1)) {
    const before = idx === 0 ? " " : lower[idx - 1];
    const after = idx + t.length >= lower.length ? " " : lower[idx + t.length];
    if (isBoundary(before) && isBoundary(after)) return true;
  }
  return false;
}
function candidateHits(text: string, term: "약을 모" | "overdose"): boolean {
  return CANDIDATES[term].locale === "ko" ? hitsKo(text, term) : hitsEnWord(text, term);
}

function main(): void {
  const corpus = JSON.parse(
    readFileSync(join(process.cwd(), "scripts", "eval-crisis-promotion.corpus.json"), "utf8"),
  ) as { samples: Sample[] };
  const samples = corpus.samples;

  // Integrity: every sample contains its candidate term, EXCEPT the marked
  // word-order-split limitation case (its absence is the point).
  for (const s of samples) {
    const exempt = (s.note ?? "").includes("word-order split");
    if (!exempt && !candidateHits(s.text, s.term)) {
      throw new Error(`corpus integrity: ${s.id} lacks "${s.term}"`);
    }
    if (exempt && candidateHits(s.text, s.term)) {
      throw new Error(`corpus integrity: ${s.id} marked word-order-split but the term hits`);
    }
  }

  console.log("| id | truth | current zone | promoted zone | note |");
  console.log("|---|---|---|---|---|");
  const rows = samples.map((s) => {
    const locale = CANDIDATES[s.term].locale;
    const current = classifyInput(s.text, locale).zone;
    const promoted = current === "red" || candidateHits(s.text, s.term) ? "red" : current;
    console.log(`| ${s.id} | ${s.truth} | ${current} | ${promoted} | ${s.note ?? ""} |`);
    return { s, current, promoted };
  });

  for (const term of ["약을 모", "overdose"] as const) {
    const mine = rows.filter(({ s }) => s.term === term);
    const normals = mine.filter(({ s }) => s.truth === "normal");
    const reds = mine.filter(({ s }) => s.truth === "red");
    const fpNow = normals.filter((r) => r.current === "red").length;
    const fpPromoted = normals.filter((r) => r.promoted === "red").length;
    const fnNow = reds.filter((r) => r.current !== "red").length;
    const fnPromoted = reds.filter((r) => r.promoted !== "red").length;
    console.log(
      `\n"${term}": FP ${fpNow}/${normals.length} -> ${fpPromoted}/${normals.length} | ` +
        `FN ${fnNow}/${reds.length} -> ${fnPromoted}/${reds.length} (승격 시)`,
    );
  }
  console.log(
    "\n주의: red 샘플은 기존 CRISIS 항목을 의도적으로 회피해 구성했다(순수 순증분 측정). " +
      "합성·작성자-구성 코퍼스로 유병률을 추정하지 않는다.",
  );
}

main();
