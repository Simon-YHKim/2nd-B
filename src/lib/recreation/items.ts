// Recreation manage layer: the writer for recreation_items (migration 0059), the
// structured backing for the 휴식 (recreation) domain star. Mirrors the ops
// manage-layer discipline (src/lib/finance/ledger.ts): no LLM, no external API,
// owner-only RLS does authorization, pure normalizer separated from Supabase.
//
// loadDomainLevels already READS this table to brighten the recreation star; this
// module is the missing WRITE path so a user can log leisure/taste items.

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";

// Must match the CHECK constraints in db/migrations/0059_recreation_items.sql.
export type RecreationCategory =
  | "game" | "movie" | "music" | "travel" | "show" | "hobby" | "other";
export type RecreationStatus = "want" | "active" | "done";

const CATEGORIES: readonly RecreationCategory[] = [
  "game", "movie", "music", "travel", "show", "hobby", "other",
];
const STATUSES: readonly RecreationStatus[] = ["want", "active", "done"];

export interface RecreationItem {
  id: string;
  user_id: string;
  title: string;
  category: RecreationCategory;
  status: RecreationStatus;
  /** 1..5 taste rating, or null. */
  rating: number | null;
  note: string | null;
  tags: string[];
  /** YYYY-MM-DD, or null. */
  occurred_on: string | null;
  created_at: string;
}

export interface NewRecreationItem {
  title: string;
  category?: RecreationCategory;
  status?: RecreationStatus;
  rating?: number | null;
  note?: string | null;
  tags?: string[];
  occurred_on?: string | null;
}

// --- pure normalizer (node-testable, no Supabase) ----------------------

export interface NormalizedRecreationItem {
  title: string;
  category: RecreationCategory;
  status: RecreationStatus;
  rating: number | null;
  note: string | null;
  tags: string[];
  occurred_on: string | null;
}

// Coerce a NewRecreationItem to satisfy the 0059 CHECK constraints (category/
// status enums, rating 1..5). Invalid enums fall back (category → 'other',
// status → 'done'); out-of-range rating drops to null rather than throwing.
export function normalizeItemInput(input: NewRecreationItem): NormalizedRecreationItem {
  const category = input.category && CATEGORIES.includes(input.category) ? input.category : "other";
  const status = input.status && STATUSES.includes(input.status) ? input.status : "done";
  let rating: number | null = null;
  if (input.rating != null) {
    const n = Math.round(input.rating);
    rating = n >= 1 && n <= 5 ? n : null;
  }
  const note = input.note?.trim() ? input.note.trim() : null;
  const tags = Array.from(
    new Set((input.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0)),
  );
  return {
    title: input.title.trim(),
    category,
    status,
    rating,
    note,
    tags,
    occurred_on: input.occurred_on ?? null,
  };
}

function rowToItem(row: Record<string, unknown>): RecreationItem {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title ?? ""),
    category: (row.category as RecreationCategory) ?? "other",
    status: (row.status as RecreationStatus) ?? "done",
    rating: row.rating == null ? null : Number(row.rating),
    note: (row.note as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    occurred_on: (row.occurred_on as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

// --- Supabase-backed queries (RLS owner-only, migration 0059) ----------

/** Log a leisure/taste item. Empty title is rejected (caller validates UI-side). */
export async function createRecreationItem(
  userId: string,
  input: NewRecreationItem,
): Promise<RecreationItem> {
  const norm = normalizeItemInput(input);
  if (!norm.title) throw new Error("title is required");
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recreation_items")
    .insert({ user_id: userId, ...norm })
    .select()
    .single();
  if (error) throw error;
  // A new item lifts the 휴식 (recreation) domain star; drop the stale home cache.
  invalidateDomainLevels(userId);
  return rowToItem(data as Record<string, unknown>);
}

/** All of the user's items, most-recent first (occurred_on nulls last). */
export async function listRecreationItems(userId: string): Promise<RecreationItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("recreation_items")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToItem(r as Record<string, unknown>));
}

/** Delete one item (RLS guarantees it must be the owner's). */
export async function deleteRecreationItem(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("recreation_items").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  invalidateDomainLevels(userId);
}
