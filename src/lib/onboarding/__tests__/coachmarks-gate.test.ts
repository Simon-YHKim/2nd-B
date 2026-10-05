const mockSetItem = jest.fn().mockResolvedValue(undefined);
const mockGetItem = jest.fn().mockResolvedValue(null);
const mockRemoveItem = jest.fn().mockResolvedValue(undefined);
const mockGetSupabaseClient = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mockGetItem, setItem: mockSetItem, removeItem: mockRemoveItem },
}));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: mockGetSupabaseClient }));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useEffect: jest.fn(),
  useState: jest.fn(),
}));

import { useEffect, useState } from "react";
import {
  COACHMARKS_REPLAY_KEY,
  COACHMARKS_SEEN_KEY,
  __resetCoachmarksGateForTests,
  hasCoachmarkContent,
  markCoachmarksSeen,
  resetCoachmarks,
  useCoachmarksGate,
} from "../coachmarks-gate";

const originalNavigator = globalThis.navigator;
beforeAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...(originalNavigator ?? {}), product: "ReactNative" },
    configurable: true,
    writable: true,
  });
});
afterAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
    writable: true,
  });
});

type Reply = { data: Array<{ id: string }> | null; error: Error | null };
const empty = (): Reply => ({ data: [], error: null });
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

function hookHarness() {
  let state: { ownerId: string; due: boolean | null } | null = null;
  let effect: (() => void | (() => void)) | null = null;
  let cleanup: (() => void) | undefined;
  (useState as jest.Mock).mockImplementation(() => [state, (next: typeof state) => { state = next; }]);
  (useEffect as jest.Mock).mockImplementation((next: typeof effect) => { effect = next; });
  return {
    render(ownerId: string | null, ready = true, retryTick = 0) {
      // This harness replaces React's hooks with deterministic test state.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const due = useCoachmarksGate(ownerId, ready, retryTick);
      cleanup?.();
      cleanup = effect?.() || undefined;
      return due;
    },
    due(ownerId: string | null, ready = true) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useCoachmarksGate(ownerId, ready);
    },
    stop() { cleanup?.(); },
  };
}

function fakeClient(respond: (table: string, owner: string) => Promise<Reply> | Reply) {
  const queries: Array<{ table: string; column: string; owner: string; selected: string; limit: number }> = [];
  mockGetSupabaseClient.mockReturnValue({
    from: (table: string) => ({
      select: (selected: string) => ({
        eq: (column: string, owner: string) => ({
          limit: (limit: number) => {
            queries.push({ table, column, owner, selected, limit });
            return respond(table, owner);
          },
        }),
      }),
    }),
  });
  return queries;
}

