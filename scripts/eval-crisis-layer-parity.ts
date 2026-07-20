// Crisis-vocabulary layer parity audit (session ai, 2026-07-21; cowork 발주 04:29 B[P0]).
//
// The crisis boundary is enforced at three places with FOUR vocabulary carriers:
//   L1a  src/lib/safety/lexicon.ts CRISIS_TERMS          (client gate, C9 primary)
//   L1b  supabase/functions/gemini-proxy/index.ts        (server gate, inlined copy)
//   L1c  supabase/functions/_shared/llm-proxy-common.ts  (server gate, claude/openai)
//   L2   src/lib/llm/safety.ts SYSTEM_PROMPT markers     (Flash semantic classifier
//        exemplars - Active RED / Latent RED lines, EN + KO)
//
// L1a<->L1b<->L1c byte-parity is ALREADY CI-enforced
// (src/lib/safety/__tests__/crisis-terms-proxy-parity.test.ts). The open
// question (cowork: "약을 모 말고 몇 개나 더 있는지") is the L2<->L1 delta:
// a marker the semantic layer knows but the deterministic gates pass. This
// script extracts all four sets from the CURRENT sources and prints the full
// presence matrix + both delta directions. Report-only: it changes nothing
// and is not wired into verify (recommendation pending approval).
//
// Direction semantics (why the two deltas are NOT symmetric bugs):
//   L2-only  -> the deterministic gates PASS input the semantic layer would
//               flag. On keyless-web input paths (classifyInputAnyLocale +
//               proxy hasCrisisTerm only) this is a REAL C9 gap = the finding.
//   L1-only  -> by design. The prompt lists exemplars, not the full gate list;
//               the model generalizes. Absence from the prompt does not stop
//               Flash from flagging the phrase.
//
// Run from the repo root:
//   npx tsx scripts/eval-crisis-layer-parity.ts           (full report)
//   npx tsx scripts/eval-crisis-layer-parity.ts --check   (CI gate)
// Deterministic, offline, zero LLM calls.
//
// --check (Simon approval 2026-07-21, cowork 발주1②): compares the ACTUAL
// L2-only set against lexicon.ts APPROVED_L2_ONLY_MARKERS and exits 1 on any
// drift — an unapproved new marker (fresh gate gap) or a stale exception (the
// marker was removed/promoted but the list wasn't updated). Wired into
// `npm run verify` as check:crisis-parity.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { APPROVED_L2_ONLY_MARKERS, CRISIS_TERMS } from "../src/lib/safety/lexicon";

const ROOT = process.cwd();

