// The pure choices behind the hand-entry tool screens (QA round 2, 2026-10-05).
// screens.tsx cannot be rendered in this jest (RN 0.85), so the decisions it makes
// are pinned here and the wiring is pinned in tool-screens-contract.test.ts.

import {
  bookSearchFailed,
  bookSearchSettled,
  editorAfterDelete,
  mealClearArmKey,
  mealFailureAfterWrite,
  mealFailureDropped,
  mealFailureInSheet,
  mealOpening,
  mealSaveAction,
  mealSheetAfterWrite,
  mealWriteLock,
  MILESTONE_NEXT,
  milestoneChip,
  pageWriteLock,
  runExclusive,
  sheetAfterWrite,
  shelfView,
  tapDelete,
  type MealWriteFailure,
  type WriteLock,
} from "../tool-logic";
import { milestoneOverdue, type MilestoneStatus } from "@/lib/ops/milestones";
import { groupShelf, type ShelfEntry } from "@/lib/reading/shelf";

describe("tapDelete (R2C-16, R2C-07): one tap never deletes", () => {
  test("the first tap only arms the row", () => {
    expect(tapDelete(null, "a")).toEqual({ armedId: "a", commit: false });
  });
  test("a second tap on the same row deletes it", () => {
    expect(tapDelete("a", "a")).toEqual({ armedId: null, commit: true });
  });
  test("a tap on another row moves the arm and deletes nothing", () => {
    expect(tapDelete("a", "b")).toEqual({ armedId: "b", commit: false });
  });
});

describe("milestoneChip (R2C-09): every tap visibly changes the chip", () => {
  const all: MilestoneStatus[] = ["todo", "doing", "done"];

  test("the chip label differs before and after each tap", () => {
    for (const s of all) expect(milestoneChip(MILESTONE_NEXT[s]).key).not.toBe(milestoneChip(s).key);
  });

  test("an overdue todo and an overdue doing show different chips", () => {
    const past = "2026-10-04";
    const now = new Date(2026, 9, 5);
    // Both are overdue by the model's rule (which this fix does not change) ...
    expect(milestoneOverdue({ status: "todo", target_date: past }, now)).toBe(true);
    expect(milestoneOverdue({ status: "doing", target_date: past }, now)).toBe(true);
    // ... and the chip still tells them apart.
    expect(milestoneChip("todo").key).toBe("planning");
    expect(milestoneChip("doing").key).toBe("inProgress");
  });

  test("the cycle is todo, doing, done, todo", () => {
    expect(MILESTONE_NEXT).toEqual({ todo: "doing", doing: "done", done: "todo" });
  });
});

describe("mealSaveAction (R2C-07): an emptied cell is cleared", () => {
  test("emptying a cell that had a meal clears it", () => {
    expect(mealSaveAction("", "Bibimbap")).toBe("clear");
    expect(mealSaveAction("   ", "Bibimbap")).toBe("clear");
  });
  test("an empty cell left empty writes nothing", () => {
    expect(mealSaveAction("", null)).toBe("close");
  });
  test("an unchanged meal writes nothing", () => {
    expect(mealSaveAction(" Bibimbap ", "Bibimbap")).toBe("close");
  });
  test("a new or changed meal is saved", () => {
    expect(mealSaveAction("Kimchi stew", null)).toBe("set");
    expect(mealSaveAction("Kimchi stew", "Bibimbap")).toBe("set");
  });
});

describe("mealClearArmKey (gate BL-02): clearing a meal takes two taps in one opening", () => {
  const mon = { session: 1, date: "2026-10-12", slot: "breakfast" };
  test("two taps in the same opening clear the cell", () => {
    const first = tapDelete(null, mealClearArmKey(mon));
    expect(first.commit).toBe(false);
    expect(tapDelete(first.armedId, mealClearArmKey(mon)).commit).toBe(true);
  });
  test("an arm left on another cell does not clear this one", () => {
    const armed = tapDelete(null, mealClearArmKey({ ...mon, session: 1, slot: "lunch" })).armedId;
    expect(tapDelete(armed, mealClearArmKey({ ...mon, session: 2 })).commit).toBe(false);
  });
  test("closing and reopening the same cell starts unarmed", () => {
    const armed = tapDelete(null, mealClearArmKey(mon)).armedId;
    const reopened = { ...mon, session: 2 };
    expect(mealClearArmKey(reopened)).not.toBe(mealClearArmKey(mon));
    expect(tapDelete(armed, mealClearArmKey(reopened)).commit).toBe(false);
  });
});

