// The pure choices behind the hand-entry tool screens (QA round 2, 2026-10-05).
// screens.tsx cannot be rendered in this jest (RN 0.85), so the decisions it makes
// are pinned here and the wiring is pinned in tool-screens-contract.test.ts.

import {
  bookSearchFailed,
  bookSearchSettled,
  mealClearArmKey,
  mealSaveAction,
  MILESTONE_NEXT,
  milestoneChip,
  runExclusive,
  sheetAfterWrite,
  shelfView,
  tapDelete,
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
