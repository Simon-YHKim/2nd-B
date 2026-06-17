// Deterministic, LLM-free pick of the user's cheapest next activation step for
// the deep-space home hero nudge. Given the per-star ladder levels, return the
// lowest-index OFFERABLE star that is still dim (below L2), or null when every
// offerable star is already lit. "Offerable" = the star has a SHIPPED
// elicitation engine + route; stars whose engine is not built yet (seen /
// possible) are NEVER offered, even if they are the only dim ones left.
//
// Pure + deterministic: this is the INSTRUMENT layer deciding the next step
// from existing star levels, never an LLM. Mirrors the brightness pipeline
// (stars.ts -> star-levels.ts) and the existing expo-router routes.

import type { LadderLevel } from "./brightness";
import { SELF_UNDERSTANDING_STARS, type SelfUnderstandingStar, type StarId } from "./stars";

// The home.json `nextStep.*` keys, one per offerable star.
export type NextStepKey = "bigFive" | "attachment" | "esm" | "values";

interface StepRoute {
  route: "/big-five" | "/attachment" | "/esm" | "/audit";
  key: NextStepKey;
}

// Only stars with a shipped engine + route are offerable. `seen` (peer/360) and
// `possible` (될 수 있는 나) have no shipped elicitation path, so they are absent
// from this map and can never be offered.
const STEP_ROUTES: Partial<Record<StarId, StepRoute>> = {
  now: { route: "/big-five", key: "bigFive" },
  relational: { route: "/attachment", key: "attachment" },
  rhythm: { route: "/esm", key: "esm" },
  values: { route: "/audit", key: "values" },
};

// A star is "lit" once it reaches L2; below that it is still dim and offerable.
const LIT_LEVEL = 2;

export interface NextActivationStep {
  star: SelfUnderstandingStar;
  route: StepRoute["route"];
  key: NextStepKey;
}

/**
 * The cheapest next step to light a star: the lowest-`index` offerable star not
 * yet at L2, or null if every offerable star is already lit.
 */
export function nextActivationStep(
  levels: Record<StarId, LadderLevel>,
): NextActivationStep | null {
  const offerable = SELF_UNDERSTANDING_STARS.filter((s) => STEP_ROUTES[s.id] !== undefined).sort(
    (a, b) => a.index - b.index,
  );
  for (const star of offerable) {
    if ((levels[star.id] ?? 1) < LIT_LEVEL) {
      const step = STEP_ROUTES[star.id]!;
      return { star, route: step.route, key: step.key };
    }
  }
  return null;
}
