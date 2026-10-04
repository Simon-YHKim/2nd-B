// W-12 (QA 261004): onboarding completion belongs to the account, not the device.
//
// The flag was one device-wide key in localStorage / AsyncStorage. Measured on web:
// sign in to the QA account (which has records) in a browser with empty storage and
// the welcome carousel runs again from slide 1, then /ttfv opens its first-day screen
// for an account that has been writing for weeks. The fix reads, in order: the
// owner's own key, then the server (one record/source row = not a new account),
// then the old device-wide key (claimed once, then removed). A failed read is never
// treated as an empty account.

const mockGetSupabaseClient = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: mockGetSupabaseClient }));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useEffect: jest.fn(),
  useState: jest.fn(),
}));

import { useState } from "react";
import {
  __resetOnboardingStateForTests,
  isOnboardingComplete,
  markOnboardingComplete,
  ONBOARDING_FROM_RECORDS,
  ONBOARDING_KEY,
  ONBOARDING_OWNER_KEY,
  onboardingCompletedAt,
  resolveOnboardingComplete,
} from "../state";
import { __resetTTFVGateForTests, useAutoTriggerTTFV } from "../ttfv-gate";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

type Rows = { records: number; sources: number } | "error";
let rows: Record<string, Rows> = {};
let reads = 0;

function supabaseFor(): unknown {
  return {
    from: (table: "records" | "sources") => ({
      select: () => ({
        eq: (_col: string, owner: string) => ({
          limit: async () => {
            reads += 1;
            const r = rows[owner] ?? { records: 0, sources: 0 };
            if (r === "error") return { data: null, error: new Error("network") };
            return { data: Array.from({ length: r[table] }, (_, i) => ({ id: `${table}-${i}` })), error: null };
          },
        }),
      }),
    }),
  };
}

const store: Record<string, string> = {};
const mockLs = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
} as unknown as Storage;

beforeEach(() => {
  __resetOnboardingStateForTests();
  __resetTTFVGateForTests();
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as { localStorage?: Storage }).localStorage = mockLs;
  rows = {};
  reads = 0;
  mockGetSupabaseClient.mockReset().mockImplementation(supabaseFor);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("onboarding completion is per account (W-12)", () => {
  test("an existing account on an empty browser is onboarded, from its rows, without the carousel", async () => {
    rows[A] = { records: 1, sources: 0 };
    expect(isOnboardingComplete(A)).toBeNull(); // nothing local: needs the server
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(ONBOARDING_FROM_RECORDS);
    // Recorded: the next launch answers locally, with no read.
    __resetOnboardingStateForTests();
    reads = 0;
    expect(isOnboardingComplete(A)).toBe(true);
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(reads).toBe(0);
  });

  test("a source row counts as much as a record row", async () => {
    rows[A] = { records: 0, sources: 1 };
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
  });

  test("a new account with no rows and no completion anywhere gets the welcome", async () => {
    await expect(resolveOnboardingComplete(A)).resolves.toBe(false);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
  });

  test("account A finishing the carousel does not complete account B on the same device", async () => {
    markOnboardingComplete(A);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(store[ONBOARDING_KEY]).toBeUndefined();
    expect(isOnboardingComplete(A)).toBe(true);
    await expect(resolveOnboardingComplete(B)).resolves.toBe(false);
  });

  test("a failed server read is never an empty account, and nothing is recorded", async () => {
    rows[A] = "error";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull(); // no first-day anchor
    // The next launch asks again.
    __resetOnboardingStateForTests();
    rows[A] = { records: 0, sources: 0 };
    await expect(resolveOnboardingComplete(A)).resolves.toBe(false);
  });

  test("the old device-wide completion is claimed once by a new account, then removed", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe("2026-10-01T09:00:00.000Z");
    expect(store[ONBOARDING_KEY]).toBeUndefined();
    // A second new account on the device does not inherit it.
    await expect(resolveOnboardingComplete(B)).resolves.toBe(false);
  });

  test("an account with rows consumes the old device-wide key instead of leaving it", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    rows[A] = { records: 2, sources: 0 };
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(ONBOARDING_FROM_RECORDS);
    expect(store[ONBOARDING_KEY]).toBeUndefined();
  });

  test("signed out, the carousel writes the device-wide flag (claimed at the next sign-in)", () => {
    markOnboardingComplete(null);
    expect(store[ONBOARDING_KEY]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(isOnboardingComplete(null)).toBe(true);
  });

  test("callers resolving the same owner at once share one server read", async () => {
    rows[A] = { records: 1, sources: 0 };
    const [one, two] = await Promise.all([resolveOnboardingComplete(A), resolveOnboardingComplete(A)]);
    expect([one, two]).toEqual([true, true]);
    expect(reads).toBe(2); // records + sources, once
  });
});

describe("the first-day /ttfv screen follows the account, not the device (W-12)", () => {
  function ttfv(ownerId: string | null, onboardingComplete: boolean | null): boolean | null {
    // Hook harness: React is mocked; useState hands back the synchronous seen value.
    (useState as jest.Mock).mockImplementation((init: unknown) => [
      typeof init === "function" ? (init as () => unknown)() : init,
      jest.fn(),
    ]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAutoTriggerTTFV(ownerId, onboardingComplete);
  }

  test("an existing account recognised from its rows never gets the first-day screen", async () => {
    rows[A] = { records: 1, sources: 0 };
    await resolveOnboardingComplete(A);
    expect(ttfv(A, true)).toBe(false);
  });

  test("a new account that just finished the carousel gets it once", () => {
    markOnboardingComplete(A);
    expect(ttfv(A, true)).toBe(true);
  });

  test("another account's fresh completion is not this account's first day", async () => {
    markOnboardingComplete(A);
    rows[B] = { records: 1, sources: 0 };
    await resolveOnboardingComplete(B);
    expect(ttfv(B, true)).toBe(false);
  });

  test("undecided until onboarding has resolved for the signed-in owner", () => {
    expect(ttfv(A, null)).toBeNull();
    expect(ttfv(null, true)).toBeNull();
  });
});
