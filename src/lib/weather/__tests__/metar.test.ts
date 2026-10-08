import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

interface Station { id: string; latitude: number; longitude: number; tempC: number; sky: string; observedAt: string }
const exportsForTest: Record<string, unknown> = {};
const file = resolve(__dirname, "../../../../supabase/functions/weather/metar.ts");
const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("exports", code)(exportsForTest);
const parse = exportsForTest.parseMetarCsv as (csv: string) => Station[];

const headers = ["raw_text", "station_id", "observation_time", "latitude", "longitude", "temp_c", "wx_string", "sky_cover", "cloud_base_ft_agl", "sky_cover", "cloud_base_ft_agl", "sky_cover", "cloud_base_ft_agl", "sky_cover", "cloud_base_ft_agl"];
const stamp = "2026-10-07T23:00:00.000Z";
const row = (values: Partial<Record<string, string>> = {}, sky: string[] = []) => [values.raw_text ?? "METAR RKSM 072300Z 18002KT 9999 SKC 13/10 A3029", values.station_id ?? "RKSM", values.observation_time ?? stamp, values.latitude ?? "37.446", values.longitude ?? "127.114", values.temp_c ?? "13", values.wx_string ?? "", sky[0] ?? "", "", sky[1] ?? "", "", sky[2] ?? "", "", sky[3] ?? "", ""];
const encode = (fields: string[]) => fields.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
const csv = (...rows: string[][]) => [headers.join(","), ...rows.map(encode)].join("\r\n");

test("decodes public station coordinates and exact minimal fields from quoted CSV", () => {
  expect(parse(csv(row({ raw_text: 'METAR RKSM 072300Z SKC RMK text, "quoted"\ncontinuation' })))).toEqual([{ id: "RKSM", latitude: 37.446, longitude: 127.114, tempC: 13, sky: "clear", observedAt: stamp }]);
});
test.each<[string[], string]>([
  [["FEW", "BKN", "OVC"], "cloudy"],
  [["SCT", "FEW"], "partlyCloudy"],
  [["CLR"], "clear"],
])("all repeated sky columns contribute: %j", (skies, expected) => {
  expect(parse(csv(row({}, skies)))[0]?.sky).toBe(expected);
});
test.each([
  ["-RASN", "snow"], ["+SHRA", "rain"], ["FZFG", "cloudy"], ["BR", "cloudy"],
])("present weather %s overrides sky layers", (wx, expected) => {
  expect(parse(csv(row({ wx_string: wx }, ["CLR"])))[0]?.sky).toBe(expected);
});
test.each([
  ["SKC", "clear"], ["CLR", "clear"], ["FEW020", "partlyCloudy"], ["SCT030", "partlyCloudy"], ["BKN040", "cloudy"], ["OVC050", "cloudy"],
])("uses raw observation sky %s when decoded sky columns are absent", (token, expected) => {
  expect(parse(csv(row({ raw_text: `METAR RKSM 072300Z ${token} 13/10` })))[0]?.sky).toBe(expected);
});
test.each(["CAVOK", "NSC", "NCD", "", "CAVOK TEMPO BKN010", "NSC BECMG SKC", "RMK SKC", "TEMPO CLR"])("does not invent a sky from %s or from trends/remarks", (token) => {
  expect(parse(csv(row({ raw_text: `METAR RKSM 072300Z ${token}` })))).toEqual([]);
});
test("observed clear is not replaced by a later trend", () => {
  expect(parse(csv(row({ raw_text: "METAR RKSM 072300Z SKC TEMPO BKN010" })))[0]?.sky).toBe("clear");
});
test.each([
  { temp_c: "" }, { temp_c: "NaN" }, { temp_c: "101" }, { latitude: "91" }, { longitude: "-181" },
  { latitude: "" }, { station_id: "<script>" }, { observation_time: "2026-02-31T01:00:00Z" }, { observation_time: "not-a-date" },
  { wx_string: "VA" },
])("drops unusable station data %j", (value) => {
  expect(parse(csv(row(value)))).toEqual([]);
});
test("deduplicates a station using its latest usable observation", () => {
  const result = parse(csv(row({ observation_time: "2026-10-07T22:00:00Z", temp_c: "12" }), row(), row({ observation_time: "2026-10-07T21:00:00Z", temp_c: "11" })));
  expect(result).toHaveLength(1);
  expect(result[0]?.tempC).toBe(13);
});
test("rejects malformed CSV, missing required headers, and more than 10000 input rows", () => {
  expect(() => parse('"unterminated')).toThrow();
  expect(() => parse("station_id,temp_c\nRKSM,13")).toThrow();
  expect(() => parse(csv(...Array.from({ length: 10001 }, () => row())))).toThrow();
});
