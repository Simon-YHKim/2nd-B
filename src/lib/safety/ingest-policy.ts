// Third-party clipping safety policy (AI-OS §1, queue E — eng review A5,
// CRITICAL). This is DELIBERATELY SEPARATE from classifyInput's first-person
// crisis routing.
//
// The threat A5 names: a user who saves (clips) a suicide-prevention article,
// a news piece about self-harm, or a research paper on crisis intervention is
// NOT a person in crisis. If the ingest path reused the first-person classifier
// the way the chat/journal path does, saving such an article would surface a
// hotline pop-up and record a `crisis_events` row — a false alarm that is both
// alarming and a data-integrity bug.
//
// So for third-party content we REUSE the classifier to DETECT crisis-language
// markers (so the clip can be tagged / quarantined for review) but:
//   - never surface crisisRouting / a hotline (the result type below has no
//     hotline field — it is structurally impossible to leak one), and
//   - never record a crisis event.
//
// First-person input (chat, interview, journal) keeps using classifyInput +
// routeCrisis unchanged. This module is for clipped/imported text only.

import { classifyInput } from "./classifier";
import type { Locale } from "./lexicon";

export type IngestPolicyAction = "allow" | "quarantine";

export interface IngestPolicyResult {
  /** allow = safe to ingest + auto-surface; quarantine = store but hold back. */
  action: IngestPolicyAction;
  /**
   * True when the clip contains crisis-language markers. FOR TAGGING /
   * QUARANTINE ONLY — this never implies the user is in crisis and never
   * routes to a hotline. (Note: no hotline/crisisRouting field exists here.)
   */
  containsCrisisMarkers: boolean;
  /** Forbidden clinical-lexicon hits. Clip is still allowed; strip/tag downstream. */
  lexiconMatches: string[];
  /** Terms that drove the decision, for the quarantine/tag annotation. */
  matched: string[];
  reason: string;
}

/**
 * Classify a third-party clipping for ingest. Crisis markers => quarantine
 * (store, tag, keep out of ambient resurfacing for review) with NO hotline and
 * NO crisis-event side effect. Forbidden lexicon => allow + tag. Otherwise
 * allow.
 *
 * `locale` selects the term set only; there is intentionally no `minor`
 * option because no crisis routing happens here, so youth-vs-adult lines are
 * irrelevant for clipped content.
 */
export function classifyIngestClipping(text: string, locale: Locale): IngestPolicyResult {
  // classifyInput may attach crisisRouting; we read only categories/matched and
  // DROP the routing on the floor — it must never reach an ingest surface.
  const res = classifyInput(text, locale);
  const containsCrisisMarkers = res.categories.includes("crisis");

  if (containsCrisisMarkers) {
    return {
      action: "quarantine",
      containsCrisisMarkers: true,
      lexiconMatches: [],
      matched: res.matched,
      reason:
        "crisis-language markers in third-party clipping — quarantined for review; no crisis routing (A5)",
    };
  }

  const lexiconMatches = res.categories.includes("forbidden_lexicon") ? res.matched : [];
  return {
    action: "allow",
    containsCrisisMarkers: false,
    lexiconMatches,
    matched: lexiconMatches,
    reason:
      lexiconMatches.length > 0
        ? "forbidden clinical lexicon present — allowed; strip/tag downstream"
        : "no safety markers",
  };
}

/** True when a clip may be ingested and auto-surfaced without review. */
export function isSafeToAutoSurface(result: IngestPolicyResult): boolean {
  return result.action === "allow";
}