describe("sheetAfterWrite (gate BL-03): a late write closes only its own sheet", () => {
  test("the sheet the write started from closes", () => {
    expect(sheetAfterWrite({ session: 3 }, 3)).toBeNull();
  });
  test("a sheet opened since stays open", () => {
    const newer = { session: 4 };
    expect(sheetAfterWrite(newer, 3)).toBe(newer);
  });
  test("an already closed sheet stays closed", () => {
    expect(sheetAfterWrite(null, 3)).toBeNull();
  });
});

// Gate S3-01 (2026-10-07): a failed meal write closed the sheet like one that landed, so the
// draft was gone (reopening filled it from the stored meal), and the error was a screen-wide
// banner that read as the failure of whatever cell was open by then.
describe("mealSheetAfterWrite (gate S3-01): only a write that landed closes its sheet", () => {
  test("done: the sheet it started from closes, a newer one stays", () => {
    expect(mealSheetAfterWrite({ session: 3 }, 3, "done")).toBeNull();
    const newer = { session: 4 };
    expect(mealSheetAfterWrite(newer, 3, "done")).toBe(newer);
  });
  test("failed: the sheet it started from stays open, as it is", () => {
    const own = { session: 3, draft: "bibimbap" };
    expect(mealSheetAfterWrite(own, 3, "failed")).toBe(own);
  });
  test("busy: nothing changes", () => {
    const own = { session: 3 };
    expect(mealSheetAfterWrite(own, 3, "busy")).toBe(own);
    expect(mealSheetAfterWrite(null, 3, "busy")).toBeNull();
  });
});

