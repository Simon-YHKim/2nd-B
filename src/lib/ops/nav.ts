// Ops navigation contract (Claude Design ops-ia.dc.html §2). The /ops home is
// the hub; its domain picker acts as a router. Domains with a dedicated
// deep-space screen push to it (depth 2, Back one direction → /ops); every other
// domain converges to the /ops recommendation flow. No new tab bar.

import type { OpsDomainId } from "./domains";

/** Literal union so router.push() stays typed-route safe (no `any`). */
export type OpsDomainRoute = "/reading" | "/meals" | "/milestones" | "/ledger" | "/side-project";

const OPS_DOMAIN_ROUTE: Partial<Record<OpsDomainId, OpsDomainRoute>> = {
  reading_list: "/reading",
  weekly_meals: "/meals",
  simple_meals: "/meals",
  learning_goals: "/milestones",
  career_check: "/milestones",
  money_check: "/ledger",
  side_project: "/side-project",
};

/**
 * The dedicated screen route for a domain, or null when the domain has no
 * dedicated screen (it stays in the /ops recommendation flow). IA rule: 5
 * dedicated screens + the common /ops home.
 */
export function opsRouteForDomain(domain: OpsDomainId): OpsDomainRoute | null {
  return OPS_DOMAIN_ROUTE[domain] ?? null;
}
