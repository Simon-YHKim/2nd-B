import { buildFoodSearchUrl, parseFoodItems } from "../foods";

describe("buildFoodSearchUrl (keyed, json, clamped)", () => {
  test("includes the key, query, and clamps numOfRows", () => {
    const url = buildFoodSearchUrl("바나나", "SVCKEY", 50);
    expect(url).toContain("serviceKey=SVCKEY");
    expect(url).toContain("type=json");
    expect(url).toContain("numOfRows=10"); // clamped from 50
    expect(url).toContain("FOOD_NM_KR=");
  });
});

describe("parseFoodItems (tolerates data.go.kr shapes, defensive)", () => {
  test("flat { items: [...] } shape with I2790 field names", () => {
    const json = {
      items: [
        { FOOD_NM_KR: "바나나", AMT_NUM1: "84", AMT_NUM3: "1.1", AMT_NUM4: "0.2", AMT_NUM6: "21.9" },
      ],
    };
    const out = parseFoodItems(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: "바나나", kcal: 84, proteinG: 1.1, fatG: 0.2, carbsG: 21.9 });
  });

  test("legacy nested { response: { body: { items: { item: [...] } } } } shape", () => {
    const json = {
      response: { body: { items: { item: [{ DESC_KOR: "사과", NUTR_CONT1: "52" }] } } },
    };
    const out = parseFoodItems(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: "사과", kcal: 52 });
  });

  test("single-object item (not wrapped in array)", () => {
    const json = { response: { body: { items: { item: { FOOD_NM_KR: "달걀", AMT_NUM1: "155" } } } } };
    expect(parseFoodItems(json)).toEqual([{ name: "달걀", kcal: 155 }]);
  });

  test("drops nameless rows, caps results, ignores junk", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ FOOD_NM_KR: `food${i}`, AMT_NUM1: "10" }));
    expect(parseFoodItems({ items }, 3)).toHaveLength(3);
    expect(parseFoodItems({ items: [{ AMT_NUM1: "10" }] })).toEqual([]);
    expect(parseFoodItems(null)).toEqual([]);
    expect(parseFoodItems({})).toEqual([]);
  });
});
