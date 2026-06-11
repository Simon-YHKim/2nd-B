import { consumeSharedIntoDrafts, normalizeSharedCaptureParams } from "../share-params";
import type { CaptureDrafts } from "../draft";

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

describe("consumeSharedIntoDrafts (share apply must never lose sibling drafts)", () => {
  const emptyLive = { body: "", topic: "", conclusion: "" };

  test("cold-start share over an existing journal draft leaves the journal draft intact (P1-5 survival)", () => {
    const drafts: CaptureDrafts = { journal: { body: "yesterday's unfinished entry", topic: "day" } };
    const { drafts: next, linkclipDraft } = consumeSharedIntoDrafts({
      drafts,
      liveDraft: emptyLive,
      liveMode: "journal",
      restoreSkipped: true,
      content: "https://example.com/a",
    });
    expect(next.journal).toEqual({ body: "yesterday's unfinished entry", topic: "day" });
    expect(next.linkclip).toEqual(linkclipDraft);
    expect(linkclipDraft.body).toBe("https://example.com/a");
  });

  test("hydrated-screen share remembers the live typing of the mode being left", () => {
    const { drafts: next } = consumeSharedIntoDrafts({
      drafts: {},
      liveDraft: { body: "typed mid-thought", topic: "" },
      liveMode: "memo",
      restoreSkipped: false,
      content: "https://example.com/b",
    });
    expect(next.memo).toEqual({ body: "typed mid-thought", topic: "" });
    expect(next.linkclip?.body).toBe("https://example.com/b");
  });

  test("hydrated screen with user-cleared fields drops the stored draft (clear means clear)", () => {
    const drafts: CaptureDrafts = { journal: { body: "old", topic: "" } };
    const { drafts: next } = consumeSharedIntoDrafts({
      drafts,
      liveDraft: emptyLive,
      liveMode: "journal",
      restoreSkipped: false,
      content: "https://example.com/c",
    });
    expect(next.journal).toBeUndefined();
  });

  test("existing linkclip draft is appended below, not replaced", () => {
    const drafts: CaptureDrafts = { linkclip: { body: "earlier clip", topic: "" } };
    const { linkclipDraft } = consumeSharedIntoDrafts({
      drafts,
      liveDraft: emptyLive,
      liveMode: "journal",
      restoreSkipped: true,
      content: "https://example.com/d",
    });
    expect(linkclipDraft.body).toBe("earlier clip\n\nhttps://example.com/d");
  });

  test("re-applying content the linkclip draft already contains is a no-op merge", () => {
    const drafts: CaptureDrafts = { linkclip: { body: "note\n\nhttps://example.com/e", topic: "" } };
    const { linkclipDraft } = consumeSharedIntoDrafts({
      drafts,
      liveDraft: emptyLive,
      liveMode: "linkclip",
      restoreSkipped: true,
      content: "https://example.com/e",
    });
    expect(linkclipDraft.body).toBe("note\n\nhttps://example.com/e");
  });

  test("live linkclip typing is preserved beneath the merge when sharing into the same mode", () => {
    const { linkclipDraft } = consumeSharedIntoDrafts({
      drafts: {},
      liveDraft: { body: "half-pasted text", topic: "" },
      liveMode: "linkclip",
      restoreSkipped: false,
      content: "https://example.com/f",
    });
    expect(linkclipDraft.body).toBe("half-pasted text\n\nhttps://example.com/f");
  });

  test("input drafts object is not mutated", () => {
    const drafts: CaptureDrafts = { journal: { body: "keep", topic: "" } };
    consumeSharedIntoDrafts({
      drafts,
      liveDraft: emptyLive,
      liveMode: "journal",
      restoreSkipped: true,
      content: "x",
    });
    expect(drafts.linkclip).toBeUndefined();
    expect(drafts.journal?.body).toBe("keep");
  });
});
