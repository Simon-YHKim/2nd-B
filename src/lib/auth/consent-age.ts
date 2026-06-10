// C10 / task F: digital-consent-age matrix.
//
// The self-consent floor is NOT globally 14. PIPA (KR) requires legal-rep
// consent below 14; COPPA (US) below 13; GDPR Art.8 (EU) defaults to 16 with
// member states free to lower to 13 (Recital 38). A single hard-coded 14 is
// KR-specific and not valid globally.
//
// The app does not yet collect a reliable jurisdiction signal (locale en/ko is
// not a country), so the live gate assumes KR — digitalConsentAge("KR") = 14.
// When country/region detection lands, thread the resolved jurisdiction here.
//
// TODO(legal): per-EU-member values + the jurisdiction signal itself need legal
// sign-off before relying on this for non-KR markets (LEXICON_LAST_LEGAL_REVIEW
// is still null). Until then, callers should pass "KR" (or accept DEFAULT=16).
// (문서화됨: docs/CONSTRAINTS.md C10)

export type Jurisdiction = "KR" | "US" | "EU" | "DEFAULT";

// Digital-consent age = the self-consent floor. Below it, registration requires
// verifiable guardian / legal-representative consent. Conservative where unsure.
const DIGITAL_CONSENT_AGE: Record<Jurisdiction, number> = {
  KR: 14, // PIPA Article 22-2 — under 14 needs legal-representative consent
  US: 13, // COPPA — under 13 needs verifiable parental consent
  EU: 16, // GDPR Article 8 default (members may lower to 13; we take the ceiling)
  DEFAULT: 16, // unknown jurisdiction — most conservative common floor
};

/** Self-consent floor for a jurisdiction. Unknown/unset -> conservative DEFAULT (16). */
export function digitalConsentAge(jurisdiction?: Jurisdiction | null): number {
  if (jurisdiction && jurisdiction in DIGITAL_CONSENT_AGE) {
    return DIGITAL_CONSENT_AGE[jurisdiction];
  }
  return DIGITAL_CONSENT_AGE.DEFAULT;
}

/** True when `age` is below the self-consent floor and needs guardian consent. */
export function requiresGuardianConsent(age: number, jurisdiction?: Jurisdiction | null): boolean {
  return age < digitalConsentAge(jurisdiction);
}
