import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

jest.mock("expo-linking", () => ({
  createURL: jest.fn(() => "secondbrain:///"),
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));

import { __resetAuthStorageRuntimeForTests } from "../../auth/session-mutation";
import { sendPasswordResetEmail, signInWithProvider } from "../auth";
import { __setSupabaseClientForTests } from "../client";

const REPO_ROOT = resolve(__dirname, "../../../..");
const BRIDGE_URL = "https://simon-yhkim.github.io/2nd-B/auth-bridge.html";

type BridgeEvent =
  | { type: "scrub"; value: string }
  | { type: "redirect"; value: string };

type MockAuth = {
  resetPasswordForEmail?: jest.Mock;
  signInWithOAuth?: jest.Mock;
};

function readRepoFile(pathname: string): string {
  return readFileSync(resolve(REPO_ROOT, pathname), "utf8");
}

function bridgeScript(): string {
  const html = readRepoFile("public/auth-bridge.html");
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error("auth bridge must contain one inline script");
  return match[1].replace(/\r\n/g, "\n");
}

function executeBridge(href: string, rejectHistoryMutation = false): BridgeEvent[] {
  const parsed = new URL(href);
  const events: BridgeEvent[] = [];
  const location = {
    href,
    origin: parsed.origin,
    pathname: parsed.pathname,
    replace: (value: string) => events.push({ type: "redirect", value }),
  };
  const history = {
    replaceState: (_state: unknown, _title: string, value: string) => {
      if (rejectHistoryMutation) throw new Error("history unavailable");
      events.push({ type: "scrub", value });
    },
  };

  runInNewContext(bridgeScript(), {
    window: { location, history },
    URL,
    URLSearchParams,
    encodeURIComponent,
  });
  return events;
}

function installClient(auth: MockAuth): void {
  __setSupabaseClientForTests(
    { auth } as unknown as Parameters<typeof __setSupabaseClientForTests>[0],
  );
}

describe("Supabase auth redirect boundary", () => {
  afterEach(() => {
    jest.clearAllMocks();
    __setSupabaseClientForTests(null);
    __resetAuthStorageRuntimeForTests();
  });

  test("production allowlist contains only exact HTTPS app and bridge URLs", () => {
    const config = readRepoFile("supabase/config.toml");
    const block = config.match(/^\s*additional_redirect_urls\s*=\s*\[([\s\S]*?)^\s*\]/m)?.[1];
    const allowlist = [...(block ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    expect(block).toBeDefined();
    expect(allowlist).toEqual([
      "https://simon-yhkim.github.io/2nd-B/",
      "https://simon-yhkim.github.io/2nd-B/sign-up",
      "https://simon-yhkim.github.io/2nd-B/reset-password",
      `${BRIDGE_URL}?to=root`,
      `${BRIDGE_URL}?to=reset-password`,
    ]);
    expect(allowlist.join("\n")).not.toMatch(/secondbrain:|localhost|127\.0\.0\.1|\/\*\*/i);
  });

  test("bridge is self-contained and pins its inline script with a strict CSP", () => {
    const html = readRepoFile("public/auth-bridge.html");
    const script = bridgeScript();
    const digest = createHash("sha256").update(script).digest("base64");

    expect(html).toContain(`script-src 'sha256-${digest}'`);
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toMatch(/<(?:script|img|link)\b[^>]+(?:src|href)=/i);
    expect((html.match(/<script>/gi) ?? [])).toHaveLength(1);
    expect(script).not.toMatch(/\bconsole\s*\.|\b(?:local|session)Storage\b|error_description/i);
  });

  test("recovery mail is OTP-only and contains no classic link", () => {
    const template = readRepoFile("supabase/templates/recovery.html");

    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    expect(template).not.toMatch(/<a\b/i);
  });

  test.each([
    ["root", "secondbrain:///?code=pkce_abc-123"],
    ["reset-password", "secondbrain:///reset-password?code=pkce_abc-123"],
  ])("forwards a bounded PKCE code only to the exact %s destination", (target, expected) => {
    expect(executeBridge(`${BRIDGE_URL}?to=${target}&code=pkce_abc-123`)).toEqual([
      { type: "scrub", value: BRIDGE_URL },
      { type: "redirect", value: expected },
    ]);
  });

  test("forwards only a bounded safe error code and drops descriptions", () => {
    expect(
      executeBridge(
        `${BRIDGE_URL}?to=reset-password#error_code=otp_expired&error_description=sensitive`,
      ),
    ).toEqual([
      { type: "scrub", value: BRIDGE_URL },
      {
        type: "redirect",
        value: "secondbrain:///reset-password?error_code=otp_expired",
      },
    ]);
  });

  test("canonicalizes GoTrue's identical query and fragment error code", () => {
    expect(
      executeBridge(
        `${BRIDGE_URL}?to=root&error_code=oauth_failed#error_code=oauth_failed`,
      ),
    ).toEqual([
      { type: "scrub", value: BRIDGE_URL },
      { type: "redirect", value: "secondbrain:///?error_code=oauth_failed" },
    ]);
  });

  test("navigates to a scrubbed HTTPS URL when history replacement is unavailable", () => {
    expect(executeBridge(`${BRIDGE_URL}?to=root&code=valid-code`, true)).toEqual([
      { type: "redirect", value: BRIDGE_URL },
    ]);
  });

  test.each([
    "access_token",
    "refresh_token",
    "provider_token",
    "provider_refresh_token",
    "id_token",
    "token",
    "token_hash",
  ])("rejects a callback carrying %s without navigating", (key) => {
    expect(
      executeBridge(`${BRIDGE_URL}?to=root&code=valid-code#${key}=attacker-secret`),
    ).toEqual([{ type: "scrub", value: BRIDGE_URL }]);
  });

  test.each([
    `${BRIDGE_URL}?to=unknown&code=valid-code`,
    `${BRIDGE_URL}?to=sign-up&code=valid-code`,
    `${BRIDGE_URL}?to=constructor&code=valid-code`,
    `${BRIDGE_URL}?to=__proto__&code=valid-code`,
    `${BRIDGE_URL}?to=root&to=sign-up&code=valid-code`,
    `${BRIDGE_URL}?to=root&code=one&code=two`,
    `${BRIDGE_URL}?to=root&code=${"a".repeat(2049)}`,
    `${BRIDGE_URL}?to=root&code=valid&error_code=denied`,
    `${BRIDGE_URL}?to=root&error_code=one#error_code=two`,
    `${BRIDGE_URL}?to=root&error_code=${"a".repeat(129)}`,
  ])("rejects an unbounded or ambiguous callback: %s", (url) => {
    expect(executeBridge(url)).toEqual([{ type: "scrub", value: BRIDGE_URL }]);
  });

  test("native OAuth ignores redirect overrides and waits for the fixed app scheme", async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({
      data: { url: "https://provider.example/authorize" },
      error: null,
    });
    const openAuthSessionAsync = (
      jest.requireMock("expo-web-browser") as { openAuthSessionAsync: jest.Mock }
    ).openAuthSessionAsync;
    openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
    installClient({ signInWithOAuth });

    await signInWithProvider("google", "secondbrain://attacker-controlled");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${BRIDGE_URL}?to=root`,
        skipBrowserRedirect: true,
      },
    });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://provider.example/authorize",
      "secondbrain:///",
    );
  });

  test("native password recovery requests the exact HTTPS reset bridge", async () => {
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null });
    installClient({ resetPasswordForEmail });

    await sendPasswordResetEmail(" person@example.com ");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
      redirectTo: `${BRIDGE_URL}?to=reset-password`,
    });
  });
});
