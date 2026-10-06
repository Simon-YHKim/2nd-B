import {
  clampPage,
  groupShelf,
  manualBook,
  MANUAL_VOLUME_PREFIX,
  PAGE_INPUT_MAX,
  parsePageDraft,
  readingProgress,
  shelfVolumeIds,
  type ShelfEntry,
} from "../shelf";

function entry(over: Partial<ShelfEntry>): ShelfEntry {
  return {
    id: "x",
    user_id: "u",
    volume_id: "v",
    title: "T",
    authors: [],
    status: "want",
    current_page: 0,
    total_pages: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("readingProgress", () => {
  test("ratio of current to total", () => {
    expect(readingProgress(50, 200)).toBe(0.25);
    expect(readingProgress(200, 200)).toBe(1);
  });
  test("0 when total unknown; clamps overrun", () => {
    expect(readingProgress(50, null)).toBe(0);
    expect(readingProgress(50, 0)).toBe(0);
    expect(readingProgress(500, 200)).toBe(1);
  });
});

describe("clampPage", () => {
  test("floors at 0, caps at total, rounds", () => {
    expect(clampPage(-5, 200)).toBe(0);
    expect(clampPage(250, 200)).toBe(200);
    expect(clampPage(12.6, 200)).toBe(13);
    expect(clampPage(999, null)).toBe(999);
  });
});

describe("groupShelf", () => {
  test("buckets entries by status, preserving order", () => {
    const shelf = groupShelf([
      entry({ id: "1", status: "reading" }),
      entry({ id: "2", status: "want" }),
      entry({ id: "3", status: "done" }),
      entry({ id: "4", status: "reading" }),
    ]);
    expect(shelf.reading.map((e) => e.id)).toEqual(["1", "4"]);
    expect(shelf.want.map((e) => e.id)).toEqual(["2"]);
    expect(shelf.done.map((e) => e.id)).toEqual(["3"]);
  });
});

describe("shelfVolumeIds (R2C-08: a book on the shelf is not offered again)", () => {
  test("collects ids from every status", () => {
    const ids = shelfVolumeIds(
      groupShelf([
        entry({ id: "1", volume_id: "a", status: "want" }),
        entry({ id: "2", volume_id: "b", status: "reading" }),
        entry({ id: "3", volume_id: "c", status: "done" }),
      ]),
    );
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
  test("no shelf yet = nothing on it", () => {
    expect(shelfVolumeIds(null).size).toBe(0);
  });
});

describe("manualBook (R2C-02: the shelf still works when search is refused)", () => {
  test("a typed title becomes a book with a stable manual id", () => {
    expect(manualBook("  Demian  ")).toEqual({ id: `${MANUAL_VOLUME_PREFIX}demian`, title: "Demian", authors: [] });
  });
  test("case and spacing fold into the same id, so a second add finds the same row", () => {
    expect(manualBook("The  Little   Prince")?.id).toBe(manualBook("the little prince")?.id);
  });
  test("an empty title makes no book", () => {
    expect(manualBook("   ")).toBeNull();
  });
  test("a manual id can never collide with a Google volume id", () => {
    expect(manualBook("abc")?.id.startsWith(MANUAL_VOLUME_PREFIX)).toBe(true);
  });
});

describe("parsePageDraft (R2C-08: the page counter can be moved)", () => {
  test("current and total", () => {
    expect(parsePageDraft("120", "300")).toEqual({ current_page: 120, total_pages: 300 });
  });
  test("total left empty = unknown, current kept", () => {
    expect(parsePageDraft("45", "")).toEqual({ current_page: 45, total_pages: null });
  });
  test("current is clamped to the total, like the progress bar", () => {
    expect(parsePageDraft("500", "200")).toEqual({ current_page: 200, total_pages: 200 });
  });
  test("a total of 0 means unknown, not a zero-page book", () => {
    expect(parsePageDraft("10", "0")).toEqual({ current_page: 10, total_pages: null });
  });
  test("typos and out-of-range numbers are refused, not saved as something else", () => {
    expect(parsePageDraft("", "200")).toBeNull();
    expect(parsePageDraft("12a", "200")).toBeNull();
    expect(parsePageDraft("-3", "200")).toBeNull();
    expect(parsePageDraft("10", "2x")).toBeNull();
    expect(parsePageDraft(String(PAGE_INPUT_MAX + 1), "")).toBeNull();
    expect(parsePageDraft("1e3", "")).toBeNull();
  });
});
