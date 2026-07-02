// Group the IPIP-NEO-120 result into the facet-lens shape: each of the 5 domains
// with its overall bar + its 6 facets (label + 0-100 percent). This is the
// precision payoff over BFI-44 (domain-only) — "which kind of extraversion". Pure +
// tested; the FacetBreakdown component renders it.

import { FACETS_BY_DOMAIN, FACET_LABEL, ipipMeanToPercent } from "./ipip-neo";
import { TRAIT_LABEL_EN, TRAIT_LABEL_KO, type BigFiveTrait } from "./bfi";

// Same domain order the persona / LensView use (O C E A N).
export const FACET_DOMAIN_ORDER: readonly BigFiveTrait[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism",
] as const;

export interface FacetRow {
  key: string;
  label: string;
  /** 0-100, or null if that facet wasn't scored. */
  percent: number | null;
}

export interface FacetDomainGroup {
  domain: BigFiveTrait;
  domainLabel: string;
  domainPercent: number | null;
  facets: FacetRow[];
}

export function facetRows(
  facets: Record<string, number>,
  domains: Partial<Record<BigFiveTrait, number>>,
  locale: "en" | "ko",
): FacetDomainGroup[] {
  const dl = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;
  return FACET_DOMAIN_ORDER.map((domain) => {
    const dm = domains[domain];
    return {
      domain,
      domainLabel: dl[domain],
      domainPercent: typeof dm === "number" ? ipipMeanToPercent(dm) : null,
      facets: FACETS_BY_DOMAIN[domain].map((key) => {
        const v = facets[key];
        return {
          key,
          label: FACET_LABEL[locale][key] ?? key,
          percent: typeof v === "number" ? ipipMeanToPercent(v) : null,
        };
      }),
    };
  });
}
