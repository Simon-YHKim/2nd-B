# Layer-2 semantic crisis classifier — promotion criteria

> Status: **baseline established, Layer-2 NOT promoted.** Owner sign-off (Simon) required to promote.
> Decision context: G1 (2026-07-05) — "build the eval set first, measure before promoting Layer-2."

## Why this doc exists

The crisis gate is layered (defense in depth):

1. **Layer-1** — lexicon backstop (`src/lib/safety/classifier.ts`, `classifyInput`). Synchronous, always runs.
2. **Layer-2** — Gemini Flash semantic classifier (`src/lib/llm/safety.ts`, `classifySafety`).

On the **live web + non-Vertex builds, Layer-2 is null** (`getFlashClient()` returns null on `live && !EXPO_PUBLIC_USE_VERTEX`, to avoid uncapped direct-API egress). So **production crisis routing is Layer-1 only.** That disable is correct — do **not** flip it to re-enable the uncapped direct client. The real promotion path is to run Layer-2 **server-side inside `gemini-proxy`** (capped, proxy/GCP-billed) as a `safety_classify` purpose.

Promotion is a **safety-clinical + cost gate** → Simon sign-off required.

## Measured baseline — Layer-1, corpus v0.1.0 (2026-07-05)

Run: `src/lib/safety/__tests__/crisis-eval-baseline.test.ts` (part of `npm run verify`) or the eval harness. Corpus: `src/lib/safety/eval/crisis-corpus.json` (n=49).

| Bucket | n | RED recall | false-RED |
|---|---|---|---|
| in_lexicon (RED, contains a term) | 15 | **100.0%** | — |
| out_of_lexicon (RED, no exact term) | 14 | **0.0%** | — |
| adversarial_benign (benign, crisis-adjacent) | 8 | — | **6** |
| yellow_distress | 6 | — | 0 |
| green_neutral | 6 | — | 0 |

Overall RED: **precision 71.4% · recall 51.7% · F1 60.0%.**

**Reading:** Layer-1 fires perfectly on inputs containing its own lexicon terms, but catches **none** of the indirect/paraphrased ideation (약을 모아뒀어요 / 옥상에 서 있다 / "giving away the things I care about"). That 0% out-of-lexicon recall is the entire justification for a semantic Layer-2. Separately, substring matching over-fires on benign crisis-adjacent text (자살골, 마지막 인사 장면, 자살 예방 캠페인) — a Layer-1 **precision** problem fixable independently of Layer-2.

## Promotion criteria (all must hold, on the eval corpus)

Layer-2 (server-side `safety_classify` via `gemini-proxy`) may be promoted **only when**, measured against the eval corpus with the promotion candidate wired as `lexicon ∪ semantic`:

1. **No RED-recall regression.** RED recall on the full RED set ≥ Layer-1 baseline, and **in_lexicon recall stays 100% (0 FN).**
2. **Closes the hole.** out_of_lexicon RED recall improves by a materially large margin over the 0% baseline (target ≥ 60%; the whole point of Layer-2). This is the primary justification — a Layer-2 that does not move this number is not worth its cost/latency.
3. **False-positive budget.** GREEN→RED false-positive rate stays within an agreed budget (proposed ≤ 5% overall; must not worsen the adversarial_benign false-RED count of 6).
4. **Latency budget.** p95 added latency within the agreed chat/advisor budget (proposed ≤ 800 ms server-side).
5. **Spend solved the right way.** Runs server-side and capped (via `bump_gemini_spend` in `gemini-proxy`), **never** the uncapped direct client. Cost per turn quantified and accepted.
6. **Owner sign-off.** Simon approves (safety-clinical gate). Crisis/consent copy stays EN-only until human review (existing policy).

## Growing the corpus

The out-of-lexicon RED labels are provisional (`reviewed: null`) and should get a clinical review pass before being treated as ground truth. Per `docs/research/batches/crisis-detection.md` §Cautions, add a privacy-preserving "this wasn't right" flag on Advisor replies (categorical flag + `routing_template_version` only, never raw text) so real production misses feed new corpus candidates for labeling. Defer until this eval harness exists (it now does).
