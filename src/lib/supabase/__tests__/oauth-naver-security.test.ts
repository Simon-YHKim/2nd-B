import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import ts from "typescript";

import { getEnv } from "@/lib/env";
import {
  JsonBodyError,
  OAUTH_JSON_BODY_LIMIT_BYTES,
  readJsonObject,
} from "../../../../supabase/functions/_shared/request-json";
import { canonicalNetworkIdentity } from "../../../../supabase/functions/_shared/network-identity";

jest.mock("@/lib/env", () => ({ getEnv: jest.fn() }));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA-1", SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex", BASE64: "base64" },
  digestStringAsync: jest.fn(),
  randomUUID: jest.fn(() => "33333333-3333-4333-8333-333333333333"),
}));

import {
  completeNaverOAuth,
  isNativeNaverCallbackState,
  isNaverEnabled,
  signInWithNaver,
} from "../auth";
import { __resetAuthStorageRuntimeForTests } from "../../auth/session-mutation";
import { __resetRecoveryProofStorageQueueForTests } from "../../auth/recovery-proof-store";
import { __setSupabaseClientForTests } from "../client";

const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;
const enabledClientEnv = {
  EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  EXPO_PUBLIC_NAVER_CLIENT_ID: "public-client-id",
  EXPO_PUBLIC_ENABLE_NAVER: true,
} as ReturnType<typeof getEnv>;

const edgePath = join(process.cwd(), "supabase/functions/oauth-naver/index.ts");
const migrationPath = join(process.cwd(), "db/migrations/0183_oauth_naver_rate_limit.sql");
const limiterCompletionDraftPath = join(
  process.cwd(),
  "db/migration-drafts/UNNUMBERED_oauth_naver_rate_limit_completion.sql",
);
const callbackPath = join(process.cwd(), "src/app/(auth)/oauth-callback.tsx");
const webDeployPath = join(process.cwd(), ".github/workflows/web-deploy.yml");
const edgeSource = readFileSync(edgePath, "utf8");
const callbackSource = readFileSync(callbackPath, "utf8");
const webDeploySource = readFileSync(webDeployPath, "utf8");

type EdgeHandler = (request: Request) => Promise<Response>;

const edgeJs = ts.transpileModule(
  edgeSource.replace(/^import[\s\S]*?;\r?\n/gm, ""),
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

new Function(
  "Deno",
  "createClient",
  "fetch",
  "crypto",
  "JsonBodyError",
  "OAUTH_JSON_BODY_LIMIT_BYTES",
  "readJsonObject",
  "canonicalNetworkIdentity",
  edgeJs,
)(
  {
    env: { get: (name: string) => edgeEnv[name] },
    serve: (handler: EdgeHandler) => {
      edgeHandler = handler;
    },
  },
  edgeCreateClient,
  edgeFetch,
  webcrypto,
  JsonBodyError,
  OAUTH_JSON_BODY_LIMIT_BYTES,
  readJsonObject,
  canonicalNetworkIdentity,
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
    if (name === "consume_oauth_naver_subject_rate_limit") {
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
    data: {
      user: { id: EXISTING_USER_ID },
      properties: {
        action_link: "https://auth.invalid/verify?type=magiclink&token=magic-hash",
        hashed_token: "magic-hash",
        verification_type: "magiclink",
      },
    },
    error: null,
  });
}

