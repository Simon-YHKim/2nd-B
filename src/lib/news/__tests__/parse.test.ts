// Wave 2 — pure RSS/Atom parsing against fixture strings (no network).

import { parseFeed, MAX_XML_CHARS } from "../parse";

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Sample Feed</title>
    <item>
      <title>First &amp; foremost</title>
      <link>https://example.com/a</link>
      <description><![CDATA[<p>Body <b>one</b></p>]]></description>
      <pubDate>Wed, 11 Jun 2026 09:00:00 +0900</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/b</link>
      <description>Plain body two</description>
      <pubDate>not a date</pubDate>
    </item>
    <item>
      <title>No link is dropped</title>
      <description>orphan</description>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Sample</title>
  <entry>
    <title>Atom entry</title>
    <link rel="alternate" href="https://example.com/atom-a"/>
    <summary>Atom summary text</summary>
    <updated>2026-06-11T00:00:00Z</updated>
  </entry>
</feed>`;

describe("parseFeed (RSS is the ground truth; reshape only, never invent)", () => {
  test("parses RSS 2.0 items, stamps source, strips HTML, normalizes dates", () => {
    const items = parseFeed("yonhap", RSS_FIXTURE);
    expect(items).toHaveLength(2); // the link-less item is dropped
    expect(items[0]).toEqual({
      source: "yonhap",
      title: "First & foremost",
      url: "https://example.com/a",
      publishedAt: new Date("Wed, 11 Jun 2026 09:00:00 +0900").toISOString(),
      snippet: "Body one",
    });
    // Unparseable date -> null, row still survives.
    expect(items[1].publishedAt).toBeNull();
    expect(items[1].url).toBe("https://example.com/b");
  });

  test("parses Atom entries via rel=alternate link href", () => {
    const items = parseFeed("bbc-world", ATOM_FIXTURE);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "bbc-world",
      title: "Atom entry",
      url: "https://example.com/atom-a",
      snippet: "Atom summary text",
      publishedAt: "2026-06-11T00:00:00.000Z",
    });
  });

  test("malformed / empty / non-feed XML yields an empty list (never throws)", () => {
    expect(parseFeed("x", "")).toEqual([]);
    expect(parseFeed("x", "not xml <<<")).toEqual([]);
    expect(parseFeed("x", "<html><body>nope</body></html>")).toEqual([]);
    // @ts-expect-error guard against non-string input at runtime
    expect(parseFeed("x", null)).toEqual([]);
  });

  test("clamps the item count so a hostile feed cannot flood the cache", () => {
    const many = Array.from(
      { length: 80 },
      (_, i) => `<item><title>t${i}</title><link>https://e.com/${i}</link></item>`,
    ).join("");
    const items = parseFeed("flood", `<rss><channel>${many}</channel></rss>`);
    expect(items.length).toBeLessThanOrEqual(50);
  });

  test("drops items whose link is not an http(s) URL (javascript:/data:/relative/guid)", () => {
    const xml = `<rss><channel>
      <item><title>js payload</title><link>javascript:alert(1)</link></item>
      <item><title>data uri</title><link>data:text/html,hi</link></item>
      <item><title>relative</title><link>/local/path</link></item>
      <item><title>opaque guid</title><guid>1a2b-3c4d-not-a-url</guid></item>
      <item><title>real one</title><link>https://example.com/ok</link></item>
    </channel></rss>`;
    const items = parseFeed("safe", xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "real one", url: "https://example.com/ok" });
  });

  test("bounds raw input size before parsing so an oversized feed cannot OOM", () => {
    // A complete leading item, then inter-element WHITESPACE that pushes the doc
    // past the cap. The slice lands inside that whitespace, so the leading item
    // (fully closed before the gap) survives and the giant tail is never parsed.
    const head = `<rss><channel><item><title>top</title><link>https://e.com/top</link></item>`;
    const padding = " ".repeat(MAX_XML_CHARS + 1000);
    const oversized = `${head}${padding}</channel></rss>`;
    expect(oversized.length).toBeGreaterThan(MAX_XML_CHARS);
    const items = parseFeed("huge", oversized);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://e.com/top");
  });
});
