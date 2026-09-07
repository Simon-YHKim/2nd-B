// ⚠ NOT WIRED YET, and that is deliberate - "dormant is a decision".
//
// This module was written but never committed to any ref; it lived only in a
// shared worktree, where it would have been lost. It lands here on its own so
// the work is not lost twice, ahead of the screen wiring that will use it.
// Landing it and its tests separately keeps the diff readable and lets the
// wiring be reviewed against main's current pixel-clay account screen rather
// than against the worktree's pre-migration copy of it.
//
// Do not delete it for having no callers. Its caller is the next change.
//
// Read-only: exact owner-scoped counts for the account screen's "what is in
// here" line. Reads nothing the user does not already own.
import { getSupabaseClient } from "../supabase/client";
import { withTimeout } from "../async/with-timeout";

export interface DataReviewCounts {
  records: number;
  sources: number;
  wikiPages: number;
}

/** Exact owner-scoped counts, not a download or an account-wide inventory.
 * Sources and wiki pages may represent the same content; never sum them.
 * A failed/missing count must not become a claim that the user's data is empty.
 */
export async function loadDataReview(userId: string): Promise<DataReviewCounts> {
  if (!userId.trim()) throw new Error("Data review requires an owner");
  const supabase = getSupabaseClient();
  const [records, sources, wikiPages] = await withTimeout(Promise.all(
    (["records", "sources", "wiki_pages"] as const).map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw error;
      if (!Number.isSafeInteger(count) || count === null || count < 0) {
        throw new Error(`Data review count unavailable: ${table}`);
      }
      return count;
    }),
  ), 10_000, "Data review");
  return { records, sources, wikiPages };
}
