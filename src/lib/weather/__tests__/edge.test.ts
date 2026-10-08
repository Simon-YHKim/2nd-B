import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";

const root = resolve(__dirname, "../../../..");
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
const parser = moduleAt("supabase/functions/weather/metar.ts");
const create = moduleAt("supabase/functions/weather/handler.ts", { "../_shared/request-json.ts": reader, "./metar.ts": parser }).createWeatherHandler as
  (deps: Dependencies) => (req: Request) => Promise<Response>;
const observedAt = "2026-10-07T23:00:00.000Z";
const csv = `raw_text,station_id,observation_time,latitude,longitude,temp_c,wx_string,sky_cover\n"METAR RKSM 072300Z 18002KT 9999 SKC 13/10 A3029",RKSM,${observedAt},37.446,127.114,13,,\n`;
const payload = { source: "noaa-metar", stations: [{ id: "RKSM", latitude: 37.446, longitude: 127.114, tempC: 13, sky: "clear", observedAt }] };
const weather = { action: "weather" };
const upstream = "https://aviationweather.gov/data/cache/metars.cache.csv.gz";
const response = (text = csv) => new Response(new Uint8Array(gzipSync(text)));
function fixture() {
  const deps: Dependencies = { enabled: true, userAgent: "PolaScope/test https://example.invalid", authenticate: jest.fn().mockResolvedValue("owner"), rpc: jest.fn().mockResolvedValue({ data: true, error: null }), fetch: jest.fn().mockImplementation(() => Promise.resolve(response())) };
  const handler = create(deps);
  const send = (body: Record<string, unknown>, options: { token?: string; signal?: AbortSignal } = {}) => handler(new Request("https://fixture.invalid/weather", {
    method: "POST", headers: { authorization: `Bearer ${options.token ?? "fixture"}`, "content-type": "application/json", origin: "http://localhost:8081", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({ contract: "weather-v1-261007", ...body }), signal: options.signal,
  }));
  return { deps, handler, send };
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("localhost CORS preflight succeeds without upstream or authentication", async () => {
  const f = fixture();
  const result = await f.handler(new Request("https://fixture.invalid/weather", { method: "OPTIONS", headers: { origin: "http://localhost:8081" } }));
  expect(result.status).toBe(204);
  expect(result.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  expect(f.deps.authenticate).not.toHaveBeenCalled();
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
test("each request remains behind authentication, consent and feature gates", async () => {
  const f = fixture();
  f.deps.authenticate.mockResolvedValueOnce(null);
  expect((await f.send(weather)).status).toBe(401);
  f.deps.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await f.send(weather)).status).toBe(403);
  f.deps.enabled = false;
  expect((await f.send(weather)).status).toBe(503);
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
test.each([
  { ...weather, place: { latitude: 37.57, longitude: 126.98 } },
  { ...weather, coords: [37.57, 126.98] },
  { ...weather, station: "RKSM" },
  { ...weather, latitude: 37.57 },
  { ...weather, url: "https://attacker.invalid" },
])("rejects every location or extra input before authentication: %j", async (input) => {
  const f = fixture();
  expect((await f.send(input)).status).toBe(400);
  expect(f.deps.authenticate).not.toHaveBeenCalled();
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
test("returns public global station observations from a fixed URL without forwarding identity", async () => {
  const f = fixture();
  const result = await f.send(weather);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(payload);
  const [url, options] = f.deps.fetch.mock.calls[0];
  expect(url).toBe(upstream);
  expect(options.headers).toEqual({ "User-Agent": f.deps.userAgent, "Accept-Encoding": "identity" });
  expect(options.redirect).toBe("error");
  expect(options.body).toBeUndefined();
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(f.deps.rpc).toHaveBeenCalledWith("authorize_weather_request", { p_user_id: "owner" });
});
test("shares only public data for ten minutes while rechecking each owner consent", async () => {
  let now = Date.now();
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const f = fixture();
  expect(await (await f.send(weather)).json()).toEqual(payload);
  f.deps.authenticate.mockResolvedValue("other-owner");
  expect(await (await f.send(weather, { token: "other" })).json()).toEqual(payload);
  expect(f.deps.fetch).toHaveBeenCalledTimes(1);
  expect(f.deps.rpc).toHaveBeenLastCalledWith("authorize_weather_request", { p_user_id: "other-owner" });
  f.deps.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await f.send(weather)).status).toBe(403);
  now += 10 * 60_000;
  expect(await (await f.send(weather)).json()).toEqual(payload);
  expect(f.deps.fetch).toHaveBeenCalledTimes(2);
});
test("concurrent authorized callers share an upstream request and one caller abort cannot cancel it", async () => {
  const f = fixture();
  let release!: (value: Response) => void;
  let started!: () => void;
  const upstreamStarted = new Promise<void>((resolve) => { started = resolve; });
  f.deps.fetch.mockImplementation(() => { started(); return new Promise<Response>((resolve) => { release = resolve; }); });
  const controller = new AbortController();
  const first = f.send(weather, { signal: controller.signal });
  await upstreamStarted;
  const second = f.send(weather, { token: "second" });
  controller.abort();
  release(response());
  expect(await (await first).json()).toBeNull();
  expect(await (await second).json()).toEqual(payload);
  expect(f.deps.fetch).toHaveBeenCalledTimes(1);
  expect(f.deps.fetch.mock.calls[0][1].signal.aborted).toBe(false);
  expect(f.deps.rpc).toHaveBeenCalledTimes(2);
});
test("upstream failures return no provider body and wait one minute before retrying", async () => {
  let now = Date.now();
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const f = fixture();
  f.deps.fetch.mockResolvedValueOnce(new Response("private provider diagnostics", { status: 429 }));
  expect(await (await f.send(weather)).json()).toBeNull();
  expect(await (await f.send(weather)).json()).toBeNull();
  expect(f.deps.fetch).toHaveBeenCalledTimes(1);
  now += 60_000;
  expect(await (await f.send(weather)).json()).toEqual(payload);
  expect(f.deps.fetch).toHaveBeenCalledTimes(2);
});
test.each<[string, () => Response]>([
  ["compressed limit", () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))],
  ["expanded limit", () => response("x".repeat(8 * 1024 * 1024 + 1))],
  ["invalid gzip", () => new Response("not a gzip")],
  ["invalid CSV", () => response("unrecognized,header\n1,2")],
])("rejects %s without exposing source material", async (_name, makeResponse) => {
  const f = fixture();
  f.deps.fetch.mockResolvedValue(makeResponse());
  expect(await (await f.send(weather)).json()).toBeNull();
});
test("an upstream that never resolves is bounded by six seconds", async () => {
  jest.useFakeTimers();
  const f = fixture();
  f.deps.fetch.mockImplementation(() => new Promise(() => undefined));
  const pending = f.send(weather);
  await jest.advanceTimersByTimeAsync(6001);
  expect(await (await pending).json()).toBeNull();
  expect(f.deps.fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
test("consent status and withdrawal remain available while weather is OFF", async () => {
  const f = fixture();
  f.deps.enabled = false;
  f.deps.rpc.mockResolvedValue({ data: { enabled: false, revision: 2 }, error: null });
  expect(await (await f.send({ action: "status" })).json()).toEqual({ enabled: false, revision: 2, available: false });
  expect((await f.send({ action: "revoke", revision: 1, locale: "ko" })).status).toBe(200);
  expect(f.deps.rpc).toHaveBeenLastCalledWith("weather_consent", { p_user_id: "owner", p_action: "revoke", p_contract: "weather-v1-261007", p_revision: 1, p_locale: "ko" });
  expect(f.deps.fetch).not.toHaveBeenCalled();
});
