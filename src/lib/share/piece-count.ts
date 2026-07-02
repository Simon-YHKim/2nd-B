// countUserPieces — total captured records ("별가루") for the ShareCard
// signature line (sb-more: "2nd-Brain · N개 별가루"). head:true exact count,
// same shape as constellation/selector's countRows. Errors resolve to null so
// the card gracefully drops the count instead of blocking the share flow.
import { getSupabaseClient } from "../supabase/client";

export async function countUserPieces(userId: string): Promise<number | null> {
  try {
    const { count, error } = await getSupabaseClient()
      .from("records")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return null;
  }
}
