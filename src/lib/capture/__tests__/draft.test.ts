import {
  loadCaptureDraft,
  loadCaptureDraftState,
  saveCaptureDraft,
  saveCaptureDraftState,
  clearCaptureDraft,
} from "../draft";

// The jest environment is node (no DOM), so pin the web path with an
// in-memory localStorage shim. The native path shares the same parse/serialize
// logic and key scheme.
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("capture draft persistence (persona sim P1-5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("round-trips journal body + topic through the compatibility helpers, scoped by user", async () => {
    saveCaptureDraft("u1", { body: "delivery memo", topic: "today" });
    expect(await loadCaptureDraft("u1")).toEqual({
      body: "delivery memo",
      topic: "today",
      conclusion: "",
      ocrReviewApproved: false,
    });
    expect(await loadCaptureDraft("u2")).toBeNull();
  });

  test("round-trips separate drafts and the last active mode", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "ocr",
      drafts: {
        memo: { body: "memo draft", topic: "" },
        ocr: { body: "ocr text", topic: "", ocrReviewApproved: true },
        journal: { body: "journal body", topic: "journal topic", conclusion: "done" },
      },
    });

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "ocr",
      drafts: {
        memo: { body: "memo draft", topic: "", conclusion: "", ocrReviewApproved: false },
        ocr: { body: "ocr text", topic: "", conclusion: "", ocrReviewApproved: true },
        journal: { body: "journal body", topic: "journal topic", conclusion: "done", ocrReviewApproved: false },
      },
    });
  });

  test("clearing one mode preserves the other mode drafts", async () => {
    saveCaptureDraftState("u1", {
      lastMode: "linkclip",
      drafts: {
        memo: { body: "memo draft", topic: "" },
        linkclip: { body: "https://example.com", topic: "" },
      },
    });

    clearCaptureDraft("u1", "memo");

    await expect(loadCaptureDraftState("u1")).resolves.toEqual({
      lastMode: "linkclip",
      drafts: {
        linkclip: { body: "https://example.com", topic: "", conclusion: "", ocrReviewApproved: false },
      },
    });
  });

  test("empty drafts are dropped instead of shadowing future restores", async () => {
    saveCaptureDraft("u1", { body: "something", topic: "" });
    saveCaptureDraft("u1", { body: "   ", topic: "" });
    expect(await loadCaptureDraft("u1")).toBeNull();
  });

  test("corrupt state and legacy storage values restore safely", async () => {
    localStorage.setItem("capture.drafts.v2.u1", "{not json");
    expect(await loadCaptureDraftState("u1")).toEqual({ drafts: {}, lastMode: "journal" });

    localStorage.clear();
    localStorage.setItem("capture.journalDraft.v1.u1", JSON.stringify({ body: "legacy body", topic: "legacy" }));
    expect(await loadCaptureDraft("u1")).toEqual({
      body: "legacy body",
      topic: "legacy",
      conclusion: "",
      ocrReviewApproved: false,
    });

    localStorage.clear();
    localStorage.setItem("capture.journalDraft.v1.u1", JSON.stringify({ topic: "no body" }));
    expect(await loadCaptureDraft("u1")).toBeNull();
  });
});
