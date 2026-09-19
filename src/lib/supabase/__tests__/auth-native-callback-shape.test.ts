// U3 (sec-port 2026-09-17): custom URL schemes are not exclusive on mobile, so
// the app accepts a native auth callback only in the exact shape
// public/auth-bridge.html emits, and no callback error carries provider text.
// Intent ported from fix/security-auth-pkce-260906 (ccd2211f) onto the current
// HTTPS bridge + PKCE design. The old direct custom-scheme redirect stays gone.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { __setSupabaseClientForTests } from "../client";
import { consumeAuthCallbackUrl } from "../auth";
import { __resetAuthStorageRuntimeForTests } from "../../auth/session-mutation";
import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  __resetRecoveryProofStorageQueueForTests,
  createRecoveryPending,
  type RecoveryPending,
} from "../../auth/recovery-proof-store";

const GENERIC = "Authentication callback could not be completed.";

type AuthMock = {
  exchangeCodeForSession?: jest.Mock;
  getSession?: jest.Mock;
  signOut?: jest.Mock;
};

function installClient(auth: AuthMock): void {
  __setSupabaseClientForTests({ auth } as never);
}

function session(userId: string, sessionId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId }))
    .toString("base64url");
  return { access_token: `header.${payload}.signature`, user: { id: userId } };
}

// React Native defines `window` but no `document`, and auth.ts keys its web
// branch on both, so this runs the native callback branch. The recovery marker
// store reads `localStorage` here; an in-memory map stands in for the encrypted
// native store.
function installNativeMarkerStore(values = new Map<string, string>()): Map<string, string> {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}

// Runs the real inline script of public/auth-bridge.html and returns the app
// URL it forwards to, so the shape check is held to what the bridge emits.
function bridgeForward(href: string): string | null {
  const html = readFileSync(resolve(__dirname, "../../../../public/auth-bridge.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error("auth bridge must contain one inline script");
  const parsed = new URL(href);
  let forwarded: string | null = null;
  runInNewContext(script, {
    window: {
      location: {
        href,
        origin: parsed.origin,
        pathname: parsed.pathname,
        replace: (value: string) => {
          forwarded = value;
        },
      },
      history: { replaceState: () => undefined },
    },
    URL,
    URLSearchParams,
    encodeURIComponent,
  });
  return forwarded;
}

function withPending(values: Map<string, string>): RecoveryPending {
  const pending = createRecoveryPending();
  values.set(RECOVERY_PENDING_KEY, JSON.stringify(pending));
  return pending;
}

afterEach(() => {
  jest.restoreAllMocks();
  __setSupabaseClientForTests(null);
  __resetAuthStorageRuntimeForTests();
  __resetRecoveryProofStorageQueueForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { navigator?: unknown }).navigator;
});

describe("the bridge's own callbacks still work on native", () => {
  test("the root PKCE callback reaches the code exchange", async () => {
    const values = installNativeMarkerStore();
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    installClient({ exchangeCodeForSession });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///?code=pkce_abc-123"),
    ).resolves.toMatchObject({ type: null });

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce_abc-123");
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);
  });

  test("the reset-password PKCE callback completes a recovery the device owns", async () => {
    const values = installNativeMarkerStore();
    const pending = withPending(values);
    const established = session("recovery-user", "recovery-session");
    installClient({
      exchangeCodeForSession: jest.fn().mockResolvedValue({
        data: { session: established, user: established.user, redirectType: "recovery" },
        error: null,
      }),
    });

    const callback = await consumeAuthCallbackUrl(
      `secondbrain:///reset-password?code=${"a".repeat(2048)}`,
      pending,
    );

    expect(callback.recoveryProof).toEqual(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "null"));
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);
  });
});

describe("the shape check accepts every code the bridge forwards", () => {
  test.each([
    ["a short root code", "root", "pkce_abc-123"],
    ["a 2048-character root code using every symbol", "root", "A.b~c-d_9".repeat(228).slice(0, 2048)],
    ["a reset-password code", "reset-password", "0f5e2f0a-0b39-4d2e-9a5b-6f0c7a1b2c3d"],
  ])("%s", async (_label, target, code) => {
    const url = bridgeForward(
      `https://simon-yhkim.github.io/2nd-B/auth-bridge.html?to=${target}&code=${encodeURIComponent(code)}`,
    );
    expect(url).not.toBeNull();
    const values = installNativeMarkerStore();
    const pending = target === "reset-password" ? withPending(values) : undefined;
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    installClient({ exchangeCodeForSession });

    // The reset case fails later (the mock issues no recovery session); the
    // shape check is passed once the exchange runs.
    await consumeAuthCallbackUrl(url as string, pending).catch(() => undefined);

    expect(exchangeCodeForSession).toHaveBeenCalledWith(code);
  });
});

