// Persistence side of the empty-graph-card dismissal (cycle-3 test gap #5).
// The card's whole reason to exist is "dismiss once, stay dismissed" — these
// pin the write path: key, ISO payload, and the no-throw guarantee when the
// native store fails.

const mockSetItem = jest.fn();
const mockGetItem = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mockGetItem, setItem: mockSetItem },
}));

import {
  EMPTY_GRAPH_DISMISSED_KEY,
  markEmptyGraphDismissed,
  __resetEmptyGraphDismissedForTests,
} from "../empty-card";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// nativeStorage() detects React Native via navigator.product — the node jest
// env doesn't set it, so pin it for this suite (and restore after).
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

describe("markEmptyGraphDismissed", () => {
  beforeEach(() => {
    mockSetItem.mockReset().mockResolvedValue(undefined);
    mockGetItem.mockReset().mockResolvedValue(null);
    __resetEmptyGraphDismissedForTests();
  });

  test("persists an ISO timestamp under the canonical key", async () => {
    markEmptyGraphDismissed();
    await flushMicrotasks();

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, value] = mockSetItem.mock.calls[0]!;
    expect(key).toBe(EMPTY_GRAPH_DISMISSED_KEY);
    // The stored value must parse back to a real instant (hydration treats
    // any truthy string as dismissed, but the timestamp is the audit trail).
    expect(Number.isNaN(Date.parse(value as string))).toBe(false);
  });

  test("a failing native store neither throws nor rejects unhandled", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockSetItem.mockRejectedValueOnce(new Error("disk full"));

    expect(() => markEmptyGraphDismissed()).not.toThrow();
    await flushMicrotasks();

    // The failure leaves a trace instead of disappearing (2026-06-10 fix).
    expect(warn).toHaveBeenCalledWith("[empty-card] persist failed", expect.any(Error));
    warn.mockRestore();
  });

  test("dismissals are idempotent at the storage layer (second call rewrites the key)", async () => {
    markEmptyGraphDismissed();
    markEmptyGraphDismissed();
    await flushMicrotasks();

    expect(mockSetItem).toHaveBeenCalledTimes(2);
    expect(mockSetItem.mock.calls[1]![0]).toBe(EMPTY_GRAPH_DISMISSED_KEY);
  });
});
