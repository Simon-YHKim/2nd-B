import { normalizeItemInput } from "../items";

describe("normalizeItemInput (enforces 0059 CHECK constraints, node-pure)", () => {
  test("valid input passes through, title/note trimmed", () => {
    const n = normalizeItemInput({
      title: "  젤다  ",
      category: "game",
      status: "active",
      rating: 5,
      note: "  명작  ",
      tags: ["스위치"],
    });
    expect(n.title).toBe("젤다");
    expect(n.category).toBe("game");
    expect(n.status).toBe("active");
    expect(n.rating).toBe(5);
    expect(n.note).toBe("명작");
  });

  test("invalid category falls back to 'other'", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizeItemInput({ title: "x", category: "podcast" }).category).toBe("other");
  });

  test("invalid status falls back to 'done'", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizeItemInput({ title: "x", status: "maybe" }).status).toBe("done");
  });

  test("rating is clamped to 1..5 or dropped to null", () => {
    expect(normalizeItemInput({ title: "x", rating: 7 }).rating).toBeNull();
    expect(normalizeItemInput({ title: "x", rating: 0 }).rating).toBeNull();
    expect(normalizeItemInput({ title: "x", rating: 4.6 }).rating).toBe(5);
  });

  test("tags are trimmed, de-duped, and empties dropped", () => {
    expect(normalizeItemInput({ title: "x", tags: [" rpg ", "rpg", "", "indie"] }).tags).toEqual(["rpg", "indie"]);
  });

  test("missing category/status default and optionals are null", () => {
    const n = normalizeItemInput({ title: "영화" });
    expect(n.category).toBe("other");
    expect(n.status).toBe("done");
    expect(n.rating).toBeNull();
    expect(n.note).toBeNull();
    expect(n.occurred_on).toBeNull();
    expect(n.tags).toEqual([]);
  });
});
