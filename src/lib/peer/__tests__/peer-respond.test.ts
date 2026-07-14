// A consent withdrawal must never fail open.
//
// The informant's withdraw button used to call the edge function and set the phase
// to "withdrawn" unconditionally, because callPeerRespond returned `await res.json()`
// without ever looking at res.ok. So a 404 not_found / 500 withdraw_failed still told
// the informant their consent was revoked -- while their observation stayed live in
// the aggregate (0064 filters on withdrawn_at IS NULL, and withdrawn_at was never set).
//
// peer-respond/index.ts:100 literally says "Check every write: a silent failure here
// would..." The server was right. The client wasn't listening.

import { callPeerRespond, PeerRespondError } from "../peer-respond";

jest.mock("@/lib/env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

function mockFetch(status: number, body: unknown | "unparseable"): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === "unparseable") throw new SyntaxError("Unexpected token");
      return body;
    },
  }) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("callPeerRespond", () => {
  test("a successful withdraw resolves with the body", async () => {
    mockFetch(200, { ok: true, status: "withdrawn" });
    await expect(callPeerRespond({ action: "withdraw", token: "t" })).resolves.toEqual({
      ok: true,
      status: "withdrawn",
    });
  });

  // The regressions. Each of these used to RESOLVE, and the screen then reported
  // "철회됐어요".
  test.each([
    [500, { error: "withdraw_failed" }, "withdraw_failed"],
    [500, { error: "lookup_failed" }, "lookup_failed"],
    [404, { error: "not_found" }, "not_found"],
    [400, { error: "bad_token" }, "bad_token"],
    [409, { error: "already_responded" }, "already_responded"],
    [405, { error: "method_not_allowed" }, "method_not_allowed"],
  ])("HTTP %i (%p) rejects instead of looking like success", async (status, body, code) => {
    mockFetch(status, body);
    const err = await callPeerRespond({ action: "withdraw", token: "t" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PeerRespondError);
    expect((err as PeerRespondError).status).toBe(status);
    expect((err as PeerRespondError).code).toBe(code);
  });

  test("a 2xx with an unreadable body rejects -- we cannot claim the write happened", async () => {
    mockFetch(200, "unparseable");
    const err = await callPeerRespond({ action: "withdraw", token: "t" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PeerRespondError);
    expect((err as PeerRespondError).code).toBe("unreadable_body");
  });

  test("a network failure propagates rather than being swallowed", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as unknown as typeof fetch;
    await expect(callPeerRespond({ action: "withdraw", token: "t" })).rejects.toThrow("Network request failed");
  });

  test("posts to the peer-respond edge function with the anon key and no session", async () => {
    mockFetch(200, { ok: true });
    await callPeerRespond({ action: "withdraw", token: "tok" });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/functions/v1/peer-respond");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ action: "withdraw", token: "tok" });
  });
});

// The screen is the other half of the fix: callPeerRespond throwing is only useful if
// withdraw() stops setting the phase unconditionally. There is no RN renderer in this
// jest setup (testEnvironment: node), so assert the source shape instead -- the same
// approach the repo's other screen guards use.
describe("the informant screen honours the failure", () => {
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "../../../app/peer/[token].tsx"),
    "utf8",
  ) as string;

  test("withdraw() gates setPhase on the result and surfaces an error", () => {
    const body = src.slice(src.indexOf("async function withdraw()"));
    const fn = body.slice(0, body.indexOf("\n  }") + 4);
    expect(fn).toMatch(/if \(r\.ok\) setPhase\("withdrawn"\)/);
    expect(fn).toMatch(/setError\(t\("withdrawError"\)\)/);
    expect(fn).toMatch(/catch/);
    // The old bug, verbatim: an unconditional setPhase right after the await.
    expect(fn).not.toMatch(/await callPeerRespond\([^)]*\);\s*\n\s*setPhase\("withdrawn"\);/);
  });

  test("the screen no longer carries its own unchecked fetch", () => {
    expect(src).not.toMatch(/async function callPeerRespond/);
    expect(src).toMatch(/import \{ callPeerRespond \} from "@\/lib\/peer\/peer-respond"/);
  });
});