function extractQuotedArray(src: string, constName: string): string[] {
  const start = src.indexOf(`const ${constName}`);
  if (start < 0) throw new Error(`${constName} not found`);
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  const close = src.indexOf("]", open);
  if (open < 0 || close < 0) throw new Error(`${constName} literal not found`);
  return [...src.slice(open + 1, close).matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

// Flash SYSTEM_PROMPT marker lines: "  Active RED: a, b,\n              c, d"
// (continuation lines are indented). Capture from the label to the next label.
function extractMarkers(prompt: string, section: "KOREAN" | "ENGLISH", label: "Active RED" | "Latent RED"): string[] {
  const secStart = prompt.indexOf(`${section} markers`);
  if (secStart < 0) throw new Error(`${section} markers section not found`);
  const secEnd = section === "KOREAN" ? prompt.indexOf("ENGLISH markers") : prompt.indexOf("OUTPUT (");
  const sec = prompt.slice(secStart, secEnd < 0 ? undefined : secEnd);
  const m = sec.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?:\\n\\s*(?:Latent RED|YELLOW|GREEN):|$)`));
  if (!m) throw new Error(`${label} not found in ${section}`);
  return m[1]!
    .split(",")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

interface LayerSets {
  en: Set<string>;
  ko: Set<string>;
}

function toSets(en: readonly string[], ko: readonly string[]): LayerSets {
  return { en: new Set(en), ko: new Set(ko) };
}

function main(): void {
  const geminiProxy = readFileSync(join(ROOT, "supabase/functions/gemini-proxy/index.ts"), "utf8");
  const shared = readFileSync(join(ROOT, "supabase/functions/_shared/llm-proxy-common.ts"), "utf8");
  const safetySrc = readFileSync(join(ROOT, "src/lib/llm/safety.ts"), "utf8");

  const l1a = toSets(CRISIS_TERMS.en, CRISIS_TERMS.ko);
  const l1b = toSets(extractQuotedArray(geminiProxy, "CRISIS_TERMS_EN"), extractQuotedArray(geminiProxy, "CRISIS_TERMS_KO"));
  const l1c = toSets(extractQuotedArray(shared, "CRISIS_TERMS_EN"), extractQuotedArray(shared, "CRISIS_TERMS_KO"));
  const l2 = toSets(
    [...extractMarkers(safetySrc, "ENGLISH", "Active RED"), ...extractMarkers(safetySrc, "ENGLISH", "Latent RED")],
    [...extractMarkers(safetySrc, "KOREAN", "Active RED"), ...extractMarkers(safetySrc, "KOREAN", "Latent RED")],
  );

  // L1 internal parity (should be exact - CI already enforces it; re-assert).
  for (const locale of ["en", "ko"] as const) {
    const a = [...l1a[locale]].sort().join("|");
    for (const [name, set] of [["gemini-proxy", l1b], ["_shared", l1c]] as const) {
      const b = [...set[locale]].sort().join("|");
      if (a !== b) console.log(`!! L1 DRIFT (${locale}) lexicon vs ${name} - parity test should have caught this`);
    }
  }

  const union = {
    en: [...new Set([...l1a.en, ...l2.en])].sort(),
    ko: [...new Set([...l1a.ko, ...l2.ko])].sort(),
  };

  // A term is COVERED by the gate when the gate would fire on text containing
  // it - i.e. some gate term is a substring of the marker (ko semantics; for
  // en, word-boundary containment approximated by substring on the phrase).
  const coveredByGate = (marker: string, locale: "en" | "ko"): boolean =>
    [...l1a[locale]].some((g) => marker.toLowerCase().includes(g.toLowerCase()));

  // --check: CI gate against the approved exception list (lexicon.ts SoT).
  if (process.argv.includes("--check")) {
    let drift = 0;
    for (const locale of ["en", "ko"] as const) {
      const actual = [...l2[locale]].filter((t) => !l1a[locale].has(t) && !coveredByGate(t, locale)).sort();
      const approved = [...APPROVED_L2_ONLY_MARKERS[locale]].sort();
      const unapproved = actual.filter((t) => !approved.includes(t));
      const stale = approved.filter((t) => !actual.includes(t));
      for (const t of unapproved) {
        drift++;
        console.error(
          `CRISIS-PARITY FAIL (${locale}): Flash marker "${t}" is not covered by the deterministic gate ` +
            `and is not in APPROVED_L2_ONLY_MARKERS. Either promote it into CRISIS_TERMS (all 3 mirrors + ` +
            `parity test) or record it as an approved exception with its reason in lexicon.ts.`,
        );
      }
      for (const t of stale) {
        drift++;
        console.error(
          `CRISIS-PARITY FAIL (${locale}): approved exception "${t}" is no longer an L2-only marker ` +
            `(promoted or removed from the prompt). Delete the stale entry from APPROVED_L2_ONLY_MARKERS.`,
        );
      }
    }
    if (drift > 0) process.exit(1);
    console.log("CRISIS-PARITY PASS  L1 mirrors byte-identical (jest) + L2-only markers == approved exception list");
    return;
  }

  for (const locale of ["en", "ko"] as const) {
    console.log(`\n### ${locale.toUpperCase()} presence matrix (${union[locale].length} terms)`);
    console.log("| term | L1 gate (lexicon=proxy x2) | L2 Flash marker | note |");
    console.log("|---|---|---|---|");
    for (const t of union[locale]) {
      const inGate = l1a[locale].has(t);
      const inL2 = l2[locale].has(t);
      const note = !inGate && inL2 ? (coveredByGate(t, locale) ? "gate covers via substring term" : "**L2-only: gate passes this**") : "";
      console.log(`| ${t} | ${inGate ? "Y" : "-"} | ${inL2 ? "Y" : "-"} | ${note} |`);
    }
  }

  console.log("\n### L2-only markers NOT covered by any gate term (the C9 gap list)");
  for (const locale of ["en", "ko"] as const) {
    const gaps = [...l2[locale]].filter((t) => !l1a[locale].has(t) && !coveredByGate(t, locale));
    console.log(`  ${locale}: ${gaps.length === 0 ? "(none)" : gaps.map((g) => `"${g}"`).join(", ")}`);
  }
  console.log("\n### Gate terms absent from the L2 marker list (by design - exemplars, not exhaustive)");
  for (const locale of ["en", "ko"] as const) {
    const only = [...l1a[locale]].filter((t) => !l2[locale].has(t) && ![...l2[locale]].some((m) => m.toLowerCase().includes(t.toLowerCase())));
    console.log(`  ${locale}: ${only.length === 0 ? "(none)" : only.map((g) => `"${g}"`).join(", ")}`);
  }
}

main();
