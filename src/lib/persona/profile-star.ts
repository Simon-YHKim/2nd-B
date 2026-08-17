// Brightness for the `profile` home star (Simon 2026-08-16, L3/L4).
//
// This star replaced museum in the seventh slot. Museum was pinned at a
// hardcoded L4 forever, so one of the seven was always lit and never meant
// anything. Profile earns its level from things the user actually filled in,
// which is the whole reason the swap is an improvement rather than a rename.
//
// Two arguments are deliberately NOT threaded into ladderLevel here:
//
//   ratified — brightness.ts short-circuits on it (`if (input.ratified) return 5`),
//     so passing it would let a single tap reach maximum brightness and skip the
//     counting entirely. Three separate designs reached L5 through that door
//     before it was noticed. This module never opens it.
//
//   now — omitting it keeps domainConfidence pure and means no staleness
//     downgrade. A profile is not stale because you did not retype your name
//     this month; dimming it would be a penalty for having finished.
//
// Reaching L5 therefore requires crossSourceAgreement, which requires something
// that did not come from the user's own keyboard. The profile star cannot max
// itself out alone, by construction.
import { type LadderLevel } from "./brightness";
import { domainLevel } from "./domain-confidence";
import type { DomainEntry } from "./domain-stars";

/** Signals that make up the profile star, all of them user-supplied facts. */
export interface ProfileStarInput {
  /** users.display_name — what they want to be called. */
  hasDisplayName: boolean;
  /** users.birth_date — always present past onboarding, counted for honesty. */
  hasBirthDate: boolean;
  /** Newest records row tagged northstar_sentence. */
  hasGoal: boolean;
  /**
   * Everything the user later edits into their front page: confirmed cards,
   * coinages, revisions. Counted, not weighted — one entry is one entry.
   */
  editedEntries?: number;
  /**
   * Observations that arrived from someone else (peer review). The only signal
   * here the user cannot type themselves, and therefore the only one that can
   * open the top tier.
   */
  outsideEntries?: number;
  /**
   * Filled fields of users.profile_details (0132) -- occupation, region,
   * household, daily rhythm, work hours/days, busiest season.
   *
   * Counted like editedEntries because that is what they are: facts the user
   * typed about themselves. They must NOT count as outside signal, so filling
   * the whole form still cannot reach the top tier alone -- the star's rule is
   * that something has to come from beyond the user's own keyboard.
   */
  filledDetails?: number;
}

/**
 * Entry list for domainConfidence. Every entry carries a category so the
 * organized-ratio floor never fires: these are structured facts, not raw dumps,
 * and grading them as "unsorted" would be describing the wrong thing.
 */
function toEntries(input: ProfileStarInput): DomainEntry[] {
  const fixed =
    (input.hasDisplayName ? 1 : 0) + (input.hasBirthDate ? 1 : 0) + (input.hasGoal ? 1 : 0);
  // profile_details rows are the user's own typing, same class as editedEntries.
  const edited = Math.max(0, input.editedEntries ?? 0) + Math.max(0, input.filledDetails ?? 0);
  const outside = Math.max(0, input.outsideEntries ?? 0);
  const total = fixed + edited + outside;
  return Array.from({ length: total }, () => ({
    domain: "collect" as const,
    category: "profile",
  }));
}

/**
 * True when the star has BOTH something the user wrote and something that came
 * from outside it. Mirrors the health star's triangulation rule: two independent
 * methods agreeing, not one method repeated.
 */
export function profileCrossSource(input: ProfileStarInput): boolean {
  const own =
    (input.hasDisplayName ? 1 : 0) +
    (input.hasBirthDate ? 1 : 0) +
    (input.hasGoal ? 1 : 0) +
    Math.max(0, input.editedEntries ?? 0) +
    // Details are typed by the user, so they belong on the "own" side of the
    // triangulation. Leaving them out would deny cross-source to someone whose
    // only self-supplied signal is a filled-in profile, which is backwards.
    Math.max(0, input.filledDetails ?? 0);
  return own >= 1 && Math.max(0, input.outsideEntries ?? 0) >= 1;
}

/**
 * L1~L5 for the profile star. Same ladder every other domain uses, so the
 * bands (0 / 1-4 / 5-14 / 15+) stay consistent across the sky.
 *
 * Finishing onboarding alone yields three entries, which is L2 — a new account
 * never sees a dead star it was never told about.
 */
export function profileStarLevel(input: ProfileStarInput): LadderLevel {
  return domainLevel(toEntries(input), {
    crossSourceAgreement: profileCrossSource(input),
  });
}
