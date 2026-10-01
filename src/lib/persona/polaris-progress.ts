import type { RoleCard } from "./role-cards";
import type { SevenStarId } from "./seven-stars";

/** Output slots mirror the six existing life inputs; profile is not a summary. */
export const POLARIS_CATEGORIES = ["infancy", "school", "twenties", "later", "work", "now"] as const satisfies readonly SevenStarId[];

export function polarisProgress(cards: readonly RoleCard[]) {
  const slots = POLARIS_CATEGORIES.map((category) => {
    const related = cards.filter((card) => card.evidence.domains.includes(category));
    const approved = related.filter((card) => card.status === "ratified");
    return { category, state: approved.length ? "filled" : related.length ? "proposed" : "empty", cards: related } as const;
  });
  const filled = slots.filter((slot) => slot.state === "filled").length;
  return { slots, filled, total: slots.length, firstApproved: filled > 0, complete: filled === slots.length };
}

export function isQaPolarisAutoEligible(input: {
  dev: boolean; email?: string; userId: string; sessionUserId?: string;
  tier: unknown; hasCards: boolean; hasEvidence: boolean; attempted: boolean;
}): boolean {
  return input.dev && input.email?.toLowerCase() === "qa.ai.b18807@example.com" &&
    input.userId === input.sessionUserId && input.tier === "brain" &&
    !input.hasCards && input.hasEvidence && !input.attempted;
}
