import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import ts from "typescript";

import { getEnv } from "@/lib/env";

jest.mock("@/lib/env", () => ({ getEnv: jest.fn() }));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  digestStringAsync: jest.fn(),
}));

import {
  completeNaverOAuth,
  isNativeNaverCallbackState,
  isNaverEnabled,
  signInWithNaver,
} from "../auth";
import { __setSupabaseClientForTests } from "../client";

const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;
const enabledClientEnv = {
  EXPO_PUBLIC_NAVER_CLIENT_ID: "public-client-id",
  EXPO_PUBLIC_ENABLE_NAVER: true,
} as ReturnType<typeof getEnv>;

const edgePath = join(process.cwd(), "supabase/functions/oauth-naver/index.ts");
const migrationPath = join(process.cwd(), "db/migrations/0160_oauth_naver_rate_limit.sql");
const edgeSource = readFileSync(edgePath, "utf8");

type EdgeHandler = (request: Request) => Promise<Response>;

const edgeJs = ts.transpileModule(
  edgeSource.replace(/^import[^\n]*\r?\n/gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const edgeFetch = jest.fn();
const edgeRpc = jest.fn();
const adminGetUserById = jest.fn();
const adminCreateUser = jest.fn();
const adminGenerateLink = jest.fn();
const edgeCreateClient = jest.fn(() => ({
  rpc: edgeRpc,
  auth: {
    admin: {
      getUserById: adminGetUserById,
      createUser: adminCreateUser,
      generateLink: adminGenerateLink,
    },
  },
}));
const edgeEnv: Record<string, string> = {
  ENABLE_NAVER_OAUTH: "true",
  NAVER_CLIENT_ID: "server-client-id",
  NAVER_CLIENT_SECRET: "server-client-secret",
  NAVER_OAUTH_HMAC_PEPPER: "test-only-pepper-with-at-least-32-bytes",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-fixture",
};
const EXISTING_USER_ID = "11111111-1111-4111-8111-111111111111";
const CREATED_USER_ID = "22222222-2222-4222-8222-222222222222";
let edgeHandler: EdgeHandler;

new Function("Deno", "createClient", "fetch", "crypto", edgeJs)(
  {
    env: { get: (name: string) => edgeEnv[name] },
    serve: (handler: EdgeHandler) => {
      edgeHandler = handler;
    },
  },
  edgeCreateClient,
  edgeFetch,
  webcrypto,
);

const PRODUCTION_REDIRECT = "https://simon-yhkim.github.io/2nd-B/oauth-callback";
const validState = "a".repeat(64);

function rawEdgeRequest(
  body: BodyInit | null,
  headers: Record<string, string> = {},
  includeOrigin = true,
): Request {
  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": "203.0.113.10",
    ...headers,
  };
  if (includeOrigin && !("origin" in headers)) {
    requestHeaders.origin = "https://simon-yhkim.github.io";
  }
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers: requestHeaders,
    body,
  };
  if (body instanceof ReadableStream) init.duplex = "half";
  return new Request("https://project.supabase.co/functions/v1/oauth-naver", init);
}

function edgeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return rawEdgeRequest(JSON.stringify(body), headers);
}

function tokenResponse(body: Record<string, unknown>, status = 200, contentType = "application/json") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

const exchangeBody = {
  action: "exchange",
  code: "Naver+opaque/code=12345678",
  state: validState,
  redirect_uri: PRODUCTION_REDIRECT,
};

function installDefaultEdgeMocks(): void {
  edgeRpc.mockImplementation(async (name: string) => {
    if (name === "consume_oauth_naver_rate_limit") {
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    }
    if (name === "issue_oauth_naver_state") return { data: true, error: null };
    if (name === "consume_oauth_naver_state") return { data: true, error: null };
    if (name === "claim_oauth_naver_identity") {
      return { data: [{ status: "bound", user_id: EXISTING_USER_ID }], error: null };
    }
    if (name === "bind_oauth_naver_identity") return { data: true, error: null };
    throw new Error(`unexpected RPC: ${name}`);
  });
  edgeFetch
    .mockResolvedValueOnce(tokenResponse({ access_token: "provider-access-token", token_type: "bearer" }))
    .mockResolvedValueOnce(tokenResponse({ resultcode: "00", response: { id: "stable-naver-id" } }));
  adminGetUserById.mockResolvedValue({
    data: { user: { id: EXISTING_USER_ID, email: `${"f".repeat(64)}@naver.invalid` } },
    error: null,
  });
  adminCreateUser.mockResolvedValue({ data: { user: { id: CREATED_USER_ID } }, error: null });
  adminGenerateLink.mockResolvedValue({
    data: { properties: { action_link: "https://auth.invalid/verify?token_hash=magic-hash" } },
    error: null,
  });
}

