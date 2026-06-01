// task C: DOB correction validation. A user may fix a mistyped birth date, but
// the corrected value must still be a valid ISO date and clear the self-consent
// floor (MIN_SELF_CONSENT_AGE). The 0030 trigger re-derives minor_tier and
// re-rejects under-14 server-side on UPDATE OF birth_date; this mirrors that as
// a fast UX guard and also blocks a no-op save (same value).

import { ageInYears, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DobCorrectionStatus = "empty" | "malformed" | "underage" | "same" | "ok";

export function dobCorrectionStatus(current: string | null, next: string): DobCorrectionStatus {
  if (!next) return "empty";
  if (!ISO_DATE.test(next)) return "malformed";
  const age = ageInYears(next);
  if (age < 0) return "malformed";
  if (age < MIN_SELF_CONSENT_AGE) return "underage";
  if (current && current === next) return "same";
  return "ok";
}

export function canSubmitDobCorrection(current: string | null, next: string): boolean {
  return dobCorrectionStatus(current, next) === "ok";
}
