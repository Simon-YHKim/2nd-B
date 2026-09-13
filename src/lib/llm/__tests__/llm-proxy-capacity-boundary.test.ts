import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

const sharedPath = resolve(
  __dirname,
  "../../../../supabase/functions/_shared/llm-proxy-common.ts",
);
const sharedSource = readFileSync(sharedPath, "utf8");

type RpcResult = { data?: unknown; error?: { message?: string } | null };
type ExecuteRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;
type Reserve = (
  executeRpc: ExecuteRpc,
  provider: "gemini" | "claude" | "openai" | "xai",
  model: string,
  weight: number,
) => Promise<
  | { ok: true; reservationId: string }
  | {
    ok: false;
    reason: "limited" | "disabled" | "config_unavailable" | "unavailable";
  }
>;
type Transition = (
  executeRpc: ExecuteRpc,
  reservationId: string,
  transition: "settle" | "release",
) => Promise<boolean>;

function loadCapacityContract(env: Record<string, string | undefined>): {
  reserveLlmProxyCapacity: Reserve;
  transitionLlmProxyCapacity: Transition;
  llmCapacityWeight: (maxTokens: number, batchItems?: number) => number;
} {
  const start = sharedSource.indexOf("export type LlmCapacityProvider");
  const end = sharedSource.indexOf("// --- responseSchema normalization", start);
  if (start < 0 || end < 0) throw new Error("capacity contract not found");
  const js = ts.transpileModule(sharedSource.slice(start, end), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exported: Record<string, unknown> = {};
  new Function("exports", "Deno", js)(exported, {
    env: { get: (name: string) => env[name] },
  });
  return exported as ReturnType<typeof loadCapacityContract>;
}

const completeEnv = {
  LLM_GLOBAL_MINUTE_WEIGHT_CAP: "120",
  LLM_GLOBAL_CONCURRENCY_CAP: "12",
  LLM_GEMINI_MINUTE_WEIGHT_CAP: "60",
  LLM_GEMINI_CONCURRENCY_CAP: "6",
};

const invalidCapacityEnvs: Array<[string, Record<string, string | undefined>]> = [
  ["missing", {}],
  ["zero", { ...completeEnv, LLM_GLOBAL_MINUTE_WEIGHT_CAP: "0" }],
  ["fractional", { ...completeEnv, LLM_GEMINI_CONCURRENCY_CAP: "6.5" }],
  ["overflow", { ...completeEnv, LLM_GLOBAL_CONCURRENCY_CAP: "2147483648" }],
];

describe("shared LLM fleet-capacity client", () => {
  test.each(invalidCapacityEnvs)(
    "fails closed on %s explicit capacity configuration",
    async (_label, env) => {
      const api = loadCapacityContract(env);
      const rpc = jest.fn<ReturnType<ExecuteRpc>, Parameters<ExecuteRpc>>();

      await expect(api.reserveLlmProxyCapacity(rpc, "gemini", "gemini-2.5-pro", 2))
        .resolves.toEqual({ ok: false, reason: "config_unavailable" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test("reserves with a fresh server id and all explicit global/provider caps", async () => {
    const api = loadCapacityContract(completeEnv);
    const rpc = jest.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: { accepted: true, reservation_id: args.p_reservation_id },
      error: null,
    }));

    const result = await api.reserveLlmProxyCapacity(rpc, "gemini", "gemini-2.5-pro", 2);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reserve_llm_proxy_capacity", {
      p_reservation_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
      p_provider: "gemini",
      p_model: "gemini-2.5-pro",
      p_weight: 2,
      p_global_minute_weight_cap: 120,
      p_provider_minute_weight_cap: 60,
      p_global_concurrency_cap: 12,
      p_provider_concurrency_cap: 6,
    });
  });

  test.each([
    ["llm_capacity_exceeded", "limited"],
    ["llm_runtime_disabled", "disabled"],
    ["llm_capacity_config_missing", "config_unavailable"],
    ["database unavailable", "unavailable"],
  ] as const)("maps %s without exposing backend detail", async (message, reason) => {
    const api = loadCapacityContract(completeEnv);
    const rpc = jest.fn(async () => ({ data: null, error: { message } }));
    await expect(api.reserveLlmProxyCapacity(rpc, "gemini", "gemini-2.5-pro", 2))
      .resolves.toEqual({ ok: false, reason });
  });

  test("fails closed on RPC rejection or a forged/malformed reservation row", async () => {
    const api = loadCapacityContract(completeEnv);
    const rejected = jest.fn(async () => {
      throw new Error("rpc missing");
    });
    await expect(api.reserveLlmProxyCapacity(rejected, "gemini", "model", 1))
      .resolves.toEqual({ ok: false, reason: "unavailable" });

    const forged = jest.fn(async () => ({
      data: { accepted: true, reservation_id: "caller-controlled" },
      error: null,
    }));
    await expect(api.reserveLlmProxyCapacity(forged, "gemini", "model", 1))
      .resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  test("weights token output and embedding batches conservatively", () => {
    const api = loadCapacityContract(completeEnv);
    expect(api.llmCapacityWeight(1)).toBe(1);
    expect(api.llmCapacityWeight(4096)).toBe(4);
    expect(api.llmCapacityWeight(512, 50)).toBe(5);
    expect(api.llmCapacityWeight(-1)).toBe(2_147_483_647);
  });

  test("settles/releases only a valid reservation id and fails closed on RPC rejection", async () => {
    const api = loadCapacityContract(completeEnv);
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    const id = "00000000-0000-4000-8000-000000000001";

    await expect(api.transitionLlmProxyCapacity(rpc, id, "settle")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("settle_llm_proxy_capacity", {
      p_reservation_id: id,
    });

    await expect(api.transitionLlmProxyCapacity(rpc, "not-a-reservation", "release"))
      .resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);

    const rejected = jest.fn(async () => {
      throw new Error("rpc missing");
    });
    await expect(api.transitionLlmProxyCapacity(rejected, id, "release"))
      .resolves.toBe(false);
  });
});

describe.each([
  ["claude-proxy", "claude", 1],
  ["gemini-proxy", "gemini", 2],
  ["openai-proxy", "openai", 2],
  ["xai-proxy", "xai", 1],
] as const)("%s fleet-capacity egress boundary", (proxy, provider, reservationCount) => {
  const source = readFileSync(
    resolve(__dirname, `../../../../supabase/functions/${proxy}/index.ts`),
    "utf8",
  );

  test("reserves weighted capacity after user/day spend and before every paid route", () => {
    expect(source).toContain("llmCapacityWeight");
    expect(source.match(/reserveLlmProxyCapacity\(/g)).toHaveLength(reservationCount);
    expect(source).toContain(`'${provider}'`);
    const firstCapacity = source.indexOf("reserveLlmProxyCapacity(");
    const firstSpend = source.lastIndexOf("'bump_gemini_spend'", firstCapacity);
    const firstFetch = source.indexOf("await fetch(", firstCapacity);
    expect(firstSpend).toBeGreaterThan(-1);
    expect(firstCapacity).toBeGreaterThan(firstSpend);
    expect(firstFetch).toBeGreaterThan(firstCapacity);
  });

  test("fails closed and refunds only the pre-dispatch user counter when capacity is unavailable", () => {
    expect(source).toMatch(/capacity\.reason === 'limited'[\s\S]*llm_capacity_exceeded/);
    expect(source).toMatch(/llm_capacity_unavailable/);
    const capacity = source.indexOf("reserveLlmProxyCapacity(");
    const fetch = source.indexOf("await fetch(", capacity);
    const preDispatch = source.slice(capacity, fetch);
    expect(preDispatch).toMatch(/await refund(?:Embed)?BeforeDispatch\(\);/);
    expect(preDispatch).toMatch(/return jsonResponse\(/);
  });

  test("releases a capacity claim on reasoning denial but settles after provider dispatch", () => {
    const reasoning = source.indexOf("if (purpose === 'reasoning_connect')");
    const nextFetch = source.indexOf("await fetch(", reasoning);
    expect(reasoning).toBeGreaterThan(-1);
    const releaseHelper = source.slice(
      source.lastIndexOf("const releaseCapacity", reasoning),
      reasoning,
    );
    expect(releaseHelper).toMatch(/transitionLlmProxyCapacity\([\s\S]*'release'/);
    expect(source.slice(reasoning, nextFetch)).toContain("await releaseCapacity();");

    const dispatch = source.lastIndexOf("const t0 = Date.now()");
    const tail = source.slice(dispatch);
    expect(dispatch).toBeGreaterThan(-1);
    expect(tail).toMatch(/transitionLlmProxyCapacity\([\s\S]*'settle'/);
    expect(tail).not.toContain("'release'");
  });
});
