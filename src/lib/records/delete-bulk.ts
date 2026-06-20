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
/** Delete specific sources by id (import-hub 철회 — removes the derived rows
 *  a ratified import created). Owner-scoped. */
export async function deleteSourcesByIds(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("sources")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return count ?? 0;
}

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

/** Delete the user's derived self-context entries (0021, owner-deletable). */
export async function deleteAllSelfContexts(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("self_contexts")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

/** Delete the user's own clipper templates (0027, owner-deletable). Shared
 *  copies others adopted are independent rows and are not touched. */
export async function deleteAllOwnedClipperTemplates(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("clipper_templates")
    .delete({ count: "exact" })
    .eq("owner_id", userId);
  if (error) throw error;
  return count ?? 0;
}

// Tables a client CANNOT erase (no DELETE RLS policy) and that therefore only
// disappear via the service-role public.users cascade in requestAccountDeletion:
//   personas (0008), memorized_patterns (0017), xp_events (0019),
//   consent_records (0031, append-only ledger), ai_audit_log (0004).
// A content wipe keeps the account, so it intentionally leaves those in place.

/** Content wipe (keeps the account): wiki pages -> sources -> records ->
 *  chat_usage -> self_contexts -> owned clipper templates. Order matters for
 *  the source_id pair CHECK on wiki_pages. The derived tables are best-effort:
 *  a failure on one (e.g. RLS) is logged and skipped so the wipe still clears
 *  the rest. RLS-protected derived data (personas/memorized_patterns/xp) is
 *  only erased by full account deletion — see requestAccountDeletion. */
export async function deleteAllUserData(userId: string): Promise<{
  records: number;
  sources: number;
  wikiPages: number;
  chatUsage: number;
  selfContexts: number;
  clipperTemplates: number;
}> {
  const wikiPages = await deleteAllWikiPages(userId);
  const sources = await deleteAllSources(userId);
  const records = await deleteAllRecords(userId);
  const chatUsage = await deleteAllChatUsage(userId);
  const selfContexts = await bestEffort(() => deleteAllSelfContexts(userId), "self_contexts");
  const clipperTemplates = await bestEffort(
    () => deleteAllOwnedClipperTemplates(userId),
    "clipper_templates",
  );
  return { records, sources, wikiPages, chatUsage, selfContexts, clipperTemplates };
}

async function bestEffort(fn: () => Promise<number>, label: string): Promise<number> {
  try {
    return await fn();
  } catch (e) {
    if (typeof console !== "undefined") console.warn(`[delete-bulk] ${label} delete failed`, e);
    return 0;
  }
}

/** Terminal account erasure (GDPR Art.17 / PIPA). Invokes the delete-account
 *  Edge Function, which (service role) deletes public.users -> cascade across
 *  every user_id-owned table, then removes the auth.users row. This is the only
 *  path that reaches RLS-protected tables (personas, memorized_patterns,
 *  xp_events) and the append-only consent_records ledger. Requires the function
 *  to be deployed; throws otherwise so the caller can decide how to proceed. */
export async function requestAccountDeletion(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  if ((data as { deleted?: boolean } | null)?.deleted !== true) {
    throw new Error("account deletion did not complete");
  }
}
