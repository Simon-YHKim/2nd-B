// Wave 1 (language_practice): RLS-scoped persistence for srs_cards / srs_reviews
// (migration 0051). Owner-only: both tables are owner-only RLS (auth.uid() =
// user_id), so every query is also scoped with .eq("user_id", userId) — the
// explicit argument must equal auth.uid() or the policy rejects the write.
//
// The scheduling math lives in scheduler.ts (a pure ts-fsrs wrapper); this
// module is only the SAVE side: read the due queue, grade a review (apply the
// scheduler → update the card row + append a review log row), and count what is
// due today. No LLM lives here.

import { getSupabaseClient } from "../supabase/client";
import {
  reviewCard,
  type SrsCardState,
  type SrsRating,
} from "./scheduler";

/** A persisted flashcard row (mirrors the srs_cards columns). */
export interface SrsCardRow extends SrsCardState {
  id: string;
  user_id: string;
  front: string;
  back: string;
  deck: string | null;
  created_at: string | null;
}

/** Fields a caller supplies to create a card; FSRS state is seeded here. */
export interface NewCardInput {
  front: string;
  back: string;
  deck?: string | null;
}

/**
 * Create a flashcard. A new card is immediately due (due = now) and starts in
 * FSRS State.New (state 0, reps/lapses 0) so it enters the very next session.
 */
export async function createCard(
  userId: string,
  input: NewCardInput,
  now: Date = new Date(),
): Promise<SrsCardRow> {
  const insert = {
    user_id: userId,
    front: input.front,
    back: input.back,
    deck: input.deck ?? null,
    due: now.toISOString(),
    stability: null,
    difficulty: null,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("srs_cards").insert(insert).select().single();
  if (error) throw error;
  return data as SrsCardRow;
}

/** Cards due at/before `now` for the user (RLS-scoped), earliest-due first. */
export async function listDueCards(userId: string, now: Date = new Date()): Promise<SrsCardRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("srs_cards")
    .select("*")
    .eq("user_id", userId)
    .lte("due", now.toISOString())
    .order("due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SrsCardRow[];
}

/** How many cards are due at/before `now` (the today queue size). */
export async function countDueToday(userId: string, now: Date = new Date()): Promise<number> {
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from("srs_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due", now.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/**
 * Grade one review. Applies the pure scheduler (ts-fsrs) to advance the card,
 * writes the new FSRS state back onto the srs_cards row, and appends an
 * srs_reviews log row — both RLS-scoped to the user. Returns the updated card.
 */
export async function recordReview(
  userId: string,
  cardId: string,
  rating: SrsRating,
  now: Date = new Date(),
): Promise<SrsCardRow> {
  const supabase = getSupabaseClient();
  const { data: cardData, error: readErr } = await supabase
    .from("srs_cards")
    .select("*")
    .eq("user_id", userId)
    .eq("id", cardId)
    .single();
  if (readErr) throw readErr;
  const current = cardData as SrsCardRow;

  const { card, log } = reviewCard(current, rating, now);

  const { data: updated, error: updateErr } = await supabase
    .from("srs_cards")
    .update(card)
    .eq("user_id", userId)
    .eq("id", cardId)
    .select()
    .single();
  if (updateErr) throw updateErr;

  const { error: logErr } = await supabase.from("srs_reviews").insert({
    user_id: userId,
    card_id: cardId,
    rating: log.rating,
    reviewed_on: log.reviewed_on,
  });
  if (logErr) throw logErr;

  return updated as SrsCardRow;
}
