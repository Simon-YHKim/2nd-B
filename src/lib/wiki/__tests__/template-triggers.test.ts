import { urlMatchesTrigger, matchTemplateByUrl } from "../template-triggers";

describe("urlMatchesTrigger", () => {
  it("matches a trailing-wildcard glob", () => {
    expect(urlMatchesTrigger("https://www.youtube.com/watch?v=abc", "https://www.youtube.com/watch*")).toBe(true);
    expect(urlMatchesTrigger("https://youtu.be/abc123", "https://youtu.be/*")).toBe(true);
  });

  it("requires a full-string match, not a substring", () => {
    expect(urlMatchesTrigger("https://example.com/page", "https://example.com/page")).toBe(true);
    expect(urlMatchesTrigger("https://example.com/page/extra", "https://example.com/page")).toBe(false);
    expect(urlMatchesTrigger("https://evil.com/?to=https://example.com/page", "https://example.com/page")).toBe(false);
  });

  it("treats regex metacharacters in the glob literally (only * is a wildcard)", () => {
    expect(urlMatchesTrigger("https://a.com/x?y=1", "https://a.com/x?y=1")).toBe(true);
    // the literal '.' must not behave like a regex 'any char'
    expect(urlMatchesTrigger("https://aXcom/x?y=1", "https://a.com/x?y=1")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(urlMatchesTrigger("https://WWW.YouTube.com/watch?v=x", "https://www.youtube.com/watch*")).toBe(true);
  });

  it("never matches a blank glob", () => {
    expect(urlMatchesTrigger("https://x.com", "")).toBe(false);
    expect(urlMatchesTrigger("https://x.com", "   ")).toBe(false);
  });
});

describe("matchTemplateByUrl", () => {
  const tpl = (slug: string, triggers: string[]) => ({ slug, triggers });

  it("returns the first template whose trigger matches", () => {
    const templates = [
      tpl("news", ["https://news.com/*"]),
      tpl("yt", ["https://www.youtube.com/watch*", "https://youtu.be/*"]),
    ];
    expect(matchTemplateByUrl("https://youtu.be/abc", templates)?.slug).toBe("yt");
  });

  it("returns null when nothing matches", () => {
    expect(matchTemplateByUrl("https://other.com/x", [tpl("news", ["https://news.com/*"])])).toBeNull();
  });

  it("returns null for a blank url", () => {
    expect(matchTemplateByUrl("  ", [tpl("news", ["https://news.com/*"])])).toBeNull();
  });

  it("skips blank triggers without throwing", () => {
    const templates = [tpl("empty", ["", "   "]), tpl("hit", ["https://hit.com/*"])];
    expect(matchTemplateByUrl("https://hit.com/a", templates)?.slug).toBe("hit");
  });
});
