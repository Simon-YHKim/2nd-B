// C10 / PR-5 (task B): consent ledger writer.
//
// Appends one immutable row to consent_records per consent event (sign-up,
// re-consent on a version bump, age-out re-consent). Records WHAT the user
// agreed to and under which document versions, for PIPA accountability
// (general consent §15/§17/§22 + §23 sensitive-data ack + overseas-transfer
// notice for Gemini/Supabase processing).
//
// NOT YET WIRED at sign-up: the consent NOTICE + ack checkboxes are a UI
// surface (delegated to the design pass). Call recordConsent() only AFTER the
// UI has actually collected the acknowledgements — never record a consent the
// user did not give.
//
// TODO(legal): the version constants below MUST track the published Privacy
// Policy / Terms documents. Bump them when the notice, purposes, or documents
// change (a bump should trigger re-consent). Align before real-user launch —
// LEXICON_LAST_LEGAL_REVIEW is still null.

import { getSupabaseClient } from "./client";

export const CONSENT_VERSION = "2026-06-02" as const;
export const PRIVACY_POLICY_VERSION = "2026-06-02" as const;
export const TERMS_VERSION = "2026-06-02" as const;

export type ConsentAgeBand = "minor_self" | "adult";
export type MinorTier = "adult" | "minor_self" | "minor_guardian";

export interface RecordConsentArgs {
  userId: string;
  /** Coarse band the consent was given under. 14-17 -> minor_self, >=18 -> adult. */
  ageBand: ConsentAgeBand;
  /** Server-derived tier at consent time (from the age-gate trigger), if known. */
  minorTier?: MinorTier | null;
  locale: "en" | "ko";
  /** Agreed processing purposes, e.g. ["service", "personalization"]. */
  purposes: string[];
  /** Required (service) consent — must be true to use the app. */
  requiredAck: boolean;
  /** Optional per-purpose toggles (marketing, recommendations, ...). */
  optionalConsents?: Record<string, boolean>;
  /** Mandatory acknowledgements surfaced in the notice. */
  llmProcessingAck: boolean;
  overseasTransferAck: boolean;
  sensitiveDataAck: boolean;
  /** Hashed request metadata — never the raw IP / UA (data minimization). */
  ipHash?: string | null;
  uaHash?: string | null;
}

export async function recordConsent(args: RecordConsentArgs): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("consent_records").insert({
    user_id: args.userId,
    age_band: args.ageBand,
    minor_tier: args.minorTier ?? null,
    consent_version: CONSENT_VERSION,
    policy_version: PRIVACY_POLICY_VERSION,
    terms_version: TERMS_VERSION,
    purposes: args.purposes,
    required_ack: args.requiredAck,
    optional_consents: args.optionalConsents ?? {},
    llm_processing_ack: args.llmProcessingAck,
    overseas_transfer_ack: args.overseasTransferAck,
    sensitive_data_ack: args.sensitiveDataAck,
    locale: args.locale,
    ip_hash: args.ipHash ?? null,
    ua_hash: args.uaHash ?? null,
  });
  if (error) throw error;
}

// A transient (network/timeout) failure should not lose a consent event, but a
// permanent error (missing table pre-migration, schema/permission, integrity)
// will never succeed on retry, so retrying it just wastes time. Distinguish the
// two so we only back off + retry the transient case.
const CONSENT_MAX_ATTEMPTS = 3;
function isPermanentConsentError(e: unknown): boolean {
  const code = String((e as { code?: string } | null)?.code ?? "");
  const msg = String((e as { message?: string } | null)?.message ?? "").toLowerCase();
  // PostgREST/Postgres: 42xxx undefined_table/column, 23xxx integrity, PGRSTxxx
  // schema/permission. A plain Error (no code) from a missing relation carries a
  // "does not exist" / "relation" message.
  return (
    code.startsWith("42") ||
    code.startsWith("23") ||
    code.startsWith("PGRST") ||
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("permission denied")
  );
}

function consentRetryBackoff(attempt: number): Promise<void> {
  // 400ms then 800ms: short enough not to stall the sign-up hand-off, long
  // enough to ride out a brief network blip.
  return new Promise((resolve) => setTimeout(resolve, attempt * 400));
}

// Best-effort variant for the sign-up / complete-profile path. The user has
// already given the acknowledgements in the UI (the submit button gates on
// them), so a failed ledger write must NOT block account creation. Before the
// 0031 migration is applied to a given environment the consent_records table
// does not exist yet; that is a permanent error here and is NOT retried.
// Transient write failures are retried with a short backoff so a flaky network
// does not lose the consent event. Returns whether the row was written.
export async function recordConsentBestEffort(args: RecordConsentArgs): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONSENT_MAX_ATTEMPTS; attempt++) {
    try {
      await recordConsent(args);
      return true;
    } catch (e) {
      lastError = e;
      if (isPermanentConsentError(e) || attempt === CONSENT_MAX_ATTEMPTS) break;
      await consentRetryBackoff(attempt);
    }
  }
  // PIPA accountability: a lost consent record is a compliance gap, so surface
  // the failure at error level (captured by monitoring) instead of a swallowed
  // warn. We still don't block account creation -- the caller acts on the
  // returned `false`.
  if (typeof console !== "undefined") {
    console.error(
      "[consent] ledger write FAILED after retries (account created without a consent record)",
      (lastError as Error).message,
    );
  }
  return false;
}
