// A "piece" the user tapped in /records can be one of two things, and the list does not
// visibly distinguish them (nor should it -- the user does not care which table we chose):
//
//   a record   typed note, journal, 4W1H, todo, voice transcript      id: <uuid>
//   a source   link, clip, import                                     id: src-<uuid>
//
// The list merges both (lib/records/source-pieces.ts prefixes the source ids so they cannot
// collide with record ids). Tapping either pushes /record/[id].
//
// The LIVE detail screen (DeepSpaceRecordDetailScreen) called only getRecordById(), which
// queries `records`. So it looked for `src-<uuid>` in the records table, found nothing, and
// showed "찾을 수 없어요". EVERY link, clip and import in the list was a dead tap.
//
// The legacy record-detail screen actually got this right -- src/app/record/[id].tsx:65 has
// a correct `origin === "source"` branch that reads the sources table. It just never runs:
// line 263 is `if (isDeepSpaceUI()) return <DeepSpaceRecordDetailScreen />`, and deep-space
// is the default. Correct code, unreachable.
//
// The id is self-describing, so the caller does not have to remember to pass an origin --
// which is exactly the kind of thing callers forget. `src-` means sources.

import { getSupabaseClient } from "../supabase/client";
import { getRecordById } from "./create";

export const SOURCE_ID_PREFIX = "src-";

export interface PieceDetail {
  id: string;
  kind: string;
  topic: string | null;
  summary?: string | null;
  conclusion?: string | null;
  body: string | null;
  ai_followup?: unknown;
  tags: string[] | null;
  created_at: string;
  /** Which table it came from. The detail view hides record-only affordances for sources. */
  origin: "record" | "source";
}

export function isSourcePieceId(id: string): boolean {
  return id.startsWith(SOURCE_ID_PREFIX);
}

/**
 * Fetch whatever the user tapped, from whichever table it lives in.
 *
 * Two callers, two conventions, both supported:
 *   /records      merges the lists and prefixes source ids (`src-<uuid>`), so the id alone
 *                 is enough.
 *   /core-brain   keeps the raw uuid and carries `origin` as a separate field on the
 *                 evidence shard, so it passes `origin` explicitly.
 *
 * Supporting both is not indulgence -- it is what stops a caller that forgets the origin
 * from silently getting a 404, which is exactly how this bug worked.
 *
 * @throws on a read failure. `null` means "read fine, no such piece" -- the two must stay
 *         distinguishable, or an offline user is told their piece was deleted.
 */
export async function getPieceById(
  userId: string,
  id: string,
  origin?: "record" | "source" | null,
): Promise<PieceDetail | null> {
  const fromSources = origin === "source" || isSourcePieceId(id);

  if (!fromSources) {
    const r = (await getRecordById(userId, id)) as PieceDetail | null;
    return r ? { ...r, origin: "record" } : null;
  }

  const sourceId = isSourcePieceId(id) ? id.slice(SOURCE_ID_PREFIX.length) : id;
  const { data, error } = await getSupabaseClient()
    .from("sources")
    .select("id, kind, title, captured_at, tags")
    .eq("user_id", userId)
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const s = data as {
    id: string;
    kind: string;
    title: string | null;
    captured_at: string;
    tags: string[] | null;
  };
  return {
    // Keep the prefixed id: it is what the route carries, and what any re-navigation needs.
    id,
    kind: s.kind,
    topic: s.title,
    summary: null,
    conclusion: null,
    // `sources` has no body column -- a clip is its title plus its tags.
    body: null,
    ai_followup: null,
    tags: s.tags,
    created_at: s.captured_at,
    origin: "source",
  };
}
