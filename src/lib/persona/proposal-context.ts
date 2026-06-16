// Prepare the propose-flow input for one self-understanding star: the current
// "before" value + supporting evidence pulled from a PersonaCard, ready to feed
// proposeSelfModelChange (propose-self-model.ts). Pure; the LLM call + ratify UI
// live elsewhere. This is the glue that makes "propose a change to star X" a
// one-call flow once the ratify surface is wired.

import type { PersonaCard } from "./build";
import type { StarId } from "./stars";

export interface ProposalContext {
  /** Current human-readable value of the star (the proposal's `before`). */
  before: string;
  /** Evidence the proposer reasons over (narrative summary + observed patterns). */
  evidence: string;
}

function evidenceFrom(card: PersonaCard): string {
  const parts: string[] = [];
  if (typeof card.patterns.summary === "string" && card.patterns.summary.length > 0) {
    parts.push(card.patterns.summary);
  }
  for (const [k, v] of Object.entries(card.patterns)) {
    if (k.startsWith("top_")) parts.push(`${k.slice(4)}: ${v}`);
  }
  return parts.join("\n");
}

export function proposalContextForStar(card: PersonaCard, starId: StarId): ProposalContext {
  const evidence = evidenceFrom(card);
  let before: string;
  switch (starId) {
    case "now":
      before = Object.entries(card.traits)
        .map(([k, v]) => `${k} ${Math.round(v * 100)}`)
        .join(", ");
      break;
    case "relational":
      before = card.attachment
        ? `${card.attachment.style} (anxiety ${card.attachment.anxiety.toFixed(1)}, avoidance ${card.attachment.avoidance.toFixed(1)})`
        : "not assessed yet";
      break;
    case "values":
      before = card.values.length > 0 ? card.values.join(", ") : "no value frameworks engaged yet";
      break;
    default:
      // recall / seen / rhythm / possible have no card-resident scalar yet.
      before = "not gathered yet";
  }
  return { before, evidence };
}
