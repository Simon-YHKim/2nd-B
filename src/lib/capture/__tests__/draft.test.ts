import { loadCaptureDraft, saveCaptureDraft, clearCaptureDraft } from "../draft";

// The jest environment is node (no DOM), so pin the web path with an
// in-memory localStorage shim — the native path shares the parse/serialize
// logic and the same key scheme.
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

describe("capture journal draft persistence (persona sim P1-5)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("round-trips body + topic, scoped by user", async () => {
    saveCaptureDraft("u1", { body: "오늘 배달 사이 메모", topic: "하루" });
    expect(await loadCaptureDraft("u1")).toEqual({ body: "오늘 배달 사이 메모", topic: "하루" });
    // another user never sees it
    expect(await loadCaptureDraft("u2")).toBeNull();
  });

  test("an emptied body clears the stored draft instead of shadowing future restores", async () => {
    saveCaptureDraft("u1", { body: "something", topic: "" });
    saveCaptureDraft("u1", { body: "   ", topic: "" });
    expect(await loadCaptureDraft("u1")).toBeNull();
  });

  test("clear removes the draft", async () => {
    saveCaptureDraft("u1", { body: "keep me", topic: "" });
    clearCaptureDraft("u1");
    expect(await loadCaptureDraft("u1")).toBeNull();
  });

  test("corrupt or legacy storage values restore as null, never throw", async () => {
    localStorage.setItem("capture.journalDraft.v1.u1", "{not json");
    expect(await loadCaptureDraft("u1")).toBeNull();
    localStorage.setItem("capture.journalDraft.v1.u1", JSON.stringify({ topic: "no body" }));
    expect(await loadCaptureDraft("u1")).toBeNull();
  });
});
