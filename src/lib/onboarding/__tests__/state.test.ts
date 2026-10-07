// The signed-in path goes to the server (account-first-run.ts, 0219); here it is
// replaced so this file pins the device flag (signed-out only) and the routing.
const mockFinishFirstRun = jest.fn();
const mockAccountComplete = jest.fn();
jest.mock("../account-first-run", () => ({
  finishFirstRun: (...args: unknown[]) => mockFinishFirstRun(...args),
  useAccountOnboardingComplete: (...args: unknown[]) => mockAccountComplete(...args),
}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (initial: unknown) => [typeof initial === "function" ? (initial as () => unknown)() : initial, () => undefined],
  useEffect: () => undefined,
}));

import {
  __resetOnboardingStateForTests,
  FIRST_STAR_CHAT_KEY,
  isFirstStarChatNudged,
  isOnboardingComplete,
  markFirstStarChatNudged,
  markOnboardingComplete,
  ONBOARDING_KEY,
  useOnboardingComplete,
} from "../state";

describe("onboarding state", () => {
  const store: Record<string, string> = {};
  const mockLs = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  } as unknown as Storage;

  beforeEach(() => {
    mockFinishFirstRun.mockReset().mockResolvedValue(true);
    mockAccountComplete.mockReset().mockReturnValue(null);
    __resetOnboardingStateForTests();
    for (const k of Object.keys(store)) delete store[k];
    (globalThis as { localStorage?: Storage }).localStorage = mockLs;
  });

  test("starts incomplete", () => {
    expect(isOnboardingComplete()).toBe(false);
  });

  test("signed out: mark + read round-trips, stores an ISO timestamp", async () => {
    await expect(markOnboardingComplete(null)).resolves.toBe(true);
    expect(isOnboardingComplete()).toBe(true);
    expect(store[ONBOARDING_KEY]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockFinishFirstRun).not.toHaveBeenCalled();
  });

  test("reads false (no throw) when localStorage is unavailable", async () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(isOnboardingComplete()).toBe(false);
    await expect(markOnboardingComplete(null)).resolves.toBe(true);
  });

  test("CDA-05: a throwing web store neither throws nor stops the finish", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    } as unknown as Storage;
    expect(isOnboardingComplete()).toBe(false);
    await expect(markOnboardingComplete(null, "skipped")).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith("[onboarding] persist failed", expect.any(Error));
    warn.mockRestore();
  });

  test("signed in: the finish goes to the account on the server, never to the device", async () => {
    mockFinishFirstRun.mockResolvedValueOnce(false);
    await expect(markOnboardingComplete("owner-1", "skipped")).resolves.toBe(false);
    expect(mockFinishFirstRun).toHaveBeenCalledWith("owner-1", "onboarding", "skipped", null);
    expect(store[ONBOARDING_KEY]).toBeUndefined();
    expect(isOnboardingComplete()).toBe(false);
  });

  test("CDA-04 = CD-02: a signed-in account never reads the device flag", () => {
    store[ONBOARDING_KEY] = "2026-01-01T00:00:00.000Z";
    mockAccountComplete.mockReturnValue(false);
    expect(useOnboardingComplete("owner-1", true)).toBe(false);
    mockAccountComplete.mockReturnValue(null);
    expect(useOnboardingComplete("owner-1", false)).toBeNull();
    expect(mockAccountComplete).toHaveBeenLastCalledWith("owner-1", false);
    // Signed out, the device flag is the answer.
    expect(useOnboardingComplete(null, true)).toBe(true);
  });

  test("first-star chat nudge starts unfired", () => {
    expect(isFirstStarChatNudged()).toBe(false);
  });

  test("first-star chat nudge mark + read round-trips, stores an ISO timestamp", () => {
    markFirstStarChatNudged();
    expect(isFirstStarChatNudged()).toBe(true);
    expect(store[FIRST_STAR_CHAT_KEY]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("first-star chat nudge is independent of onboarding completion", async () => {
    await markOnboardingComplete(null);
    expect(isFirstStarChatNudged()).toBe(false);
  });

  test("first-star chat nudge reads false (no throw) without localStorage", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(isFirstStarChatNudged()).toBe(false);
    expect(() => markFirstStarChatNudged()).not.toThrow();
  });
});
