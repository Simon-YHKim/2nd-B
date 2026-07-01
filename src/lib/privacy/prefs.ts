// C10 / task D: privacy-preference contract.
//
// 14-17 minors are seeded to high privacy (everything OFF) server-side by the
// age-gate trigger (0032); adults default to the same privacy-by-design
// baseline and opt in via the (UI) toggles. This module is the single source of
// the key set + default resolution, shared by the server defaults, the app, and
// the settings UI (delegated to the design pass — it binds toggles to these keys).

// Task D (2026-07-01): pruned three declared-but-never-read keys —
// `llm_training`, `persona_export`, `persona_share`. None was enforced or shown
// (all absent from VISIBLE_PRIVACY_KEYS), so each was a false privacy promise: a
// pref the app persisted but never honored. Removing them from the contract makes
// the set honest — re-add a key only when a real enforcer ships. Old rows may
// still carry the seeded booleans in users.privacy_prefs (migration 0032); those
// are inert here (resolvePrivacyPrefs drops unknown keys) — an optional cleanup
// migration + trigger update can strip them from the DB later.
export const PRIVACY_PREF_KEYS = [
  "ads",
  "sharing",
  "recommendations",
  "external_analytics",
  "long_term_memory",
  "ops_push",
  "health_import",
] as const;

export type PrivacyPrefKey = (typeof PRIVACY_PREF_KEYS)[number];
export type PrivacyPrefs = Record<PrivacyPrefKey, boolean>;

// Privacy-by-design: every outward-sharing / profiling / external-processing
// feature is OFF until explicitly enabled. Minors are additionally enforced
// server-side (the trigger seeds these exact values on sign-up).
export function defaultPrivacyPrefs(): PrivacyPrefs {
  const out = {} as PrivacyPrefs;
  for (const k of PRIVACY_PREF_KEYS) out[k] = false;
  return out;
}

// Resolve stored prefs (users.privacy_prefs jsonb) into a complete set: a
// stored boolean wins; any missing or non-boolean key falls back to the default
// (false). Unknown keys are dropped — the key set is authoritative here.
export function resolvePrivacyPrefs(stored: Record<string, unknown> | null | undefined): PrivacyPrefs {
  const base = defaultPrivacyPrefs();
  if (!stored || typeof stored !== "object") return base;
  for (const k of PRIVACY_PREF_KEYS) {
    if (typeof stored[k] === "boolean") base[k] = stored[k] as boolean;
  }
  return base;
}

// 14-17 self-consent minors are held at high privacy: every outward-sharing,
// profiling, or external-processing pref stays locked OFF and cannot be turned
// on from the settings UI. The single exception is long_term_memory — a minor
// may *explicitly* promote it (off by default, opt-in allowed). Adults may
// toggle every key.
//
// This is the UX layer of the protection; the server seeds these same defaults
// for minors on sign-up (migration 0032). Server-side enforcement of minor
// *updates* (so a tampered client cannot enable a locked key) is a separate
// follow-up — this function alone is not a security boundary.
// ops_push joins the exception list (Simon, 2026-06-11): it hands an event
// the user just approved on screen to their OWN device calendar/share sheet —
// a device-local hand-off, not an outward data flow — so a minor may promote
// it like long_term_memory.
export const MINOR_PROMOTABLE_KEYS: readonly PrivacyPrefKey[] = ["long_term_memory", "ops_push"];

// D-12 (2026-06-07 consensus): the settings UI MUST render ONLY enforced keys
// — showing a toggle that controls nothing is a false privacy promise (which is
// why the unenforced llm_training/persona_export/persona_share keys were pruned
// entirely; `sharing` remains as the one intentional future-wiring placeholder).
// Enforced today:
//   - external_analytics: analytics-consent-queue gates GA4/Clarity/PostHog.
//   - ads (2026-06-11): AdSlot reads this pref as the explicit ads consent
//     (policy rule 3, src/lib/ads/policy.ts) — OFF means no ads at all, not
//     non-personalized ones. Minors stay locked OFF here AND suppressed
//     again inside the ad policy (defense in depth).
//   - ops_push (2026-06-11, O-R3): standing consent for routine push hand-offs
//     (/ops reads it before opening calendar links / the share sheet). The
//     first push asks once and stores true; this toggle is the off switch.
//   - health_import (Phase B Slice 1): app-level opt-in for the health/activity
//     ingest (PIPA 민감정보). OFF for everyone by default; gated in
//     src/lib/health/ingest.ts via healthImportAllowed. Minors are NOT in
//     MINOR_PROMOTABLE_KEYS below, so they stay hard-locked OFF (and the 0050
//     seed sets it false on sign-up) — they can never ingest health data.
//   - recommendations (D-20 follow-up, D-25 2026-06-21): the /ops recommend gate
//     (recommendationsAllowed) now enforces this pref for adults too — OFF by
//     default, opt-in here. Minors are NOT in MINOR_PROMOTABLE_KEYS, so they see
//     it locked OFF (and stay server-clamped). The §11-5-gated in-context
//     understanding-gate is a separate step, not this plain toggle.
// The other keys remain here as the single point of future wiring.
export const VISIBLE_PRIVACY_KEYS: readonly PrivacyPrefKey[] = [
  "external_analytics",
  "ads",
  "ops_push",
  "health_import",
  "recommendations",
];

export function isPrivacyPrefEditable(key: PrivacyPrefKey, isMinor: boolean): boolean {
  if (!isMinor) return true;
  return MINOR_PROMOTABLE_KEYS.includes(key);
}
