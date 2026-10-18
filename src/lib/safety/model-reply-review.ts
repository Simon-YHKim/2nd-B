// Q-261013-39 / Q39-D1: a candidate is never permission to display a reply.
// These four substitutions are the fixed 2026-10-13 legal-review table. Only
// the copy is classified; the original model reply is never rewritten for UI.
import type { Locale } from "./lexicon";
import { koSpacingForms } from "./classifier";
import { hasCrisisRiskContext } from "./crisis-context";
import { checkModelReplyOverlaps, gateTermsLeft, type ModelReplyOptions } from "./model-reply-scan";

export const MODEL_REPLY_REWORDINGS = [
  ["다짐이 되", "결심이 되"],
  ["마음가짐이 되", "마음 자세가 되"],
  ["몸가짐이 되", "몸 자세가 되"],
  ["더 이상 살펴", "더는 살펴"],
] as const;

export function rewordModelReplyOverlaps(reply: string): string {
  let copy = reply.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  for (const [from, to] of MODEL_REPLY_REWORDINGS) {
    for (const form of koSpacingForms(from)) copy = copy.split(form).join(to);
  }
  return copy;
}

// No user turns, identifiers or nickname are added to this copy. Recheck the
// final bytes: substitution must never be how a separate crisis marker escapes.
export function prepareModelReplyReview(
  reply: string, locale: Locale, options: ModelReplyOptions,
): string | null {
  if (!checkModelReplyOverlaps(reply, locale, options).candidate) return null;
  if (reply.normalize("NFKC").replace(/\s+/g, "").includes("마지막")) return null;
  const copy = rewordModelReplyOverlaps(reply);
  if (gateTermsLeft(copy).length || hasCrisisRiskContext(copy)) return null;
  return copy;
}

// Only a complete, valid, confidently GREEN verdict can release a candidate.
// YELLOW, RED, unknown, malformed, unavailable and low-confidence all retain
// the existing crisis replacement. Do not clamp an invalid confidence into range.
export function isValidModelReplyVerdict(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const verdict = value as Record<string, unknown>;
  return typeof verdict.zone === "string" && ["green", "yellow", "red"].includes(verdict.zone) && Array.isArray(verdict.triggers) &&
    verdict.triggers.every((trigger) => typeof trigger === "string") &&
    typeof verdict.confidence === "number" && Number.isFinite(verdict.confidence) &&
    verdict.confidence >= 0 && verdict.confidence <= 1;
}

export function isClearModelReplyVerdict(value: unknown): boolean {
  if (!isValidModelReplyVerdict(value)) return false;
  const verdict = value as { zone: string; confidence: number };
  return verdict.zone === "green" && verdict.confidence >= 0.8;
}
