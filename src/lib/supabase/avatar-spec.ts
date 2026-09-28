// The saved avatar recipe belongs to the authenticated user's own users row.
// A NULL value is distinct from a failed read: only NULL means "not saved".

import { resolveAvatarSpec, type AvatarSpec } from "@/lib/avatar";
import { markAvatarFirstRunDeferred, markAvatarFirstRunSaved } from "@/lib/avatar/first-run-store";
import { getSupabaseClient } from "./client";

export async function fetchAvatarSpec(userId: string): Promise<AvatarSpec | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("avatar_spec")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Avatar owner row was not found");
  if (!Object.prototype.hasOwnProperty.call(data, "avatar_spec")) {
    throw new Error("Avatar field was not returned");
  }
  const stored = (data as Record<string, unknown>).avatar_spec;
  return stored === null ? null : resolveAvatarSpec(stored);
}

export async function saveAvatarSpec(userId: string, spec: AvatarSpec): Promise<void> {
  const supabase = getSupabaseClient();
  const clean = resolveAvatarSpec(spec);
  const { data, error } = await supabase
    .from("users")
    .update({ avatar_spec: clean })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Avatar owner row was not found");
  markAvatarFirstRunSaved(userId);
}

/** Leave required setup only when its avatar read failed in this session. */
export function markAvatarSetupDeferredForSession(userId: string): void {
  markAvatarFirstRunDeferred(userId);
}
