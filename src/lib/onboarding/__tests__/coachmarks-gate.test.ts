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
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";
import {
  COACHMARKS_REPLAY_KEY,
  COACHMARKS_SEEN_KEY,
  __resetCoachmarksGateForTests,
  hasCoachmarkContent,
  markCoachmarksSeen,
  purgeCoachmarksForDeletedAccount,
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

type ReactHooks = { useState: typeof useState; useEffect: typeof useEffect };

// `gate` and `hooks` default to this module instance; another tab is a
// separate instance (jest.isolateModules) with its own mocked React hooks.
function hookHarness(gate = useCoachmarksGate, hooks: ReactHooks = { useState, useEffect }) {
  let state: { ownerId: string; due: boolean | null } | null = null;
  let effect: (() => void | (() => void)) | null = null;
  let cleanup: (() => void) | undefined;
  (hooks.useState as jest.Mock).mockImplementation(() => [state, (next: typeof state) => { state = next; }]);
  (hooks.useEffect as jest.Mock).mockImplementation((next: typeof effect) => { effect = next; });
  return {
    render(ownerId: string | null, ready = true, retryTick = 0) {
      // This harness replaces React's hooks with deterministic test state.
      const due = gate(ownerId, ready, retryTick);
      cleanup?.();
      cleanup = effect?.() || undefined;
      return due;
    },
    due(ownerId: string | null, ready = true) {
      return gate(ownerId, ready);
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

// QA 261004 BL-02: both flags are owner-scoped device data and were missing
// from the account-deletion purge (lib/account/local-purge.ts).
describe("account deletion purges the owner's guide flags", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCoachmarksGateForTests();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);
    (useState as jest.Mock).mockReset();
    (useEffect as jest.Mock).mockReset();
  });

  test("native: removes both keys, drops the memory flag, and reports success", async () => {
    fakeClient(() => empty());
    markCoachmarksSeen("owner-A");
    await flush();
    const before = hookHarness();
    before.render("owner-A");
    await flush();
    expect(before.due("owner-A")).toBe(false);
    before.stop();

    await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(true);
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_SEEN_KEY("owner-A"));
    expect(mockRemoveItem).toHaveBeenCalledWith(COACHMARKS_REPLAY_KEY("owner-A"));
    expect(mockRemoveItem).not.toHaveBeenCalledWith(COACHMARKS_SEEN_KEY("owner-B"));

    // The in-memory "seen" went with it: the same id reads storage again.
    const after = hookHarness();
    after.render("owner-A");
    await flush();
    expect(after.due("owner-A")).toBe(true);
    after.stop();
  });

  test("native: a queued write for the owner finishes before the purge removes", async () => {
    let finishReplay!: () => void;
    mockSetItem.mockImplementation((key: string) => key === COACHMARKS_REPLAY_KEY("owner-A")
      ? new Promise<void>((resolve) => { finishReplay = resolve; })
      : Promise.resolve());
    resetCoachmarks("owner-A");
    await flush();
    const purge = purgeCoachmarksForDeletedAccount("owner-A");
    await flush();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    finishReplay();
    await expect(purge).resolves.toBe(true);
    const removed = mockRemoveItem.mock.calls.map(([key]) => key);
    expect(removed).toEqual(expect.arrayContaining([COACHMARKS_SEEN_KEY("owner-A"), COACHMARKS_REPLAY_KEY("owner-A")]));
  });

  test("native: a key that reads back is not a completed purge", async () => {
    mockGetItem.mockImplementation((key: string) => Promise.resolve(key === COACHMARKS_SEEN_KEY("owner-A") ? "2026-10-05" : null));
    await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(false);
  });

  test("an empty owner never widens into a purge", async () => {
    await expect(purgeCoachmarksForDeletedAccount("  ")).resolves.toBe(false);
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  test("web: removes only this owner's keys from localStorage", async () => {
    const store = new Map<string, string>();
    const local = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true, writable: true });
    // A browser, not React Native: the deletion fence guards writes with the
    // same localStorage the flags live in.
    const nativeNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: { product: "Gecko" }, configurable: true, writable: true });
    try {
      markCoachmarksSeen("owner-A");
      resetCoachmarks("owner-A");
      markCoachmarksSeen("owner-B");
      expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(true);
      expect(store.has(COACHMARKS_REPLAY_KEY("owner-A"))).toBe(true);

      await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(true);
      expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(false);
      expect(store.has(COACHMARKS_REPLAY_KEY("owner-A"))).toBe(false);
      expect(store.has(COACHMARKS_SEEN_KEY("owner-B"))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: nativeNavigator, configurable: true, writable: true });
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

// QA 261004 BL-02-RACE: the purge's "both keys read back empty" must still be
// true afterwards. A flag write made during or after the deletion (this
// runtime, or another tab reading the durable marker) used to land later and
// bring a flag back, so the local purge could report "complete" falsely.
describe("the deletion fence keeps purged guide flags purged", () => {
  const store = new Map<string, string>();

  function storeBackedNative(): void {
    store.clear();
    mockGetItem.mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null));
    mockSetItem.mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    });
    mockRemoveItem.mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    __resetCoachmarksGateForTests();
    __resetAccountLocalDeletionFencesForTests();
    storeBackedNative();
    (useState as jest.Mock).mockReset();
    (useEffect as jest.Mock).mockReset();
  });
  afterEach(() => {
    __resetAccountLocalDeletionFencesForTests();
  });

  test("native: a write during or after the deletion neither lands nor revives the memory flag", async () => {
    const queries = fakeClient(() => empty());
    // A replay write is still out when the deletion starts.
    let finishReplay!: () => void;
    mockSetItem.mockImplementationOnce((key: string, value: string) => new Promise<void>((resolve) => {
      finishReplay = () => {
        store.set(key, value);
        resolve();
      };
    }));
    resetCoachmarks("owner-A");
    await flush();
    const fence = installAccountLocalDeletionFence("owner-A");
    // Same order as purgeDeletedAccountLocalData: fence first, then the purge.
    markCoachmarksSeen("owner-A");
    resetCoachmarks("owner-A");
    finishReplay();
    await expect(fence).resolves.toBe(true);
    await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(true);

    // After the readback: nothing may come back.
    resetCoachmarks("owner-A");
    markCoachmarksSeen("owner-A");
    await flush();
    expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(false);
    expect(store.has(COACHMARKS_REPLAY_KEY("owner-A"))).toBe(false);

    // The in-memory "seen" did not come back either: the gate reads storage
    // and asks the server instead of answering from memory.
    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(queries).toHaveLength(2);
    expect(hook.due("owner-A")).toBe(true);
    hook.stop();

    // Another owner on the device is untouched by the fence.
    markCoachmarksSeen("owner-B");
    await flush();
    expect(store.has(COACHMARKS_SEEN_KEY("owner-B"))).toBe(true);
  });

  test("web: another tab's write after the purge reads the durable marker and is dropped", async () => {
    const local = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true, writable: true });
    const nativeNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { value: { product: "Gecko" }, configurable: true, writable: true });
    try {
      markCoachmarksSeen("owner-A");
      expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(true);
      // No Web Locks in this browser: the marker is still written, the fence
      // just cannot confirm another tab's running write (it reports false).
      await installAccountLocalDeletionFence("owner-A");
      await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(true);

      // The other tab has its own module state, so its in-memory fence is empty.
      let otherTab!: {
        markCoachmarksSeen: typeof markCoachmarksSeen;
        resetCoachmarks: typeof resetCoachmarks;
        useCoachmarksGate: typeof useCoachmarksGate;
      };
      let otherReact!: ReactHooks;
      jest.isolateModules(() => {
        otherTab = jest.requireActual("../coachmarks-gate");
        otherReact = jest.requireMock("react");
      });
      const queries = fakeClient(() => empty());
      const other = hookHarness(otherTab.useCoachmarksGate, otherReact);
      other.render("owner-A");
      await flush();
      expect(queries).toHaveLength(2);
      otherTab.markCoachmarksSeen("owner-A");
      otherTab.resetCoachmarks("owner-A");
      await flush();
      expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(false);
      expect(store.has(COACHMARKS_REPLAY_KEY("owner-A"))).toBe(false);

      // Nor in that tab's memory (QA 261004 BL-02-RACE-R2): its guide stays
      // closed, and a refocus reads storage and asks the server again instead
      // of answering from a remembered "seen" of the deleted owner.
      expect(other.due("owner-A")).toBe(false);
      other.render("owner-A", true, 1);
      await flush();
      expect(queries).toHaveLength(4);
      other.stop();
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: nativeNavigator, configurable: true, writable: true });
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  // QA 261004 F2052-04: "다시 보기" can be this runtime's first write after
  // another runtime put up the durable marker. The replay used to stay in
  // memory (the gate kept answering true) and the fence then turned every
  // skip and Android back into a no-op, so the guide could not be closed.
  test("native: a replay another runtime's fence refuses is closed, not remembered, and the guide still closes", async () => {
    const queries = fakeClient(() => empty());
    let otherRuntime!: { installAccountLocalDeletionFence: typeof installAccountLocalDeletionFence };
    jest.isolateModules(() => {
      otherRuntime = jest.requireActual("../../account/local-deletion-fence");
    });
    await expect(otherRuntime.installAccountLocalDeletionFence("owner-A")).resolves.toBe(true);

    const hook = hookHarness();
    hook.render("owner-A");
    await flush();
    expect(hook.due("owner-A")).toBe(true);

    resetCoachmarks("owner-A");
    await flush();
    expect(store.has(COACHMARKS_REPLAY_KEY("owner-A"))).toBe(false);
    expect(hook.due("owner-A")).toBe(false);

    // No replay in memory: a refocus reads storage and asks the server.
    hook.render("owner-A", true, 1);
    await flush();
    expect(queries).toHaveLength(4);
    expect(hook.due("owner-A")).toBe(true);

    // Skip and Android back still close it, and store nothing.
    markCoachmarksSeen("owner-A");
    expect(hook.due("owner-A")).toBe(false);
    await flush();
    expect(store.has(COACHMARKS_SEEN_KEY("owner-A"))).toBe(false);
    hook.stop();
  });

  test("a gate read that started before the purge does not settle on the removed flag", async () => {
    // Completion saved on an earlier launch: only storage knows it.
    store.set(COACHMARKS_SEEN_KEY("owner-A"), "2026-10-05T00:00:00.000Z");
    let releaseRead!: () => void;
    mockGetItem.mockImplementationOnce((key: string) => {
      const stale = store.get(key) ?? null;
      return new Promise<string | null>((resolve) => { releaseRead = () => resolve(stale); });
    });
    fakeClient(() => empty());
    const hook = hookHarness();
    expect(hook.render("owner-A")).toBeNull();
    await flush();
    await expect(purgeCoachmarksForDeletedAccount("owner-A")).resolves.toBe(true);
    releaseRead();
    await flush();
    expect(hook.due("owner-A")).toBeNull();
    hook.stop();
  });
});
