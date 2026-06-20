import { clampPage, groupShelf, readingProgress, type ShelfEntry } from "../shelf";

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
