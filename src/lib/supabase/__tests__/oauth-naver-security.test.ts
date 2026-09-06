import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getEnv } from "@/lib/env";
import { __setSupabaseClientForTests } from "../client";
import {
  completeNaverOAuth,
  isNaverEnabled,
  signInWithNaver,
} from "../auth";

jest.mock("@/lib/env", () => ({ getEnv: jest.fn() }));

const mockGetEnv = getEnv as jest.MockedFunction<typeof getEnv>;
const enabledEnv = {
  EXPO_PUBLIC_NAVER_CLIENT_ID: "public-client-id",
  EXPO_PUBLIC_ENABLE_NAVER: true,
} as ReturnType<typeof getEnv>;

function setWebRuntime(): Map<string, string> {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        origin: "https://simon-yhkim.github.io",
        pathname: "/2nd-B/sign-in",
        href: "",
      },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  return values;
}

function setNativeRuntime(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
}

afterEach(() => {
  __setSupabaseClientForTests(null);
  setNativeRuntime();
  jest.clearAllMocks();
});

describe("Naver client boundary", () => {
  test("the public enable flag gates every platform and native stays unavailable", () => {
    mockGetEnv.mockReturnValue(enabledEnv);

    setNativeRuntime();
    expect(isNaverEnabled()).toBe(false);

    setWebRuntime();
    expect(isNaverEnabled()).toBe(true);

    mockGetEnv.mockReturnValue({
      ...enabledEnv,
      EXPO_PUBLIC_ENABLE_NAVER: false,
    });
    expect(isNaverEnabled()).toBe(false);
  });

  test("native start fails before opening a browser or invoking the edge function", async () => {
    mockGetEnv.mockReturnValue(enabledEnv);
    setNativeRuntime();
    const invoke = jest.fn();
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    await expect(signInWithNaver()).rejects.toThrow("Naver login is available on web only.");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("native callback completion fails before edge exchange", async () => {
    mockGetEnv.mockReturnValue(enabledEnv);
    setNativeRuntime();
    const invoke = jest.fn();
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    await expect(
      completeNaverOAuth({ code: "provider-code", state: "a".repeat(32) }),
    ).rejects.toThrow("Naver login is available on web only.");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("web callback rejects malformed state and code before edge exchange", async () => {
    mockGetEnv.mockReturnValue(enabledEnv);
    const values = setWebRuntime();
    values.set("secondB_naver_oauth_state", "a".repeat(32));
    const invoke = jest.fn();
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    await expect(
      completeNaverOAuth({ code: "provider code with spaces", state: "a".repeat(32) }),
    ).rejects.toThrow("Naver sign-in could not be completed.");
    await expect(
      completeNaverOAuth({ code: "provider-code", state: "native." + "a".repeat(32) }),
    ).rejects.toThrow("Naver sign-in could not be completed.");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("web callback does not surface raw edge errors", async () => {
    mockGetEnv.mockReturnValue(enabledEnv);
    const values = setWebRuntime();
    const state = "a".repeat(32);
    values.set("secondB_naver_oauth_state", state);
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("sensitive provider response"),
    });
    __setSupabaseClientForTests({ functions: { invoke } } as never);

    const error = await completeNaverOAuth({ code: "provider-code", state }).catch(
      (caught: unknown) => caught,
    );

    expect((error as Error).message).toBe("Naver sign-in could not be completed.");
    expect((error as Error).message).not.toContain("provider response");
  });
});

const root = join(__dirname, "..", "..", "..", "..");
const edgeSource = readFileSync(
  join(root, "supabase", "functions", "oauth-naver", "index.ts"),
  "utf8",
);
const edgeCode = edgeSource
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

describe("oauth-naver edge web-only boundary", () => {
  test("missing or unlisted Origin is rejected before feature flags and provider calls", () => {
    expect(edgeCode).not.toMatch(/return ALLOWED_ORIGINS\.has\(origin\) \? origin : 'null'/);
    expect(edgeCode).toMatch(/const origin = allowedOrigin\(req\);/);
    expect(edgeCode).toMatch(/if \(!origin\) return jsonResponse\(req, \{ error: 'origin_not_allowed' \}, 403\);/);

    const originGate = edgeCode.indexOf("if (!origin)");
    const enableGate = edgeCode.indexOf("ENABLE_NAVER_OAUTH");
    const providerCall = edgeCode.indexOf("await fetch(tokenUrl");
    expect(originGate).toBeGreaterThan(-1);
    expect(originGate).toBeLessThan(enableGate);
    expect(originGate).toBeLessThan(providerCall);
  });

  test("redirect URI and state must match the exact allowed web flow", () => {
    expect(edgeCode).toMatch(/const expectedRedirectUri = NAVER_REDIRECT_URIS\.get\(origin\);/);
    expect(edgeCode).toMatch(/redirectUri !== expectedRedirectUri/);
    expect(edgeCode).toMatch(/!NAVER_STATE_PATTERN\.test\(state\)/);
    expect(edgeCode).not.toContain("native.");

    const validation = edgeCode.indexOf("redirectUri !== expectedRedirectUri");
    const providerCall = edgeCode.indexOf("await fetch(tokenUrl");
    expect(validation).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(providerCall);
  });

  test("CORS only reflects an exact allowed origin and never emits null as an origin", () => {
    expect(edgeCode).toMatch(/if \(origin\) headers\['access-control-allow-origin'\] = origin;/);
    expect(edgeCode).not.toMatch(/'access-control-allow-origin':\s*'null'/);
    expect(edgeCode).not.toMatch(/'access-control-allow-origin':\s*'\*'/);
  });

  test("reads a small strict JSON object without unbounded req.json()", () => {
    expect(edgeCode).not.toMatch(/await req\.json\(\)/);
    expect(edgeCode).toMatch(/NAVER_REQUEST_MAX_BYTES = 4 \* 1024/);
    expect(edgeCode).toMatch(/mediaType !== 'application\/json'/);
    expect(edgeCode).toMatch(/Number\(declaredLength\) > NAVER_REQUEST_MAX_BYTES/);
    expect(edgeCode).toMatch(/size > NAVER_REQUEST_MAX_BYTES/);
    expect(edgeCode).toMatch(/new TextDecoder\('utf-8', \{ fatal: true \}\)/);
    expect(edgeCode).toMatch(/Promise\.race\(\[read\(\), deadline\]\)/);
    expect(edgeCode).toMatch(/await reader\.cancel\(\)/);
    expect(edgeCode).toMatch(/Array\.isArray\(parsed\)/);
    expect(edgeCode).toMatch(/keys\.join\(','\) !== 'code,redirect_uri,state'/);

    const bodyValidation = edgeCode.indexOf("await readStrictRequestBody(req)");
    const providerCall = edgeCode.indexOf("await fetch(tokenUrl");
    expect(bodyValidation).toBeGreaterThan(-1);
    expect(bodyValidation).toBeLessThan(providerCall);
  });
});
