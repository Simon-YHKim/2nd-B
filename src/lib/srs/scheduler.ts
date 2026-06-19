// Wave 1 (language_practice): a thin PURE wrapper over ts-fsrs (the FSRS
// algorithm — MIT, pure JS, $0). ts-fsrs owns the scheduling math; this module
// only converts between our srs_cards row shape and the ts-fsrs `Card`, and
// calls `fsrs().next(...)` to grade one review. No Supabase, no LLM — this is
// node-testable in isolation.
//
// We deliberately do NOT hand-roll SM-2 or invent a scheduler: every state
// transition (due / stability / difficulty / reps / lapses / state) comes
// straight out of ts-fsrs.

import {
  fsrs,
  createEmptyCard,
  State,
  type Card as FsrsCard,
  type Grade,
  type RecordLogItem,
} from "ts-fsrs";

/** The grading buttons, mapped to ts-fsrs Rating (1=Again..4=Easy). */
export type SrsRating = 1 | 2 | 3 | 4;

/**
 * The persisted FSRS columns of an srs_cards row (migration 0051). This is the
 * subset the scheduler reads/writes; the row also carries id/user_id/front/back
 * /deck/created_at which the scheduler never touches.
 */
export interface SrsCardState {
  /** ISO timestamp the card is next due. */
  due: string;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  reps: number;
  lapses: number;
  /** ts-fsrs State: 0=New, 1=Learning, 2=Review, 3=Relearning. */
  state: number;
  last_review: string | null;
}

/** A row to insert into srs_reviews after grading. */
export interface SrsReviewLogRow {
  rating: SrsRating;
  reviewed_on: string;
}

const scheduler = fsrs();

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD for srs_reviews.reviewed_on (mirrors ops localDayKey). */
export function localReviewDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Build the FSRS card the scheduler expects from a stored row. A brand-new card
 * (state 0 with no stability yet) seeds from ts-fsrs createEmptyCard so the
 * internal fields (learning_steps) are initialised correctly; otherwise we
 * reconstruct the full Card from the persisted columns.
 */
export function rowToFsrsCard(row: SrsCardState, now: Date = new Date()): FsrsCard {
  const empty = createEmptyCard(now);
  const isNew = row.state === State.New && (row.stability === null || row.stability === 0);
  if (isNew) {
    return { ...empty, due: new Date(row.due) };
  }
  return {
    ...empty,
    due: new Date(row.due),
    stability: row.stability ?? empty.stability,
    difficulty: row.difficulty ?? empty.difficulty,
    elapsed_days: row.elapsed_days ?? 0,
    scheduled_days: row.scheduled_days ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** Flatten a ts-fsrs Card back into the storable row columns. */
export function fsrsCardToRow(card: FsrsCard): SrsCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/**
 * Grade one review. PURE: takes the stored card state + a rating + the review
 * instant, asks ts-fsrs for the next state, and returns the new row plus the
 * review-log row to append. The persistence (queries.ts) writes both.
 */
export function reviewCard(
  row: SrsCardState,
  rating: SrsRating,
  now: Date = new Date(),
): { card: SrsCardState; log: SrsReviewLogRow } {
  const fsrsCard = rowToFsrsCard(row, now);
  // Rating is 1=Again..4=Easy here, which is exactly the ts-fsrs `Grade` subset
  // (Manual=0 is excluded by construction of SrsRating).
  const result: RecordLogItem = scheduler.next(fsrsCard, now, rating as Grade);
  return {
    card: fsrsCardToRow(result.card),
    log: { rating, reviewed_on: localReviewDay(now) },
  };
}
