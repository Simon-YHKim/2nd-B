// SOKA — Self-Other Knowledge Asymmetry (Vazire, 2010): others perceive a person's
// OBSERVABLE traits (extraversion most readily; then the behaviorally-visible
// conscientiousness and agreeableness) more accurately than their internal ones
// (neuroticism, openness), which the self knows better. So from a user's OWN Big
// Five we can honestly surface "the part of you most readable from outside" --
// grounded in their self-report, and explicitly NOT a claim about what any specific
// other person thinks (that requires peer data, which the Seen view collects
// separately). Pure + tested; the Seen lens renders it.

import {
  bfiMeanToPercent,
  TRAIT_LABEL_EN,
  TRAIT_LABEL_KO,
  type BigFiveTrait,
} from "./bfi";

export type BfiMeans = Record<BigFiveTrait, number>;

// Ordered by observability (extraversion highest). Neuroticism + openness are the
// LESS-observable, more-internal traits and are deliberately excluded here.
export const OBSERVABLE_TRAITS: readonly BigFiveTrait[] = [
  "extraversion",
  "conscientiousness",
  "agreeableness",
] as const;

export interface ObservableTrait {
  trait: BigFiveTrait;
  label: string;
  /** 0-100, same (v-1)/4 anchor as the persona bars. */
  percent: number;
}

export function observableSelf(means: BfiMeans | null, locale: "en" | "ko"): ObservableTrait[] {
  if (!means) return [];
  const labels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;
  return OBSERVABLE_TRAITS.map((trait) => ({
    trait,
    label: labels[trait],
    percent: bfiMeanToPercent(means[trait]),
  })).sort((a, b) => b.percent - a.percent);
}