describe("anything else is refused before the quarantine write or the exchange", () => {
  test.each([
    ["a duplicate code", "secondbrain:///?code=one&code=two"],
    ["an overlong code", `secondbrain:///?code=${"a".repeat(2049)}`],
    ["a code outside the bridge alphabet", "secondbrain:///?code=abc%2Fdef"],
    ["an extra parameter", "secondbrain:///?code=abc&next=%2Fsettings"],
    ["a fragment", "secondbrain:///?code=abc#code=def"],
    ["a path the bridge never targets", "secondbrain:///oauth-return?code=abc"],
    ["the sign-up path the bridge folds into root", "secondbrain:///sign-up?code=abc"],
    ["the host form", "secondbrain://oauth-callback?code=abc"],
    ["an extra slash", "secondbrain:////?code=abc"],
    ["an upper-case scheme", "SECONDBRAIN:///?code=abc"],
    ["leading whitespace", " secondbrain:///?code=abc"],
    ["another app scheme", "exp://127.0.0.1:8081/--/?code=abc"],
    ["a web URL", "https://simon-yhkim.github.io/2nd-B/?code=abc"],
    ["no code at all", "secondbrain:///"],
  ])("%s", async (_label, url) => {
    const values = installNativeMarkerStore();
    const exchangeCodeForSession = jest.fn();
    installClient({ exchangeCodeForSession });

    await expect(consumeAuthCallbackUrl(url)).rejects.toThrow(GENERIC);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);
  });

  test("an owned recovery binds the callback to the reset-password destination", async () => {
    const values = installNativeMarkerStore();
    const pending = withPending(values);
    const exchangeCodeForSession = jest.fn();
    installClient({ exchangeCodeForSession });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///?code=pkce_abc-123", pending),
    ).rejects.toThrow(GENERIC);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    // A refused link releases only this operation's marker, like any other
    // callback that established no session.
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("a malformed reset-password link releases the owned marker without exchanging", async () => {
    const values = installNativeMarkerStore();
    const pending = withPending(values);
    const exchangeCodeForSession = jest.fn();
    installClient({ exchangeCodeForSession });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///reset-password?code=one&code=two", pending),
    ).rejects.toThrow(GENERIC);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });
});

describe("a callback error never carries provider text", () => {
  // The sign-in screen logs this message and hides a provider button when it
  // reads "not enabled", so a forged callback must not be able to choose it.
  const FORGED_DESCRIPTION = "Unsupported provider: provider is not enabled";

  test("native: a forged error description is dropped", async () => {
    installNativeMarkerStore();
    installClient({ exchangeCodeForSession: jest.fn() });

    const error = await consumeAuthCallbackUrl(
      `secondbrain:///?error_code=validation_failed&error_description=${encodeURIComponent(FORGED_DESCRIPTION)}`,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(GENERIC);
  });

  test("native: the bridge's bounded error code is refused with the same message", async () => {
    const values = installNativeMarkerStore();
    const pending = withPending(values);
    installClient({ exchangeCodeForSession: jest.fn() });

    await expect(
      consumeAuthCallbackUrl("secondbrain:///reset-password?error_code=otp_expired", pending),
    ).rejects.toThrow(new Error(GENERIC));
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("web: GoTrue's error description is dropped too", async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "https://simon-yhkim.github.io", pathname: "/2nd-B/" } },
    });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    // Web callbacks run under the cross-tab lock; without one they fail for an
    // unrelated reason and this test would prove nothing.
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async <T>(
            name: string,
            _options: { mode: "exclusive" },
            callback: (lock: { name: string; mode: "exclusive" }) => Promise<T>,
          ) => callback({ name, mode: "exclusive" }),
        },
      },
    });
    installClient({ exchangeCodeForSession: jest.fn() });

    const error = await consumeAuthCallbackUrl(
      `https://simon-yhkim.github.io/2nd-B/?error=access_denied&error_code=validation_failed&error_description=${encodeURIComponent(FORGED_DESCRIPTION)}`,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(GENERIC);
  });
});