describe("meal write failures (gate S3-01): tied to the opening and the cell they came from", () => {
  type Sheet = { session: number; date: string; slot: string; day: string; current: string | null };
  const sheet = (session: number, date: string, slot: string, current: string | null = null): Sheet => ({
    session,
    date,
    slot,
    day: "Mon",
    current,
  });
  const monLunch1 = sheet(1, "2026-10-05", "lunch", "kimbap");

  test("a failed write records its opening, its action and the draft it tried", () => {
    expect(mealFailureAfterWrite(null, monLunch1, "failed", "set", "bibimbap")).toEqual({
      sheet: monLunch1,
      action: "set",
      draft: "bibimbap",
    });
  });

  test("a write that lands clears its own cell's failure only", () => {
    const failed = mealFailureAfterWrite<Sheet>(null, monLunch1, "failed", "set", "bibimbap");
    // The same cell, from a later opening: cleared.
    expect(mealFailureAfterWrite(failed, sheet(2, "2026-10-05", "lunch"), "done", "set", "x")).toBeNull();
    // Another slot, another day: kept.
    expect(mealFailureAfterWrite(failed, sheet(2, "2026-10-05", "dinner"), "done", "set", "x")).toBe(failed);
    expect(mealFailureAfterWrite(failed, sheet(2, "2026-10-06", "lunch"), "done", "set", "x")).toBe(failed);
    // A refused write changes nothing.
    expect(mealFailureAfterWrite(failed, monLunch1, "busy", "set", "x")).toBe(failed);
  });

  test("the sheet shows the failure only on the opening it came from", () => {
    const failed = mealFailureAfterWrite<Sheet>(null, monLunch1, "failed", "set", "bibimbap");
    expect(mealFailureInSheet(failed, monLunch1)).toBe(true);
    // Another cell opened meanwhile: never shown there.
    expect(mealFailureInSheet(failed, sheet(2, "2026-10-05", "dinner"))).toBe(false);
    expect(mealFailureInSheet(failed, sheet(2, "2026-10-06", "lunch"))).toBe(false);
    // The same cell reopened is a new session: it gets the failure only through mealOpening.
    expect(mealFailureInSheet(failed, sheet(2, "2026-10-05", "lunch"))).toBe(false);
    // A session number alone is not enough: the cell must match too.
    expect(mealFailureInSheet(failed, sheet(1, "2026-10-05", "dinner"))).toBe(false);
    expect(mealFailureInSheet(failed, null)).toBe(false);
    expect(mealFailureInSheet(null, monLunch1)).toBe(false);
  });

  test("opening the failed cell again gives back the draft that failed, with the failure", () => {
    const failed = mealFailureAfterWrite<Sheet>(null, monLunch1, "failed", "set", "bibimbap");
    const reopened = sheet(5, "2026-10-05", "lunch", "kimbap");
    const opened = mealOpening(failed, reopened, reopened.current);
    expect(opened.draft).toBe("bibimbap");
    expect(opened.failure).toEqual({ sheet: reopened, action: "set", draft: "bibimbap" });
    expect(mealFailureInSheet(opened.failure, reopened)).toBe(true);
  });

  test("opening another cell fills from its stored meal and leaves the failure on its own cell", () => {
    const failed = mealFailureAfterWrite<Sheet>(null, monLunch1, "failed", "set", "bibimbap");
    const other = sheet(6, "2026-10-05", "dinner", "soup");
    const opened = mealOpening(failed, other, other.current);
    expect(opened.draft).toBe("soup");
    expect(opened.failure).toBe(failed);
    expect(mealFailureInSheet(opened.failure, other)).toBe(false);
    expect(mealOpening(null, sheet(7, "2026-10-06", "lunch"), null)).toEqual({ draft: "", failure: null });
  });

  test("nothing left to save drops that cell's failure, and only that cell's", () => {
    const failed = mealFailureAfterWrite<Sheet>(null, monLunch1, "failed", "clear", "");
    expect(mealFailureDropped(failed, sheet(9, "2026-10-05", "lunch"))).toBeNull();
    expect(mealFailureDropped(failed, sheet(9, "2026-10-05", "dinner"))).toBe(failed);
    expect(mealFailureDropped(null, monLunch1)).toBeNull();
  });

  // The screen's sequence, step by step through the same functions it calls.
  test("closing the sheet mid-write and opening another cell: the failure stays with the first cell", () => {
    // The user typed "bibimbap" into Mon lunch (opening 1) and saved, then closed that sheet
    // and opened Mon dinner (opening 2) before the save answered. Now the save fails.
    const dinner = sheet(2, "2026-10-05", "dinner", "soup");
    const none: MealWriteFailure<Sheet> | null = null;
    const kept = mealFailureAfterWrite(none, monLunch1, "failed", "set", "bibimbap");
    const open = mealSheetAfterWrite<Sheet>(dinner, monLunch1.session, "failed");
    expect(open).toBe(dinner); // dinner's sheet is untouched
    expect(mealFailureInSheet(kept, open)).toBe(false); // and does not show lunch's failure
    expect(kept?.sheet.slot).toBe("lunch"); // the screen names Mon lunch instead
    // Reopening Mon lunch brings the draft back, with the failure and its retry.
    const lunchAgain = sheet(3, "2026-10-05", "lunch", "kimbap");
    const opened = mealOpening(kept, lunchAgain, lunchAgain.current);
    expect(opened.draft).toBe("bibimbap");
    expect(mealFailureInSheet(opened.failure, lunchAgain)).toBe(true);
    // The retry lands: that sheet closes and the failure is gone.
    expect(mealSheetAfterWrite(lunchAgain, lunchAgain.session, "done")).toBeNull();
    expect(mealFailureAfterWrite(opened.failure, lunchAgain, "done", "set", "bibimbap")).toBeNull();
  });
});

describe("editorAfterDelete (gate CD-R1-01): a goal's delete closes only that goal's editor", () => {
  test("the editor open on the deleted goal closes", () => {
    expect(editorAfterDelete({ id: "goal-a", title: "A", due: "" }, "goal-a")).toBeNull();
  });
  test("another goal's editor, opened while the delete ran, keeps its draft", () => {
    const draftB = { id: "goal-b", title: "B renamed", due: "2026-11-01" };
    expect(editorAfterDelete(draftB, "goal-a")).toBe(draftB);
  });
  test("an already closed editor stays closed", () => {
    expect(editorAfterDelete(null, "goal-a")).toBeNull();
  });
});

describe("editorAfterDelete (gate CD-R2-01): a book's delete closes only that book's page editor", () => {
  test("book B's page draft, opened while book A's delete ran, survives A's delete", () => {
    const draftB = { session: 2, id: "book-b", cur: "120", total: "300" };
    expect(editorAfterDelete(draftB, "book-a")).toBe(draftB);
  });
  test("the page editor open on the deleted book closes, whichever opening it is", () => {
    expect(editorAfterDelete({ session: 1, id: "book-a", cur: "20", total: "" }, "book-a")).toBeNull();
    expect(editorAfterDelete({ session: 3, id: "book-a", cur: "40", total: "" }, "book-a")).toBeNull();
  });
});

