// Data-access layer for community-format moderation (migration 0097) — the
// report + block path Play policy requires for public UGC.
//
// Authorization is RLS, exactly like template-queries.ts: content_reports and
// template_blocks both WITH CHECK the caller's own id, so a forged reporter_id
// or blocker_id is rejected by the server rather than by these wrappers. The
// userId argument is passed explicitly (rather than read from the session here)
// to match the shape of the sibling module and to keep these functions pure
// enough to test.
//
// What is NOT here, on purpose: a "list what I can see" filter. The
// clipper_templates read policy already excludes blocked authors, formats I
// reported, and formats past the report threshold, so listAccessibleTemplates()
// returns a filtered set with no extra round trip. The client-side hiding in
// /formats is optimistic UX layered on top of that, never the gate.

import { getSupabaseClient } from "../supabase/client";
import type { ReportReason } from "./moderation";

/**
 * Report one community-shared format. Idempotent from the caller's point of
 * view: content_reports_one_per_reporter makes a second report by the same user
 * a no-op rather than a way to inflate the tally, so a duplicate is swallowed.
 */
export async function reportTemplate(
  userId: string,
  templateId: string,
  reason: ReportReason,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("content_reports")
    .insert({ template_id: templateId, reporter_id: userId, reason });
  // 23505 = unique_violation: already reported by this user. The user's intent
  // is satisfied either way, so this is a success, not an error to surface.
  if (error && error.code !== "23505") throw error;
}

/**
 * Block a format author. Every shared format of theirs disappears from this
 * user's community list (enforced by the clipper_templates read policy).
 * Blocking someone twice is a no-op.
 */
export async function blockOwner(userId: string, ownerId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("template_blocks")
    .insert({ blocker_id: userId, blocked_owner_id: ownerId });
  if (error && error.code !== "23505") throw error;
}

/** Lift one block. */
export async function unblockOwner(userId: string, ownerId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("template_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_owner_id", ownerId);
  if (error) throw error;
}

/**
 * Lift every block this user holds. There is no author identity anywhere in the
 * app (no profiles, no display names), so a per-author unblock list would read
 * as a column of meaningless ids. One reversible control is the honest surface.
 */
export async function unblockAllOwners(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("template_blocks").delete().eq("blocker_id", userId);
  if (error) throw error;
}

/**
 * The author ids this user has blocked. Used to show the unblock control and to
 * hide rows optimistically; the server has already applied the same filter.
 */
export async function listBlockedOwnerIds(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("template_blocks")
    .select("blocked_owner_id")
    .eq("blocker_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as { blocked_owner_id?: unknown }[];
  return rows
    .map((r) => r.blocked_owner_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}
