import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(__dirname, "../../../..");
// Execute real Edge logic under Node; SDK and Deno globals belong to index.ts.
function moduleAt(file: string, dependencies: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(resolve(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", code)(exports, (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  });
  return exports;
}
interface Dependencies { enabled: boolean; userAgent: string; authenticate: jest.Mock; rpc: jest.Mock; fetch: jest.Mock }
const reader = moduleAt("supabase/functions/_shared/request-json.ts");
const create = moduleAt("supabase/functions/weather/handler.ts", { "../_shared/request-json.ts": reader }).createWeatherHandler as
  (deps: Dependencies) => (req: Request) => Promise<Response>;
function fixture() {
  const deps: Dependencies = { enabled: true, userAgent: "PolaScope/test https://example.invalid", authenticate: jest.fn().mockResolvedValue("owner"), rpc: jest.fn().mockResolvedValue({ data: true, error: null }), fetch: jest.fn() };
  const handler = create(deps);
  const send = (body: Record<string, unknown>, origin = "http://localhost:8081") => handler(new Request("https://fixture.invalid/weather", {
    method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json", origin },
    body: JSON.stringify({ contract: "weather-v1-261007", ...body }),
  }));
  return { deps, handler, send };
}
const weather = { action: "weather", place: { latitude: 37.57, longitude: 126.98 } };
test("localhost CORS preflight succeeds without upstream or authentication", async () => {
  const f = fixture(); const result = await f.handler(new Request("https://fixture.invalid/weather", { method: "OPTIONS", headers: { origin: "http://localhost:8081" } }));
  expect(result.status).toBe(204); expect(result.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  expect(f.deps.authenticate).not.toHaveBeenCalled(); expect(f.deps.fetch).not.toHaveBeenCalled();
});
test("server consent denial and feature OFF cannot call MET", async () => {
  const f = fixture(); f.deps.rpc.mockResolvedValue({ data: false, error: null });
  expect((await f.send(weather)).status).toBe(403);
  f.deps.enabled = false; expect((await f.send(weather)).status).toBe(503);
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
test.each([
  { ...weather, place: { latitude: 37.566535, longitude: 126.98 } },
  { ...weather, place: { latitude: 91, longitude: 0 } },
  { ...weather, place: { latitude: "37.57", longitude: 0 } },
  { ...weather, url: "https://attacker.invalid" },
])("rejects precise/invalid/extra input %j", async (input) => {
  const f = fixture(); expect((await f.send(input)).status).toBe(400); expect(f.deps.fetch).not.toHaveBeenCalled();
});
test("returns just current forecast; does not forward caller identity or geometry", async () => {
  const f = fixture(); const time = new Date(Date.now()-1000).toISOString();
  f.deps.fetch.mockResolvedValue(new Response(JSON.stringify({ geometry: { coordinates: [126.98,37.57] }, properties: { timeseries: [{ time, data: { instant: { details: { air_temperature: 18 } }, next_1_hours: { summary: { symbol_code: "clearsky_day" } } } }] } }), { headers: { expires: new Date(Date.now()+60_000).toUTCString() } }));
  const result = await f.send(weather);
  expect(await result.json()).toMatchObject({ symbol: "clearsky_day", tempC: 18, validAt: time });
  const [url, options] = f.deps.fetch.mock.calls[0];
  expect(url).toBe("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.57&lon=126.98");
  expect(options.headers).toEqual({ "User-Agent": f.deps.userAgent });
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(f.deps.rpc).toHaveBeenCalledWith("authorize_weather_request", { p_user_id: "owner" });
});
test("failed upstream and missing current hour return null, never an upstream error body", async () => {
  const f = fixture(); f.deps.fetch.mockResolvedValue(new Response("provider error with location", { status: 429 }));
  expect(await (await f.send(weather)).json()).toBeNull();
  f.deps.fetch.mockResolvedValue(new Response('{"properties":{"timeseries":[]}}'));
  expect(await (await f.send(weather)).json()).toBeNull();
});
