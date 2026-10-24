import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captureLiveOwnerCheck, fetchWithLiveOwnerGate, observeLiveOwner } from "../live-owner-guard";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, noteResolvedOwner } from "../account-epoch";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise<void>(resolve => setImmediate(resolve));
  expect(check()).toBe(true);
}
beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("a"); });
afterEach(() => jest.restoreAllMocks());

test("unscoped requests keep their original fetch arguments", async () => {
  const signal = new AbortController().signal, init = { method: "POST", body: "same", signal };
  const network = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await fetchWithLiveOwnerGate("https://example.invalid", init);
  expect(network.mock.calls[0][1]).toBe(init);
});

test("the shared SDK uses the final fetch gate", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/supabase/client.ts"), "utf8");
  expect(source).toContain('import { fetchWithLiveOwnerGate } from "../auth/live-owner-guard"');
  expect(source).toContain("global: { fetch: fetchWithLiveOwnerGate }");
});

test.each(["functions", "query", "rpc", "storage"])("real SDK %s checks after session acquisition, before fetch", async kind => {
  const session = deferred<string>(); let waiting = false;
  const network = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  const sdk = createClient("https://example.invalid", "test-anon", {
    accessToken: () => { waiting = true; return session.promise; }, global: { fetch: fetchWithLiveOwnerGate },
  });
  const owner = observeLiveOwner(captureLiveOwnerCheck("a"));
  try {
    const pending = Promise.resolve(kind === "functions" ? sdk.functions.invoke("test", { body: {}, signal: owner.signal })
      : kind === "query" ? sdk.from("test").select().abortSignal(owner.signal)
      : kind === "rpc" ? sdk.rpc("test").abortSignal(owner.signal)
      : sdk.storage.from("test").download("test", undefined, { signal: owner.signal }));
    await until(() => waiting);
    beginAccountOwnerTransition("b"); session.resolve("test-session");
    const result = await pending.catch(error => ({ error }));
    expect(result.error).toBeTruthy();
    expect(network).not.toHaveBeenCalled();
  } finally { owner.release(); }
});

test.each(["logout", "switch", "return", "refresh", "user-abort"])("real SDK keeps the sent response across %s, except user cancellation", async change => {
  const response = deferred<Response>(), parent = new AbortController();
  let dispatched: AbortSignal | null | undefined;
  const network = jest.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
    dispatched = init?.signal;
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      dispatched?.addEventListener("abort", abort, { once: true });
      response.promise.then(resolve, reject).finally(() => dispatched?.removeEventListener("abort", abort));
    });
  });
  const sdk = createClient("https://example.invalid", "test-anon", {
    accessToken: async () => "test-session", global: { fetch: fetchWithLiveOwnerGate },
  });
  const owner = observeLiveOwner(captureLiveOwnerCheck("a"), parent.signal);
  try {
    const pending = sdk.functions.invoke("test", { body: {}, signal: owner.signal });
    await until(() => network.mock.calls.length === 1);
    expect(dispatched).toBe(parent.signal);
    if (change === "refresh") noteResolvedOwner("a");
    else if (change === "user-abort") parent.abort();
    else { noteResolvedOwner(change === "logout" ? null : "b"); if (change === "return") noteResolvedOwner("a"); }
    response.resolve(new Response(JSON.stringify({ error: "safety_red_zone", crisis_lane: "medical_emergency" }), { status: 422 }));
    const result = await pending;
    if (change === "user-abort") expect(result.error).toMatchObject({ name: "FunctionsFetchError", context: { name: "AbortError" } });
    else {
      expect(result.error.context.status).toBe(422);
      expect(await result.error.context.json()).toMatchObject({ crisis_lane: "medical_emergency" });
    }
  } finally { owner.release(); }
});

test("nested guards check every owner and retain user cancellation only", () => {
  const parent = new AbortController(), check = captureLiveOwnerCheck("a");
  const outer = observeLiveOwner(check, parent.signal), inner = observeLiveOwner(check, outer.signal);
  const network = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  void fetchWithLiveOwnerGate("https://example.invalid", { signal: inner.signal });
  expect(network.mock.calls[0][1]?.signal).toBe(parent.signal);
  noteResolvedOwner("b");
  expect(() => fetchWithLiveOwnerGate("https://example.invalid", { signal: inner.signal })).toThrow(expect.objectContaining({ name: "AbortError" }));
  outer.release(); inner.release();
});
