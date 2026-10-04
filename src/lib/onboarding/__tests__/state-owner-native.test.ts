// Gate r2 on #2043 (R2-01 / BL-02 / BL-03): the owner record and the device-wide
// completion claim, on the native storage path (AsyncStorage, no localStorage).
//
// R2-01 / BL-02: recordOwner() used to put the answer in memory and return
// success before the guarded write had run. When the write was refused (a
// durable deletion fence, or a fence read that failed) the caller still removed
// the device-wide key, so a deleted account kept an in-memory completion and a
// live account could lose the device's completion without gaining its own.
//
// BL-03: two owners resolving at once (an account switch while the first read
// is still out) could both read the device-wide key before either removed it,
// and both recorded it as their own.

const mockGetSupabaseClient = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: mockGetSupabaseClient }));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useEffect: jest.fn(),
  useState: jest.fn(),
}));

const mockDisk = new Map<string, string>();
// Keys whose next getItem rejects once (a transient native read failure).
const mockFailReadOnce = new Set<string>();
function mockTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
jest.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      await mockTick();
      if (mockFailReadOnce.delete(key)) throw new Error("native read failed");
      return mockDisk.has(key) ? mockDisk.get(key)! : null;
    },
    setItem: async (key: string, value: string) => {
      await mockTick();
      mockDisk.set(key, value);
    },
    removeItem: async (key: string) => {
      await mockTick();
      mockDisk.delete(key);
    },
  },
}));

import { useEffect, useState } from "react";
import { __resetAccountLocalDeletionFencesForTests } from "../../account/local-deletion-fence";
import {
  __resetOnboardingStateForTests,
  ONBOARDING_KEY,
  ONBOARDING_OWNER_KEY,
  onboardingCompletedAt,
  resolveOnboardingComplete,
} from "../state";
import { __resetTTFVGateForTests, TTFV_SEEN_KEY, TTFV_SEEN_OWNER_KEY, useAutoTriggerTTFV } from "../ttfv-gate";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const FENCE = (owner: string) => `account.deletionFence.v1:${owner}`;
const DEVICE_AT = "2026-10-01T09:00:00.000Z";

let rows: Record<string, number> = {};
let serverGate: Promise<void> | null = null;

function supabaseFor(): unknown {
  return {
    from: (table: "records" | "sources") => ({
      select: () => ({
        eq: (_col: string, owner: string) => ({
          limit: async () => {
            if (serverGate) await serverGate;
            const n = table === "records" ? rows[owner] ?? 0 : 0;
            return { data: Array.from({ length: n }, (_, i) => ({ id: `${table}-${i}` })), error: null };
          },
        }),
      }),
    }),
  };
}