describe("oauth-naver durable server boundary", () => {
  beforeEach(() => {
    edgeFetch.mockReset();
    edgeRpc.mockReset();
    edgeCreateClient.mockClear();
    adminGetUserById.mockReset();
    adminCreateUser.mockReset();
    adminGenerateLink.mockReset();
    installDefaultEdgeMocks();
  });

  test("migration fixes policy, TTL, uniqueness, atomicity, and service-role-only ACLs", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.oauth_naver_states");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.oauth_naver_identities");
    expect(sql).toContain("oauth_naver_identities_user_id_key UNIQUE");
    expect(sql).toContain("REFERENCES auth.users (id) ON DELETE CASCADE");
    expect(sql).toContain("oauth_naver_identities_claim_hash_key UNIQUE");
    expect(sql).toContain("DELETE FROM public.oauth_naver_states");
    expect(sql).toContain("expires_at >");
    expect(sql).toContain("ON CONFLICT (subject_hash) DO NOTHING");
    expect(sql).toContain("consume_oauth_naver_rate_limit");
    expect(sql).toContain("v_ip_minute_count > 10");
    expect(sql).toContain("v_ip_hour_count > 60");
    expect(sql).toContain("v_state_count > 5");
    expect(sql).toContain("public.billing_request_role() IS DISTINCT FROM 'service_role'");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.issue_oauth_naver_state[\s\S]* TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.consume_oauth_naver_state[\s\S]* TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_oauth_naver_identity[\s\S]* TO service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.bind_oauth_naver_identity[\s\S]* TO service_role/i);
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]* TO (?:anon|authenticated)/i);
    expect(sql).not.toMatch(/\b(?:p_provider|p_limit|p_window|p_bucket)\b/i);
  });

  test("server issues the only state after the fixed limiter and stores only HMAC fingerprints", async () => {
    const response = await edgeHandler(edgeRequest({
      action: "start",
      redirect_uri: PRODUCTION_REDIRECT,
    }));
    const result = await response.json() as { authorize_url?: string };
    const authorize = new URL(result.authorize_url ?? "https://invalid.example");

    expect(response.status).toBe(200);
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://nid.naver.com/oauth2.0/authorize");
    expect(authorize.searchParams.get("response_type")).toBe("code");
    expect(authorize.searchParams.get("client_id")).toBe("server-client-id");
    expect(authorize.searchParams.get("redirect_uri")).toBe(PRODUCTION_REDIRECT);
    expect(authorize.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
    expect(authorize.searchParams.has("code_challenge")).toBe(false);
    expect(edgeFetch).not.toHaveBeenCalled();
    expect(edgeRpc.mock.calls.map(([name]) => name)).toEqual([
      "consume_oauth_naver_rate_limit",
      "issue_oauth_naver_state",
    ]);
    const calls = JSON.stringify(edgeRpc.mock.calls);
    expect(calls).not.toContain("203.0.113.10");
    expect(calls).not.toContain(authorize.searchParams.get("state"));
    expect(edgeRpc.mock.calls[0]?.[1]).toEqual({
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_state_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  test("kill switch, missing pepper, redirect tricks, and caller policy fields fail closed", async () => {
    const originalEnabled = edgeEnv.ENABLE_NAVER_OAUTH;
    const originalPepper = edgeEnv.NAVER_OAUTH_HMAC_PEPPER;
    try {
      edgeEnv.ENABLE_NAVER_OAUTH = "false";
      const disabled = await edgeHandler(edgeRequest({
        action: "start",
        redirect_uri: PRODUCTION_REDIRECT,
      }));
      expect(disabled.status).toBe(503);
      expect(edgeRpc).not.toHaveBeenCalled();

      edgeEnv.ENABLE_NAVER_OAUTH = "true";
      delete edgeEnv.NAVER_OAUTH_HMAC_PEPPER;
      const missingPepper = await edgeHandler(edgeRequest({
        action: "start",
        redirect_uri: PRODUCTION_REDIRECT,
      }));
      expect(missingPepper.status).toBe(503);
      expect(edgeRpc).not.toHaveBeenCalled();
    } finally {
      edgeEnv.ENABLE_NAVER_OAUTH = originalEnabled!;
      edgeEnv.NAVER_OAUTH_HMAC_PEPPER = originalPepper!;
    }

    const invalidBodies = [
      { action: "start", redirect_uri: `${PRODUCTION_REDIRECT}?next=https://evil.invalid` },
      { action: "start", redirect_uri: PRODUCTION_REDIRECT, native: false },
      { action: "start", redirect_uri: PRODUCTION_REDIRECT, provider: "naver" },
      { action: "start", redirect_uri: PRODUCTION_REDIRECT, limit: 1 },
    ];
    for (const body of invalidBodies) {
      const response = await edgeHandler(edgeRequest(body));
      expect(response.status).toBe(400);
    }
    expect(edgeRpc).not.toHaveBeenCalled();
    expect(edgeFetch).not.toHaveBeenCalled();
  });

  test("limiter and one-time state failures stop before Naver or auth writes", async () => {
    edgeRpc.mockImplementationOnce(async () => ({
      data: [{ allowed: false, retry_after_seconds: 37 }],
      error: null,
    }));
    const limited = await edgeHandler(edgeRequest(exchangeBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("37");
    expect(edgeFetch).not.toHaveBeenCalled();
    expect(adminCreateUser).not.toHaveBeenCalled();

    edgeRpc.mockReset();
    edgeFetch.mockReset();
    edgeRpc
      .mockResolvedValueOnce({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const replay = await edgeHandler(edgeRequest(exchangeBody));
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "oauth_state_invalid" });
    expect(edgeFetch).not.toHaveBeenCalled();

    edgeRpc.mockReset().mockResolvedValueOnce({ data: null, error: { message: "private DB detail" } });
    const unavailable = await edgeHandler(edgeRequest(exchangeBody));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "oauth_rate_limit_unavailable" });
    expect(edgeFetch).not.toHaveBeenCalled();
  });

  test("uses fixed POST/GET egress with bounded schemas and returns no identity or provider secret", async () => {
    const response = await edgeHandler(edgeRequest(exchangeBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(edgeFetch).toHaveBeenCalledTimes(2);
    const [tokenTarget, tokenInit] = edgeFetch.mock.calls[0] as [string, RequestInit];
    expect(tokenTarget).toBe("https://nid.naver.com/oauth2.0/token");
    expect(new URL(tokenTarget).search).toBe("");
    expect(tokenInit).toEqual(expect.objectContaining({ method: "POST", redirect: "error" }));
    expect(tokenInit.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(tokenInit.body as string);
    expect(form.get("client_secret")).toBe("server-client-secret");
    expect(form.get("code")).toBe(exchangeBody.code);
    expect(form.has("code_verifier")).toBe(false);
    const [profileTarget, profileInit] = edgeFetch.mock.calls[1] as [string, RequestInit];
    expect(profileTarget).toBe("https://openapi.naver.com/v1/nid/me");
    expect(profileInit).toEqual(expect.objectContaining({ method: "GET", redirect: "error" }));
    expect(result).toEqual({ token_hash: "magic-hash", token_type: "magiclink" });
    expect(JSON.stringify(result)).not.toContain(EXISTING_USER_ID);
    expect(JSON.stringify(result)).not.toContain("provider-access-token");
    expect(edgeRpc.mock.calls.map(([name]) => name).slice(0, 2)).toEqual([
      "consume_oauth_naver_rate_limit",
      "consume_oauth_naver_state",
    ]);
    expect(edgeRpc.mock.invocationCallOrder[1]).toBeLessThan(edgeFetch.mock.invocationCallOrder[0]!);
  });

  test("claims a subject before creating one account without email linking and binds afterward", async () => {
    edgeRpc.mockImplementation(async (name: string) => {
      if (name === "consume_oauth_naver_rate_limit") {
        return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
      }
      if (name === "consume_oauth_naver_state") return { data: true, error: null };
      if (name === "claim_oauth_naver_identity") {
        return { data: [{ status: "claimed", user_id: null }], error: null };
      }
      if (name === "bind_oauth_naver_identity") return { data: true, error: null };
      throw new Error(`unexpected RPC: ${name}`);
    });
    edgeFetch.mockReset()
      .mockResolvedValueOnce(tokenResponse({ access_token: "provider-access-token", token_type: "bearer" }))
      .mockResolvedValueOnce(tokenResponse({
        resultcode: "00",
        response: {
          id: "new-stable-naver-id",
          email: "must-not-link@example.com",
          nickname: "must-not-store",
        },
      }));

    const response = await edgeHandler(edgeRequest(exchangeBody));

    expect(response.status).toBe(200);
    expect(adminGetUserById).not.toHaveBeenCalled();
    expect(adminCreateUser).toHaveBeenCalledTimes(1);
    const createArgs = adminCreateUser.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(createArgs.email).toBe("must-not-link@example.com");
    expect(JSON.stringify(createArgs)).not.toContain("new-stable-naver-id");
    expect(JSON.stringify(createArgs)).not.toContain("must-not-store");
    const names = edgeRpc.mock.calls.map(([name]) => name);
    expect(names).toEqual([
      "consume_oauth_naver_rate_limit",
      "consume_oauth_naver_state",
      "claim_oauth_naver_identity",
      "bind_oauth_naver_identity",
    ]);
    const claimArgs = edgeRpc.mock.calls[2]?.[1];
    expect(claimArgs).toEqual({
      p_subject_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_claim_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(claimArgs)).not.toContain("new-stable-naver-id");
    expect(edgeRpc.mock.invocationCallOrder[2]).toBeLessThan(adminCreateUser.mock.invocationCallOrder[0]!);
    expect(adminCreateUser.mock.invocationCallOrder[0]).toBeLessThan(edgeRpc.mock.invocationCallOrder[3]!);
  });

  test("rejects missing/untrusted origins, mismatched redirects, and absent gateway identity", async () => {
    const missingOrigin = await edgeHandler(rawEdgeRequest(
      JSON.stringify({ action: "start", redirect_uri: PRODUCTION_REDIRECT }),
      {},
      false,
    ));
    expect(missingOrigin.status).toBe(403);
    expect(missingOrigin.headers.get("access-control-allow-origin")).toBeNull();

    const evilOrigin = await edgeHandler(edgeRequest(
      { action: "start", redirect_uri: PRODUCTION_REDIRECT },
      { origin: "https://evil.invalid" },
    ));
    expect(evilOrigin.status).toBe(403);

    const crossedBinding = await edgeHandler(edgeRequest(
      { action: "start", redirect_uri: PRODUCTION_REDIRECT },
      { origin: "http://localhost:8081" },
    ));
    expect(crossedBinding.status).toBe(400);

    const noPeer = await edgeHandler(edgeRequest(
      { action: "start", redirect_uri: PRODUCTION_REDIRECT },
      { "cf-connecting-ip": "" },
    ));
    expect(noPeer.status).toBe(503);
    expect(edgeRpc).not.toHaveBeenCalled();
    expect(edgeFetch).not.toHaveBeenCalled();
  });

  test("strict request reader enforces type, declared/actual 4 KiB, duplicate keys, depth, and fatal UTF-8", async () => {
    const validRaw = JSON.stringify({ action: "start", redirect_uri: PRODUCTION_REDIRECT });
    const wrongType = await edgeHandler(rawEdgeRequest(validRaw, { "content-type": "text/plain" }));
    expect(wrongType.status).toBe(415);

    const oversizedDeclared = await edgeHandler(rawEdgeRequest(validRaw, { "content-length": "4097" }));
    expect(oversizedDeclared.status).toBe(413);

    const mismatchedLength = await edgeHandler(rawEdgeRequest(validRaw, { "content-length": "1" }));
    expect(mismatchedLength.status).toBe(400);
    expect(await mismatchedLength.json()).toEqual({ error: "request_content_length_mismatch" });

    const oversizedActual = await edgeHandler(rawEdgeRequest(JSON.stringify({
      action: "start",
      redirect_uri: PRODUCTION_REDIRECT,
      padding: "x".repeat(4096),
    })));
    expect(oversizedActual.status).toBe(413);

    const duplicate = await edgeHandler(rawEdgeRequest(
      '{"action":"start","act\\u0069on":"start","redirect_uri":"' + PRODUCTION_REDIRECT + '"}',
    ));
    expect(duplicate.status).toBe(400);

    const tooDeep = await edgeHandler(rawEdgeRequest(
      '{"action":"start","redirect_uri":{"a":{"b":{"c":{"d":"x"}}}}}',
    ));
    expect(tooDeep.status).toBe(400);

    const invalidUtf8 = await edgeHandler(rawEdgeRequest(new Uint8Array([0xc3, 0x28])));
    expect(invalidUtf8.status).toBe(400);
    expect(edgeRpc).not.toHaveBeenCalled();
    expect(edgeFetch).not.toHaveBeenCalled();
  });

  test("strict request reader cancels a stalled body at one full 3 second deadline", async () => {
    jest.useFakeTimers();
    const cancel = jest.fn();
    const stalled = new ReadableStream<Uint8Array>({ cancel });
    try {
      const pending = edgeHandler(rawEdgeRequest(stalled));
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(3_001);
      const response = await pending;
      expect(response.status).toBe(408);
      expect(await response.json()).toEqual({ error: "request_body_timeout" });
      expect(cancel).toHaveBeenCalled();
      expect(edgeRpc).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("strict request reader cancels an unread body when headers are rejected", async () => {
    const cancel = jest.fn();
    const unread = new ReadableStream<Uint8Array>({ cancel });
    const response = await edgeHandler(rawEdgeRequest(unread, { "content-type": "text/plain" }));

    expect(response.status).toBe(415);
    expect(cancel).toHaveBeenCalled();
    expect(edgeRpc).not.toHaveBeenCalled();
    expect(edgeFetch).not.toHaveBeenCalled();
  });

  test("rejects oversized or malformed provider responses before auth writes", async () => {
    const cancel = jest.fn();
    const unread = new ReadableStream<Uint8Array>({ cancel });
    edgeFetch.mockReset().mockResolvedValueOnce(new Response(unread, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    const wrongType = await edgeHandler(edgeRequest(exchangeBody));
    expect(wrongType.status).toBe(502);
    expect(await wrongType.json()).toEqual({ error: "naver_token_exchange_failed" });
    expect(cancel).toHaveBeenCalled();
    expect(adminGenerateLink).not.toHaveBeenCalled();

    installDefaultEdgeMocks();
    edgeFetch.mockReset().mockResolvedValueOnce(tokenResponse({
      access_token: "x".repeat(70_000),
      token_type: "bearer",
    }));
    const oversized = await edgeHandler(edgeRequest(exchangeBody));
    expect(oversized.status).toBe(502);
    expect(await oversized.json()).toEqual({ error: "naver_token_exchange_failed" });
    expect(adminGenerateLink).not.toHaveBeenCalled();
  });

  test("security responses are non-cacheable, nosniff, and never expose raw failures", async () => {
    edgeRpc.mockReset().mockResolvedValueOnce({
      data: null,
      error: { message: "private DB detail with state and IP" },
    });
    const response = await edgeHandler(edgeRequest(exchangeBody));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(JSON.stringify(await response.json())).not.toContain("private DB detail");
  });

  test("source has hard egress/body limits and no scan, raw PII response, detail, or logs", () => {
    expect(edgeSource).toContain("UPSTREAM_TIMEOUT_MS = 5_000");
    expect(edgeSource).toContain("redirect: 'error'");
    expect(edgeSource).toMatch(/REQUEST_BODY_LIMIT_BYTES\s*=\s*4 \* 1024/);
    expect(edgeSource).toContain("REQUEST_BODY_TIMEOUT_MS = 3_000");
    expect(edgeSource).toMatch(/UPSTREAM_BODY_LIMIT_BYTES\s*=\s*64 \* 1024/);
    expect(edgeSource).toContain("new Uint8Array(options.limit)");
    expect(edgeSource).not.toMatch(/const chunks\s*:/);
    expect(edgeSource).toContain("request_content_length_mismatch");
    expect(edgeSource).toContain("keys.has(key)");
    expect(edgeSource).not.toMatch(/\.auth\.admin\.listUsers\s*\(/);
    expect(edgeSource).not.toMatch(/\bdetail\s*:/);
    expect(edgeSource).not.toMatch(/console\.(?:log|warn|error)/);
    expect(edgeSource).not.toMatch(/await req\.json\s*\(/);
  });
});

interface MemoryStorage {
  values: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function installWeb(storage: MemoryStorage) {
  const location = {
    origin: "https://simon-yhkim.github.io",
    pathname: "/2nd-B/sign-in",
    href: "",
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location, sessionStorage: storage },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  return location;
}

function uninstallWeb(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
}

describe("Naver client state capability", () => {
  beforeEach(() => {
    mockGetEnv.mockReturnValue(enabledClientEnv);
    __setSupabaseClientForTests(null);
  });

  afterEach(() => {
    uninstallWeb();
    __setSupabaseClientForTests(null);
  });

  test("gets 256-bit state from the server, binds the redirect, and consumes it locally once", async () => {
    const storage = memoryStorage();
    const location = installWeb(storage);
    const state = "b".repeat(64);
    const authorizeUrl = new URL("https://nid.naver.com/oauth2.0/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", "public-client-id");
    authorizeUrl.searchParams.set("redirect_uri", PRODUCTION_REDIRECT);
    authorizeUrl.searchParams.set("state", state);
    const invoke = jest.fn()
      .mockResolvedValueOnce({ data: { authorize_url: authorizeUrl.toString() }, error: null })
      .mockResolvedValueOnce({ data: { token_hash: "client-magic-hash" }, error: null });
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: { id: "client-user" } },
      error: null,
    });
    __setSupabaseClientForTests({ functions: { invoke }, auth: { verifyOtp } } as never);

    await signInWithNaver();
    expect(location.href).toBe(authorizeUrl.toString());
    expect(invoke).toHaveBeenNthCalledWith(1, "oauth-naver", {
      body: { action: "start", redirect_uri: PRODUCTION_REDIRECT },
    });
    const entries = [...storage.values.entries()];
    expect(entries).toHaveLength(1);
    const [storageKey, rawTransaction] = entries[0]!;
    expect(JSON.parse(rawTransaction)).toEqual({ state, redirectUri: PRODUCTION_REDIRECT });

    location.origin = "https://changed.invalid";
    await expect(completeNaverOAuth({ code: "opaque-code", state }))
      .resolves.toEqual({ userId: "client-user" });
    expect(storage.getItem(storageKey)).toBeNull();
    expect(invoke).toHaveBeenNthCalledWith(2, "oauth-naver", {
      body: { action: "exchange", code: "opaque-code", state, redirect_uri: PRODUCTION_REDIRECT },
    });
    await expect(completeNaverOAuth({ code: "opaque-code", state }))
      .rejects.toThrow("Naver sign-in could not be completed.");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  test("native start, completion, and custom-scheme state bridge all fail before edge exchange", async () => {
    uninstallWeb();
    const invoke = jest.fn();
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    expect(isNaverEnabled()).toBe(false);
    expect(isNativeNaverCallbackState("native." + "c".repeat(64))).toBe(false);
    await expect(signInWithNaver()).rejects.toThrow("Naver login is available on web only.");
    await expect(completeNaverOAuth({ code: "opaque-code", state: "c".repeat(64) }))
      .rejects.toThrow("Naver login is available on web only.");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("the public enable flag gates the web path", () => {
    installWeb(memoryStorage());
    expect(isNaverEnabled()).toBe(true);
    mockGetEnv.mockReturnValue({
      ...enabledClientEnv,
      EXPO_PUBLIC_ENABLE_NAVER: false,
    });
    expect(isNaverEnabled()).toBe(false);
  });

  test("rejects malformed server URLs, state/code shapes, and raw edge errors generically", async () => {
    const storage = memoryStorage();
    installWeb(storage);
    const invoke = jest.fn().mockResolvedValueOnce({
      data: {
        authorize_url:
          "https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=public-client-id"
          + "&redirect_uri=" + encodeURIComponent(PRODUCTION_REDIRECT)
          + "&state=" + "d".repeat(64) + "&next=https://evil.invalid",
      },
      error: null,
    });
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    await expect(signInWithNaver()).rejects.toThrow("Naver sign-in could not be completed.");
    expect(storage.values.size).toBe(0);

    const state = "e".repeat(64);
    storage.setItem("secondB_naver_oauth_state", JSON.stringify({ state, redirectUri: PRODUCTION_REDIRECT }));
    await expect(completeNaverOAuth({ code: "code with spaces", state }))
      .rejects.toThrow("Naver sign-in could not be completed.");
    expect(invoke).toHaveBeenCalledTimes(1);

    const authorizeUrl = new URL("https://nid.naver.com/oauth2.0/authorize");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", "public-client-id");
    authorizeUrl.searchParams.set("redirect_uri", PRODUCTION_REDIRECT);
    authorizeUrl.searchParams.set("state", state);
    invoke
      .mockResolvedValueOnce({ data: { authorize_url: authorizeUrl.toString() }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("raw provider and DB detail") });

    await signInWithNaver();
    const error = await completeNaverOAuth({ code: "valid-code", state }).catch(
      (caught: unknown) => caught,
    );
    expect((error as Error).message).toBe("Naver sign-in could not be completed.");
    expect((error as Error).message).not.toContain("provider");
  });
});
