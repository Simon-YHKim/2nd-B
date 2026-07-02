import { layoutPeopleMap, radiusForCloseness, RELATION_SECTORS } from "../people-map-layout";
import type { Person } from "../people";

const person = (over: Partial<Person>): Person => ({
  id: "p",
  user_id: "u",
  display_name: "이름",
  relation_kind: "friend",
  closeness: 3,
  contact_cadence: null,
  last_interaction_on: null,
  note: null,
  tags: [],
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

describe("people map layout (P4c 관계 렌즈)", () => {
  test("six relation sectors, deterministic output", () => {
    expect(RELATION_SECTORS).toHaveLength(6);
    const people = [person({ id: "a" }), person({ id: "b", relation_kind: "family" })];
    expect(layoutPeopleMap(people)).toEqual(layoutPeopleMap(people));
  });

  test("closer people sit nearer the center", () => {
    expect(radiusForCloseness(5)).toBeLessThan(radiusForCloseness(3));
    expect(radiusForCloseness(3)).toBeLessThan(radiusForCloseness(1));
    expect(radiusForCloseness(null)).toBe(radiusForCloseness(1));
  });

  test("all nodes stay inside the unit square", () => {
    const people = RELATION_SECTORS.flatMap((kind, k) =>
      [1, 3, 5].map((c, i) => person({ id: `${kind}-${c}`, relation_kind: kind, closeness: c, display_name: `p${k}${i}` })),
    );
    for (const node of layoutPeopleMap(people)) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(1);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(1);
    }
  });

  test("unknown kinds fall into the other sector; empty input is safe", () => {
    expect(layoutPeopleMap([])).toEqual([]);
    const odd = layoutPeopleMap([person({ id: "x", relation_kind: "weird" as never })]);
    expect(odd[0].kind).toBe("other");
  });
});
