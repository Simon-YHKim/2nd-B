// A "piece" the user captured lives in one of two tables, and which one depends on how it
// was captured, not on anything the user would ever think about:
//
//   records   typed notes, journal entries, 4W1H, todos, voice transcripts
//   sources   links, clips, imported/imagined pieces (the source-origin captures)
//
// /records shows BOTH -- it read `sources` inline and merged them into the timeline.
// /insights read only `listRecentRecords()`. So a user who captures links and clips saw
// their pieces in the list and then saw /insights tell them it was their "first week".
// The app reported less than they put in, which is the one thing the constellation is not
// allowed to do.
//
// Two screens each merging by hand is what let them drift apart in the first place, so the
// sources half lives here now and both call it.

import { getSupabaseClient } from "../supabase/client";
import { withSystemTagsColumn } from "./system-tags";

/** A source-origin capture, shaped to slot alongside a record row. */
export interface SourcePiece {
  /** Prefixed so it can never collide with a records id in a merged list. */
  id: string;
  /** The real `sources.id`, used when opening the source detail route. */
  sourceId: string;
  title: string | null;
  /** Named `created_at` (not `captured_at`) so it merges with record rows unchanged. */
  created_at: string;
  tags: string[] | null;
  system_tags?: string[];
}

const LIMIT = 200;

/**
 * The user's source-origin pieces (links, clips, imports), newest first.
 *
 * @throws on a read failure. `[]` means "read fine, none captured" -- callers must be able
 *         to tell those apart, which is the whole point.
 */
export async function listSourcePieces(userId: string, opts: { excludeProfileImports?: boolean } = {}): Promise<SourcePiece[]> {
  const { data, error } = await withSystemTagsColumn((columnPresent) => {
    const table = getSupabaseClient().from("sources");
    const selected = columnPresent
      ? table.select("id, title, captured_at, tags, system_tags")
      : table.select("id, title, captured_at, tags");
    let query = selected.eq("user_id", userId)
      .order("captured_at", { ascending: false })
      .limit(LIMIT);
    // Keep the ordinary archive complete; reasoning excludes managed imports.
    if (opts.excludeProfileImports) query = query.is("frontmatter->profile_context_import_id", null);
    return query;
  });
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    title: string | null;
    captured_at: string;
    tags: string[] | null;
    system_tags?: string[];
  }[];

  return rows.map((r) => ({
    id: `src-${r.id}`,
    sourceId: r.id,
    title: r.title,
    created_at: r.captured_at,
    tags: r.tags,
    ...(r.system_tags === undefined ? {} : { system_tags: r.system_tags }),
  }));
}
