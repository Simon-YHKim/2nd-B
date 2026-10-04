// Profile display name is optional and has the same 40-character limit as
// onboarding and the users_display_name_len database constraint (0127).
import { getSupabaseClient } from "./client";

export const DISPLAY_NAME_MAX_LENGTH = 40;

export function normalizeDisplayName(input: string): string | null {
  const name = input.trim();
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error("Display name exceeds the 40-character limit");
  }
  return name || null;
}

/** Never turn a read error or a missing owner row into an empty editable name. */
export async function fetchDisplayName(userId: string): Promise<string | null> {
  if (!userId) throw new Error("Missing account owner");
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("id,display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== userId) throw new Error("Display name owner row was not found");
  if (data.display_name !== null && typeof data.display_name !== "string") {
    throw new Error("Display name value is invalid");
  }
  return data.display_name;
}

/** An owner-scoped UPDATE must return the owner's row before Save succeeds. */
export async function saveDisplayName(userId: string, input: string): Promise<string | null> {
  if (!userId) throw new Error("Missing account owner");
  const displayName = normalizeDisplayName(input);
  const { data, error } = await getSupabaseClient()
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select("id,display_name")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.id !== userId || data.display_name !== displayName) {
    throw new Error("Display name update was not confirmed");
  }
  return displayName;
}