describe("owner-scoped coachmarks gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCoachmarksGateForTests();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    (useState as jest.Mock).mockReset();
    (useEffect as jest.Mock).mockReset();
  });

  test("completion and explicit replay belong to one owner and use separate flags", async () => {
    markCoachmarksSeen("owner-A");
    await flush();
    expect(mockSetItem).toHaveBeenCalledWith(COACHMARKS_SEEN_KEY("owner-A"), expect.any(String));
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"));
    resetCoachmarks("owner-A");
    await flush();
    expect(mockSetItem).toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"), expect.any(String));
    expect(mockRemoveItem).not.toHaveBeenCalledWith(COACHMARKS_SEEN_KEY("owner-A"));
    expect(COACHMARKS_SEEN_KEY("owner-B")).not.toBe(COACHMARKS_SEEN_KEY("owner-A"));
    expect(mockSetItem).not.toHaveBeenCalledWith(COACHMARKS_SEEN_KEY("owner-B"), expect.anything());
  });

  test.each(["records", "sources"])("%s alone counts as existing content", async (present) => {
    const queries = fakeClient((table) => ({
      data: table === present ? [{ id: "one" }] : [], error: null,
    }));
    await expect(hasCoachmarkContent("owner-A")).resolves.toBe(true);
    expect(queries).toEqual([
      { table: "records", selected: "id", column: "user_id", owner: "owner-A", limit: 1 },
      { table: "sources", selected: "id", column: "user_id", owner: "owner-A", limit: 1 },
    ]);
  });

  test("an empty owner can receive the guide; a failed read is never treated as empty", async () => {
    fakeClient(() => empty());
    await expect(hasCoachmarkContent("owner-A")).resolves.toBe(false);
    fakeClient((table) => table === "sources"
      ? { data: null, error: new Error("network") }
      : empty());
    await expect(hasCoachmarkContent("owner-A")).rejects.toThrow("network");
    fakeClient(() => ({ data: null, error: null }));
    await expect(hasCoachmarkContent("owner-A")).rejects.toThrow("response unavailable");
  });

  test("replay wins over existing data and completion clears replay", async () => {
    const queries = fakeClient(() => ({ data: [{ id: "one" }], error: null }));
    resetCoachmarks("owner-A");
    // No server read is needed after an explicit replay or completion.
    expect(queries).toHaveLength(0);
    markCoachmarksSeen("owner-A");
    await flush();
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"));
  });

  test("native replay write finishes before a following completion clears it", async () => {
    let finishReplay!: () => void;
    mockSetItem.mockImplementation((key: string) => key === COACHMARKS_REPLAY_KEY("owner-A")
      ? new Promise<void>((resolve) => { finishReplay = resolve; })
      : Promise.resolve());
    resetCoachmarks("owner-A");
    markCoachmarksSeen("owner-A");
    await flush();
    expect(mockRemoveItem).not.toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"));
    finishReplay();
    await flush();
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"));
  });

  test("one owner's local completion cannot suppress a new empty owner", async () => {
    fakeClient(() => empty());
    markCoachmarksSeen("owner-A");
    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(hook.due("owner-A")).toBe(false);
    hook.render("owner-B");
    await flush();
    expect(hook.due("owner-B")).toBe(true);
    hook.stop();
  });

  test("same owner on a new device is suppressed by server content", async () => {
    fakeClient((table) => ({ data: table === "records" ? [{ id: "saved-elsewhere" }] : [], error: null }));
    const hook = hookHarness();
    expect(hook.render("owner-A")).toBeNull();
    await flush();
    expect(hook.due("owner-A")).toBe(false);
    hook.stop();
  });

  test("an old owner response cannot decide the new owner's guide", async () => {
    const pendingA: Array<() => void> = [];
    fakeClient((_table, owner) => owner === "owner-A"
      ? new Promise<Reply>((resolve) => pendingA.push(() => resolve({ data: [{ id: "old" }], error: null })))
      : empty());
    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(pendingA).toHaveLength(2);
    expect(hook.render("owner-B")).toBeNull();
    await flush();
    expect(hook.due("owner-B")).toBe(true);
    pendingA.forEach((finish) => finish());
    await flush();
    expect(hook.due("owner-B")).toBe(true);
    markCoachmarksSeen("owner-A");
    expect(hook.due("owner-B")).toBe(true);
    hook.stop();
  });

  test("read failure stays unknown, and a later focus retries", async () => {
    let fail = true;
    fakeClient(() => fail
      ? { data: null, error: new Error("offline") }
      : empty());
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(hook.due("owner-A")).toBeNull();
    fail = false;
    hook.render("owner-A", true, 1);
    await flush();
    expect(hook.due("owner-A")).toBe(true);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
    hook.stop();
  });

  test("manual replay opens a guide for an owner with content and completion closes it", async () => {
    const queries = fakeClient(() => ({ data: [{ id: "saved" }], error: null }));
    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(hook.due("owner-A")).toBe(false);
    resetCoachmarks("owner-A");
    expect(hook.due("owner-A")).toBe(true);
    hook.render("owner-A", true, 1);
    await flush();
    expect(hook.due("owner-A")).toBe(true);
    markCoachmarksSeen("owner-A");
    expect(hook.due("owner-A")).toBe(false);
    expect(queries).toHaveLength(2);
    hook.stop();
  });
});
