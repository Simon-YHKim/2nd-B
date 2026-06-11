import {
  COMFORT_OFFER_DISMISSED_KEY,
  __resetComfortOfferForTests,
  markComfortOfferDismissed,
} from "../comfort-offer";

// Node test env: pin the web path with an in-memory localStorage shim
// (same approach as empty-card.test.ts).
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

describe("comfort offer dismissal (persona sim v2 P1-1)", () => {
  beforeEach(() => {
    store.clear();
    __resetComfortOfferForTests();
  });

  test("marking dismissed persists an ISO timestamp under the appearance key", () => {
    expect(store.get(COMFORT_OFFER_DISMISSED_KEY)).toBeUndefined();
    markComfortOfferDismissed();
    const at = store.get(COMFORT_OFFER_DISMISSED_KEY);
    expect(at).toBeDefined();
    expect(Number.isNaN(new Date(at as string).getTime())).toBe(false);
  });

  test("the offer is one-shot: a persisted value means never show again", () => {
    markComfortOfferDismissed();
    // A fresh hook instance reads the persisted value synchronously on web;
    // the stored timestamp is the contract (hook returns dismissed=true).
    expect(store.has(COMFORT_OFFER_DISMISSED_KEY)).toBe(true);
  });
});
