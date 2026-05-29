import { isOnboardingComplete, markOnboardingComplete, ONBOARDING_KEY } from "../state";

describe("onboarding state", () => {
  const store: Record<string, string> = {};
  const mockLs = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  } as unknown as Storage;

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    (globalThis as { localStorage?: Storage }).localStorage = mockLs;
  });

  test("starts incomplete", () => {
    expect(isOnboardingComplete()).toBe(false);
  });

  test("mark + read round-trips, stores an ISO timestamp", () => {
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);
    expect(store[ONBOARDING_KEY]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("reads false (no throw) when localStorage is unavailable", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(isOnboardingComplete()).toBe(false);
    expect(() => markOnboardingComplete()).not.toThrow();
  });
});
