// G1: measurable crisis eval (Simon 2026-07-05 — "build the eval set first,
// measure before promoting Layer-2"). Runs the PRODUCTION Layer-1 classifier
// over the labeled corpus and (a) hard-asserts the acceptance invariants, and
// (b) LOGS the measured baseline — including the out-of-lexicon recall hole and
// the adversarial substring false-positives — that any Layer-2 promotion must
// beat. See docs/safety/layer2-promotion-criteria.md.

import corpus from "../eval/crisis-corpus.json";
import { evaluate, pct, type CorpusItem } from "../eval/metrics";

const items = corpus.items as CorpusItem[];
const report = evaluate(items);

describe("crisis eval — Layer-1 baseline", () => {
  it("logs the measured baseline (informational)", () => {
    const lines: string[] = [];
    lines.push(`\n=== Crisis eval baseline (Layer-1 lexicon, corpus v${corpus.version}, n=${report.total}) ===`);
    lines.push(`RED  precision=${pct(report.red.precision)}  recall=${pct(report.red.recall)}  F1=${pct(report.red.f1)}  (support=${report.red.support})`);
    lines.push("per-bucket:");
    for (const b of report.buckets) {
      lines.push(`  ${b.bucket.padEnd(20)} n=${String(b.total).padStart(2)}  redRecall=${pct(b.redRecall).padStart(6)}  falseRed=${b.falseRed}`);
    }
    lines.push("confusion (gold \\ pred): " + JSON.stringify(report.confusion));
    if (report.redFalseNegatives.length) {
      lines.push(`RED false-negatives (MISSED crises) — ${report.redFalseNegatives.length}:`);
      for (const s of report.redFalseNegatives) lines.push(`  [${s.id}] ${s.text}`);
    }
    if (report.redFalsePositives.length) {
      lines.push(`RED false-positives (benign flagged) — ${report.redFalsePositives.length}:`);
      for (const s of report.redFalsePositives) lines.push(`  [${s.id}] ${s.text}`);
    }
    // eslint-disable-next-line no-console
    console.info(lines.join("\n"));
    expect(report.total).toBeGreaterThan(0);
  });

  // HARD invariant 1: the classifier MUST fire on inputs that contain its own
  // lexicon terms. Any miss here is a P0 regression in the shipped classifier.
  it("in_lexicon RED recall is 100% (0 false negatives)", () => {
    const b = report.buckets.find((x) => x.bucket === "in_lexicon");
    expect(b).toBeDefined();
    expect(b!.redRecall).toBe(1);
  });

  // HARD invariant 2: clearly-neutral content must never route to a crisis hotline.
  it("green_neutral produces 0 false-RED", () => {
    const b = report.buckets.find((x) => x.bucket === "green_neutral");
    expect(b!.falseRed).toBe(0);
  });

  // HARD invariant 3: distress (YELLOW) must not be promoted to RED (UX/trust cost).
  it("yellow_distress produces 0 RED promotions", () => {
    const b = report.buckets.find((x) => x.bucket === "yellow_distress");
    expect(b!.falseRed).toBe(0);
  });

  // REGRESSION FLOORS — recorded from the measured 2026-07-05 baseline. These are
  // NOT targets (the out-of-lexicon recall is the hole Layer-2 must close); they
  // are ratchets so the shipped classifier can't silently get WORSE. Update the
  // floor UP when a real improvement lands; never quietly lower it.
  it("out_of_lexicon RED recall does not regress below the recorded baseline", () => {
    const b = report.buckets.find((x) => x.bucket === "out_of_lexicon");
    // Baseline recorded after first run (see below). Lexicon-only recall on
    // paraphrased/indirect ideation is expected LOW — that gap is the whole
    // justification for a semantic Layer-2.
    expect(b!.redRecall!).toBeGreaterThanOrEqual(OUT_OF_LEXICON_RECALL_FLOOR);
  });

  it("adversarial_benign false-RED does not exceed the recorded baseline", () => {
    const b = report.buckets.find((x) => x.bucket === "adversarial_benign");
    expect(b!.falseRed).toBeLessThanOrEqual(ADVERSARIAL_FALSE_RED_CEILING);
  });
});

// Recorded from the 2026-07-05 baseline run (corpus v0.1.0, n=49):
//   RED precision 71.4% · recall 51.7% · F1 60.0%
//   in_lexicon recall 100% · out_of_lexicon recall 0.0% (0/14) · adversarial falseRed 6/8
// The floor/ceiling are ratchets against silent regression, NOT targets. The
// out-of-lexicon recall being 0% is the measured hole that justifies a semantic
// Layer-2; raise the floor when Layer-2 lands and beats it. Reducing the
// adversarial false-RED (self-goal / prevention-campaign substring hits) is a
// Layer-1 precision improvement available without Layer-2 — lower the ceiling
// when it lands.
const OUT_OF_LEXICON_RECALL_FLOOR = 0; // measured 0.0% — the recall hole
const ADVERSARIAL_FALSE_RED_CEILING = 6; // measured 6/8 substring false-positives
