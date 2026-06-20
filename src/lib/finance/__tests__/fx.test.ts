import { convertToKrw, fxRateFor, parseEximFx, parseRateNumber } from "../fx";

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
