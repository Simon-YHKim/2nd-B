// Supabase reads/writes for the `notices` + `user_notice_reads` tables
// (db/migrations/0113_notices.sql).
//
// Error policy follows the two idioms already established in this repo:
//   * reads that a screen renders around FAIL SOFT - warn and return empty, the
//     way src/lib/supabase/privacy.ts:12-29 does, so /notices and the home
//     screen still render when the tables have not been applied to a given
//     environment yet or the device is offline.
//   * the write THROWS on anything except a duplicate key, matching
//     src/lib/wiki/moderation-queries.ts:31-36. A second "read" of the same
//     notice is the user's intent already being satisfied, not an error.
//
// The client is untyped (src/lib/supabase/client.ts calls createClient with no
// <Database> generic and src/lib/supabase/types.gen.ts is stale and imported by
// nothing), so row shapes are hand-declared here and cast at the boundary -
// same as src/lib/wiki/template-queries.ts:35-49.

import { getSupabaseClient } from "../supabase/client";
import { REMOTE_NOTICE_KINDS, type RemoteNotice, type RemoteNoticeKind } from "./types";

interface NoticeRow {
  id: string;
  kind: string;
  title_ko: string;
  title_en: string;
  body_ko: string;
  body_en: string;
  published_at: string;
  min_app_version: string | null;
}

function isRemoteKind(value: string): value is RemoteNoticeKind {
  return (REMOTE_NOTICE_KINDS as readonly string[]).includes(value);
}

function toRemoteNotice(row: NoticeRow): RemoteNotice | null {
  // A kind outside the enum cannot happen through the column type, but the
  // client is untyped and the app ships against whatever the environment has.
  // Dropping the row is safer than defaulting it: defaulting to "major" would
  // let bad data interrupt users, defaulting to "minor" would silently mute a
  // real announcement.
  if (!isRemoteKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind,
    titleKo: row.title_ko,
    titleEn: row.title_en,
    bodyKo: row.body_ko,
    bodyEn: row.body_en,
    publishedAt: row.published_at,
    minAppVersion: row.min_app_version,
  };
}

/** Cap on how many notices the inbox pulls. The list is a history view, not an
 *  archive, and the popup only ever looks at the newest unread major. */
export const NOTICE_FETCH_LIMIT = 50;

/**
 * Published notices, newest first.
 *
 * `published_at <= now()` is enforced by the RLS policy, so no filter is needed
 * here; visibleNotices() in select.ts re-applies it against the device clock.
 */
export async function fetchNotices(): Promise<RemoteNotice[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("notices")
      .select("id, kind, title_ko, title_en, body_ko, body_en, published_at, min_app_version")
      .order("published_at", { ascending: false })
      .limit(NOTICE_FETCH_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as NoticeRow[];
    return rows.map(toRemoteNotice).filter((notice): notice is RemoteNotice => notice !== null);
  } catch (error) {
    // Fail soft: an empty notice list is a correct-looking screen. A thrown
    // error here would take down the home shell, which is a far worse outcome
    // than a missing announcement.
    console.warn("[notices] failed to fetch notices", error);
    return [];
  }
}

/** Ids of notices this user has already read. RLS restricts the rows to the
 *  caller, so no user_id filter is required for correctness; it is included
 *  anyway so the query is still right if the policy is ever widened. */
export async function fetchReadNoticeIds(userId: string): Promise<Set<string>> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_notice_reads")
      .select("notice_id")
      .eq("user_id", userId);
    if (error) throw error;
    const rows = (data ?? []) as { notice_id: string }[];
    return new Set(rows.map((row) => row.notice_id));
  } catch (error) {
    // Fail soft, but note the direction of the failure: an empty read set makes
    // everything look UNREAD. That is the safe side for a badge, and the popup
    // is additionally gated on a once-per-mount flag, so a read failure cannot
    // produce a popup loop within a session.
    console.warn("[notices] failed to fetch read state", error);
    return new Set();
  }
}

/**
 * Record that the user has read a notice.
 *
 * user_notice_reads has no UPDATE grant for authenticated on purpose, so this
 * is a plain INSERT: a read is append-only. 23505 means the row is already
 * there, which is the same end state the caller asked for.
 */
export async function markNoticeRead(userId: string, noticeId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("user_notice_reads")
    .insert({ user_id: userId, notice_id: noticeId });
  // 23505 = unique_violation: already read. Not an error to surface.
  if (error && (error as { code?: string }).code !== "23505") throw error;
}
