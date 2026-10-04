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

import { useEffect, useState } from "react";
import {
  __resetAccountLocalDeletionFencesForTests,
  installAccountLocalDeletionFence,
} from "../../account/local-deletion-fence";
import {
  __resetOnboardingStateForTests,
  isOnboardingComplete,
  markOnboardingComplete,
  ONBOARDING_FROM_RECORDS,
  ONBOARDING_KEY,
  ONBOARDING_OWNER_KEY,
  onboardingCompletedAt,
  purgeOnboardingForDeletedAccount,
  resolveOnboardingComplete,
  useOnboardingComplete,
} from "../state";
import {
  __resetTTFVGateForTests,
  markTTFVSeen,
  purgeTTFVSeenForDeletedAccount,
  TTFV_SEEN_KEY,
  TTFV_SEEN_OWNER_KEY,
  useAutoTriggerTTFV,
} from "../ttfv-gate";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const ISO = new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}T");
const B = "bbbbbbbb-0000-4000-8000-000000000002";

type Rows = { records: number; sources: number } | "error";
let rows: Record<string, Rows> = {};
let reads = 0;
// Holds every server read until released (an in-flight read racing a deletion).
let serverGate: Promise<void> | null = null;

function supabaseFor(): unknown {
  return {
    from: (table: "records" | "sources") => ({
      select: () => ({
        eq: (_col: string, owner: string) => ({
          limit: async () => {
            if (serverGate) await serverGate;
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
  __resetAccountLocalDeletionFencesForTests();
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as { localStorage?: Storage }).localStorage = mockLs;
  rows = {};
  reads = 0;
  serverGate = null;
  mockGetSupabaseClient.mockReset().mockImplementation(supabaseFor);
  (useEffect as jest.Mock).mockReset();
  (useState as jest.Mock).mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function hold(): () => void {
  let release!: () => void;
  serverGate = new Promise<void>((resolve) => { release = resolve; });
  return release;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

  test("a failed server read does not claim or consume the device-wide key (BL-01)", async () => {
    // The device key is fresh (inside the first-day window). If a failed read let
    // an existing account claim it, /ttfv would open its first-day screen and the
    // owner key would stop the server from ever being asked again.
    const fresh = new Date(Date.now() - 60_000).toISOString();
    store[ONBOARDING_KEY] = fresh;
    rows[A] = "error";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(store[ONBOARDING_KEY]).toBe(fresh);
    expect(onboardingCompletedAt(A)).toBeNull();
    // The next launch, with the server back, asks again and finds the rows.
    __resetOnboardingStateForTests();
    rows[A] = { records: 1, sources: 0 };
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(ONBOARDING_FROM_RECORDS);
    expect(store[ONBOARDING_KEY]).toBeUndefined();
  });

  test("the old device-wide completion is claimed once by a new account, then removed", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe("2026-10-01T09:00:00.000Z");
    expect(store[ONBOARDING_KEY]).toBeUndefined();
    // A second new account on the device does not inherit it.
    await expect(resolveOnboardingComplete(B)).resolves.toBe(false);
  });

  test("a lookup its screens dropped (account switch) leaves the device-wide key to the next account (BL-03)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    await expect(resolveOnboardingComplete(A, () => false)).resolves.toBe(false);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
    await expect(resolveOnboardingComplete(B)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(B)]).toBe("2026-10-01T09:00:00.000Z");
    expect(store[ONBOARDING_KEY]).toBeUndefined();
  });

  test("one caller still on screen is enough for a shared read to claim (BL-03)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    const release = hold();
    const dropped = resolveOnboardingComplete(A, () => false);
    const live = resolveOnboardingComplete(A, () => true);
    release();
    await expect(Promise.all([dropped, live])).resolves.toEqual([true, true]);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("the hook's read stops asking for the device-wide key once its effect is cleaned up (BL-03)", async () => {
    // Account switch while A's read is out: the hook's effect cleanup runs, the
    // read itself goes on, and it must not take the device's completion.
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    const release = hold();
    let effect: (() => void | (() => void)) | undefined;
    (useEffect as jest.Mock).mockImplementation((fn: () => void | (() => void)) => { effect = fn; });
    (useState as jest.Mock).mockImplementation((init: unknown) => [
      typeof init === "function" ? (init as () => unknown)() : init,
      jest.fn(),
    ]);
    expect(useOnboardingComplete(A)).toBeNull();
    const cleanup = effect?.();
    expect(typeof cleanup).toBe("function");
    (cleanup as () => void)();
    release();
    for (let i = 0; i < 10; i += 1) await flush();
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
    // The account now on screen takes it.
    await expect(resolveOnboardingComplete(B)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(B)]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("the same hook, never cleaned up, claims it (BL-03 control)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    let effect: (() => void | (() => void)) | undefined;
    (useEffect as jest.Mock).mockImplementation((fn: () => void | (() => void)) => { effect = fn; });
    (useState as jest.Mock).mockImplementation((init: unknown) => [
      typeof init === "function" ? (init as () => unknown)() : init,
      jest.fn(),
    ]);
    useOnboardingComplete(A);
    effect?.();
    for (let i = 0; i < 10; i += 1) await flush();
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("the owner key settling the screen's own answer is not read as a dropped lookup (BL-03)", async () => {
    // On web the stored owner key flips the hook's synchronous answer, which
    // cleans up its effect. That happens after the decision, so the account with
    // rows still discards the device-wide key.
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    rows[A] = { records: 1, sources: 0 };
    await expect(resolveOnboardingComplete(A, () => store[ONBOARDING_OWNER_KEY(A)] === undefined)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(ONBOARDING_FROM_RECORDS);
    expect(store[ONBOARDING_KEY]).toBeUndefined();
  });

  test("a dropped lookup with rows records its owner but does not discard the device-wide key (BL-03)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    rows[A] = { records: 1, sources: 0 };
    await expect(resolveOnboardingComplete(A, () => false)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(ONBOARDING_FROM_RECORDS);
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("two owners resolving at once on web: only one takes the device-wide key (BL-03)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    const release = hold();
    const both = Promise.all([resolveOnboardingComplete(A), resolveOnboardingComplete(B)]);
    release();
    const results = await both;
    const holders = [A, B].filter((o) => store[ONBOARDING_OWNER_KEY(o)] === "2026-10-01T09:00:00.000Z");
    expect(holders).toHaveLength(1);
    expect(results.filter(Boolean)).toHaveLength(1);
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

  test("account A having seen /ttfv does not spend account B's first day (R2-03)", () => {
    markOnboardingComplete(A);
    markTTFVSeen(A);
    expect(ttfv(A, true)).toBe(false);
    markOnboardingComplete(B);
    expect(ttfv(B, true)).toBe(true);
  });

  test("the seen flag is stored under the owner, never the old device-wide key (R2-03)", async () => {
    markTTFVSeen(A);
    await flush();
    expect(store[TTFV_SEEN_OWNER_KEY(A)]).toMatch(ISO);
    expect(store[TTFV_SEEN_KEY]).toBeUndefined();
    // A later launch reads it back from storage.
    __resetTTFVGateForTests();
    markOnboardingComplete(A);
    expect(ttfv(A, true)).toBe(false);
  });

  test("an old device-wide seen flag is nobody's own (R2-03)", () => {
    store[TTFV_SEEN_KEY] = "2026-10-01T09:30:00.000Z";
    markOnboardingComplete(A);
    expect(ttfv(A, true)).toBe(true);
  });

  test("the old device-wide seen flag moves with the device completion it belonged to (R2-03)", async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    store[ONBOARDING_KEY] = fresh;
    store[TTFV_SEEN_KEY] = new Date(Date.now() - 30_000).toISOString();
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBe(fresh);
    expect(store[TTFV_SEEN_OWNER_KEY(A)]).toMatch(ISO);
    expect(store[TTFV_SEEN_KEY]).toBeUndefined();
    expect(ttfv(A, true)).toBe(false); // already seen on the earlier build
  });

  test("an account with rows discards the old seen flag along with the device completion (R2-03)", async () => {
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    store[TTFV_SEEN_KEY] = "2026-10-01T09:30:00.000Z";
    rows[A] = { records: 1, sources: 0 };
    await resolveOnboardingComplete(A);
    expect(store[TTFV_SEEN_KEY]).toBeUndefined();
    expect(store[TTFV_SEEN_OWNER_KEY(A)]).toBeUndefined();
  });

  test("a deleted account's seen flag is purged, and not written after the fence (R2-03)", async () => {
    markTTFVSeen(A);
    markTTFVSeen(B);
    await flush();
    await expect(purgeTTFVSeenForDeletedAccount(A)).resolves.toBe(true);
    expect(store[TTFV_SEEN_OWNER_KEY(A)]).toBeUndefined();
    expect(store[TTFV_SEEN_OWNER_KEY(B)]).toMatch(ISO);
    await installAccountLocalDeletionFence(A);
    markTTFVSeen(A);
    await flush();
    expect(store[TTFV_SEEN_OWNER_KEY(A)]).toBeUndefined();
    await expect(purgeTTFVSeenForDeletedAccount("  ")).resolves.toBe(false);
  });

  test("a failed read does not hand an existing account a fresh device-wide first day (BL-01)", async () => {
    store[ONBOARDING_KEY] = new Date(Date.now() - 60_000).toISOString();
    rows[A] = "error";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(ttfv(A, true)).toBe(false);
  });
});

describe("a deleted account's onboarding key goes with it (BL-02)", () => {
  test("purge removes the owner key and the in-memory answer, and leaves other accounts alone", async () => {
    markOnboardingComplete(A);
    markOnboardingComplete(B);
    await expect(purgeOnboardingForDeletedAccount(A)).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
    expect(isOnboardingComplete(A)).toBeNull();
    expect(store[ONBOARDING_OWNER_KEY(B)]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(isOnboardingComplete(B)).toBe(true);
  });

  test("a session-only answer from a failed read is dropped too", async () => {
    rows[A] = "error";
    await expect(resolveOnboardingComplete(A)).resolves.toBe(true);
    expect(isOnboardingComplete(A)).toBe(true); // session-only
    await expect(purgeOnboardingForDeletedAccount(A)).resolves.toBe(true);
    expect(isOnboardingComplete(A)).toBeNull();
  });

  test("a read still in flight when the account is deleted does not write the key back", async () => {
    let release!: () => void;
    serverGate = new Promise<void>((resolve) => { release = resolve; });
    rows[A] = { records: 1, sources: 0 };
    const pending = resolveOnboardingComplete(A);
    await installAccountLocalDeletionFence(A);
    await expect(purgeOnboardingForDeletedAccount(A)).resolves.toBe(true);
    release();
    await pending;
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
  });

  test("a deleted account does not claim the device-wide key on its way out", async () => {
    let release!: () => void;
    serverGate = new Promise<void>((resolve) => { release = resolve; });
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    const pending = resolveOnboardingComplete(A); // a new account: no rows
    await installAccountLocalDeletionFence(A);
    await purgeOnboardingForDeletedAccount(A);
    release();
    await pending;
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("a failed read still in flight when the account is deleted leaves no session-only answer", async () => {
    let release!: () => void;
    serverGate = new Promise<void>((resolve) => { release = resolve; });
    rows[A] = "error";
    const pending = resolveOnboardingComplete(A);
    await installAccountLocalDeletionFence(A);
    await purgeOnboardingForDeletedAccount(A);
    release();
    await pending;
    expect(isOnboardingComplete(A)).toBeNull();
  });

  test("another tab's durable deletion fence stops the stored write", () => {
    // The fence marker is in shared storage but this runtime never saw the
    // deletion, so only the serialised write path can tell.
    store[`account.deletionFence.v1:${A}`] = "terminal";
    markOnboardingComplete(A);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
  });

  test("another tab's fence found by an in-flight read: no memory, and the device key stays (R2-01)", async () => {
    // Codex repro: another tab installs A's durable fence and finishes the
    // deletion while this tab's read for A is out; this runtime has no memory
    // fence. The refused write must not leave an in-memory completion behind,
    // and the device-wide key must not be spent on it.
    const release = hold();
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    const pending = resolveOnboardingComplete(A); // a new account: no rows
    store[`account.deletionFence.v1:${A}`] = "terminal";
    release();
    await expect(pending).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("the same, for an account with rows: nothing in memory, the device key is not consumed (R2-01)", async () => {
    const release = hold();
    store[ONBOARDING_KEY] = "2026-10-01T09:00:00.000Z";
    rows[A] = { records: 1, sources: 0 };
    const pending = resolveOnboardingComplete(A);
    store[`account.deletionFence.v1:${A}`] = "terminal";
    release();
    await expect(pending).resolves.toBe(true);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
    expect(store[ONBOARDING_KEY]).toBe("2026-10-01T09:00:00.000Z");
  });

  test("a carousel finish refused by another tab's fence takes its in-memory answer back (R2-01)", async () => {
    store[`account.deletionFence.v1:${A}`] = "terminal";
    markOnboardingComplete(A);
    await flush();
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
  });

  test("finishing the carousel after the deletion fence is up writes nothing", async () => {
    await installAccountLocalDeletionFence(A);
    markOnboardingComplete(A);
    expect(store[ONBOARDING_OWNER_KEY(A)]).toBeUndefined();
    expect(onboardingCompletedAt(A)).toBeNull();
  });

  test("reports false when the key could not be removed, and refuses an empty owner", async () => {
    markOnboardingComplete(A);
    const removeItem = jest.spyOn(mockLs, "removeItem").mockImplementation(() => undefined);
    await expect(purgeOnboardingForDeletedAccount(A)).resolves.toBe(false);
    removeItem.mockRestore();
    await expect(purgeOnboardingForDeletedAccount("  ")).resolves.toBe(false);
  });
});
