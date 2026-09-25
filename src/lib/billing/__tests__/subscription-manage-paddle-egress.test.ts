// Runs supabase/functions/subscription-manage/index.ts under a small Deno shim.
//
// subscription-manage-edge.test.ts pins the source text. These tests observe the
// two properties the Paddle egress boundary exists for, on the real handler:
//   1. PADDLE_API_KEY travels as a bearer token, so the only hosts that may ever
//      receive the request are Paddle's two API roots, whatever PADDLE_API_BASE says.
//   2. Paddle's reply is provider input. Only a short code or id reaches the
//      billing ledger and the logs, and the reply is read under a size and a
//      nesting ceiling. The HTTP status, not the body, decides the outcome.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import * as requestJson from "../../../../supabase/functions/_shared/request-json";
import * as paddleEnvironment from "../../../../supabase/functions/_shared/paddle-environment";
import * as checkoutBindings from "../../../../supabase/functions/_shared/paddle-checkout-binding";
import { webcrypto } from "node:crypto";

const FUNCTIONS = join(__dirname, "..", "..", "..", "..", "supabase", "functions");
const USER_ID = "8a6b2f1e-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const API_KEY = `pdl_live_apikey_${"a".repeat(26)}_${"b".repeat(22)}_abc`;
const SANDBOX_API_KEY = API_KEY.replace("_live_", "_sdbx_");
const PRICE = `pri_${"a".repeat(26)}`;
const BINDING_SECRET = "fixture-checkout-binding-secret-no-real-value";
const SANDBOX_ENV = {
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_SANDBOX_SUPABASE_URL: "https://sandbox.supabase.co",
  PADDLE_LIVE_SUPABASE_URL: "https://live.supabase.co",
  SUPABASE_URL: "https://sandbox.supabase.co",
  PADDLE_API_KEY: SANDBOX_API_KEY,
};

type Handler = (req: Request) => Promise<Response>;
type RpcCall = { name: string; args: Record<string, unknown> };
type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

function evaluate(
  file: string,
  resolveImport: (id: string) => unknown,
  deno?: unknown,
  fetchImpl?: unknown,
): Record<string, unknown> {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", "Deno", "fetch", outputText)(
    resolveImport,
    loaded,
    loaded.exports,
    deno,
    fetchImpl,
  );
  return loaded.exports;
}

function loadHandler(env: Record<string, string | undefined>, fetchImpl: FetchImpl) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "claim_billing_self_service_rate_limit") return { data: 0, error: null };
      if (name === "refund_eligibility") {
        return { data: { status: "eligible", tier: "cortex" }, error: null };
      }
      if (name === "claim_billing_self_service") {
        return {
          data: { id: "claim_01", transaction_id: "txn_01", subscription_id: "sub_01" },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: "https://project.supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    PADDLE_SELF_SERVICE_ENABLED: "1",
    PADDLE_API_KEY: API_KEY,
    PADDLE_CHECKOUT_BINDING_SECRET: BINDING_SECRET,
    PADDLE_PRICE_CORTEX: PRICE,
    ...env,
  };
  let handler: Handler | null = null;
  const deno = {
    env: { get: (name: string) => values[name] },
    serve: (value: Handler) => {
      handler = value;
    },
  };
  const fetchMock = jest.fn(fetchImpl);
  // The boundary module is loaded only when the handler asks for it.
  const resolveImport = (id: string): unknown => {
    if (id === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
    if (id === "jsr:@supabase/supabase-js@2") return { createClient: () => client };
    if (id === "../_shared/request-json.ts") return requestJson;
    if (id === "../_shared/paddle-environment.ts") return paddleEnvironment;
    if (id === "../_shared/paddle-checkout-binding.ts") return checkoutBindings;
    if (id === "../_shared/paddle-api-boundary.ts") {
      return evaluate(join(FUNCTIONS, "_shared", "paddle-api-boundary.ts"), (inner) => {
        if (inner === "./request-json.ts") return requestJson;
        throw new Error(`unexpected boundary import: ${inner}`);
      });
    }
    throw new Error(`unexpected edge import: ${id}`);
  };
  evaluate(join(FUNCTIONS, "subscription-manage", "index.ts"), resolveImport, deno, fetchMock);
  if (!handler) throw new Error("subscription-manage did not register a handler");
  return { handler: handler as Handler, fetchMock, rpcCalls };
}

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = [
  base64Url({ alg: "HS256", typ: "JWT" }),
  base64Url({ sub: USER_ID, role: "authenticated" }),
  "signature",
].join(".");

function refundRequest(): Request {
  return new Request("https://project.supabase.test/functions/v1/subscription-manage", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "refund_request" }),
  });
}

