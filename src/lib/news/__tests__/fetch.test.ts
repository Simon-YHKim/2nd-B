// Codex P2 #4 — platform-aware fetch routing + SSRF allowlist (pure parts).

import { resolveFetchPlan } from "../fetch";
import { isAllowedFeedUrl, NEWS_FEED_URLS, getFeedByUrl, NEWS_FEEDS } from "../feeds";

describe("resolveFetchPlan (native fetches directly; web routes via proxy)", () => {
  const url = "https://www.yna.co.kr/rss/news.xml";

  test("native (web=false) -> direct fetch of the feed url", () => {
    expect(resolveFetchPlan(url, false)).toEqual({ mode: "direct", url });
  });

  test("web (web=true) -> proxy route carrying the feed url", () => {
    expect(resolveFetchPlan(url, true)).toEqual({ mode: "proxy", feedUrl: url });
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
