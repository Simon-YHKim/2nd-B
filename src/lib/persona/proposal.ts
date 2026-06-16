// App-wide self-model propose -> ratify contract (synthesis memo §3f). The AI
// never writes the self-model directly: it emits a SelfModelProposal (a diff
// with before/after, a cited rationale, and a target ladder level); the user
// ratifies, and only ratification advances a node to L5 (실행가능). This promotes
// the clipper-format proposal skeleton (wiki/propose-template.ts) to a self-
// model interaction contract. Pure + lexicon-guarded here; the LLM (callGemini)
// and the ratify UI live elsewhere so C1 / C3 / C9 are enforced at those sites.

import { containsForbiddenLexicon } from "../safety/classifier";
import type { LadderLevel } from "./brightness";
import type { StarId } from "./stars";

// What a proposal can target. Internal DB keys stay frozen; this is the
// self-model surface the AI may suggest a change to.
export type ProposalTarget =
  | { kind: "star"; star: StarId } // a self-understanding axis estimate
  | { kind: "soulCore" } // the aggregate (북극성) reading
  | { kind: "northStar" }; // the 0th-brain philosophy sentence

export interface SelfModelProposal {
  target: ProposalTarget;
  before: string;
  after: string;
  /** Why, in plain non-clinical language. */
  rationale: string;
  /** Evidence backing the change (record ids / source slugs). */
  citations: string[];
  /** The ladder level this change moves the node toward once ratified. */
  targetLevel: LadderLevel;
}

export type RatifyDecision = "ratify" | "decline";

export interface RatifyResult {
  decision: RatifyDecision;
  /** ratify -> L5 (the only path to it); decline -> unchanged. */
  resultingLevel: LadderLevel;
}

// Defensive: a proposal carrying clinical / medical wording in any surface field
// is rejected so a forbidden term can never reach the self-model. Mirrors the
// C-vocabulary gate in wiki/propose-template.ts.
export function isProposalClean(p: SelfModelProposal): boolean {
  const surface = [p.before, p.after, p.rationale, ...p.citations].join(" \n ");
  return (
    containsForbiddenLexicon(surface, "en").length === 0 &&
    containsForbiddenLexicon(surface, "ko").length === 0
  );
}

// Presentable only when well-formed AND lexicon-clean AND actually a change.
export function isPresentableProposal(p: SelfModelProposal): boolean {
  if (p.before.trim() === p.after.trim()) return false;
  if (p.after.trim().length === 0) return false;
  if (p.rationale.trim().length === 0) return false;
  return isProposalClean(p);
}

// Apply a user decision. Ratification is the ONLY path to L5 (실행가능);
// declining leaves the node at its current level.
export function applyRatify(currentLevel: LadderLevel, decision: RatifyDecision): RatifyResult {
  if (decision === "ratify") return { decision, resultingLevel: 5 };
  return { decision, resultingLevel: currentLevel };
}