function paddleReply(body: string, status = 201, contentType = "application/json"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function settlement(rpcCalls: RpcCall[]): Record<string, unknown> {
  const settles = rpcCalls.filter((call) => call.name === "settle_billing_self_service");
  expect(settles).toHaveLength(1);
  return settles[0].args;
}

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe("subscription-manage Paddle egress", () => {
  it.each([
    { PADDLE_API_KEY: SANDBOX_API_KEY },
    { PADDLE_API_KEY: `live_${"a".repeat(27)}` },
    { PADDLE_API_BASE: "https://sandbox-api.paddle.com" },
  ])("refuses a crossed environment or a client token before money egress: %#", async (env) => {
    const { handler, fetchMock, rpcCalls } = loadHandler(env, async () => paddleReply('{}'));
    await handler(refundRequest());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(settlement(rpcCalls).p_outcome).toBe("misconfigured");
  });

  it("mints a sandbox binding only for its own configured price and project", async () => {
    const { handler, fetchMock } = loadHandler(SANDBOX_ENV, async () => paddleReply('{}'));
    const request = (body: unknown) => new Request("https://sandbox.supabase.co/functions/v1/subscription-manage?env=production", {
      method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    for (const body of [
      { action: "checkout_binding" },
      { action: "checkout_binding", price_id: PRICE, paddle_environment: "production" },
      { action: "checkout_binding", price_id: `pri_${"z".repeat(26)}`, paddle_environment: "sandbox" },
    ]) expect((await handler(request(body))).status).toBe(400);

    const response = await handler(request({ action: "checkout_binding", price_id: PRICE, paddle_environment: "sandbox" }));
    expect(response.status).toBe(200);
    const binding = await response.json();
    const scope = { environment: "sandbox" as const, audience: SANDBOX_ENV.SUPABASE_URL, price_id: PRICE };
    expect(binding).toMatchObject({ version: 2, ...scope, user_id: USER_ID });
    await expect(checkoutBindings.verifyCheckoutBinding(binding, BINDING_SECRET, undefined, scope)).resolves.toBe(USER_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses sandbox money actions against the live database before any RPC or egress", async () => {
    const { handler, fetchMock, rpcCalls } = loadHandler({
      PADDLE_ENVIRONMENT: "sandbox",
      PADDLE_SANDBOX_SUPABASE_URL: "https://sandbox.supabase.co",
      PADDLE_LIVE_SUPABASE_URL: "https://live.supabase.co",
      SUPABASE_URL: "https://live.supabase.co",
    }, async () => paddleReply('{"data":{"id":"adj_01"}}'));
    const response = await handler(refundRequest());
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([]);
  });

  it.each([
    "https://paddle.attacker.example",
    "http://api.paddle.com",
    "https://api.paddle.com.attacker.example",
    "https://user@api.paddle.com",
  ])("never sends the API key when PADDLE_API_BASE is %j", async (base) => {
    const { handler, fetchMock, rpcCalls } = loadHandler({ PADDLE_API_BASE: base }, async () =>
      paddleReply('{"data":{"id":"adj_01"}}'),
    );

    const response = await handler(refundRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      outcome: "misconfigured",
      contact_support: true,
    });
    expect(settlement(rpcCalls)).toMatchObject({
      p_outcome: "misconfigured",
      p_provider_ref: null,
      p_provider_error: "invalid_paddle_api_base",
    });
  });

  it.each([
    [undefined, "https://api.paddle.com/adjustments"],
    ["https://sandbox-api.paddle.com/", "https://sandbox-api.paddle.com/adjustments"],
  ])("still reaches Paddle when PADDLE_API_BASE is %j", async (base, endpoint) => {
    const { handler, fetchMock, rpcCalls } = loadHandler({ PADDLE_API_BASE: base,
      ...(base?.includes("sandbox") ? SANDBOX_ENV : {}),
    }, async () =>
      paddleReply('{"data":{"id":"adj_01"}}'),
    );

    const response = await handler(refundRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(endpoint);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${base?.includes("sandbox") ? SANDBOX_API_KEY : API_KEY}`);
    // A redirect must not carry the bearer to a URL the pin never checked.
    expect(init.redirect).toBe("error");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: "accepted",
      reference: "adj_01",
    });
    expect(settlement(rpcCalls)).toMatchObject({
      p_outcome: "accepted",
      p_provider_ref: "adj_01",
      p_provider_error: null,
    });
  });

  it.each([
    [
      "a refusal with detail text",
      async () =>
        paddleReply(
          JSON.stringify({
            error: { code: "transaction_not_found", detail: "provider detail: Bearer leaked" },
          }),
          400,
        ),
      "transaction_not_found",
    ],
    [
      "a code that is not code-shaped",
      async () =>
        paddleReply(
          JSON.stringify({
            error: { code: `bad${String.fromCharCode(10)}authorization: Bearer leaked`, detail: "x" },
          }),
          422,
        ),
      "http_422",
    ],
    [
      "a transport exception",
      async () => {
        throw new TypeError(
          "error sending request for url (https://api.paddle.com/adjustments): Bearer leaked",
        );
      },
      "provider_transport_error",
    ],
  ])("stores only a short code for %s", async (_label, reply, storedError) => {
    const { handler, rpcCalls } = loadHandler({}, reply as FetchImpl);

    const response = await handler(refundRequest());

    await expect(response.json()).resolves.toMatchObject({ ok: false, outcome: "provider_error" });
    const settled = settlement(rpcCalls);
    expect(settled).toMatchObject({ p_outcome: "provider_error", p_provider_error: storedError });
    expect(JSON.stringify(settled)).not.toContain("Bearer");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Bearer");
  });

  it.each([
    ["over 64 KiB", `{"data":{"id":"adj_01"},"pad":"${"x".repeat(64 * 1024)}"}`],
    ["nested deeper than 8", `{"data":{"id":"adj_01"},"n":${"[".repeat(8)}1${"]".repeat(8)}}`],
  ])("does not parse a 2xx reply %s and still settles it accepted", async (_label, body) => {
    const { handler, rpcCalls } = loadHandler({}, async () => paddleReply(body));

    const response = await handler(refundRequest());

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: "accepted",
      reference: null,
    });
    expect(settlement(rpcCalls)).toMatchObject({
      p_outcome: "accepted",
      p_provider_ref: null,
      p_provider_error: null,
    });
  });
});
