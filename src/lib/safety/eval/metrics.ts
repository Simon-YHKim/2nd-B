// G1 crisis eval metrics — runs the PRODUCTION Layer-1 classifier (classifyInput)
// over a labeled corpus and computes zone-level precision/recall/F1 + a confusion
// matrix, split by bucket. This measures the ACTUAL shipped classifier (lexicon
// only, since Layer-2 is null on live non-Vertex prod) so every Layer-2 promotion
// decision compares against a real baseline. Pure + offline (no network, no cost).

import { classifyInput } from "../classifier";
import type { Locale } from "../lexicon";

export type Zone = "green" | "yellow" | "red";
export type Bucket =
  | "in_lexicon"
  | "out_of_lexicon"
  | "adversarial_benign"
  | "yellow_distress"
  | "green_neutral";

export interface CorpusItem {
  id: string;
  text: string;
  locale: Locale;
  gold_zone: Zone;
  gold_cssrs: number | null;
  bucket: Bucket;
  note?: string;
}

export interface Scored extends CorpusItem {
  predicted: Zone;
  correct: boolean;
}

export interface ZoneStats {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface BucketStats {
  bucket: Bucket;
  total: number;
  redRecall: number | null; // for RED-gold buckets: fraction correctly flagged RED
  falseRed: number; // count of non-RED gold items predicted RED
}

export interface EvalReport {
  scored: Scored[];
  confusion: Record<Zone, Record<Zone, number>>; // gold -> predicted -> count
  red: ZoneStats;
  buckets: BucketStats[];
  redFalseNegatives: Scored[]; // gold red, predicted not red — the catastrophic misses
  redFalsePositives: Scored[]; // gold not red, predicted red — the UX/precision cost
  total: number;
  overallAccuracy: number;
}

const ZONES: Zone[] = ["green", "yellow", "red"];

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

export function scoreItem(item: CorpusItem): Scored {
  const r = classifyInput(item.text, item.locale);
  return { ...item, predicted: r.zone, correct: r.zone === item.gold_zone };
}

export function evaluate(items: CorpusItem[]): EvalReport {
  const scored = items.map(scoreItem);

  const confusion = Object.fromEntries(
    ZONES.map((g) => [g, Object.fromEntries(ZONES.map((p) => [p, 0])) as Record<Zone, number>]),
  ) as Record<Zone, Record<Zone, number>>;
  for (const s of scored) confusion[s.gold_zone][s.predicted] += 1;

  // RED is the decision that matters (crisis routing). TP = gold red & pred red.
  let tp = 0, fp = 0, fn = 0;
  for (const s of scored) {
    const goldRed = s.gold_zone === "red";
    const predRed = s.predicted === "red";
    if (goldRed && predRed) tp += 1;
    else if (!goldRed && predRed) fp += 1;
    else if (goldRed && !predRed) fn += 1;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = safeDiv(2 * precision * recall, precision + recall);

  const bucketNames = [...new Set(items.map((i) => i.bucket))] as Bucket[];
  const buckets: BucketStats[] = bucketNames.map((b) => {
    const inB = scored.filter((s) => s.bucket === b);
    const goldRed = inB.filter((s) => s.gold_zone === "red");
    const flaggedRed = goldRed.filter((s) => s.predicted === "red").length;
    const falseRed = inB.filter((s) => s.gold_zone !== "red" && s.predicted === "red").length;
    return {
      bucket: b,
      total: inB.length,
      redRecall: goldRed.length > 0 ? flaggedRed / goldRed.length : null,
      falseRed,
    };
  });

  return {
    scored,
    confusion,
    red: { tp, fp, fn, precision, recall, f1, support: tp + fn },
    buckets,
    redFalseNegatives: scored.filter((s) => s.gold_zone === "red" && s.predicted !== "red"),
    redFalsePositives: scored.filter((s) => s.gold_zone !== "red" && s.predicted === "red"),
    total: scored.length,
    overallAccuracy: safeDiv(scored.filter((s) => s.correct).length, scored.length),
  };
}

export function pct(x: number | null): string {
  return x === null ? "n/a" : `${(x * 100).toFixed(1)}%`;
}
