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
//   mealClearArmKey  BL-02 (gate)     "clear this meal" takes two taps in one sheet opening
//   runExclusive     BL-03 (gate)     one meal write at a time; a clear cannot race a save
//   mealWriteLock    BL-03 (gate r3)  that lock is per cell and module-wide, not per screen
//   pageWriteLock    BL-09 (gate)     the same, for one book's page count
//   sheetAfterWrite  BL-03 / BL-09    a late write closes only the sheet or editor it started from
//   mealSheetAfterWrite, mealFailure*, mealOpening
//                    S3-01 (gate)     a failed meal write keeps its sheet, draft and retry, tied to its cell
//   mealOpening      OPSFIX-A1-02     a cell changed elsewhere since the failure opens on what is saved now
//   mealRetry, mealUnsavedDraft
//                    OPSFIX-A1-03     the retry repeats only the write that failed, on its own draft
//   editorAfterDelete CD-R1-01        a goal's delete closes only that goal's editor
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

// --- meal sheet writes (gate findings BL-02 / BL-03, 2026-10-05) ----------------

/** One opening of the meal sheet. `session` is new on every open, so nothing left over
 *  from an earlier opening (an armed clear, a late write) can act on a later one. */
export interface MealSheetRef {
  session: number;
  date: string;
  slot: string;
}

/**
 * The two-tap key for "clear this meal": the cell AND the sheet opening it was armed in.
 *
 * BL-02: "clear this meal" deleted the cell on one tap, while the shelf, goals and ledger
 * already took two. Keying the arm by the opening means opening another cell, or closing
 * the sheet and reopening the same one, starts unarmed: the next tap arms, never deletes.
 */
export function mealClearArmKey(sheet: MealSheetRef): string {
  return `${sheet.session}|${sheet.date}|${sheet.slot}`;
}

/**
 * The sheet to show once a meal write settles: closed if it is still the opening the write
 * started from, otherwise left as it is. BL-03: a late completion used to close whatever
 * sheet was open by then, including one the user had just opened on another cell.
 *
 * The shelf's page-count editor uses it the same way (gate BL-09): each opening of the
 * editor carries its own `session`, and a save closes only the opening it started from.
 */
export function sheetAfterWrite<T extends { session: number }>(open: T | null, startedIn: number): T | null {
  return open !== null && open.session === startedIn ? null : open;
}

// --- a meal write that failed (gate S3-01, 2026-10-07) --------------------------------
//
// A failed save or clear used to close the sheet just like one that landed, and the error
// went to a banner over the whole screen. Opening the cell again filled the draft from the
// stored meal, so what the user had typed was gone, and if another cell was open by then the
// banner read as that cell's failure. Now only a write that landed closes its sheet; a failed
// one keeps the sheet, its draft and an error with a retry, tied to the opening and the cell
// it came from.

export type MealWriteAction = "set" | "clear";

/** An opening of the meal sheet together with the meal stored in its cell when it opened. */
export interface MealCellSheet extends MealSheetRef {
  current: string | null;
}

/** A meal write that did not land: the opening it came from (its date and slot name the
 *  cell), what it tried, and the draft as it stood when it was asked.
 *
 *  `base` is the meal that was stored when the write was asked (gate OPSFIX-A1-02). It stays
 *  with the failure when the cell is opened again, so a later opening can tell whether the
 *  cell changed elsewhere since. `stale` is set once it has: from then on the failure is only
 *  shown, never retried, and the draft it tried is only offered back. */
export interface MealWriteFailure<S extends MealSheetRef = MealSheetRef> {
  sheet: S;
  action: MealWriteAction;
  draft: string;
  base: string | null;
  stale: boolean;
}

function sameMealCell(a: MealSheetRef, b: MealSheetRef): boolean {
  return a.date === b.date && a.slot === b.slot;
}

/** A stored meal or a draft, compared the way a save compares them (mealSaveAction). */
function mealText(value: string | null): string {
  return (value ?? "").trim();
}

/**
 * The sheet once a meal write settles. Only a write that landed closes it, and only if it is
 * still the opening the write started from (sheetAfterWrite). A failed write leaves the sheet
 * and its draft as they are, so the user can try again; a refused one ("busy") changes nothing.
 */
export function mealSheetAfterWrite<T extends { session: number }>(
  open: T | null,
  startedIn: number,
  outcome: ExclusiveOutcome,
): T | null {
  return outcome === "done" ? sheetAfterWrite(open, startedIn) : open;
}