describe("runExclusive (gate BL-03): a clear cannot race a save", () => {
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  test("a clear asked for while a save is in flight is refused, not sent", async () => {
    const lock: WriteLock = { held: false };
    const order: string[] = [];
    const save = deferred();
    const saving = runExclusive(lock, async () => {
      order.push("upsert:start");
      await save.promise;
      order.push("upsert:end");
    });
    // The lock is taken before the first await: a tap in the same frame is already refused.
    expect(lock.held).toBe(true);
    const clearWrite = jest.fn(async () => {
      order.push("delete");
    });
    await expect(runExclusive(lock, clearWrite)).resolves.toBe("busy");
    expect(clearWrite).not.toHaveBeenCalled();
    save.resolve();
    await expect(saving).resolves.toBe("done");
    // No DELETE ran in between, so no late UPSERT can bring a cleared cell back.
    expect(order).toEqual(["upsert:start", "upsert:end"]);
    expect(lock.held).toBe(false);
  });

  test("after the save settles, the clear goes through", async () => {
    const lock: WriteLock = { held: false };
    await runExclusive(lock, async () => undefined);
    const clearWrite = jest.fn(async () => undefined);
    await expect(runExclusive(lock, clearWrite)).resolves.toBe("done");
    expect(clearWrite).toHaveBeenCalledTimes(1);
  });

  test("a failed write reports failure and lets go of the lock", async () => {
    const lock: WriteLock = { held: false };
    const w = deferred();
    const running = runExclusive(lock, () => w.promise);
    w.reject(new Error("400"));
    await expect(running).resolves.toBe("failed");
    expect(lock.held).toBe(false);
  });
});

describe("mealWriteLock (gate BL-03 r3): the lock outlives the screen that took it", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };
  // Each screen looks the lock up for itself, the way MealsScreen does on every write.
  // Distinct ids per test, because the locks are module-wide by design.
  const screenWrite = (user: string, date: string, slot: string, write: () => Promise<unknown>) =>
    runExclusive(mealWriteLock(user, date, slot), write);

  test("a clear from a second screen is refused while the first screen's save is in flight", async () => {
    const order: string[] = [];
    const save = deferred();
    // Screen A (say the /meals route) saves B over A ...
    const saving = screenWrite("u-two-screens", "2026-10-12", "lunch", async () => {
      order.push("upsert:start");
      await save.promise;
      order.push("upsert:end");
    });
    // ... and screen B (the phone hub, or A remounted) clears the same cell meanwhile.
    const clearWrite = jest.fn(async () => {
      order.push("delete");
    });
    await expect(screenWrite("u-two-screens", "2026-10-12", "lunch", clearWrite)).resolves.toBe("busy");
    expect(clearWrite).not.toHaveBeenCalled();
    save.resolve();
    await expect(saving).resolves.toBe("done");
    expect(order).toEqual(["upsert:start", "upsert:end"]);
    // Once the save has landed, the clear goes through, after it.
    await expect(screenWrite("u-two-screens", "2026-10-12", "lunch", clearWrite)).resolves.toBe("done");
    expect(order).toEqual(["upsert:start", "upsert:end", "delete"]);
  });

  test("every lookup of one cell returns the same lock", () => {
    expect(mealWriteLock("u-same", "2026-10-12", "dinner")).toBe(mealWriteLock("u-same", "2026-10-12", "dinner"));
  });

  test("another cell, day or user is not held up", async () => {
    const save = deferred();
    const saving = screenWrite("u-other", "2026-10-12", "breakfast", () => save.promise);
    const other = jest.fn(async () => undefined);
    await expect(screenWrite("u-other", "2026-10-12", "lunch", other)).resolves.toBe("done");
    await expect(screenWrite("u-other", "2026-10-13", "breakfast", other)).resolves.toBe("done");
    await expect(screenWrite("u-someone-else", "2026-10-12", "breakfast", other)).resolves.toBe("done");
    expect(other).toHaveBeenCalledTimes(3);
    save.resolve();
    await expect(saving).resolves.toBe("done");
  });
});

