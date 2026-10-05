// The pure choices behind the hand-entry tool screens (QA round 2, 2026-10-05).
// screens.tsx cannot be rendered in this jest (RN 0.85), so the decisions it makes
// are pinned here and the wiring is pinned in tool-screens-contract.test.ts.

import {
  bookSearchFailed,
  bookSearchSettled,
  mealSaveAction,
  MILESTONE_NEXT,
  milestoneChip,
  shelfView,
  tapDelete,
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
