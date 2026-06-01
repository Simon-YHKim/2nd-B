// C10 (task B1): read & write users.privacy_prefs for the settings toggle.
//
// fetchPrivacyPrefs is fail-soft: the settings screen must still render before
// the 0032 migration is applied to a given environment (the privacy_prefs
// column may not exist yet), so any read error resolves to the privacy-by-
// design defaults (everything OFF). savePrivacyPrefs throws so the screen can
// revert an optimistic toggle and surface the failure.

import { getSupabaseClient } from "./client";
import { resolvePrivacyPrefs, type PrivacyPrefs } from "../privacy/prefs";

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
  const { error } = await supabase.from("users").update({ privacy_prefs: prefs }).eq("id", userId);
  if (error) throw error;
}
