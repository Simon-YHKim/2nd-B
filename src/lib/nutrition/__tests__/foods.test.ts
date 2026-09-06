import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockInvoke = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

import { buildFoodSearchUrl, parseFoodItems, searchFoods } from "../foods";

beforeEach(() => {
  mockInvoke.mockReset();
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

describe("searchFoods (authenticated public-data proxy)", () => {
  test("keeps the legacy URL-builder export but fails closed", () => {
    expect(() => buildFoodSearchUrl("바나나", "legacy-client-key", 10)).toThrow(
      "direct_provider_url_disabled",
    );
  });

  test("invokes the fixed proxy operation, clamps the limit, and normalizes results", async () => {
    const signal = new AbortController().signal;
    mockInvoke.mockResolvedValue({
      data: {
        provider: "mfds_food",
        data: {
          header: { resultCode: "00" },
          body: {
            items: [
              {
                FOOD_NM_KR: "바나나",
                AMT_NUM1: "84",
                AMT_NUM3: "1.1",
                AMT_NUM4: "0.2",
                AMT_NUM6: "21.9",
              },
            ],
          },
        },
      },
      error: null,
    });

    await expect(
      searchFoods("\u3000ＡＢＣ\t\n바나나\u0000", {
        serviceKey: "legacy-client-key",
        max: 50,
        signal,
      }),
    ).resolves.toEqual([
      { name: "바나나", kcal: 84, proteinG: 1.1, fatG: 0.2, carbsG: 21.9 },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("public-data-proxy", {
      body: { provider: "mfds_food", query: "ABC 바나나", limit: 10 },
      signal,
    });
    expect(JSON.stringify(mockInvoke.mock.calls)).not.toContain("legacy-client-key");
  });

  test("keeps the intentional empty-query fail-soft path without a request", async () => {
    await expect(searchFoods(" \t\n ")).resolves.toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("surfaces provider and proxy quota failures as typed error codes", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "provider_key_rejected" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      },
    });
    await expect(searchFoods("사과")).rejects.toBe("provider_key_rejected");

    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "proxy_quota_exceeded" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      },
    });
    await expect(searchFoods("사과")).rejects.toBe("proxy_quota_exceeded");
  });

  test("rejects a malformed or wrong-provider proxy envelope", async () => {
    mockInvoke.mockResolvedValue({
      data: { provider: "exim_fx", data: [] },
      error: null,
    });
    await expect(searchFoods("사과")).rejects.toBe("bad_response");
  });

  test("contains no direct MFDS fetch target or public provider-key env", () => {
    const source = readFileSync(join(__dirname, "..", "foods.ts"), "utf8");
    expect(source).not.toContain("EXPO_PUBLIC_MFDS_FOOD_KEY");
    expect(source).not.toContain("apis.data.go.kr");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("opts.serviceKey");
  });
});