/**
 * The failure to keep once a write on `sheet` settles. A failed write replaces it with its
 * own; a write that landed on the same cell clears that cell's failure; anything else (a write
 * on another cell, a refused write) leaves it as it was.
 */
export function mealFailureAfterWrite<S extends MealCellSheet>(
  kept: MealWriteFailure<S> | null,
  sheet: S,
  outcome: ExclusiveOutcome,
  action: MealWriteAction,
  draft: string,
): MealWriteFailure<S> | null {
  // The write was asked against the meal its opening showed, so that is its base.
  if (outcome === "failed") return { sheet, action, draft, base: sheet.current, stale: false };
  if (outcome === "done" && kept !== null && sameMealCell(kept.sheet, sheet)) return null;
  return kept;
}

/**
 * Whether the open sheet shows the failure: only when it came from this very opening (same
 * session, date and slot). A sheet opened on another cell meanwhile never shows it; the
 * screen names the failed cell instead. (A plain boolean, not a type guard: false can mean
 * "another sheet is open", which says nothing about the failure itself.)
 */
export function mealFailureInSheet<S extends MealSheetRef>(failure: MealWriteFailure<S> | null, open: MealSheetRef | null): boolean {
  return failure !== null && open !== null && failure.sheet.session === open.session && sameMealCell(failure.sheet, open);
}

/**
 * Opening a cell. If that cell's last write failed, the failure moves into this opening, so
 * the sheet shows it. Otherwise the stored meal fills the draft and another cell's failure
 * stays where it is.
 *
 * Gate OPSFIX-A1-02: the failed draft used to come back whatever the cell held now. If the
 * cell was saved elsewhere meanwhile (another screen, another device) and the week was read
 * again, reopening still filled in the old draft and its retry wrote it over the newer meal,
 * or deleted it if the failure was a clear. Now `stored` is checked against the failure's
 * `base`:
 *  - the cell already holds what the failed write wanted: nothing is left to do, it is dropped;
 *  - the cell still holds its base: the failed draft comes back, with its retry;
 *  - the cell changed elsewhere: the draft is what is stored now, and the failure is kept as
 *    stale, shown apart from it, never retried (mealRetry). Writing the old draft over the
 *    newer meal, or clearing it, is then the user's own explicit save or two-tap clear.
 */
export function mealOpening<S extends MealSheetRef>(
  kept: MealWriteFailure<S> | null,
  opening: S,
  stored: string | null,
): { draft: string; failure: MealWriteFailure<S> | null } {
  if (kept === null || !sameMealCell(kept.sheet, opening)) return { draft: stored ?? "", failure: kept };
  const wanted = kept.action === "clear" ? "" : mealText(kept.draft);
  if (mealText(stored) === wanted) return { draft: stored ?? "", failure: null };
  const stale = kept.stale || mealText(stored) !== mealText(kept.base);
  if (stale) return { draft: stored ?? "", failure: { ...kept, sheet: opening, stale: true } };
  return { draft: kept.draft, failure: { ...kept, sheet: opening } };
}

/** The retry the sheet offers: the write that failed, exactly. */
export type MealRetry = { action: "clear" } | { action: "set"; title: string };

/**
 * The retry for the open sheet, or null when there is none to offer (gate OPSFIX-A1-03).
 *
 * The retry used to repeat a failed clear whatever the draft had become, and to re-read a
 * failed save from the current draft, so an edited draft turned a save into a clear or into
 * nothing at all. Now it is offered only on the failure's own opening, only while the draft
 * is still the one the failed write was asked with, and never for a stale failure; and it
 * repeats that write as it was (a clear clears, a save writes the draft that failed). Once
 * the draft is edited, the sheet's plain save saves the new draft instead.
 */
export function mealRetry<S extends MealSheetRef>(
  failure: MealWriteFailure<S> | null,
  open: MealSheetRef | null,
  draft: string,
): MealRetry | null {
  if (failure === null || failure.stale || !mealFailureInSheet(failure, open)) return null;
  if (mealText(draft) !== mealText(failure.draft)) return null;
  return failure.action === "clear" ? { action: "clear" } : { action: "set", title: mealText(failure.draft) };
}

/**
 * The failed draft to offer back on a stale failure (gate OPSFIX-A1-02), or null. Only a
 * failed save has a draft worth offering, and only while the input does not already hold it.
 * Taking it only fills the input; saving it over the newer meal is still the user's save.
 */
