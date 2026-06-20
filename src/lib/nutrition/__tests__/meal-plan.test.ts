import { buildWeekGrid, weekDayKeys, weekStartKey, type MealEntry } from "../meal-plan";

function entry(over: Partial<MealEntry>): MealEntry {
  return {
    id: "x",
    user_id: "u",
    plan_date: "2026-06-15",
    slot: "breakfast",
    title: "Oatmeal",
    kcal: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("weekStartKey (Monday-anchored)", () => {
  test("Saturday 2026-06-20 → Monday 2026-06-15", () => {
    expect(weekStartKey(new Date(2026, 5, 20))).toBe("2026-06-15");
  });
  test("Monday maps to itself", () => {
    expect(weekStartKey(new Date(2026, 5, 15))).toBe("2026-06-15");
  });
  test("Sunday 2026-06-21 → the Monday before (2026-06-15)", () => {
    expect(weekStartKey(new Date(2026, 5, 21))).toBe("2026-06-15");
  });
});

describe("weekDayKeys", () => {
  test("7 consecutive days Mon..Sun", () => {
    expect(weekDayKeys("2026-06-15")).toEqual([
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
    ]);
  });
  test("crosses a month boundary", () => {
    expect(weekDayKeys("2026-06-29")).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
  });
});

describe("buildWeekGrid", () => {
  test("places entries into the right (day, slot) cell; empties are null", () => {
    const grid = buildWeekGrid("2026-06-15", [
      entry({ plan_date: "2026-06-15", slot: "breakfast", title: "Oatmeal" }),
      entry({ plan_date: "2026-06-15", slot: "lunch", title: "Salad" }),
      entry({ plan_date: "2026-06-17", slot: "dinner", title: "Pasta" }),
    ]);
    expect(grid).toHaveLength(7);
    expect(grid[0].date).toBe("2026-06-15");
    expect(grid[0].breakfast?.title).toBe("Oatmeal");
    expect(grid[0].lunch?.title).toBe("Salad");
    expect(grid[0].dinner).toBeNull();
    expect(grid[2].dinner?.title).toBe("Pasta");
    expect(grid[2].breakfast).toBeNull();
    expect(grid[6].breakfast).toBeNull();
  });
});
