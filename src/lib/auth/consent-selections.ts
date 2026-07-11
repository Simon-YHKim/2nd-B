// C10 (task B2): UI-state contract for the sign-up / complete-profile consent
// notice. The notice collects PIPA general-consent acknowledgements (14+
// self-consent — Articles 15/17/22) plus the §23 sensitive-data and overseas-
// transfer notices, and an optional marketing consent.
//
// allRequiredAcksChecked() gates the submit button; buildSignUpConsentArgs()
// maps the collected state to the immutable ledger row shape
// (src/lib/supabase/consent.ts). Kept pure so the gating + mapping are unit
// tested without rendering the form.

import type { RecordConsentArgs, ConsentAgeBand, MinorTier } from "../supabase/consent";

export interface ConsentSelections {
  /** Required service consent. Must be true to use the app. */
  service: boolean;
  /** Gemini/LLM processing of the user's entries acknowledged. */
  llmProcessing: boolean;
  /** Overseas transfer (Gemini/Supabase processing regions) acknowledged. */
  overseasTransfer: boolean;
  /** PIPA §23 sensitive-data handling acknowledged. */
  sensitiveData: boolean;
  /** Optional marketing / update messages. Free to decline. */
  marketing: boolean;
}

// The acknowledgements that are mandatory to proceed. `marketing` is optional
// and deliberately excluded.
export const REQUIRED_ACK_KEYS = [
  "service",
  "llmProcessing",
  "overseasTransfer",
  "sensitiveData",
] as const satisfies readonly (keyof ConsentSelections)[];

export function emptyConsentSelections(): ConsentSelections {
  return {
    service: false,
    llmProcessing: false,
    overseasTransfer: false,
    sensitiveData: false,
    marketing: false,
  };
}

export function allRequiredAcksChecked(sel: ConsentSelections): boolean {
  return REQUIRED_ACK_KEYS.every((k) => sel[k] === true);
}

// Set every required ack to `next` at once (the "agree to all required" master
// control). Leaves the optional marketing consent untouched.
export function setAllRequiredAcks(sel: ConsentSelections, next: boolean): ConsentSelections {
  const out = { ...sel };
  for (const k of REQUIRED_ACK_KEYS) out[k] = next;
  return out;
}

export interface BuildConsentArgsInput {
  userId: string;
  /** 16-17 at consent time -> minor_self band; otherwise adult. */
  isMinor: boolean;
  locale: "en" | "ko";
  selections: ConsentSelections;
}

export function buildSignUpConsentArgs(input: BuildConsentArgsInput): RecordConsentArgs {
  const { userId, isMinor, locale, selections } = input;
  const ageBand: ConsentAgeBand = isMinor ? "minor_self" : "adult";
  const minorTier: MinorTier = isMinor ? "minor_self" : "adult";
  const purposes = ["service"];
  if (selections.marketing) purposes.push("marketing");
  return {
    userId,
    ageBand,
    minorTier,
    locale,
    purposes,
    requiredAck: selections.service,
    optionalConsents: { marketing: selections.marketing },
    llmProcessingAck: selections.llmProcessing,
    overseasTransferAck: selections.overseasTransfer,
    sensitiveDataAck: selections.sensitiveData,
  };
}