describe("pageWriteLock (gate BL-09): page-count saves for one book go one at a time", () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };
  // Each save looks the lock up for itself, the way ReadingScreen does. Distinct ids per
  // test, because the locks are module-wide by design.
  const savePages = (user: string, entry: string, write: () => Promise<unknown>) =>
    runExclusive(pageWriteLock(user, entry), write);

  test("a second save while the first is out is refused, so the older value cannot land last", async () => {
    // The row as the server holds it. The UPDATE has no version check: last write wins.
    let stored = 0;
    const slow = deferred();
    // Save 20; its UPDATE is slow to land ...
    const first = savePages("u-bl09", "book-a", async () => {
      await slow.promise;
      stored = 20;
    });
    // ... and 30 is asked for meanwhile, from this screen or the other one mounted.
    const second = jest.fn(async () => {
      stored = 30;
    });
    await expect(savePages("u-bl09", "book-a", second)).resolves.toBe("busy");
    expect(second).not.toHaveBeenCalled();
    slow.resolve();
    await expect(first).resolves.toBe("done");
    expect(stored).toBe(20);
    // Once the first has landed, 30 goes through after it and stays.
    await expect(savePages("u-bl09", "book-a", second)).resolves.toBe("done");
    expect(stored).toBe(30);
  });

  test("every lookup of one book returns the same lock", () => {
    expect(pageWriteLock("u-same-book", "book-b")).toBe(pageWriteLock("u-same-book", "book-b"));
  });

  test("another book or another user is not held up", async () => {
    const slow = deferred();
    const saving = savePages("u-books", "book-c", () => slow.promise);
    const other = jest.fn(async () => undefined);
    await expect(savePages("u-books", "book-d", other)).resolves.toBe("done");
    await expect(savePages("u-books-else", "book-c", other)).resolves.toBe("done");
    expect(other).toHaveBeenCalledTimes(2);
    slow.resolve();
    await expect(saving).resolves.toBe("done");
  });

  test("a page lock is never a meal cell's lock, even when the keys would spell the same", () => {
    expect(pageWriteLock("u-fam", "2026-10-12|lunch")).not.toBe(mealWriteLock("u-fam", "2026-10-12", "lunch"));
  });

  test("a save closes only the editor opening it started from", () => {
    const reopened = { session: 2, id: "book-a", cur: "30", total: "" };
    expect(sheetAfterWrite(reopened, 1)).toBe(reopened);
    expect(sheetAfterWrite({ session: 1, id: "book-a", cur: "20", total: "" }, 1)).toBeNull();
  });
});

describe("book search outcomes (R2C-02): a failure is not an empty result", () => {
  test("zero hits is 'none', not idle and not failed", () => {
    expect(bookSearchSettled("zzqq", [])).toEqual({ kind: "none", q: "zzqq" });
  });
  test("hits are results", () => {
    const items = [{ id: "v", title: "T", authors: [] }];
    expect(bookSearchSettled("t", items)).toEqual({ kind: "results", q: "t", items });
  });
  test("a 429 is a failure marked as the quota refusal", () => {
    expect(bookSearchFailed("demian", "rate_limited")).toEqual({ kind: "failed", q: "demian", rate: true });
  });
  test("any other throw is a plain failure", () => {
    expect(bookSearchFailed("demian", "fetch_failed")).toEqual({ kind: "failed", q: "demian", rate: false });
  });
});

describe("shelfView (R2C-08): nothing on the shelf disappears from the screen", () => {
  const entry = (id: string, status: ShelfEntry["status"]): ShelfEntry => ({
    id,
    user_id: "u",
    volume_id: `v${id}`,
    title: id,
    authors: [],
    status,
    current_page: 0,
    total_pages: null,
    created_at: "",
    updated_at: "",
  });

  test("finished books are listed", () => {
    const view = shelfView(groupShelf([entry("1", "done")]));
    expect(view.done.map((e) => e.id)).toEqual(["1"]);
    expect(view.empty).toBe(false);
  });

  test("a second book being read is not dropped", () => {
    const view = shelfView(groupShelf([entry("1", "reading"), entry("2", "reading")]));
    expect(view.hero?.id).toBe("1");
    expect(view.alsoReading.map((e) => e.id)).toEqual(["2"]);
  });

  test("only a shelf with nothing on it is empty", () => {
    expect(shelfView(groupShelf([])).empty).toBe(true);
    expect(shelfView(null).empty).toBe(true);
    expect(shelfView(groupShelf([entry("1", "want")])).empty).toBe(false);
  });
});
