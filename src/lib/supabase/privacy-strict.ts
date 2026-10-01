// Reads for consent decisions that must not guess. fetchPrivacyPrefs (./privacy) is
// fail-soft on purpose: the settings screen still renders when the read fails. A save that
// starts from that fallback writes every consent as OFF, so a withdrawal flow reads with
// these instead: an error or a missing row throws, and the caller changes nothing.
import { getSupabaseClient } from "./client";
import { resolvePrivacyPrefs, type PrivacyPrefKey, type PrivacyPrefs } from "../privacy/prefs";

/** The stored privacy prefs. Throws when the row cannot be read. */
export async function readPrivacyPrefsStrict(userId: string): Promise<PrivacyPrefs> {
  const { data, error } = await getSupabaseClient().from("users").select("privacy_prefs").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("privacy_prefs_row_missing");
  return resolvePrivacyPrefs((data.privacy_prefs as Record<string, unknown> | null | undefined) ?? null);
}

/** The latest grant or revoke recorded for one key in the consent_changes ledger, or null. */
export async function latestConsentChange(userId: string, key: PrivacyPrefKey): Promise<"grant" | "revoke" | null> {
  const { data, error } = await getSupabaseClient()
    .from("consent_changes")
    .select("event_type")
    .eq("user_id", userId)
    .eq("pref_key", key)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const eventType = (data as { event_type?: unknown } | null)?.event_type;
  return eventType === "grant" || eventType === "revoke" ? eventType : null;
}
