// Dormant S0-B preparation. Callers must first accept a current, non-RED boundary reply.
import { HOTLINES } from "../safety/lexicon";
import { findCurrentContactIntents } from "./probe-contact-intent";

export type ContactId = "KR_109" | "KR_1388" | "GLOBAL_988" | "KR_119" | "KR_112";
export type Correction = "country-condition-added" | "unsupported-country-removed" |
  "emergency-priority" | "unverified-number-removed";
export type ProbeGuidance =
  | { kind: "none" }
  | { kind: "contacts"; contacts: readonly ContactId[]; physicalUrgency: boolean; corrections: readonly Correction[] }
  | { kind: "unresolved"; reason: "unsupported-contact" | "conflicting-intent" };
export type GuidanceInspection =
  | { status: "not-inspected"; reason: "too-long" | "invalid-shape" | "unparseable";
      evidence: "absent"; guidance: { kind: "none" } }
  | { status: "inspected"; evidence: "absent"; guidance: { kind: "none" } }
  | { status: "inspected"; evidence: "current-contact"; guidance: Exclude<ProbeGuidance, { kind: "none" }> };

const contactsInOrder: readonly ContactId[] = ["KR_119", "KR_112", "KR_1388", "KR_109", "GLOBAL_988"];
const correctionsInOrder: readonly Correction[] = ["country-condition-added", "unsupported-country-removed", "emergency-priority", "unverified-number-removed"];
const none = (): GuidanceInspection => ({ status: "inspected", evidence: "absent", guidance: { kind: "none" } });
const notInspected = (reason: "too-long" | "invalid-shape" | "unparseable"): GuidanceInspection =>
  ({ status: "not-inspected", reason, evidence: "absent", guidance: { kind: "none" } });
const unresolved = (reason: "unsupported-contact" | "conflicting-intent"): GuidanceInspection =>
  ({ status: "inspected", evidence: "current-contact", guidance: { kind: "unresolved", reason } });

/** No UI, risk classification, logging or persistence. Inspect only accepted post-boundary text. */
export function inspectProbeContactGuidance(postBoundaryText: unknown, isMinor: boolean | null): GuidanceInspection {
  if (typeof postBoundaryText !== "string") return notInspected("invalid-shape");
  if (postBoundaryText.length > 16384) return notInspected("too-long");
  let parsed: unknown;
  try { parsed = JSON.parse(postBoundaryText); } catch { return notInspected("unparseable"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.hasOwn(parsed, "question")) {
    return notInspected("invalid-shape");
  }
  const question: unknown = (parsed as Record<string, unknown>).question;
  if (typeof question !== "string") return notInspected("invalid-shape");
  if (question.length > 4096) return notInspected("too-long");
  const intents = findCurrentContactIntents(question);
  if (!intents.length) return none();

  const contacts = new Set<ContactId>(), corrections = new Set<Correction>();
  for (const intent of intents) {
    const selected = new Set<ContactId>();
    if (intent.physical || intent.emergencyAlternative) selected.add("KR_119");
    if (intent.threat) selected.add("KR_112");
    for (const number of intent.numbers) {
      const contact = contactsInOrder.find((id) => HOTLINES[id].number === number);
      if (!contact) {
        // A positively established local physical-emergency recommendation can
        // use the existing conditional body. 911 itself is never registered/displayed.
        if (number === "911" && intent.physical) corrections.add("unverified-number-removed");
        else return unresolved("unsupported-contact");
      } else { selected.add(contact); }
    }
    if (selected.has("KR_112") && intent.conflictingSupport) return unresolved("conflicting-intent");
    if (selected.has("KR_109") || selected.has("KR_1388")) {
      selected.add("KR_109");
      if (isMinor !== false) selected.add("KR_1388");
    }
    if (intent.emergencyAlternative || selected.has("KR_119") &&
      (selected.has("KR_109") || selected.has("KR_1388") || selected.has("GLOBAL_988"))) corrections.add("emergency-priority");
    if (intent.unsupportedCountry || [...selected].some((id) =>
      id === "GLOBAL_988" ? intent.koreanCondition : intent.usCondition)) corrections.add("unsupported-country-removed");
    if ([...selected].some((id) => id === "GLOBAL_988" ? !intent.usCondition : !intent.koreanCondition)) {
      corrections.add("country-condition-added");
    }
    for (const contact of selected) contacts.add(contact);
  }
  const blocks = Number(contacts.has("KR_119")) + Number(contacts.has("KR_112")) +
    Number(contacts.has("KR_109") || contacts.has("KR_1388")) + Number(contacts.has("GLOBAL_988"));
  if (blocks > 3) return unresolved("conflicting-intent");
  return { status: "inspected", evidence: "current-contact", guidance: {
    kind: "contacts", contacts: contactsInOrder.filter((id) => contacts.has(id)),
    physicalUrgency: contacts.has("KR_119"), corrections: correctionsInOrder.filter((value) => corrections.has(value)),
  } };
}