async function startPeerRateHash(peer: string): Promise<string> {
  const callsBefore = edgeRpc.mock.calls.length;
  const response = await edgeHandler(edgeRequest(
    { action: "start", redirect_uri: PRODUCTION_REDIRECT },
    { "cf-connecting-ip": peer },
  ));
  const rateCall = edgeRpc.mock.calls.slice(callsBefore).find(
    ([name]) => name === "consume_oauth_naver_rate_limit",
  );
  const rateArgs = rateCall?.[1] as Record<string, unknown> | undefined;

  expect(response.status).toBe(200);
  expect(rateArgs?.p_ip_hash).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
  return String(rateArgs?.p_ip_hash);
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

  test("forward draft removes attacker-cardinality state rows and adds a service-only subject quota", () => {
    const sql = readFileSync(limiterCompletionDraftPath, "utf8");
    const peerLimiter = sql.match(
      /CREATE OR REPLACE FUNCTION public\.consume_oauth_naver_rate_limit[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";
    const stateFunctions = sql.match(
      /CREATE OR REPLACE FUNCTION public\.issue_oauth_naver_state[\s\S]*?CREATE OR REPLACE FUNCTION public\.consume_oauth_naver_state[\s\S]*?\n\$\$;/,
    )?.[0] ?? "";

    expect(sql).toContain("DELETE FROM public.oauth_preauth_rate_limits");
    expect(sql).toContain("dimension = 'state_10m'");
    expect(sql).toContain("'subject_hour'");
    expect(sql).toContain("'global_minute'");
    expect(peerLimiter).not.toContain("VALUES ('naver', 'state_10m'");
    expect(peerLimiter.indexOf("VALUES ('naver', 'ip_minute'")).toBeLessThan(
      peerLimiter.indexOf("VALUES ('naver', 'global_minute'"),
    );
    expect(peerLimiter.indexOf("v_global_count >= 600")).toBeLessThan(
      peerLimiter.indexOf("VALUES ('naver', 'ip_minute'"),
    );
    expect(peerLimiter.indexOf("IF v_retry > 0")).toBeLessThan(
      peerLimiter.indexOf("VALUES ('naver', 'global_minute'"),
    );
    expect(peerLimiter).toContain("VALUES ('naver', 'ip_minute'");
    expect(peerLimiter).toContain("VALUES ('naver', 'ip_hour'");
    expect(peerLimiter).toContain("LIMIT 32");
    expect(sql).toContain("consume_oauth_naver_subject_rate_limit");
    expect(sql.match(/LIMIT 64/g)).toHaveLength(2);
    expect(sql).toContain(
      "CHECK (redirect_uri = 'https://simon-yhkim.github.io/2nd-B/oauth-callback')",
    );
    expect(stateFunctions).not.toContain("localhost");
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_oauth_naver_subject_rate_limit\(text\)\s+TO service_role/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_oauth_naver_subject_rate_limit\(text\)[\s\S]*TO (?:anon|authenticated)/i,
    );
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

  test("collapses textual IPv6 variants within one /64 before the peer HMAC", async () => {
    const hashes: string[] = [];
    for (const peer of [
      "2001:0DB8:ABCD:0012:0000:0000:0000:0001",
      "2001:db8:abcd:12::ffff",
      "2001:db8:abcd:0012:1234:5678:90ab:cdef",
    ]) hashes.push(await startPeerRateHash(peer));

    expect(new Set(hashes).size).toBe(1);
    await expect(startPeerRateHash("2001:db8:abcd:13::1"))
      .resolves.not.toBe(hashes[0]);
  });

  test("maps IPv4-mapped IPv6 variants to the underlying IPv4 peer HMAC", async () => {
    const ipv4Hash = await startPeerRateHash("203.0.113.7");

    await expect(startPeerRateHash("::ffff:203.0.113.7")).resolves.toBe(ipv4Hash);
    await expect(startPeerRateHash("0:0:0:0:0:FFFF:CB00:7107")).resolves.toBe(ipv4Hash);
  });

  test("canonicalizes plain IPv4 text while keeping addresses isolated", async () => {
    const canonical = await startPeerRateHash("203.0.113.7");

    await expect(startPeerRateHash("203.000.113.007")).resolves.toBe(canonical);
    await expect(startPeerRateHash("203.0.113.8")).resolves.not.toBe(canonical);
  });

  test.each([
    "",
    "not-an-ip",
    "deadbeef",
    "2001:db8:::1",
    "2001:db8::1::2",
    "2001:db8::zzzz",
    "203.0.113.999",
  ])("rejects malformed peer identity before limiter state: %s", async (peer) => {
    const response = await edgeHandler(edgeRequest(
      { action: "start", redirect_uri: PRODUCTION_REDIRECT },
      { "cf-connecting-ip": peer },
    ));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "peer_identity_unavailable" });
    expect(edgeRpc).not.toHaveBeenCalled();
  });

  test("privileged Supabase transport is exact-origin, redirect-free, timed, and body-bounded", async () => {
    const response = await edgeHandler(edgeRequest({
      action: "start",
      redirect_uri: PRODUCTION_REDIRECT,
    }));
    expect(response.status).toBe(200);
    const createOptions = (edgeCreateClient.mock.calls[0] as unknown[])[2] as {
      global?: { fetch?: typeof fetch };
    };
    const guardedFetch = createOptions.global?.fetch;
    expect(guardedFetch).toBeInstanceOf(Function);

    edgeFetch.mockReset();
    await expect(guardedFetch!("https://evil.invalid/auth/v1/admin/users"))
      .rejects.toThrow("supabase upstream rejected");
    expect(edgeFetch).not.toHaveBeenCalled();

    edgeFetch.mockResolvedValueOnce(new Response(new Uint8Array((128 * 1024) + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(guardedFetch!("https://project.supabase.co/auth/v1/admin/users"))
      .rejects.toThrow("supabase upstream rejected");
    expect(edgeSource).toContain("SUPABASE_UPSTREAM_TIMEOUT_MS = 5_000");
    expect(edgeSource).toMatch(/SUPABASE_UPSTREAM_BODY_LIMIT_BYTES\s*=\s*128 \* 1024/);

    jest.useFakeTimers();
    try {
      edgeFetch.mockImplementationOnce(async (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("transport aborted")),
            { once: true },
          );
        }));
      const rejection = expect(
        guardedFetch!("https://project.supabase.co/rest/v1/private_table"),
      ).rejects.toThrow("supabase upstream rejected");
      await jest.advanceTimersByTimeAsync(5_001);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
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

  test("subject quota runs after a verified profile and before identity or Auth writes", async () => {
    const success = await edgeHandler(edgeRequest(exchangeBody));
    expect(success.status).toBe(200);
    const names = edgeRpc.mock.calls.map(([name]) => name);
    expect(names).toEqual([
      "consume_oauth_naver_rate_limit",
      "consume_oauth_naver_state",
      "consume_oauth_naver_subject_rate_limit",
      "claim_oauth_naver_identity",
    ]);
    expect(edgeFetch.mock.invocationCallOrder[1]).toBeLessThan(edgeRpc.mock.invocationCallOrder[2]!);
    expect(edgeRpc.mock.invocationCallOrder[2]).toBeLessThan(adminGetUserById.mock.invocationCallOrder[0]!);
    expect(edgeRpc.mock.calls[2]?.[1]).toEqual({
      p_subject_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    edgeRpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "consume_oauth_naver_rate_limit") {
        return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
      }
      if (name === "consume_oauth_naver_state") return { data: true, error: null };
      if (name === "consume_oauth_naver_subject_rate_limit") {
        return { data: [{ allowed: false, retry_after_seconds: 91 }], error: null };
      }
      throw new Error(`unexpected RPC after subject quota: ${name}`);
    });
    edgeFetch.mockReset()
      .mockResolvedValueOnce(tokenResponse({ access_token: "provider-access-token", token_type: "bearer" }))
      .mockResolvedValueOnce(tokenResponse({ resultcode: "00", response: { id: "stable-naver-id" } }));
    adminGetUserById.mockClear();
    adminCreateUser.mockClear();
    adminGenerateLink.mockClear();

    const limited = await edgeHandler(edgeRequest(exchangeBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("91");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(edgeRpc.mock.calls.map(([name]) => name)).toEqual([
      "consume_oauth_naver_rate_limit",
      "consume_oauth_naver_state",
      "consume_oauth_naver_subject_rate_limit",
    ]);
    expect(adminGetUserById).not.toHaveBeenCalled();
    expect(adminCreateUser).not.toHaveBeenCalled();
    expect(adminGenerateLink).not.toHaveBeenCalled();
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

  test("accepts only the SDK hashed magic-link token, never action-link or raw OTP material", async () => {
    adminGenerateLink.mockResolvedValueOnce({
      data: {
        properties: {
          action_link: "https://auth.invalid/verify?type=magiclink&token=raw-url-token",
          email_otp: "123456",
          verification_type: "magiclink",
        },
      },
      error: null,
    });

    const response = await edgeHandler(edgeRequest(exchangeBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "naver_session_unavailable" });
    expect(edgeSource).toContain("properties.hashed_token");
    expect(edgeSource).not.toContain("properties.action_link");
    expect(edgeSource).not.toContain("properties.email_otp");
  });

  test("binds the generated magic link to the exact claimed subject user", async () => {
    adminGenerateLink.mockResolvedValueOnce({
      data: {
        user: { id: CREATED_USER_ID },
        properties: {
          hashed_token: "wrong-user-hash",
          verification_type: "magiclink",
        },
      },
      error: null,
    });

    const response = await edgeHandler(edgeRequest(exchangeBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "naver_session_unavailable" });
  });

  test("claims a subject before creating one account without email linking and binds afterward", async () => {
    edgeRpc.mockImplementation(async (name: string) => {
      if (name === "consume_oauth_naver_rate_limit") {
        return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
      }
      if (name === "consume_oauth_naver_state") return { data: true, error: null };
      if (name === "consume_oauth_naver_subject_rate_limit") {
        return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
      }
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
    adminGenerateLink.mockResolvedValueOnce({
      data: {
        user: { id: CREATED_USER_ID },
        properties: {
          hashed_token: "magic-hash",
          verification_type: "magiclink",
        },
      },
      error: null,
    });

    const response = await edgeHandler(edgeRequest(exchangeBody));

    expect(response.status).toBe(200);
    expect(adminGetUserById).not.toHaveBeenCalled();
    expect(adminCreateUser).toHaveBeenCalledTimes(1);
    const createArgs = adminCreateUser.mock.calls[0]?.[0] as Record<string, unknown>;
    const claimArgs = edgeRpc.mock.calls[3]?.[1] as Record<string, unknown>;
    expect(createArgs.email).toBe(`${claimArgs.p_subject_hash}@naver.invalid`);
    expect(createArgs.email).not.toBe("must-not-link@example.com");
    expect(JSON.stringify(createArgs)).not.toContain("new-stable-naver-id");
    expect(JSON.stringify(createArgs)).not.toContain("must-not-store");
    const names = edgeRpc.mock.calls.map(([name]) => name);
    expect(names).toEqual([
      "consume_oauth_naver_rate_limit",
      "consume_oauth_naver_state",
      "consume_oauth_naver_subject_rate_limit",
      "claim_oauth_naver_identity",
      "bind_oauth_naver_identity",
    ]);
    expect(claimArgs).toEqual({
      p_subject_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_claim_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(claimArgs)).not.toContain("new-stable-naver-id");
    expect(edgeRpc.mock.invocationCallOrder[3]).toBeLessThan(adminCreateUser.mock.invocationCallOrder[0]!);
    expect(adminCreateUser.mock.invocationCallOrder[0]).toBeLessThan(edgeRpc.mock.invocationCallOrder[4]!);
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
    expect(crossedBinding.status).toBe(403);

    const loopback = await edgeHandler(edgeRequest(
      { action: "start", redirect_uri: "http://localhost:8081/oauth-callback" },
      { origin: "http://localhost:8081" },
    ));
    expect(loopback.status).toBe(403);

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
    expect(edgeSource).toContain("jsr:@supabase/supabase-js@2.106.1");
    expect(edgeSource).toContain("UPSTREAM_TIMEOUT_MS = 5_000");
    expect(edgeSource).toContain("redirect: 'error'");
    expect(edgeSource).toContain("readJsonObject(req, OAUTH_JSON_BODY_LIMIT_BYTES)");
    expect(edgeSource).toContain("REQUEST_BODY_TIMEOUT_MS = 3_000");
    expect(edgeSource).toMatch(/UPSTREAM_BODY_LIMIT_BYTES\s*=\s*64 \* 1024/);
    expect(edgeSource).toContain("new Uint8Array(options.limit)");
    expect(edgeSource).not.toMatch(/const chunks\s*:/);
    expect(edgeSource).toContain("request_content_length_mismatch");
    expect(edgeSource).toContain("keys.has(key)");
    expect(edgeSource).not.toMatch(/\.auth\.admin\.listUsers\s*\(/);
    expect(edgeSource).not.toContain("record.email");
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

function clientSession(userId: string, sessionId: string) {
  return {
    access_token: `header.${Buffer.from(JSON.stringify({
      sub: userId,
      session_id: sessionId,
    })).toString("base64url")}.signature`,
    user: { id: userId },
  };
}

function installWeb(storage: MemoryStorage) {
  const authStorage = memoryStorage();
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
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: authStorage,
  });
  return location;
}

function uninstallWeb(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

describe("Naver client state capability", () => {
  test("keeps the Pages build disabled until the operator supplies both Naver values", () => {
    expect(webDeploySource).toContain(
      "EXPO_PUBLIC_ENABLE_NAVER: ${{ vars.EXPO_PUBLIC_ENABLE_NAVER || 'false' }}",
    );
    expect(webDeploySource).toContain(
      "EXPO_PUBLIC_NAVER_CLIENT_ID: ${{ vars.EXPO_PUBLIC_NAVER_CLIENT_ID }}",
    );
    expect(webDeploySource).not.toContain(
      "EXPO_PUBLIC_ENABLE_NAVER: ${{ vars.EXPO_PUBLIC_ENABLE_NAVER || 'true' }}",
    );
  });

  beforeEach(() => {
    mockGetEnv.mockReturnValue(enabledClientEnv);
    __setSupabaseClientForTests(null);
  });

  afterEach(() => {
    uninstallWeb();
    __setSupabaseClientForTests(null);
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
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
      data: {
        user: { id: "client-user" },
        session: clientSession("client-user", "client-session"),
      },
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

  test.each([
    ["missing session", null],
    ["mismatched session user", clientSession("other-user", "other-session")],
  ])("rejects a Naver OTP result with %s", async (_case, session) => {
    const storage = memoryStorage();
    installWeb(storage);
    const state = "c".repeat(64);
    storage.setItem(
      "secondB_naver_oauth_state",
      JSON.stringify({ state, redirectUri: PRODUCTION_REDIRECT }),
    );
    const invoke = jest.fn().mockResolvedValue({
      data: { token_hash: "client-magic-hash" },
      error: null,
    });
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: { id: "client-user" }, session },
      error: null,
    });
    const getSession = jest.fn().mockResolvedValue({
      data: { session },
      error: null,
    });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseClientForTests({
      functions: { invoke },
      auth: { verifyOtp, getSession, signOut },
    } as never);

    await expect(completeNaverOAuth({ code: "valid-code", state }))
      .rejects.toThrow("Naver sign-in could not be completed.");
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

  test("the callback route never forwards an authorization code through a custom scheme", () => {
    expect(callbackSource).not.toContain("buildNativeNaverCallbackUrl");
    expect(callbackSource).not.toContain("isNativeNaverCallbackState");
    expect(callbackSource).not.toContain("window.location.replace");
    expect(callbackSource).toContain('Platform.OS !== "web"');
  });

  test("the callback route scrubs code and state before branching or awaiting exchange", () => {
    const readSearchAt = callbackSource.indexOf("new URLSearchParams(window.location.search)");
    const scrubAt = callbackSource.indexOf("window.history.replaceState");
    const providerBranchAt = callbackSource.indexOf('params.get("error")');
    const exchangeAt = callbackSource.indexOf("await completeNaverOAuth");

    expect(readSearchAt).toBeGreaterThan(-1);
    expect(scrubAt).toBeGreaterThan(readSearchAt);
    expect(scrubAt).toBeLessThan(providerBranchAt);
    expect(scrubAt).toBeLessThan(exchangeAt);
    expect(callbackSource).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:code|state|search|params)/);
    expect(callbackSource).not.toMatch(/console\.(?:log|warn|error)/);
  });

  test("wraps OTP transport failures without exposing credential-bearing SDK detail", async () => {
    const storage = memoryStorage();
    installWeb(storage);
    const state = "9".repeat(64);
    storage.setItem(
      "secondB_naver_oauth_state",
      JSON.stringify({ state, redirectUri: PRODUCTION_REDIRECT }),
    );
    const invoke = jest.fn().mockResolvedValue({
      data: { token_hash: "client-magic-hash" },
      error: null,
    });
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("raw SDK request detail with credential material"),
    });
    __setSupabaseClientForTests({ functions: { invoke }, auth: { verifyOtp } } as never);

    const error = await completeNaverOAuth({ code: "valid-code", state }).catch(
      (caught: unknown) => caught,
    );

    expect((error as Error).message).toBe("Naver sign-in could not be completed.");
    expect((error as Error).message).not.toContain("credential");
  });

  test("removes the exact installed session when OTP returns an error and stable session", async () => {
    const storage = memoryStorage();
    installWeb(storage);
    const state = "8".repeat(64);
    storage.setItem(
      "secondB_naver_oauth_state",
      JSON.stringify({ state, redirectUri: PRODUCTION_REDIRECT }),
    );
    const invoke = jest.fn().mockResolvedValue({
      data: { token_hash: "client-magic-hash" },
      error: null,
    });
    const session = clientSession("client-user", "client-session");
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: { id: "client-user" }, session },
      error: new Error("raw SDK request detail with credential material"),
    });
    const getSession = jest.fn().mockResolvedValue({ data: { session }, error: null });
    const signOut = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseClientForTests({
      functions: { invoke },
      auth: { verifyOtp, getSession, signOut },
    } as never);

    await expect(completeNaverOAuth({ code: "valid-code", state }))
      .rejects.toThrow("Naver sign-in could not be completed.");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("the public enable flag gates web start and callback exchange", async () => {
    const storage = memoryStorage();
    installWeb(storage);
    expect(isNaverEnabled()).toBe(true);
    mockGetEnv.mockReturnValue({
      ...enabledClientEnv,
      EXPO_PUBLIC_ENABLE_NAVER: false,
    });
    expect(isNaverEnabled()).toBe(false);
    const state = "f".repeat(64);
    storage.setItem(
      "secondB_naver_oauth_state",
      JSON.stringify({ state, redirectUri: PRODUCTION_REDIRECT }),
    );
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("server gate should not be reached"),
    });
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    await expect(completeNaverOAuth({ code: "valid-code", state }))
      .rejects.toThrow("Naver sign-in could not be completed.");
    expect(invoke).not.toHaveBeenCalled();
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
