import { normalizeSharedCaptureParams } from "../share-params";

describe("normalizeSharedCaptureParams (O-R2 scrap track)", () => {
  test("returns null when nothing meaningful was shared", () => {
    expect(normalizeSharedCaptureParams({})).toBeNull();
    expect(normalizeSharedCaptureParams({ url: "", text: "  ", title: undefined })).toBeNull();
  });

  test("link-only share stays a bare URL so the titled-link flow runs", () => {
    const p = normalizeSharedCaptureParams({ url: "https://example.com/a" });
    expect(p?.content).toBe("https://example.com/a");
  });

  test("Chrome-style share (title + text=url) composes without duplicating the link", () => {
    const p = normalizeSharedCaptureParams({
      title: "An article",
      text: "https://example.com/a",
    });
    expect(p?.content).toBe("An article\n\nhttps://example.com/a");
    expect(p?.content.match(/https:\/\//g)).toHaveLength(1);
  });

  test("prose text with an embedded link keeps the prose and skips re-appending", () => {
    const p = normalizeSharedCaptureParams({
      title: "Note",
      text: "worth reading https://example.com/b later",
    });
    expect(p?.content).toBe("Note\n\nworth reading https://example.com/b later");
  });

  test("url param + separate prose text appends the link once at the end", () => {
    const p = normalizeSharedCaptureParams({
      url: "https://example.com/c",
      text: "remember this",
    });
    expect(p?.content).toBe("remember this\n\nhttps://example.com/c");
  });

  test("title identical to the url is not repeated above it", () => {
    const p = normalizeSharedCaptureParams({
      url: "https://example.com/d",
      title: "https://example.com/d",
    });
    expect(p?.content).toBe("https://example.com/d");
  });

  test("array params (repeated query keys) use the first value", () => {
    const p = normalizeSharedCaptureParams({ url: ["https://example.com/e", "https://other.example"] });
    expect(p?.content).toBe("https://example.com/e");
  });

  test("non-http url param still lands as content instead of dropping the share", () => {
    const p = normalizeSharedCaptureParams({ url: "obsidian://vault/x" });
    expect(p?.content).toBe("obsidian://vault/x");
  });

  test("key is stable for identical params and distinct for different ones", () => {
    const a = normalizeSharedCaptureParams({ text: "same" });
    const b = normalizeSharedCaptureParams({ text: "same" });
    const c = normalizeSharedCaptureParams({ text: "different" });
    expect(a?.key).toBe(b?.key);
    expect(a?.key).not.toBe(c?.key);
  });
});
