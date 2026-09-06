import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockInvoke = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

import { convertToKrw, fetchFxRates, fxRateFor, parseEximFx, parseRateNumber } from "../fx";

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("parseRateNumber (Eximbank comma strings)", () => {
  test("parses comma decimals and integers", () => {
    expect(parseRateNumber("1,303.5")).toBe(1303.5);
    expect(parseRateNumber("1,234")).toBe(1234);
    expect(parseRateNumber(1500)).toBe(1500);
  });
  test("rejects junk and non-positive", () => {
    expect(parseRateNumber("")).toBeUndefined();
    expect(parseRateNumber("abc")).toBeUndefined();
    expect(parseRateNumber("0")).toBeUndefined();
    expect(parseRateNumber(null)).toBeUndefined();
  });
});

describe("parseEximFx (result===1 rows only)", () => {
  const json = [
    { result: 1, cur_unit: "USD", cur_nm: "미국 달러", deal_bas_r: "1,303.5" },
    { result: 1, cur_unit: "JPY(100)", cur_nm: "일본 옌", deal_bas_r: "900.12" },
    { result: 2, cur_unit: "BAD", deal_bas_r: "1,000" }, // error row -> dropped
    { result: 1, cur_unit: "", deal_bas_r: "1,000" }, // no currency -> dropped
  ];
  test("keeps valid OK rows with parsed rates", () => {
    const out = parseEximFx(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ currency: "USD", rateKrw: 1303.5, name: "미국 달러" });
    expect(out[1].currency).toBe("JPY(100)");
  });
  test("non-array → []", () => {
    expect(parseEximFx({})).toEqual([]);
    expect(parseEximFx(null)).toEqual([]);
  });
});

describe("fxRateFor / convertToKrw", () => {
  const rates = parseEximFx([
    { result: 1, cur_unit: "USD", deal_bas_r: "1,300" },
    { result: 1, cur_unit: "JPY(100)", deal_bas_r: "900" },
  ]);
  test("matches by leading code", () => {
    expect(fxRateFor(rates, "usd")?.currency).toBe("USD");
    expect(fxRateFor(rates, "JPY")?.currency).toBe("JPY(100)");
    expect(fxRateFor(rates, "EUR")).toBeUndefined();
  });
  test("converts, dividing per-100 quotes by their unit", () => {
    expect(convertToKrw(10, "USD", rates)).toBe(13000); // 10 * 1300
    expect(convertToKrw(1000, "JPY", rates)).toBe(9000); // 1000 * (900/100)
    expect(convertToKrw(5, "EUR", rates)).toBeUndefined();
  });
});

describe("fetchFxRates (authenticated public-data proxy)", () => {
  test("invokes the fixed proxy operation and normalizes its envelope", async () => {
    const signal = new AbortController().signal;
    mockInvoke.mockResolvedValue({
      data: {
        provider: "exim_fx",
        data: [{ result: 1, cur_unit: "USD", cur_nm: "미국 달러", deal_bas_r: "1,303.5" }],
      },
      error: null,
    });

    await expect(fetchFxRates({ authKey: "legacy-client-key", signal })).resolves.toEqual([
      { currency: "USD", rateKrw: 1303.5, name: "미국 달러" },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith("public-data-proxy", {
      body: { provider: "exim_fx" },
      signal,
    });
    expect(JSON.stringify(mockInvoke.mock.calls)).not.toContain("legacy-client-key");
  });

  test("surfaces provider and quota failures as typed error codes", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "provider_quota_exceeded" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      },
    });
    await expect(fetchFxRates()).rejects.toBe("provider_quota_exceeded");

    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "provider_key_rejected" }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }),
      },
    });
    await expect(fetchFxRates()).rejects.toBe("provider_key_rejected");
  });

  test("rejects a malformed or wrong-provider proxy envelope", async () => {
    mockInvoke.mockResolvedValue({
      data: { provider: "mfds_food", data: [] },
      error: null,
    });
    await expect(fetchFxRates()).rejects.toBe("bad_response");
  });

  test("contains no direct Eximbank fetch target or public provider-key env", () => {
    const source = readFileSync(join(__dirname, "..", "fx.ts"), "utf8");
    expect(source).not.toContain("EXPO_PUBLIC_EXIM_FX_KEY");
    expect(source).not.toContain("oapi.koreaexim.go.kr");
    expect(source).not.toMatch(/\bfetch\s*\(/u);
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("opts.authKey");
  });
});
