// Reading shelf manage layer (O-R3 Wave 2, reading_list). Pairs with the Google
// Books search source (books.ts): search finds a volume, this persists it on the
// user's shelf with a status (want/reading/done) + page progress. Manual
// structured input — no Gemini call, no new C1/C9/C3 surface. $0.
//
// RLS owner-only (migration 0053). Pure helpers separated from the Supabase
// calls so they are node-testable, the same discipline as ops/routines.ts.

import { getSupabaseClient } from "../supabase/client";
import type { BookResult } from "./books";

export type ReadingStatus = "want" | "reading" | "done";

export interface ShelfEntry {
  id: string;
  user_id: string;
  volume_id: string;
  title: string;
  authors: string[];
  status: ReadingStatus;
  current_page: number;
  total_pages: number | null;
  created_at: string;
  updated_at: string;
}

export interface Shelf {
  want: ShelfEntry[];
  reading: ShelfEntry[];
  done: ShelfEntry[];
}

// --- pure helpers (node-testable, no Supabase) -------------------------

/** Read progress 0..1; 0 when total is unknown/zero. Current is clamped to total. */
export function readingProgress(currentPage: number, totalPages: number | null): number {
  if (!totalPages || totalPages <= 0) return 0;
  const cur = Math.max(0, Math.min(currentPage, totalPages));
  return cur / totalPages;
}

/** Clamp a page number into [0, total] (total null → just floor at 0). */
export function clampPage(page: number, totalPages: number | null): number {
  const p = Math.max(0, Math.round(page));
  return totalPages && totalPages > 0 ? Math.min(p, totalPages) : p;
}

/** Group shelf entries by status (each list keeps input order). */
export function groupShelf(entries: ReadonlyArray<ShelfEntry>): Shelf {
  const shelf: Shelf = { want: [], reading: [], done: [] };
  for (const e of entries) shelf[e.status].push(e);
  return shelf;
}

function rowToEntry(row: Record<string, unknown>): ShelfEntry {
  const authors = Array.isArray(row.authors)
    ? (row.authors as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const status = row.status === "reading" || row.status === "done" ? row.status : "want";
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    volume_id: String(row.volume_id),
    title: String(row.title),
    authors,
    status: status as ReadingStatus,
    current_page: typeof row.current_page === "number" ? row.current_page : 0,
    total_pages: typeof row.total_pages === "number" ? row.total_pages : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// --- Supabase-backed queries (RLS owner-only) --------------------------

/** Put a found book on the shelf (idempotent on user+volume via upsert). */
export async function addToShelf(
  userId: string,
  book: Pick<BookResult, "id" | "title" | "authors" | "pageCount">,
  status: ReadingStatus = "want",
): Promise<ShelfEntry> {
  const insert = {
    user_id: userId,
    volume_id: book.id,
    title: book.title,
    authors: book.authors ?? [],
    status,
    current_page: 0,
    total_pages: typeof book.pageCount === "number" ? book.pageCount : null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_reading")
    .upsert(insert, { onConflict: "user_id,volume_id" })
    .select()
    .single();
  if (error) throw error;
  return rowToEntry(data as Record<string, unknown>);
}

/** The whole shelf, grouped by status. */
export async function listShelf(userId: string): Promise<Shelf> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_reading")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return groupShelf((data ?? []).map((r) => rowToEntry(r as Record<string, unknown>)));
}

/** Update status and/or page progress for one shelf entry. */
export async function updateShelfEntry(
  userId: string,
  id: string,
  patch: { status?: ReadingStatus; current_page?: number; total_pages?: number | null },
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) update.status = patch.status;
  if (typeof patch.current_page === "number") {
    update.current_page = clampPage(patch.current_page, patch.total_pages ?? null);
  }
  if (patch.total_pages !== undefined) update.total_pages = patch.total_pages;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_reading").update(update).eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

/** Remove a book from the shelf. */
export async function removeFromShelf(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_reading").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
