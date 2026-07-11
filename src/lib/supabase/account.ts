// task C: account-level self-service mutations.
//
// - fetchBirthDate: fail-soft read of the current DOB to prefill the correction
//   field (a read error resolves to null — the field just starts empty).
// - updateBirthDate: corrects a mistyped DOB. The 0030 BEFORE UPDATE OF
//   birth_date trigger re-validates server-side (rejects <16, re-derives
//   minor_tier / account_status), so a tampered value can't bypass the floor.
//   Throws on error so the screen can surface it.
//
// Full account erasure reuses deleteAllUserData (src/lib/records/delete-bulk.ts)
// plus signOut from the screen; removing the auth.users record itself needs a
// service_role path (a follow-up edge function), so that is handled out of band.

import { getSupabaseClient } from "./client";

export async function fetchBirthDate(userId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("birth_date")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.birth_date as string | null | undefined) ?? null;
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[account] birth_date load failed", (e as Error).message);
    }
    return null;
  }
}

export async function updateBirthDate(userId: string, birthDate: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("users").update({ birth_date: birthDate }).eq("id", userId);
  if (error) throw error;
}
