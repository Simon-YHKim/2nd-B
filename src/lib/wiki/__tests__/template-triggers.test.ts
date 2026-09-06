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

  it("keeps prefix and suffix anchors with consecutive wildcards", () => {
    const glob = "https://example.com/**a***b*/end";
    expect(urlMatchesTrigger("https://example.com/a/b/end", glob)).toBe(true);
    expect(urlMatchesTrigger("xhttps://example.com/a/b/end", glob)).toBe(false);
    expect(urlMatchesTrigger("https://example.com/a/b/end/more", glob)).toBe(false);
  });

  it("matches Unicode text case-insensitively", () => {
    expect(
      urlMatchesTrigger(
        "HTTPS://例え.テスト/Über/별/🌟",
        "https://例え.テスト/über/*/🌟",
      ),
    ).toBe(true);
  });

  it("does not construct a RegExp for user-authored globs", () => {
    const regExpSpy = jest.spyOn(globalThis, "RegExp").mockImplementation(() => {
      throw new Error("RegExp construction is forbidden in the glob matcher");
    });

    let matched = false;
    try {
      matched = urlMatchesTrigger("https://example.com/a", "https://example.com/*");
    } finally {
      regExpSpy.mockRestore();
    }

    expect(matched).toBe(true);
  });

  it("rejects overlong and over-complex inputs without throwing", () => {
    const overlongUrl = "a".repeat(20_000);
    const overlongGlob = "a".repeat(2_100);
    const tooManyLiteralSegments = Array.from({ length: 65 }, () => "a").join("*");

    expect(() => urlMatchesTrigger(overlongUrl, "*")).not.toThrow();
    expect(urlMatchesTrigger(overlongUrl, "*")).toBe(false);
    expect(urlMatchesTrigger(overlongGlob, overlongGlob)).toBe(false);
    expect(urlMatchesTrigger("a".repeat(65), tooManyLiteralSegments)).toBe(false);
  });

  it("fails a long adversarial wildcard pattern in bounded work", () => {
    const glob = `${"*a".repeat(63)}*z*`;
    const url = "a".repeat(8_000);
    expect(urlMatchesTrigger(url, glob)).toBe(false);
  });

  it("fails closed for non-string runtime inputs", () => {
    const invalidValues: unknown[] = [null, undefined, {}, []];
    for (const invalid of invalidValues) {
      expect(() => urlMatchesTrigger("https://example.com", invalid as string)).not.toThrow();
      expect(urlMatchesTrigger("https://example.com", invalid as string)).toBe(false);
      expect(() => urlMatchesTrigger(invalid as string, "*")).not.toThrow();
      expect(urlMatchesTrigger(invalid as string, "*")).toBe(false);
    }
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
