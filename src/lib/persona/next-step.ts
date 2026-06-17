// Deterministic, LLM-free pick of the user's next activation step for the
// deep-space home hero nudge. Given the per-star ladder levels, return the
// highest-priority OFFERABLE star that is still dim (below L2), or null when
// every offerable star is already lit. "Offerable" = the star has a SHIPPED
// elicitation engine + route; stars whose engine is not built yet (seen /
// possible) are NEVER offered, even if they are the only dim ones left.
//
// Order is by ACTIVATION_PRIORITY (fastest path to a meaningful lit star),
// NOT star index. This matches the onboarding lure + the persona-sim leading
// indicator: the 12-item attachment (ECR) check is the cheapest validated
// instrument and jumps its star straight to L4, so it leads. Keeping this in
// sync with the empty-state CTA in core-brain / persona (both route to
// /attachment first) is what makes the hero nudge and onboarding agree.
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

// Order offerable stars by activation cost-to-reward, NOT star index. Attachment
// (ECR, ~3 min) lands its star at L4 immediately, so it is the cheapest first
// win and leads (matching onboarding). Big Five is the other validated L4
// instrument; values (audit) is L2-L3; the rhythm/ESM check climbs only over
// repeated check-ins, so it trails as a retention step rather than a first win.
const ACTIVATION_PRIORITY: NextStepKey[] = ["attachment", "bigFive", "values", "esm"];

export interface NextActivationStep {
  star: SelfUnderstandingStar;
  route: StepRoute["route"];
  key: NextStepKey;
}

/**
 * The next step to light a star: the highest ACTIVATION_PRIORITY offerable star
 * not yet at L2 (attachment-first), or null if every offerable star is lit.
 */
export function nextActivationStep(
  levels: Record<StarId, LadderLevel>,
): NextActivationStep | null {
  const offerable = SELF_UNDERSTANDING_STARS.filter((s) => STEP_ROUTES[s.id] !== undefined).sort(
    (a, b) => ACTIVATION_PRIORITY.indexOf(STEP_ROUTES[a.id]!.key) - ACTIVATION_PRIORITY.indexOf(STEP_ROUTES[b.id]!.key),
  );
  for (const star of offerable) {
    if ((levels[star.id] ?? 1) < LIT_LEVEL) {
      const step = STEP_ROUTES[star.id]!;
      return { star, route: step.route, key: step.key };
    }
  }
  return null;
}
