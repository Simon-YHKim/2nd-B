// C10 (task B1): read & write users.privacy_prefs for the settings toggle.
//
// fetchPrivacyPrefs is fail-soft: the settings screen must still render before
// the 0032 migration is applied to a given environment (the privacy_prefs
// column may not exist yet), so any read error resolves to the privacy-by-
// design defaults (everything OFF). savePrivacyPrefs throws so the screen can
// revert an optimistic toggle and surface the failure.

import { getSupabaseClient } from "./client";
import { resolvePrivacyPrefs, PRIVACY_PREF_KEYS, type PrivacyPrefs } from "../privacy/prefs";

export async function fetchPrivacyPrefs(userId: string): Promise<PrivacyPrefs> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("privacy_prefs")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    const stored = (data?.privacy_prefs as Record<string, unknown> | null | undefined) ?? null;
    return resolvePrivacyPrefs(stored);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[privacy] prefs load failed; using defaults", (e as Error).message);
    }
    return resolvePrivacyPrefs(null);
  }
}

export async function savePrivacyPrefs(userId: string, prefs: PrivacyPrefs): Promise<void> {
  const supabase = getSupabaseClient();
  // D-3: snapshot the before-state so we can append a consent-change row per
  // toggled key after the write. fetchPrivacyPrefs is fail-soft (never throws),
  // so this can't block the save; a read miss resolves to all-off defaults.
  const before = await fetchPrivacyPrefs(userId);
  const { error } = await supabase.from("users").update({ privacy_prefs: prefs }).eq("id", userId);
  if (error) throw error;
  // Append only AFTER a successful write (a failed save recorded no consent
  // change). Best-effort and never rethrows, so the change ledger can't break
  // the settings save.
  await recordConsentChanges(userId, before, prefs);
}

/**
 * D-3: append the optional-consent transitions from a privacy-prefs save to the
 * append-only consent_changes ledger (migration 0062) — one row per changed key,
 * event_type 'grant' (false -> true) or 'revoke' (true -> false). This closes
 * the PIPA §37 (동의 철회) / GDPR Art.7(3) withdrawal-record gap: consent_records
 * only logs GRANTs at sign-up, so turning a pref OFF previously left no trace.
 *
 * Best-effort: a lost row is an accountability gap (surfaced at error level for
 * monitoring, mirroring recordConsentBestEffort) but must never break the
 * settings save, so every failure is caught here and not rethrown. Request
 * metadata (ip/ua) is intentionally omitted client-side — data minimization; the
 * columns stay NULL, matching the consent_records nullable contract.
 */
export async function recordConsentChanges(
  userId: string,
  before: PrivacyPrefs,
  after: PrivacyPrefs,
): Promise<void> {
  const rows = PRIVACY_PREF_KEYS.filter((key) => before[key] !== after[key]).map((key) => ({
    user_id: userId,
    pref_key: key,
    event_type: after[key] ? ("grant" as const) : ("revoke" as const),
  }));
  if (rows.length === 0) return;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("consent_changes").insert(rows);
    if (error) throw error;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.error("[consent] change-ledger append failed", (e as Error).message);
    }
  }
}
