// First-day TTFV gate. The first-day screen must auto-trigger exactly ONCE,
// only within the first day after onboarding. These pin the two pieces of that
// contract that can break silently: the persisted "seen" write path, and the
// pure first-day window math.

const mockSetItem = jest.fn();
const mockGetItem = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mockGetItem, setItem: mockSetItem },
}));

import {
  TTFV_SEEN_KEY,
  FIRST_DAY_MS,
  markTTFVSeen,
  isWithinFirstDay,
  __resetTTFVGateForTests,
} from "../ttfv-gate";

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

describe("markTTFVSeen", () => {
  beforeEach(() => {
    mockSetItem.mockReset().mockResolvedValue(undefined);
    mockGetItem.mockReset().mockResolvedValue(null);
    __resetTTFVGateForTests();
  });

  test("persists an ISO timestamp under the canonical key", async () => {
    markTTFVSeen();
    await flushMicrotasks();

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const [key, value] = mockSetItem.mock.calls[0]!;
    expect(key).toBe(TTFV_SEEN_KEY);
    expect(Number.isNaN(Date.parse(value as string))).toBe(false);
  });

  test("a failing native store neither throws nor rejects unhandled", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockSetItem.mockRejectedValueOnce(new Error("disk full"));

    expect(() => markTTFVSeen()).not.toThrow();
    await flushMicrotasks();

    expect(warn).toHaveBeenCalledWith("[ttfv-gate] persist failed", expect.any(Error));
    warn.mockRestore();
  });
});

describe("isWithinFirstDay", () => {
  const now = Date.parse("2026-06-21T12:00:00.000Z");

  test("true within the first day", () => {
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    expect(isWithinFirstDay(oneHourAgo, now)).toBe(true);
  });

  test("true at the exact moment of onboarding", () => {
    expect(isWithinFirstDay(new Date(now).toISOString(), now)).toBe(true);
  });

  test("true just before the 24h edge", () => {
    const justInside = new Date(now - (FIRST_DAY_MS - 1000)).toISOString();
    expect(isWithinFirstDay(justInside, now)).toBe(true);
  });

  test("false once past the first day", () => {
    const dayAndAnHour = new Date(now - (FIRST_DAY_MS + 60 * 60 * 1000)).toISOString();
    expect(isWithinFirstDay(dayAndAnHour, now)).toBe(false);
  });

  test("false for a null / missing timestamp", () => {
    expect(isWithinFirstDay(null, now)).toBe(false);
  });

  test("false for an unparseable timestamp", () => {
    expect(isWithinFirstDay("not-a-date", now)).toBe(false);
  });

  test("false for a timestamp far in the future (clock skew guard)", () => {
    const wayFuture = new Date(now + (FIRST_DAY_MS + 60 * 60 * 1000)).toISOString();
    expect(isWithinFirstDay(wayFuture, now)).toBe(false);
  });
});
