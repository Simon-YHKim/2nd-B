// C10 / task D: privacy-preference contract.
//
// 14-17 minors are seeded to high privacy (everything OFF) server-side by the
// age-gate trigger (0032); adults default to the same privacy-by-design
// baseline and opt in via the (UI) toggles. This module is the single source of
// the key set + default resolution, shared by the server defaults, the app, and
// the settings UI (delegated to the design pass — it binds toggles to these keys).

export const PRIVACY_PREF_KEYS = [
  "ads",
  "sharing",
  "recommendations",
  "external_analytics",
  "llm_training",
  "persona_export",
  "persona_share",
  "long_term_memory",
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