export function mealUnsavedDraft<S extends MealSheetRef>(
  failure: MealWriteFailure<S> | null,
  open: MealSheetRef | null,
  draft: string,
): string | null {
  if (failure === null || !failure.stale || failure.action !== "set" || !mealFailureInSheet(failure, open)) return null;
  return mealText(draft) === mealText(failure.draft) ? null : failure.draft;
}

/** The cell's failure, dropped: saving found nothing to write (the draft matches the stored
 *  meal), so there is nothing left to retry. Another cell's failure stays. */
export function mealFailureDropped<S extends MealSheetRef>(kept: MealWriteFailure<S> | null, cell: MealSheetRef): MealWriteFailure<S> | null {
  return kept !== null && sameMealCell(kept.sheet, cell) ? null : kept;
}

/**
 * The goal editor to show once a goal's delete settles: closed if it is open on the goal
 * that was deleted (that goal is gone), otherwise left as it is.
 *
 * Gate CD-R1-01: the delete used to close whatever editor was open by then. While a delete
 * is in flight the list is still drawn and another goal's title still opens its editor, so
 * a draft typed into goal B during goal A's delete was thrown away when A's delete landed.
 *
 * The shelf's page-count editor uses it the same way (gate CD-R2-01): while book A's delete
 * is in flight, book B can become the book being read and its page editor can open, and
 * that draft must survive A's delete.
 */
export function editorAfterDelete<T extends { id: string }>(open: T | null, deletedId: string): T | null {
  return open !== null && open.id === deletedId ? null : open;
}

/** Held while a meal write is in flight. A plain object so a React ref can carry it. */
export interface WriteLock {
  held: boolean;
}

export type ExclusiveOutcome = "done" | "failed" | "busy";

/**
 * Run one write while no other is in flight; a write asked for meanwhile is refused
 * ("busy"), not queued and not raced.
 *
 * BL-03: save and clear had no shared lock. Save B over A, then clear before the save
 * answered: the DELETE could land first and the earlier UPSERT after it, so the cell the
 * user had just cleared came back as B. The lock is taken synchronously, before the first
 * await, so a second tap in the same frame is refused too.
 */
export async function runExclusive(lock: WriteLock, write: () => Promise<unknown>): Promise<ExclusiveOutcome> {
  if (lock.held) return "busy";
  lock.held = true;
  try {
    await write();
    return "done";
  } catch {
    return "failed";
  } finally {
    lock.held = false;
  }
}

/** The lock stored under `key`, made on first use. Every lock family below goes through it. */
function lockIn(locks: Map<string, WriteLock>, key: string): WriteLock {
  let lock = locks.get(key);
  if (lock === undefined) {
    lock = { held: false };
    locks.set(key, lock);
  }
  return lock;
}

/** Meal cell locks by `user|date|slot`. One small entry per cell written this session. */
const MEAL_WRITE_LOCKS = new Map<string, WriteLock>();

/**
 * The write lock for one meal cell, shared by every MealsScreen in this JS runtime.
 *
 * BL-03 (gate r3): the lock used to be a useRef inside MealsScreen, so it covered one
 * mounted screen only. The /meals route and the phone ops hub each mount their own
 * MealsScreen, and a screen that unmounts mid-write and mounts again starts with a new
 * ref: a clear from the second screen could still land before the first one's UPSERT
 * and bring the cleared meal back. The lock now lives here, at module scope, keyed by
 * user, date and slot. A write that outlives its screen still holds it, so any screen
 * asking to write the same cell meanwhile is refused ("busy") until that write settles.
 */
export function mealWriteLock(userId: string, date: string, slot: string): WriteLock {
  return lockIn(MEAL_WRITE_LOCKS, `${userId}|${date}|${slot}`);
}

/** Page-count locks by `user|shelf entry`. One small entry per book saved this session. */
const PAGE_WRITE_LOCKS = new Map<string, WriteLock>();

/**
 * The write lock for one book's page count, shared by every ReadingScreen in this JS runtime.
 *
 * BL-09 (gate, 2026-10-06): saving the page count had no in-flight guard. Save 20, then
 * 30 while the first UPDATE was still out, and both went; the UPDATE has no version
 * condition, so if 30 landed first and 20 after, the book read 20. The /reading route and
 * the phone ops hub each mount their own ReadingScreen (the BL-03 r3 shape), so the lock
 * lives here, keyed by user and shelf entry, and a save that outlives its screen still
 * holds it: any screen asking to save the same book meanwhile is refused ("busy").
 */
export function pageWriteLock(userId: string, entryId: string): WriteLock {
  return lockIn(PAGE_WRITE_LOCKS, `${userId}|${entryId}`);
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
