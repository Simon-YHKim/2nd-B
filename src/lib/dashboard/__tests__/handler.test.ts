import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as input from "../generation-input";
import * as output from "../generation-output";

function edgeModule(file: string, dependencies: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../../../..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(exports, (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return exports;
}
const reader = edgeModule("supabase/functions/_shared/request-json.ts");
const create = edgeModule("supabase/functions/dashboard-generate/handler.ts", {
  "../_shared/request-json.ts": reader,
  "../../../src/lib/dashboard/generation-input.ts": input,
  "../../../src/lib/dashboard/generation-output.ts": output,
}).createDashboardHandler as (deps: ReturnType<typeof fixture>["deps"]) => (req: Request) => Promise<Response>;
const note = { slot: "morning", line: "Read today.", basis_refs: [{ kind: "routine", id: "r1" }], reminder_suggestions: [] };
const reservation = {
  kind: "claimed", id: "run1", lease_token: "10000000-0000-0000-0000-000000000001", purpose: "daily_note", slot: "morning", consent_token: "a".repeat(64),
  source: { reminders: [{ id: "r1", kind: "routine", title: "Read", at: null, state: "open" }] },
};

test("a pre-dispatch failure closes its lease and a same-key retry uses the replacement", async () => {
  const f = fixture();
  const secondLease = "20000000-0000-0000-0000-000000000002";
  let claims = 0;
  f.deps.rpc.mockImplementation(async (name) => ({ data: name === "dashboard_generation_request_v2"
    ? { ...reservation, lease_token: ++claims === 1 ? reservation.lease_token : secondLease } : true }));
  f.deps.generate.mockRejectedValueOnce(new Error("capacity unavailable"));
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
  expect(f.deps.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish_v2", expect.objectContaining({ p_output: null, p_lease_token: reservation.lease_token }));
  expect(await (await f.send()).json()).toEqual({ kind: "ready", purpose: "daily_note", value: note });
  expect(f.deps.generate).toHaveBeenLastCalledWith(expect.objectContaining({ leaseToken: secondLease }));
  expect(f.deps.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish_v2", expect.objectContaining({ p_output: note, p_lease_token: secondLease }));
});

test.each([undefined, null, "", "not-a-lease"])("invalid claim lease %s never calls generation", async (lease_token) => {
  const f = fixture(); f.deps.rpc.mockResolvedValue({ data: { ...reservation, lease_token } });
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
  expect(f.deps.generate).not.toHaveBeenCalled();
});
function fixture() {
  const deps = {
    enabled: true, authenticate: jest.fn().mockResolvedValue("owner"), isScheduler: jest.fn().mockResolvedValue(false),
    rpc: jest.fn(async (name: string, _args: Record<string, unknown>): Promise<{ data: unknown; error?: unknown }> => {
      if (name === "dashboard_generation_request_v2") return { data: reservation };
      if (name === "dashboard_generation_finish_v2") return { data: true };
      return { data: [] };
    }),
    generate: jest.fn().mockResolvedValue(note),
  };
  return { deps, send: (body: unknown = { action: "open", timeZone: "Asia/Seoul", locale: "ko" }) => create(deps)(new Request("https://fixture.invalid/dashboard", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer fixture" }, body: JSON.stringify(body),
  })) };
}
test("server-owned source alone reaches generation and validated output is saved", async () => {
  const f = fixture(); const response = await f.send();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ kind: "ready", purpose: "daily_note", value: note });
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
  expect(f.deps.generate.mock.calls[0][0]).toMatchObject({ userId: "owner", purpose: "daily_note", consentToken: "a".repeat(64) });
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_finish_v2", expect.objectContaining({ p_user_id: "owner", p_run_id: "run1", p_output: note }));
});
test.each(["prompt", "source", "userId", "model", "recordExcerpts"])("caller cannot inject %s", async (field) => {
  const f = fixture(); expect((await f.send({ action: "open", [field]: "attacker" })).status).toBe(400);
  expect(f.deps.rpc).not.toHaveBeenCalled(); expect(f.deps.generate).not.toHaveBeenCalled();
});
test("disabled, unauthenticated and forged scheduler calls stop before reads", async () => {
  const f = fixture(); f.deps.enabled = false; expect((await f.send()).status).toBe(503);
  f.deps.enabled = true; f.deps.authenticate.mockResolvedValue(null); expect((await f.send()).status).toBe(401);
  expect((await f.send({ action: "hourly" })).status).toBe(403); expect(f.deps.rpc).not.toHaveBeenCalled();
});
test.each(["busy", "waiting", "limited", "denied", "empty"])("%s claim makes no paid call", async (kind) => {
  const f = fixture(); f.deps.rpc.mockResolvedValue({ data: { kind } });
  expect((await f.send()).status).toBe(200); expect(f.deps.generate).not.toHaveBeenCalled();
});
test("cache hits never regenerate", async () => {
  const f = fixture(); f.deps.rpc.mockResolvedValue({ data: { kind: "ready", purpose: "daily_note", slot: "morning", value: note, source: reservation.source } });
  expect(await (await f.send()).json()).toMatchObject({ kind: "ready", value: note });
  expect(f.deps.generate).not.toHaveBeenCalled();
});
test("untrusted or absent evidence cannot create or display a result", async () => {
  const f = fixture(); f.deps.generate.mockResolvedValue({ ...note, basis_refs: [{ kind: "health", id: "secret" }] });
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
  expect(f.deps.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish_v2", expect.objectContaining({ p_output: null }));
});
test("a consent change during generation withholds the result", async () => {
  const f = fixture(); f.deps.rpc.mockImplementation(async (name) => ({ data: name === "dashboard_generation_request_v2" ? reservation : false }));
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
});
test("provider errors never reflect input or retry the provider", async () => {
  const f = fixture(); f.deps.generate.mockRejectedValue(new Error("PRIVATE SOURCE"));
  const response = await f.send(); expect(await response.text()).not.toContain("PRIVATE SOURCE");
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
  expect(f.deps.rpc).toHaveBeenLastCalledWith("dashboard_generation_finish_v2", expect.objectContaining({ p_output: null }));
});
test("hourly scheduler uses server-selected owners, returns no personal outputs", async () => {
  const f = fixture(); f.deps.isScheduler.mockResolvedValue(true);
  f.deps.rpc.mockImplementation(async (name) => ({ data: name === "dashboard_generation_due" ? ["owner-a", "owner-b"] : name === "dashboard_generation_request_v2" ? reservation : true }));
  const response = await f.send({ action: "hourly" }); const body = await response.json();
  expect(body).toEqual({ kind: "batch", processed: 2, nextCursor: null });
  expect(f.deps.rpc).toHaveBeenCalledWith("dashboard_generation_request_v2", expect.objectContaining({ p_user_id: "owner-b", p_action: "hourly" }));
  expect(JSON.stringify(body)).not.toContain("Read today");
});


test("a previous note keeps its creation time and is rechecked against surviving references", async () => {
  const f = fixture();
  const cached = { kind: "ready", purpose: "daily_note", slot: "morning", value: note,
    source: reservation.source, generatedAt: "2026-10-09T00:35:08Z", previous: true };
  f.deps.rpc.mockResolvedValue({ data: cached });
  expect(await (await f.send()).json()).toMatchObject({ kind: "ready", value: note, generatedAt: cached.generatedAt, previous: true });
  expect(f.deps.generate).not.toHaveBeenCalled();
  f.deps.rpc.mockResolvedValue({ data: { ...cached, source: { reminders: [{ ...reservation.source.reminders[0], id: "different" }] } } });
  expect(await (await f.send()).json()).toEqual({ kind: "unavailable" });
  expect(f.deps.generate).not.toHaveBeenCalled();
});
