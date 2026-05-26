// Bulk + scoped record deletion. All operations are RLS-scoped to
// auth.uid() so the userId argument is belt-and-suspenders alongside
// the policy. Each helper returns the affected row count so the UI
// can show 'Deleted N records'.

import { getSupabaseClient } from "../supabase/client";

/** Delete every record belonging to the user. Returns affected count. */
export async function deleteAllRecords(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete records by kind (e.g. only 'journal' or only 'note'). */
export async function deleteRecordsByKind(
  userId: string,
  kind: "journal" | "note" | "audit_response",
): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("kind", kind);
  if (error) throw error;
  return count ?? 0;
}

/** Delete records whose tags array overlaps with any of the tags. */
export async function deleteRecordsByTag(userId: string, tags: string[]): Promise<number> {
  if (tags.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .overlaps("tags", tags);
  if (error) throw error;
  return count ?? 0;
}

/** Delete an explicit list of record IDs (bulk-select UI). */
export async function deleteRecordsByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("records")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every wiki page (cascades wiki_links). Sources are untouched. */
export async function deleteAllWikiPages(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("wiki_pages")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every un-ingested source. Promoted sources need their wiki
 *  page deleted first (the wiki_pages_source_kind_pair CHECK blocks
 *  source deletion while a kind='source' page references it). */
export async function deleteUningestedSources(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("ingested", false);
  if (error) throw error;
  return count ?? 0;
}

/** Delete every source (after wiki pages are deleted). Safe-order:
 *  call deleteAllWikiPages first when you want a full wipe. */
export async function deleteAllSources(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete chat_usage rows so the daily quota resets to zero. */
export async function deleteAllChatUsage(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("chat_usage")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Full wipe: wiki pages → sources → records → chat_usage.
 *  Order matters because of the source_id pair CHECK on wiki_pages. */
export async function deleteAllUserData(userId: string): Promise<{
  records: number;
  sources: number;
  wikiPages: number;
  chatUsage: number;
}> {
  const wikiPages = await deleteAllWikiPages(userId);
  const sources = await deleteAllSources(userId);
  const records = await deleteAllRecords(userId);
  const chatUsage = await deleteAllChatUsage(userId);
  return { records, sources, wikiPages, chatUsage };
}
