// Reads for consent decisions that must not guess. fetchPrivacyPrefs (./privacy) is
// fail-soft on purpose: the settings screen still renders when the read fails. A save that
// starts from that fallback writes every consent as OFF, so a withdrawal flow reads with
// this instead: an error or a missing row throws, and the caller changes nothing.
import { getSupabaseClient } from "./client";
import { resolvePrivacyPrefs, type PrivacyPrefs } from "../privacy/prefs";

/** The stored privacy prefs. Throws when the row cannot be read. */
export async function readPrivacyPrefsStrict(userId: string): Promise<PrivacyPrefs> {
  const { data, error } = await getSupabaseClient().from("users").select("privacy_prefs").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("privacy_prefs_row_missing");
  return resolvePrivacyPrefs((data.privacy_prefs as Record<string, unknown> | null | undefined) ?? null);
}
