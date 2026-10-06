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
