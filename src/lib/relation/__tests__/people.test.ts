import { normalizePersonInput } from "../people";

describe("normalizePersonInput (enforces 0058 CHECK constraints, node-pure)", () => {
  test("valid input passes through, name/note trimmed", () => {
    const n = normalizePersonInput({
      display_name: "  소하  ",
      relation_kind: "partner",
      closeness: 5,
      contact_cadence: "daily",
      note: "  결혼  ",
      tags: ["가족"],
    });
    expect(n.display_name).toBe("소하");
    expect(n.relation_kind).toBe("partner");
    expect(n.closeness).toBe(5);
    expect(n.contact_cadence).toBe("daily");
    expect(n.note).toBe("결혼");
  });

  test("invalid relation_kind falls back to 'other'", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizePersonInput({ display_name: "x", relation_kind: "bestie" }).relation_kind).toBe("other");
  });

  test("invalid contact_cadence drops to null (not a DB violation)", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizePersonInput({ display_name: "x", contact_cadence: "yearly" }).contact_cadence).toBeNull();
  });

  test("closeness is clamped to 1..5 or dropped to null", () => {
    expect(normalizePersonInput({ display_name: "x", closeness: 9 }).closeness).toBeNull();
    expect(normalizePersonInput({ display_name: "x", closeness: 0 }).closeness).toBeNull();
    expect(normalizePersonInput({ display_name: "x", closeness: 3.4 }).closeness).toBe(3);
  });

  test("tags are trimmed, de-duped, and empties dropped", () => {
    expect(normalizePersonInput({ display_name: "x", tags: [" a ", "a", "", "b"] }).tags).toEqual(["a", "b"]);
  });

  test("missing kind defaults to 'other' and missing optionals are null", () => {
    const n = normalizePersonInput({ display_name: "친구" });
    expect(n.relation_kind).toBe("other");
    expect(n.closeness).toBeNull();
    expect(n.contact_cadence).toBeNull();
    expect(n.last_interaction_on).toBeNull();
    expect(n.note).toBeNull();
    expect(n.tags).toEqual([]);
  });
});
