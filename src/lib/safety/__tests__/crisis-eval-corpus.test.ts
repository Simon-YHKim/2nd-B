// Measurable crisis-classifier eval (G1). Scores the runtime Layer-1 lexicon
// against the labeled corpus and prints recall/precision so the Layer-2 decision
// is grounded in numbers. Asserts only the safety invariants that must always
// hold; the RED_LATENT recall gap is LOGGED (not asserted) because closing it is
// precisely Layer 2's job — see crisis-eval-corpus.ts.

import { classifyInput } from "../classifier";
import { CRISIS_EVAL, KNOWN_LAYER1_FALSE_POSITIVES, evaluateClassifier } from "../crisis-eval-corpus";

const classify = (text: string, locale: "ko" | "en") => classifyInput(text, locale);

describe("crisis eval corpus — Layer 1 (lexicon) benchmark", () => {
  const m = evaluateClassifier(classify);

  test("metrics summary (informational)", () => {
    // Surfaced in CI logs; makes the Layer-2 gap visible and trackable.
    // eslint-disable-next-line no-console
    console.log(
      "[crisis-eval] Layer-1 metrics\n" +
        `  RED_EXPLICIT recall: ${(m.redExplicit.recall * 100).toFixed(0)}% (${m.redExplicit.caught}/${m.redExplicit.total})\n` +
        `  RED_LATENT   recall: ${(m.redLatent.recall * 100).toFixed(0)}% (${m.redLatent.caught}/${m.redLatent.total})  <- Layer-2 target\n` +
        `  YELLOW  false-RED: ${m.yellow.falseRed}/${m.yellow.total}\n` +
        `  GREEN   false-RED: ${m.green.falseRed}/${m.green.total}\n` +
        `  GREEN_TRAP false-RED: ${m.greenTrap.falseRed}/${m.greenTrap.total}` +
        (m.greenTrap.falseRedTexts.length ? ` (known idiom FP: ${m.greenTrap.falseRedTexts.join(", ")})` : "") +
        "\n" +
        (m.redLatent.missed.length ? `  latent misses (Layer-2 must catch):\n   - ${m.redLatent.missed.join("\n   - ")}` : ""),
    );
    expect(m).toBeTruthy();
  });

  // ── Safety invariants (must always hold) ──────────────────────────────────

  test("RED_EXPLICIT: 0 false-negatives (P0 — every explicit case caught)", () => {
    expect(m.redExplicit.missed).toEqual([]);
  });

  test("GREEN: never falsely promoted to RED", () => {
    expect(m.green.falseRed).toBe(0);
  });

  test("GREEN_TRAP: only the documented lexicon false-positive mis-fires (no NEW ones)", () => {
    // Layer 1 currently mis-flags exactly the known "자살골"(own goal) idiom
    // (KNOWN_LAYER1_FALSE_POSITIVES) — surfaced for the G1 allowlist decision.
    // Asserting the exact set means any additional false-positive fails the build.
    expect(m.greenTrap.falseRedTexts.sort()).toEqual([...KNOWN_LAYER1_FALSE_POSITIVES].sort());
  });

  test("YELLOW: distress never promoted to RED", () => {
    expect(m.yellow.falseRed).toBe(0);
  });

  // ── Layer-2 gap (measured, not a failure) ─────────────────────────────────

  test("RED_LATENT recall is recorded as the Layer-2 requirement", () => {
    // Whatever Layer 1 misses here is the concrete argument for Layer 2. We only
    // assert the corpus is non-trivial so the benchmark stays meaningful.
    expect(CRISIS_EVAL.RED_LATENT.length).toBeGreaterThanOrEqual(8);
    expect(m.redLatent.recall).toBeGreaterThanOrEqual(0);
  });
});
