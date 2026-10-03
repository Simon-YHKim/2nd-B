// Re-consent gate for the privacy-policy revision that adds phone-calendar reading.
//
// Simon, 2026-10-02 / 10-03 (re-consent report, docs/legal/calendar-read-disclosure-draft-261002.md §7-2):
// - Q-261002-01 = B: every user confirms the new policy again.
// - Q-261002-02 = A: show what changed and re-check the required items; the calendar is asked
//   separately when it is turned on, so it has no box here.
// - Q-261002-03 = A: block until confirmed, but keep the exits open; AI processing does not stop
//   (consents given under the previous revision stay valid on the server).
// - Q-261002-04 = C: in force from the day the revision is merged (and published the same day).
// - Q-261002-05 = A: accounts that cannot consent on this screen (under 14, age unknown, email not
//   verified) only see a notice they can close, and their locks stay as they are.
//
// One reading of the coding session (same §7-2): a person who withdrew consent to AI processing
// is not asked for the AI item again. Re-checking it would press them to undo a withdrawal
// (PIPA §38④), so they confirm the other required items and the withdrawal stands.
//
// The gate stays off until the revision exists (reconsent-gate.test.ts checks the policy text).
import { REQUIRED_ACK_KEYS } from "../auth/consent-selections";

export const RECONSENT_GATE_ENABLED: boolean = false;

/** Below this age a guardian consents (PIPA §22-2), so this screen cannot take the confirmation. */
const SELF_CONSENT_MIN_AGE = 14;

/** What stays reachable while the gate blocks (Q-261002-03 = A). */
export const RECONSENT_EXITS = ["settings", "account-deletion", "privacy-policy", "sign-out", "support"] as const;

export type RequiredAckKey = (typeof REQUIRED_ACK_KEYS)[number];
export type AiConsentState = "uncovered" | "granted" | "revoked" | "blocked";

export interface ReconsentAccount {
  /** The server says this account has not confirmed the revision in force. */
  needsConfirmation: boolean;
  /** Age in years from the profile, or null when it is not known. */
  age: number | null;
  emailVerified: boolean;
  /** The AI-processing consent state (service-consent). */
  aiConsent: AiConsentState;
}

export type ReconsentGateMode =
  | { kind: "none" }
  /** Blocks the app until the listed items are checked again. */
  | { kind: "block"; recheck: readonly RequiredAckKey[]; exits: typeof RECONSENT_EXITS }
  /** A notice the person can close. Nothing is recorded and no lock changes. */
  | { kind: "notice" };

/** The required items asked again. The AI item is left out after a withdrawal. */
export function reconsentRecheckKeys(aiConsent: AiConsentState): readonly RequiredAckKey[] {
  if (aiConsent === "revoked" || aiConsent === "blocked") return REQUIRED_ACK_KEYS.filter((key) => key !== "llmProcessing");
  return REQUIRED_ACK_KEYS;
}

export function reconsentGateMode(account: ReconsentAccount, enabled: boolean = RECONSENT_GATE_ENABLED): ReconsentGateMode {
  if (!enabled || !account.needsConfirmation) return { kind: "none" };
  const canConsent = account.emailVerified && account.age !== null && account.age >= SELF_CONSENT_MIN_AGE;
  if (!canConsent) return { kind: "notice" };
  return { kind: "block", recheck: reconsentRecheckKeys(account.aiConsent), exits: RECONSENT_EXITS };
}
