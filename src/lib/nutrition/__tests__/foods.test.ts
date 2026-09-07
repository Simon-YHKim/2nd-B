import { foodSearchBody, parseFoodItems, QUERY_MAX, RESULT_MAX } from "../foods";

// 2026-09-08: this used to be buildFoodSearchUrl(query, serviceKey) - the client
// composed the keyed data.go.kr URL itself, which is exactly why the key was in
// the bundle. URL composition moved into public-data-proxy; what leaves the
// client now is a parameter body with no key in it.
describe("foodSearchBody (parameters only, clamped, no key)", () => {
  test("names the source, trims the query, and clamps max", () => {
    const body = foodSearchBody("바나나", 50);
    expect(body).toEqual({ source: "mfds", query: "바나나", max: RESULT_MAX }); // clamped from 50
  });

  test("carries nothing that looks like a credential", () => {
    const json = JSON.stringify(foodSearchBody("바나나"));
    expect(json).not.toMatch(/serviceKey|authkey|apis\.data\.go\.kr/i);
  });

  test("clamps a long query and a below-range max", () => {
    const body = foodSearchBody(`  ${"가".repeat(200)}  `, 0);
    expect(body.query).toHaveLength(QUERY_MAX);
    expect(body.max).toBe(1);
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
