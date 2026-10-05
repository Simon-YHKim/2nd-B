// Pure decisions behind the hand-entry tool screens (reading, goals, ledger, meals).
//
// This repo's jest has no React Native renderer (RN 0.85), so the screens in
// screens.tsx are guarded by source contracts and the choices they make live here,
// where a test can call them directly. No React, no RN, no Supabase in this file.
//
// What each part fixes (QA round 2, 2026-10-05):
//   tapDelete        R2C-16 / R2C-07  a delete takes two taps on the same row
//   milestoneChip    R2C-09           the status chip shows the status, never "overdue"
//   mealSaveAction   R2C-07           an emptied meal cell is cleared, not kept
//   bookSearch*      R2C-02           a failed book search says so
//   shelfView        R2C-08           finished books and every book being read are shown

import type { OpsChipTone } from "@/components/deepspace/ops";
import { isBooksRateLimited, type BookResult } from "@/lib/reading/books";
import type { MilestoneStatus } from "@/lib/ops/milestones";
import type { Shelf, ShelfEntry } from "@/lib/reading/shelf";

// --- two-tap delete ------------------------------------------------------

/** How long an armed delete waits for its second tap before it lets go. */
export const DELETE_ARM_MS = 4000;

export interface DeleteTap {
  /** The row now waiting for its second tap (null = none). */
  armedId: string | null;
  /** True only on the second tap of the SAME row: delete it now. */
  commit: boolean;
}

/**
 * One tap on a row's delete control. The first tap arms that row and deletes nothing;
 * a second tap on the same row deletes it. Tapping another row's delete moves the arm
 * there, so a stray tap can never delete a row the user did not just confirm.
 *
 * The ledger's ✕ used to delete on the first tap (R2C-16), next to the amount, with no
 * confirm and no undo, unlike every other single-item delete in the app.
 */
export function tapDelete(armedId: string | null, id: string): DeleteTap {
  if (armedId === id) return { armedId: null, commit: true };
  return { armedId: id, commit: false };
}

// --- milestone status chip -------------------------------------------------

/** Status advances todo → doing → done → todo (one tap cycles the chip). */
export const MILESTONE_NEXT: Readonly<Record<MilestoneStatus, MilestoneStatus>> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

export type MilestoneChipKey = "planning" | "inProgress" | "done";

/**
 * The chip shows the goal's status, and only that.
 *
 * R2C-09: the chip used to return "overdue" first whenever the due date had passed.
 * milestoneOverdue() is true for both todo and doing, so on an overdue goal the first
 * tap (todo → doing) was saved but the chip did not change, and "in progress" could
 * not be seen at all. Overdue now lives on the due-date line (the screen still asks
 * milestoneOverdue for it), and every tap visibly changes this chip.
 */
export function milestoneChip(status: MilestoneStatus): { tone: OpsChipTone; key: MilestoneChipKey } {
  if (status === "doing") return { tone: "positive", key: "inProgress" };
  if (status === "done") return { tone: "muted", key: "done" };
  return { tone: "info", key: "planning" };
}

// --- meal cell save ----------------------------------------------------------

export type MealSaveAction = "set" | "clear" | "close";

/**
 * What saving the meal sheet does.
 *
 * R2C-07: an emptied draft used to just close the sheet, so clearing a cell and
 * pressing save left the old meal in place. Now an emptied cell that had a meal is
 * cleared; an unchanged or still-empty cell writes nothing.
 */
export function mealSaveAction(draft: string, current: string | null): MealSaveAction {
  const next = draft.trim();
  const had = (current ?? "").trim();
  if (next.length === 0) return had.length > 0 ? "clear" : "close";
  return next === had ? "close" : "set";
}

// --- book search --------------------------------------------------------------

export type BookSearchView =
  | { kind: "idle" }
  | { kind: "searching"; q: string }
  | { kind: "results"; q: string; items: BookResult[] }
  | { kind: "none"; q: string }
  | { kind: "failed"; q: string; rate: boolean };

/**
 * A finished search. Zero hits is its own state ("nothing matched"), separate from a
 * failure and from "not searched yet". R2C-02: all three used to land on the same
 * empty card ("no suggestions yet"), so a refused search looked like nothing at all.
 */
export function bookSearchSettled(q: string, items: BookResult[]): BookSearchView {
  return items.length > 0 ? { kind: "results", q, items } : { kind: "none", q };
}

/** A search that threw. A quota refusal (429) is told apart from other failures. */
export function bookSearchFailed(q: string, error: unknown): BookSearchView {
  return { kind: "failed", q, rate: isBooksRateLimited(error) };
}

// --- shelf layout ---------------------------------------------------------------

export interface ShelfView {
  /** The NOW READING hero: the most recently touched book being read. */
  hero: ShelfEntry | null;
  /** Every other book being read. Only reading[0] used to be shown (R2C-08). */
  alsoReading: ShelfEntry[];
  want: ShelfEntry[];
  /** Finished books. These were never drawn, so "finished" looked like "deleted". */
  done: ShelfEntry[];
  /** Nothing on the shelf at all. */
  empty: boolean;
}

export function shelfView(shelf: Shelf | null | undefined): ShelfView {
  const reading = shelf?.reading ?? [];
  const want = shelf?.want ?? [];
  const done = shelf?.done ?? [];
  return {
    hero: reading[0] ?? null,
    alsoReading: reading.slice(1),
    want,
    done,
    empty: reading.length + want.length + done.length === 0,
  };
}
