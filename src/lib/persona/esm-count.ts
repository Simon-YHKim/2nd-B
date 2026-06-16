// Count a user's ESM check-ins (esm_responses, 0042) to feed star4 (리듬) via
// rhythmStarLevel. Standalone (no build/star-levels import) to avoid an import
// cycle - both buildPersona and loadStarLevels call it. Best-effort: 0 on error.

import { getSupabaseClient } from "../supabase/client";

export async function loadEsmCount(userId: string): Promise<number> {
  try {
    const { count } = await getSupabaseClient()
      .from("esm_responses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return count ?? 0;
  } catch {
    return 0;
  }
}