const originalNavigator = globalThis.navigator;
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
beforeAll(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: { ...(originalNavigator ?? {}), product: "ReactNative" },
    configurable: true,
    writable: true,
  });
  delete (globalThis as { localStorage?: Storage }).localStorage;
});
afterAll(() => {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
  if (originalLocalStorage) (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
});

beforeEach(() => {
  __resetOnboardingStateForTests();
  __resetTTFVGateForTests();
  (useEffect as jest.Mock).mockReset();
  (useState as jest.Mock).mockReset();
  __resetAccountLocalDeletionFencesForTests();
  mockDisk.clear();
  mockFailReadOnce.clear();
  rows = {};
  serverGate = null;
  mockGetSupabaseClient.mockReset().mockImplementation(supabaseFor);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function hold(): () => void {
  let release!: () => void;
  serverGate = new Promise<void>((resolve) => { release = resolve; });
  return release;
}

describe("a refused owner write is not a success (R2-01 / BL-02)", () => {
  test("a transient fence read failure keeps the device completion for the next launch", async () => {
    // A live new account: the fence read fails once, so the guarded write is
    // refused. The device's completion must still be there to claim next launch.
    mockDisk.set(ONBOARDING_KEY, DEVICE_AT);
    mockFailReadOnce.add(FENCE(A));
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(mockDisk.get(ONBOARDING_OWNER_KEY(A))).toBeUndefined();
    expect(mockDisk.get(ONBOARDING_KEY)).toBe(DEVICE_AT);
    expect(onboardingCompletedAt(A)).toBeNull(); // session only, no first-day anchor

    // Next launch, storage healthy: the claim completes.
    __resetOnboardingStateForTests();
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(mockDisk.get(ONBOARDING_OWNER_KEY(A))).toBe(DEVICE_AT);
    expect(mockDisk.has(ONBOARDING_KEY)).toBe(false);
  });

  test("an account with rows does not consume the device key when its own key was not stored", async () => {
    mockDisk.set(ONBOARDING_KEY, DEVICE_AT);
    rows[A] = 1;
    mockFailReadOnce.add(FENCE(A));
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(mockDisk.get(ONBOARDING_OWNER_KEY(A))).toBeUndefined();
    expect(mockDisk.get(ONBOARDING_KEY)).toBe(DEVICE_AT);
  });

  test("a durable fence found while the read was out leaves no memory and keeps the device key", async () => {
    mockDisk.set(ONBOARDING_KEY, DEVICE_AT);
    const release = hold();
    const pending = resolveOnboardingComplete(A);
    mockDisk.set(FENCE(A), "terminal"); // deletion published by a runtime this one never saw
    release();
    await expect(pending).resolves.toBe(true);
    expect(mockDisk.get(ONBOARDING_OWNER_KEY(A))).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
    expect(mockDisk.get(ONBOARDING_KEY)).toBe(DEVICE_AT);
  });
});

describe("one device completion, one owner (BL-03)", () => {
  test("two owners resolving at once never both take the device-wide completion", async () => {
    mockDisk.set(ONBOARDING_KEY, DEVICE_AT);
    const release = hold();
    const a = resolveOnboardingComplete(A);
    const b = resolveOnboardingComplete(B);
    release();
    const results = await Promise.all([a, b]);
    const holders = [A, B].filter((owner) => mockDisk.get(ONBOARDING_OWNER_KEY(owner)) === DEVICE_AT);
    expect(holders).toHaveLength(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mockDisk.has(ONBOARDING_KEY)).toBe(false);
  });
});

describe("native /ttfv seen follows the owner (R2-03)", () => {
  function harness(ownerId: string | null, complete: boolean | null) {
    const effects: Array<() => void | (() => void)> = [];
    const setter = jest.fn();
    (useEffect as jest.Mock).mockImplementation((fn: () => void | (() => void)) => { effects.push(fn); });
    (useState as jest.Mock).mockImplementation((init: unknown) => [
      typeof init === "function" ? (init as () => unknown)() : init,
      setter,
    ]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const value = useAutoTriggerTTFV(ownerId, complete);
    for (const effect of effects) effect();
    return { value, setter };
  }

  test("nothing is read before onboarding has resolved for the owner", async () => {
    const { value, setter } = harness(A, null);
    expect(value).toBeNull();
    for (let i = 0; i < 5; i += 1) await mockTick();
    expect(setter).not.toHaveBeenCalled();
  });

  test("the device-wide seen flag moved by the claim is what the gate then reads", async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    mockDisk.set(ONBOARDING_KEY, fresh);
    mockDisk.set(TTFV_SEEN_KEY, new Date(Date.now() - 30_000).toISOString());
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(mockDisk.has(TTFV_SEEN_KEY)).toBe(false);
    expect(mockDisk.get(TTFV_SEEN_OWNER_KEY(A))).toBeDefined();
    const { value, setter } = harness(A, true);
    expect(value).toBeNull(); // hydrating
    for (let i = 0; i < 5; i += 1) await mockTick();
    expect(setter).toHaveBeenCalledWith({ ownerId: A, seen: true });
  });

  test("another owner's flag does not count", async () => {
    mockDisk.set(TTFV_SEEN_OWNER_KEY(A), "2026-10-01T09:30:00.000Z");
    const { setter } = harness(B, true);
    for (let i = 0; i < 5; i += 1) await mockTick();
    expect(setter).toHaveBeenCalledWith({ ownerId: B, seen: false });
  });
});
