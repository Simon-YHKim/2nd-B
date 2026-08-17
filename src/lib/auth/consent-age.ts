// C10 / task F: digital-consent-age matrix.
//
// The self-consent floor is NOT globally 14. PIPA (KR) requires legal-rep
// consent below 14; COPPA (US) below 13; GDPR Art.8 (EU) defaults to 16 with
// member states free to lower to 13 (Recital 38). A single hard-coded 14 is
// KR-specific and not valid globally.
//
// 2026-08-16: the country signal landed. resolveJurisdiction() now reads the
// device region (src/lib/auth/device-region.ts) and maps it to a bucket, so
// DIGITAL_CONSENT_AGE.EU finally applies to somebody. An unreadable or
// unrecognised region still answers KR, which keeps today's behaviour for the
// KR-first base rather than raising the floor on a failed signal.
//
// TODO(legal): per-EU-member values + the jurisdiction signal itself need legal
// sign-off before relying on this for non-KR markets (LEXICON_LAST_LEGAL_REVIEW
// is still null). Until then, callers should pass "KR" (or accept DEFAULT=16).
// (문서화됨: docs/CONSTRAINTS.md C10)

import { deviceRegionCode } from "./device-region";

export type Jurisdiction = "KR" | "US" | "EU" | "DEFAULT";

// Digital-consent age = the self-consent floor. Below it, registration requires
// verifiable guardian / legal-representative consent. Conservative where unsure.
const DIGITAL_CONSENT_AGE: Record<Jurisdiction, number> = {
  KR: 14, // PIPA Article 22-2 — under 14 needs legal-representative consent
  US: 13, // COPPA — under 13 needs verifiable parental consent
  EU: 16, // GDPR Article 8 default (members may lower to 13; we take the ceiling)
  DEFAULT: 16, // unknown jurisdiction — most conservative common floor
};

// ── Country -> jurisdiction bucket ─────────────────────────────────────────
//
// The EEA is deliberately ONE bucket at 16 rather than 27 rows, and that is a
// correctness decision, not laziness. Art.8 lets each member state lower the
// floor to 13, so a per-country row is only ever LOWER than 16 — which means a
// wrong row admits people who cannot legally consent, while a missing row only
// turns away people who could. The two errors are not symmetric, so unverified
// values do not go in.
//
// They are also not currently knowable to the standard this deserves: sources
// consulted on 2026-08-16 disagreed with each other on France (15 vs 16) and on
// Ireland (13 vs 16), and the most complete table found was a 2021 snapshot.
// Lowering any row below 16 needs a source Simon has signed off on. Until then
// the ceiling applies and nobody is admitted who should not be.
const EEA_AND_UK = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", // EU 27
  "IS", "LI", "NO", // EEA non-EU
  "GB", // UK GDPR / DPA 2018 — its own regime, same ceiling until verified
]);

/**
 * Map an ISO 3166-1 alpha-2 country to the bucket whose floor applies.
 *
 * Unknown countries return null rather than DEFAULT so the caller can decide
 * what "unknown" means for it. resolveJurisdiction() keeps unknown on KR, which
 * preserves today's behaviour for the KR-first user base instead of silently
 * raising the floor to 16 for anyone whose device does not report a region.
 */
export function jurisdictionForCountry(country?: string | null): Jurisdiction | null {
  if (!country) return null;
  const cc = country.trim().toUpperCase();
  if (cc.length !== 2) return null;
  if (cc === "KR") return "KR";
  if (cc === "US") return "US";
  if (EEA_AND_UK.has(cc)) return "EU";
  return null;
}

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

/**
 * THE single seam for "which jurisdiction's rules apply to this user". There is
 * no reliable country signal yet (locale != country), so this returns the
 * documented current assumption — KR (the app ships KR-first) — but every gate
 * routes through here instead of a scattered literal "KR". When a real signal
 * (SIM region / IP geo / an explicit profile field) lands, thread it in HERE and
 * every age gate upgrades at once. An operator may pin a market for testing via
 * EXPO_PUBLIC_JURISDICTION (KR|US|EU); direct process.env read so babel inlines it.
 *
 * WARNING: this is NOT production multi-market support. Serving non-KR markets on
 * their own floors needs legal sign-off first (per-EU-member values, the signal
 * itself, LEXICON_LAST_LEGAL_REVIEW). Until then the default stays KR so behavior
 * is unchanged; the override exists for QA/staging, not a real geo rollout.
 */
export function resolveJurisdiction(): Jurisdiction {
  const raw = (process.env.EXPO_PUBLIC_JURISDICTION ?? "").trim().toUpperCase();
  if (raw === "KR" || raw === "US" || raw === "EU") return raw;

  // Device region (Simon 2026-08-16, J1). Only a RECOGNISED country moves the
  // floor; anything else stays on KR, which is what this function has always
  // answered. That asymmetry is the point — a user whose region we cannot read
  // must not be locked out of sign-up by a signal that failed, and the KR-first
  // base must not silently jump to a 16 floor because a platform returned null.
  const fromDevice = jurisdictionForCountry(deviceRegionCode());
  if (fromDevice) return fromDevice;

  return "KR";
}
