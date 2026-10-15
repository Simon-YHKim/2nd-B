import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
type Wire = { enabled: boolean; authenticate: (req: Request) => Promise<string | null>; isScheduler: (req: Request) => Promise<boolean> };
function fixture(extra: Record<string, string> = {}) {
  const settings: Record<string, string> = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-fixture", DASHBOARD_CRON_SECRET: "x".repeat(32), ...extra };
  const getUser = jest.fn().mockResolvedValue({ data: { user: { id: "verified-owner" } }, error: null });
  const proof = jest.fn().mockResolvedValue({ data: [], error: null });
  const createClient = jest.fn((_url: string, _key: string, options?: { global?: { headers?: { Authorization?: string } } }) => ({
    auth: { getUser }, rpc: (...args: unknown[]) => ({ abortSignal: () =>
      options?.global?.headers?.Authorization === "Bearer rotated-service-fixture"
        ? proof(...args) : Promise.resolve({ data: null, error: { code: "42501" } }),
    }),
  }));
  let wire!: Wire; const serve = jest.fn();
  const deps: Record<string, unknown> = {
    "jsr:@supabase/functions-js/edge-runtime.d.ts": {},
    "jsr:@supabase/supabase-js@2": { createClient },
    "./handler.ts": { createDashboardHandler: (value: Wire) => { wire = value; return () => undefined; } },
    "./provider.ts": { createBoardProvider: jest.fn() },
  };
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../../../../supabase/functions/dashboard-generate/index.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", "Deno", code)({}, (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; }, { env: { get: (key: string) => settings[key] }, serve });
  return { wire, getUser, serve, proof, createClient };
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

test("a different valid service credential must prove its role through the service-only RPC", async () => {
  const f = fixture();
  expect(await f.wire.isScheduler(request("rotated-service-fixture", "x".repeat(32)))).toBe(true);
  expect(f.createClient).toHaveBeenCalledWith("https://fixture.supabase.co", "service-fixture", expect.objectContaining({
    global: { headers: { Authorization: "Bearer rotated-service-fixture" } },
  }));
  expect(f.proof).toHaveBeenCalledWith("dashboard_generation_due", { p_after: null });
  f.proof.mockResolvedValue({ data: [], error: {} });
  expect(await f.wire.isScheduler(request("rotated-service-fixture", "x".repeat(32)))).toBe(false);
});

test("wrong cron, user tokens and RPC outages cannot gain scheduler access", async () => {
  const f = fixture();
  expect(await f.wire.isScheduler(request("rotated-service-fixture", "wrong"))).toBe(false);
  expect(f.proof).not.toHaveBeenCalled();
  expect(await f.wire.isScheduler(request("user-token", "x".repeat(32)))).toBe(false);
  f.proof.mockRejectedValue(new Error("private transport detail"));
  expect(await f.wire.isScheduler(request("rotated-service-fixture", "x".repeat(32)))).toBe(false);
});
