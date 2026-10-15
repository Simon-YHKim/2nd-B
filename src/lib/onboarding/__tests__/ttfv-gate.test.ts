// First-day TTFV gate. The first-day review opens by itself at most ONCE PER
// ACCOUNT, by a server grant the home asks for (account-first-run.ts, 0219).
// What /ttfv itself reports is pinned here: the visit takes the home's receipt
// once (BA-02), content on screen uses the chance (shown), a visit that ended
// without showing anything after a load error hands the home's grant back with
// its receipt (not_shown), and the device is never written any more. The pure
// first-day window math stays here too.

const mockSetItem = jest.fn();
const mockGetItem = jest.fn();
const mockFinishFirstRun = jest.fn();
const mockToken = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mockGetItem, setItem: mockSetItem },
}));
// Keep the real module light: its client and owner seams are not used here.
jest.mock("../../supabase/client", () => ({ getSupabaseClient: jest.fn() }));
jest.mock("../../auth/account-epoch", () => ({ currentAccountOwner: () => null }));
jest.mock("../account-first-run", () => ({
  ...jest.requireActual("../account-first-run"),
  finishFirstRun: (...args: unknown[]) => mockFinishFirstRun(...args),
  takeFirstRunTTFVToken: (...args: unknown[]) => mockToken(...args),
}));

import {
  FIRST_DAY_MS,
  isWithinFirstDay,
  markTTFVSeen,
  releaseTTFVClaim,
  takeTTFVClaimToken,
} from "../ttfv-gate";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// The old device write path ran only under React Native (navigator.product).
// Pin it, so "never writes the device" is checked where it used to write.
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

describe("what /ttfv reports to the server", () => {
  beforeEach(() => {
    mockSetItem.mockReset().mockResolvedValue(undefined);
    mockGetItem.mockReset().mockResolvedValue(null);
    mockFinishFirstRun.mockReset().mockResolvedValue(true);
    mockToken.mockReset().mockReturnValue(null);
  });

  test("content on screen uses the first-day chance, with or without a grant", async () => {
    markTTFVSeen("owner-1", "token-1", "s1");
    markTTFVSeen("owner-1", null, "s1");
    await flushMicrotasks();
    expect(mockFinishFirstRun.mock.calls).toEqual([
      ["owner-1", "ttfv", "shown", "token-1", "s1"],
      ["owner-1", "ttfv", "shown", null, "s1"],
    ]);
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  test("a review that could not load hands back only a grant it holds the receipt of", async () => {
    releaseTTFVClaim("owner-1", "token-1", "s1");
    releaseTTFVClaim("owner-1", null, "s1");
    releaseTTFVClaim(null, "token-1", "s1");
    await flushMicrotasks();
    expect(mockFinishFirstRun.mock.calls).toEqual([["owner-1", "ttfv", "not_shown", "token-1", "s1"]]);
  });

  test("signed out reports nothing, and a failing server neither throws nor rejects unhandled", async () => {
    markTTFVSeen(null, null, "s1");
    expect(mockFinishFirstRun).not.toHaveBeenCalled();
    mockFinishFirstRun.mockResolvedValueOnce(false);
    expect(() => markTTFVSeen("owner-1", null, "s1")).not.toThrow();
    await flushMicrotasks();
  });

  test("the receipt is the one the home's grant carried, taken from the store's take-once", () => {
    mockToken.mockReturnValueOnce("token-9").mockReturnValue(null);
    expect(takeTTFVClaimToken("owner-1", "s1")).toBe("token-9");
    expect(takeTTFVClaimToken("owner-1", "s1")).toBeNull();
    expect(mockToken).toHaveBeenCalledWith("owner-1", "s1");
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
