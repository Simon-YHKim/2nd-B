// Reading shelf manage layer (O-R3 Wave 2, reading_list). Pairs with the Google
// Books search source (books.ts): search finds a volume, this persists it on the
// user's shelf with a status (want/reading/done) + page progress. Manual
// structured input — no Gemini call, no new C1/C9/C3 surface. $0.
//
// RLS owner-only (migration 0053). Pure helpers separated from the Supabase
// calls so they are node-testable, the same discipline as ops/routines.ts.

import { getSupabaseClient } from "../supabase/client";
import { invalidateDomainLevels } from "../persona/load-domain-levels";
import type { BookResult } from "./books";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";

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

/** Every volume id already on the shelf, whatever its status. A search result
 *  whose id is in here is shown as "on shelf" instead of offering a second add. */
export function shelfVolumeIds(shelf: Shelf | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!shelf) return ids;
  for (const e of [...shelf.want, ...shelf.reading, ...shelf.done]) ids.add(e.volume_id);
  return ids;
}

/** Volume ids of books added by title, not from a search result. */
export const MANUAL_VOLUME_PREFIX = "manual:";
const MANUAL_TITLE_MAX = 200;
// A legacy 200-code-unit title can expand to 400 when lowercased (e.g. U+0130).
const MANUAL_ID_MAX = MANUAL_TITLE_MAX * 2;

/**
 * A shelf book made from a typed title (R2C-02). The search is a third-party API
 * that can refuse every request (the keyless quota measured 0 on 2026-10-05), and it
 * was the only way onto the shelf, so one dead dependency made the whole screen
 * unusable. The id is derived from the title (case and spacing folded) so adding the
 * same title twice finds the same row instead of making a second one.
 */
export async function manualBook(title: string): Promise<BookResult | null> {
  const clean = title.trim().replace(/\s+/g, " ");
  if (clean.length === 0) return null;
  const normalized = clean.toLowerCase();
  // S-03: keep legacy ids, but identify long titles by their entire normalized text.
  // Uppercase SHA256 cannot be a legacy lowercased title id. A fixed-size digest also
  // keeps arbitrarily long titles out of the UNIQUE index's key-size limit.
  const identity = normalized.length <= MANUAL_ID_MAX
    ? normalized
    : `SHA256:${await digestStringAsync(CryptoDigestAlgorithm.SHA256, normalized)}`;
  return { id: `${MANUAL_VOLUME_PREFIX}${identity}`, title: clean.slice(0, MANUAL_TITLE_MAX), authors: [] };
}

/** Page numbers above this are refused rather than stored (the column is int4). */
export const PAGE_INPUT_MAX = 100000;
export const PAGE_INPUT_MAX_CHARS = 6;

/** BL-08: refuse the whole edit; never keep a truncated paste as another page count. */
export function pageCountEdit(held: string, typed: string): { text: string; overflow: boolean } {
  return typed.length > PAGE_INPUT_MAX_CHARS ? { text: held, overflow: true } : { text: typed, overflow: false };
}

/**
 * Parse the page editor's two fields (R2C-08: the "0 / 200" under NOW READING had no
 * way to change). `current` is required; `total` may be left empty for "unknown".
 * Returns null for anything that is not a plain whole number in range, so a typo is
 * refused instead of being saved as some other number. The current page is clamped
 * to the total, the same rule the progress bar uses.
 */
export function parsePageDraft(
  currentDraft: string,
  totalDraft: string,
): { current_page: number; total_pages: number | null } | null {
  const whole = (raw: string): number | null | undefined => {
    if (raw.length > PAGE_INPUT_MAX_CHARS) return null;
    const t = raw.trim();
    if (t.length === 0) return undefined;
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) && n <= PAGE_INPUT_MAX ? n : null;
  };
  const cur = whole(currentDraft);
  const tot = whole(totalDraft);
  if (cur === undefined || cur === null || tot === null) return null;
  const total = tot === undefined || tot === 0 ? null : tot;
  return { current_page: clampPage(cur, total), total_pages: total };
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

async function findShelfEntry(userId: string, volumeId: string): Promise<ShelfEntry | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("ops_reading")
    .select("*")
    .eq("user_id", userId)
    .eq("volume_id", volumeId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToEntry(data as Record<string, unknown>) : null;
}

/**
 * Put a found book on the shelf. A book that is already there is returned as it is.
 *
 * R2C-08: this used to upsert `{ status, current_page: 0 }` on (user_id, volume_id),
 * so adding a book that was already on the shelf (being read, 120 pages in) quietly
 * reset it to "want" at page 0. The UNIQUE(user_id, volume_id) constraint (0053)
 * turned the second add into that UPDATE. Now an existing row is never written here;
 * status and progress only change through setShelfStatus / updateShelfEntry.
 */
export async function addToShelf(
  userId: string,
  book: Pick<BookResult, "id" | "title" | "authors" | "pageCount">,
  status: ReadingStatus = "want",
): Promise<ShelfEntry> {
  const existing = await findShelfEntry(userId, book.id);
  if (existing) return existing;
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
  const { data, error } = await supabase.from("ops_reading").insert(insert).select().single();
  if (error) {
    // Two taps raced and the other insert won the unique constraint: same book, same
    // answer. Anything else is a real failure.
    if ((error as { code?: unknown }).code === "23505") {
      const raced = await findShelfEntry(userId, book.id);
      if (raced) return raced;
    }
    throw error;
  }
  // A shelf entry lifts the 성장 (growth) domain star; drop the stale home cache.
  invalidateDomainLevels(userId);
  return rowToEntry(data as Record<string, unknown>);
}

/**
 * med#21: move a shelf entry between statuses (want → reading → done). The
 * NOW-READING hero could never light up before this existed — nothing in the
 * UI ever set status to "reading".
 */
export async function setShelfStatus(userId: string, entryId: string, status: ReadingStatus): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("ops_reading")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", entryId);
  if (error) throw error;
  invalidateDomainLevels(userId);
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
  invalidateDomainLevels(userId);
}

/** Remove a book from the shelf. */
export async function removeFromShelf(userId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("ops_reading").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
  // The shelf feeds the growth star's coverage; a removed book must not keep it lit.
  invalidateDomainLevels(userId);
}
