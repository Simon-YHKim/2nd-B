import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source = readFileSync(resolve(__dirname, "../run-dashboard-hourly.mjs"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
class Exit extends Error {}
function fixture(extra: Record<string, string> = {}) {
  const env = { DASHBOARD_SUPABASE_URL: "https://fixture.supabase.co/", DASHBOARD_SERVICE_ROLE_KEY: "fixture-key", ...extra };
  const fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 })); const log = jest.fn();
  const run = async () => {
    try { await new AsyncFunction("process", "fetch", "console", source)({ env, exit: () => { throw new Exit(); } }, fetch, { log }); }
    catch (error) { if (!(error instanceof Exit)) throw error; }
  };
  return { fetch, log, run };
}
test("disabled scheduler has no network effects", async () => {
  const f = fixture(); await f.run(); expect(f.fetch).not.toHaveBeenCalled();
});
test("retention continues after generation and its cron secret are disabled", async () => {
  const f = fixture({ DASHBOARD_RETENTION_ENABLED: "true" }); await f.run();
  expect(f.fetch).toHaveBeenCalledTimes(1); expect(String(f.fetch.mock.calls[0][0])).toContain("/rpc/purge_dashboard_generation");
});
test("failed retention prevents generation", async () => {
  const f = fixture({ DASHBOARD_RETENTION_ENABLED: "true", DASHBOARD_GENERATION_ENABLED: "true", DASHBOARD_CRON_SECRET: "a".repeat(32) });
  f.fetch.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(f.run()).rejects.toThrow("retention unavailable"); expect(f.fetch).toHaveBeenCalledTimes(1);
});
test("pagination terminates and never logs owner cursors or secrets", async () => {
  const f = fixture({ DASHBOARD_RETENTION_ENABLED: "true", DASHBOARD_GENERATION_ENABLED: "true", DASHBOARD_CRON_SECRET: "a".repeat(32) });
  const cursor = "00000000-0000-0000-0000-000000000001";
  f.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "batch", processed: 10, nextCursor: cursor })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "batch", processed: 2, nextCursor: null })));
  await f.run(); expect(f.fetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(f.fetch.mock.calls[2][1].body)).toEqual({ action: "hourly", cursor });
  expect(f.log).toHaveBeenCalledWith("Dashboard hourly batch finished; processed=12");
});
test("repeated cursor stops the loop rather than repeating paid work", async () => {
  const f = fixture({ DASHBOARD_RETENTION_ENABLED: "true", DASHBOARD_GENERATION_ENABLED: "true", DASHBOARD_CRON_SECRET: "a".repeat(32) });
  f.fetch.mockResolvedValueOnce(new Response(null, { status: 204 })).mockImplementation(async () => new Response(JSON.stringify({ kind: "batch", processed: 10, nextCursor: "00000000-0000-0000-0000-000000000001" })));
  await expect(f.run()).rejects.toThrow("Invalid dashboard batch"); expect(f.fetch).toHaveBeenCalledTimes(3);
});
