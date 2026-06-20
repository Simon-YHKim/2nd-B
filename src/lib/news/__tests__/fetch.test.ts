// Codex P2 #4 — platform-aware fetch routing + SSRF allowlist (pure parts)
// plus the all-feeds-failed shared-error contract for fetchFeeds().

import { resolveFetchPlan, fetchFeeds, classifyProxyInvokeError } from "../fetch";
import { isAllowedFeedUrl, NEWS_FEED_URLS, getFeedByUrl, NEWS_FEEDS } from "../feeds";

// Minimal RSS that parseFeed accepts (one item) for the "some items" case.
const RSS_ONE = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Hello</title><link>https://example.com/a</link></item>
</channel></rss>`;

describe("resolveFetchPlan (native fetches directly; web routes via proxy)", () => {
  const url = "https://www.yna.co.kr/rss/news.xml";

  test("native (web=false) -> direct fetch of the feed url", () => {
    expect(resolveFetchPlan(url, false)).toEqual({ mode: "direct", url });
  });

  test("web (web=true) -> proxy route carrying the feed url", () => {
    expect(resolveFetchPlan(url, true)).toEqual({ mode: "proxy", feedUrl: url });
  });
});

describe("classifyProxyInvokeError (proxy ran w/ feed outage vs proxy unreachable)", () => {
  test("proxy 502 (upstream feed timed out / non-OK) -> fetch_failed", () => {
    // FunctionsHttpError-shaped: the function answered, .context is the Response.
    expect(classifyProxyInvokeError({ context: { status: 502 } })).toBe("fetch_failed");
  });

  test("unreachable / not-deployed / auth (no 502) -> proxy_unavailable", () => {
    expect(classifyProxyInvokeError(new Error("Failed to fetch"))).toBe("proxy_unavailable");
    expect(classifyProxyInvokeError({ context: { status: 401 } })).toBe("proxy_unavailable");
    expect(classifyProxyInvokeError(null)).toBe("proxy_unavailable");
  });
});

describe("feeds allowlist (SSRF guard mirrored by rss-proxy)", () => {
  test("every curated feed url is on the allowlist", () => {
    for (const f of NEWS_FEEDS) expect(isAllowedFeedUrl(f.url)).toBe(true);
    expect(NEWS_FEED_URLS.length).toBe(NEWS_FEEDS.length);
  });

  test("an arbitrary / internal url is rejected (no SSRF)", () => {
    expect(isAllowedFeedUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedFeedUrl("https://evil.example.com/rss")).toBe(false);
    // A near-miss (same host, different path) is not allowed — exact match only.
    expect(isAllowedFeedUrl("https://www.yna.co.kr/rss/other.xml")).toBe(false);
  });

  test("getFeedByUrl resolves only exact-match feed urls", () => {
    expect(getFeedByUrl("https://feeds.bbci.co.uk/news/world/rss.xml")?.id).toBe("bbc-world");
    expect(getFeedByUrl("https://feeds.bbci.co.uk/news/world/rss.xml?x=1")).toBeUndefined();
  });
});

// Codex P2 #4 fix: when EVERY feed fails for the SAME reason, fetchFeeds surfaces
// that shared error so the UI tells an outage apart from a genuinely empty digest.
// Jest has no `document`, so fetch.ts takes the native direct-fetch path and we
// drive it by mocking the global fetch.
describe("fetchFeeds — all-feeds-failed shared error (Codex P2 #4)", () => {
  const ids = NEWS_FEEDS.map((f) => f.id);
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  test("every feed fetch_failed (offline/DNS down) -> error:'fetch_failed', not silent []", async () => {
    // A non-OK response makes fetchRaw return { error: "fetch_failed" }.
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const res = await fetchFeeds(ids);
    expect(res.items).toEqual([]);
    expect(res.error).toBe("fetch_failed");
  });

  test("every feed throws (network reject) -> error:'fetch_failed'", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ENOTFOUND")) as unknown as typeof fetch;
    const res = await fetchFeeds(ids);
    expect(res.items).toEqual([]);
    expect(res.error).toBe("fetch_failed");
  });

  test("a mix of failure reasons -> empty with NO error tag (can't claim one outage)", async () => {
    // First feed rejects (fetch_failed); the rest return an empty-but-OK body
    // that parses to zero items (no error). Mixed => no shared reason.
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.reject(new Error("down"));
      return Promise.resolve({ ok: true, text: () => Promise.resolve("<rss><channel></channel></rss>") });
    }) as unknown as typeof fetch;
    const res = await fetchFeeds(ids);
    expect(res.items).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  test("at least one feed returns items -> items flattened, no error", async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ ok: true, text: () => Promise.resolve(RSS_ONE) });
      return Promise.reject(new Error("down"));
    }) as unknown as typeof fetch;
    const res = await fetchFeeds(ids);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.error).toBeUndefined();
  });
});
