import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
type Wire = { enabled: boolean; authenticate: (req: Request) => Promise<string | null>; isScheduler: (req: Request) => Promise<boolean> };
function fixture(extra: Record<string, string> = {}) {
  const settings: Record<string, string> = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-fixture", DASHBOARD_CRON_SECRET: "x".repeat(32), ...extra };
  const getUser = jest.fn().mockResolvedValue({ data: { user: { id: "verified-owner" } }, error: null });
  let wire!: Wire; const serve = jest.fn();
  const deps: Record<string, unknown> = {
    "jsr:@supabase/functions-js/edge-runtime.d.ts": {},
    "jsr:@supabase/supabase-js@2": { createClient: () => ({ auth: { getUser }, rpc: jest.fn() }) },
    "./handler.ts": { createDashboardHandler: (value: Wire) => { wire = value; return () => undefined; } },
    "./provider.ts": { createBoardProvider: jest.fn() },
  };
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../../../../supabase/functions/dashboard-generate/index.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", "Deno", code)({}, (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; }, { env: { get: (key: string) => settings[key] }, serve });
  return { wire, getUser, serve };
}
const request = (token: string, cron?: string) => new Request("https://fixture.invalid", { headers: { authorization: `Bearer ${token}`, ...(cron ? { "x-dashboard-cron": cron } : {}) } });
test("entrypoint stays disabled without an explicit server switch", () => {
  const f = fixture(); expect(f.wire.enabled).toBe(false); expect(f.serve).toHaveBeenCalledTimes(1);
});
test("user ownership comes from verified auth, never parsing an unsigned JWT", async () => {
  const f = fixture(); expect(await f.wire.authenticate(request("user-token"))).toBe("verified-owner");
  expect(f.getUser).toHaveBeenCalledWith("user-token");
  f.getUser.mockResolvedValue({ data: { user: null }, error: {} });
  expect(await f.wire.authenticate(request("forged-token"))).toBeNull();
});
test("scheduler needs both server credentials and never passes user authentication", async () => {
  const f = fixture();
  expect(await f.wire.isScheduler(request("service-fixture", "x".repeat(32)))).toBe(true);
  expect(await f.wire.isScheduler(request("service-fixture", "wrong"))).toBe(false);
  expect(await f.wire.isScheduler(request("user-token", "x".repeat(32)))).toBe(false);
  expect(await f.wire.authenticate(request("service-fixture"))).toBeNull();
  expect(f.getUser).not.toHaveBeenCalled();
});
test("an absent or short scheduler secret never authorizes a batch", async () => {
  expect(await fixture({ DASHBOARD_CRON_SECRET: "" }).wire.isScheduler(request("service-fixture"))).toBe(false);
  expect(await fixture({ DASHBOARD_CRON_SECRET: "short" }).wire.isScheduler(request("service-fixture", "short"))).toBe(false);
});
