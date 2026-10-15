import type { WeatherConsent } from "./model";

/** A successful revoke response is evidence only for that write/current screen visit. */
export function consentEvidence(status: WeatherConsent | null | undefined, revoked = false): "on" | "off" | "unknown" {
  if (!status) return "unknown";
  if (status.enabled === true) return "on";
  // 0232's users trigger couples profile OFF to stored OFF; eligible OFF is therefore evidence.
  if (status.enabled === false && (status.eligible === true || revoked)) return "off";
  return "unknown";
}

/** A failed write may reveal a newer ON, but never establishes a visible OFF. */
export function consentAfterFailedRevoke(previous: WeatherConsent | null, latest?: WeatherConsent): WeatherConsent | null {
  return consentEvidence(latest) === "on" ? latest! : previous;
}
