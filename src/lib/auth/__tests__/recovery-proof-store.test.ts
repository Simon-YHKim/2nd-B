import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  __resetRecoveryProofStorageQueueForTests,
  applyAuthCallbackQuarantineStorageValue,
  applyRecoveryPendingStorageValue,
  armWebRecoveryPendingFromLocation,
  clearRecoveryPendingExpected,
  clearRecoveryStateExpected,
  createAuthCallbackQuarantine,
  createRecoveryProof,
  isRecoveryPendingInMemory,
  loadRecoveryPending,
  loadRecoveryProof,
  parseRecoveryPending,
  parseRecoveryProof,
  persistAuthCallbackQuarantineInsideMutation,
  persistRecoveryPending,
  persistRecoveryProof,
  recoveryProofMatchesSession,
  recoveryProofOwnsPending,
  recoverySessionIdentity,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "../recovery-proof-store";
import { __resetAuthStorageRuntimeForTests, runAuthSessionMutation } from "../session-mutation";

function accessToken(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: "u1", session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

describe("persistent recovery proof", () => {
  const values = new Map<string, string>();
  const lockRequest = jest.fn(async <T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: (lock: { name: string; mode: "exclusive" }) => Promise<T>,
  ) => callback({ name, mode: "exclusive" }));

  beforeEach(() => {
    values.clear();
    lockRequest.mockClear();
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { locks: { request: lockRequest } },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { navigator?: unknown }).navigator;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("binds proof to the stable JWT session_id, not just the user", () => {
    const token = accessToken("session-a");
    expect(sessionIdFromAccessToken(token)).toBe("session-a");
    expect(recoverySessionIdentity({ access_token: token, user: { id: "u1" } })).toEqual({
      userId: "u1",
      sessionId: "session-a",
    });
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    expect(recoveryProofMatchesSession(proof, { access_token: token, user: { id: "u1" } })).toBe(true);
    expect(
      recoveryProofMatchesSession(proof, {
        access_token: accessToken("session-b"),
        user: { id: "u1" },
      }),
    ).toBe(false);
  });

  test("rejects malformed, tokenless, and incomplete identities", () => {
    expect(sessionIdFromAccessToken("not-a-jwt")).toBeNull();
    expect(recoverySessionIdentity({ user: { id: "u1" } })).toBeNull();
    expect(parseRecoveryProof("{}")).toBeNull();
    expect(parseRecoveryProof("not-json")).toBeNull();
  });

  test("persists, hydrates, and clears a secret-free marker", async () => {
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    await persistRecoveryProof(proof);
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proof);
    await expect(loadRecoveryProof()).resolves.toEqual(proof);
    await clearRecoveryStateExpected(proof);
    await expect(loadRecoveryProof()).resolves.toBeNull();
  });

  test("stale recovery A cleanup preserves newer B proof and pending markers", async () => {
    const proofA = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    const proofB = createRecoveryProof({ userId: "u1", sessionId: "session-b" });
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proofB));
    values.set(RECOVERY_PENDING_KEY, JSON.stringify({ issuedAt: "2026-09-13T00:00:00.000Z" }));

    await expect(clearRecoveryStateExpected(proofA)).resolves.toBe(false);
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proofB);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);

    await expect(clearRecoveryStateExpected(proofB)).resolves.toBe(false);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);

    const pending = await loadRecoveryPending();
    expect(pending).not.toBeNull();
    await clearRecoveryPendingExpected(pending!);
    await expect(clearRecoveryStateExpected(proofB)).resolves.toBe(true);
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
    await expect(clearRecoveryStateExpected(proofB)).resolves.toBe(true);
  });

  test("recovery A cleanup preserves a newer callback B quarantine", async () => {
    const proofA = createRecoveryProof({ userId: "u1", sessionId: "session-a" });
    const quarantineB = createAuthCallbackQuarantine("ordinary");
    values.set(RECOVERY_PROOF_KEY, JSON.stringify(proofA));
    values.set(AUTH_CALLBACK_QUARANTINE_KEY, JSON.stringify(quarantineB));

    await expect(clearRecoveryStateExpected(proofA)).resolves.toBe(false);
    expect(JSON.parse(values.get(RECOVERY_PROOF_KEY) ?? "{}")).toEqual(proofA);
    expect(JSON.parse(values.get(AUTH_CALLBACK_QUARANTINE_KEY) ?? "{}")).toEqual(quarantineB);
  });

  test("keeps an invalid persisted marker fail-closed during hydration", async () => {
    values.set(RECOVERY_PROOF_KEY, JSON.stringify({ userId: "u1" }));
    await expect(loadRecoveryProof()).rejects.toThrow("invalid");
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(true);
  });

  test("persists and broadcasts a provisional recovery lock", async () => {
    expect(isRecoveryPendingInMemory()).toBe(false);
    const pending = await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: expect.any(String),
      ownerNonce: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    await clearRecoveryPendingExpected(pending);
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
  });

  test("a stale A clear cannot erase a newer B pending owner", async () => {
    const pendingA = await persistRecoveryPending();
    const pendingB = await persistRecoveryPending();

    await expect(clearRecoveryPendingExpected(pendingA)).resolves.toBe(false);
    await expect(loadRecoveryPending()).resolves.toEqual(pendingB);
    await expect(clearRecoveryPendingExpected(pendingB)).resolves.toBe(true);
  });

  test("a stale A clear cannot erase a newer B proof for the same session", async () => {
    const identity = { userId: "u1", sessionId: "same-session" };
    const proofA = createRecoveryProof(
      identity,
      "11111111-1111-4111-8111-111111111111",
    );
    const proofB = createRecoveryProof(
      identity,
      "22222222-2222-4222-8222-222222222222",
    );
    await persistRecoveryProof(proofA);
    await persistRecoveryProof(proofB);

    await expect(clearRecoveryStateExpected(proofA)).resolves.toBe(false);
    await expect(loadRecoveryProof()).resolves.toEqual(proofB);
    await expect(clearRecoveryStateExpected(proofB)).resolves.toBe(true);
  });

  test("a proof may clear only the pending nonce from its own transaction", async () => {
    const pendingA = await persistRecoveryPending();
    const proofA = createRecoveryProof(
      { userId: "u1", sessionId: "session-a" },
      pendingA.ownerNonce ?? undefined,
    );
    const pendingB = await persistRecoveryPending();

    expect(recoveryProofOwnsPending(proofA, pendingA)).toBe(true);
    expect(recoveryProofOwnsPending(proofA, pendingB)).toBe(false);
  });

  test("legacy issuedAt-only markers remain a fail-closed owner", () => {
    expect(parseRecoveryPending('{"issuedAt":"2026-09-13T00:00:00.000Z"}')).toEqual({
      issuedAt: "2026-09-13T00:00:00.000Z",
      ownerNonce: null,
    });
  });

  test("arms web callback routes before Supabase consumes their session", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://example.com/2nd-B/reset-password?code=pkce-1" } },
    });
    await expect(armWebRecoveryPendingFromLocation()).resolves.toMatchObject({
      ownerNonce: expect.any(String),
    });
    expect(lockRequest).toHaveBeenCalled();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
  });

  // U1 (sec-port 2026-09-17, the 09-07 BLOCK P1 #3 fix): a storage event's
  // newValue can be stale by delivery time. A late null must not release the
  // in-memory fence while the live ledger still holds a marker.
  test("a late null storage event cannot release a newer marker still on disk", async () => {
    await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);

    // Another tab cleared its older marker before this tab wrote B, and that
    // removal's event is only delivered now.
    expect(applyRecoveryPendingStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a malformed marker on disk stays a fence even when the event says it is gone", () => {
    values.set(RECOVERY_PENDING_KEY, "{not json");

    expect(applyRecoveryPendingStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("an unreadable ledger keeps the fence closed when the event says it is gone", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage disabled");
      },
    });

    expect(applyRecoveryPendingStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a valid late marker event is still reported as valid after its marker is gone", () => {
    // Another tab wrote A and already cleared it (a frozen tab gets both events
    // at once). AuthContext fails closed when a non-null event returns no marker,
    // and without a proof that is a local sign-out, so judging A by the
    // now-empty ledger would sign out a bystander tab. A keeps the fence closed
    // until its own removal event lands.
    const markerA = {
      issuedAt: "2026-09-17T00:00:00.000Z",
      ownerNonce: "11111111-1111-4111-8111-111111111111",
    };

    expect(applyRecoveryPendingStorageValue(JSON.stringify(markerA))).toEqual(markerA);
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(applyRecoveryPendingStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(false);
  });

  test("without web storage the event value is still what gets applied", () => {
    delete (globalThis as { window?: unknown }).window;
    const marker = {
      issuedAt: "2026-09-17T00:00:00.000Z",
      ownerNonce: "11111111-1111-4111-8111-111111111111",
    };

    expect(applyRecoveryPendingStorageValue(JSON.stringify(marker))).toEqual(marker);
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(applyRecoveryPendingStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(false);
  });

  // N1 (sec-port 2026-09-17): the callback quarantine key had the same gap. A
  // late null from another tab's finished callback must not release the fence
  // while this tab's own newer callback is still in flight.
  test("a late null quarantine event cannot release this tab's own newer quarantine", async () => {
    const quarantineQ2 = createAuthCallbackQuarantine("ordinary");
    await runAuthSessionMutation(
      () => persistAuthCallbackQuarantineInsideMutation(quarantineQ2),
      { requireCrossTab: true },
    );
    expect(isRecoveryPendingInMemory()).toBe(true);

    // Another tab removed its finished Q1 before this tab took M and wrote Q2,
    // and that removal's event is only delivered now.
    expect(applyAuthCallbackQuarantineStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("an unreadable ledger keeps the quarantine fence closed on a null event", () => {
    const quarantineQ1 = createAuthCallbackQuarantine("ordinary");
    applyAuthCallbackQuarantineStorageValue(JSON.stringify(quarantineQ1));
    expect(isRecoveryPendingInMemory()).toBe(true);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage disabled");
      },
    });

    expect(applyAuthCallbackQuarantineStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a valid late quarantine event is still reported as valid after its marker is gone", () => {
    // Another tab wrote Q1 and already removed it (a frozen tab gets both events
    // at once). AuthContext fails closed when a non-null quarantine event returns
    // nothing, and without a proof that is a local sign-out, so judging Q1 by the
    // now-empty ledger would sign out a bystander tab.
    const quarantineQ1 = createAuthCallbackQuarantine("ordinary");
    expect(values.has(AUTH_CALLBACK_QUARANTINE_KEY)).toBe(false);

    const raw = JSON.stringify(quarantineQ1);
    expect(applyAuthCallbackQuarantineStorageValue(raw)).toEqual(quarantineQ1);
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("a quarantine removal still opens the fence once the ledger is really empty", () => {
    const quarantineQ1 = createAuthCallbackQuarantine("ordinary");
    applyAuthCallbackQuarantineStorageValue(JSON.stringify(quarantineQ1));
    expect(isRecoveryPendingInMemory()).toBe(true);

    expect(applyAuthCallbackQuarantineStorageValue(null)).toBeNull();
    expect(isRecoveryPendingInMemory()).toBe(false);
  });
});

// The N1 fix keeps the fence closed; AuthContext is what has to honor it. When
// another tab's quarantine disappears it re-reads the session, and it re-enters
// INITIAL_SESSION only while isRecoveryPendingInMemory() is false. That check is
// what stops a late null from promoting a session in the middle of this tab's own
// callback. AuthContext render tests cannot run on RN 0.85, so pin it in source.
describe("AuthContext cross-tab quarantine re-entry", () => {
  test("re-checks the in-memory fence before re-entering INITIAL_SESSION", () => {
    const source = readFileSync(join(__dirname, "..", "AuthContext.tsx"), "utf8");
    const start = source.indexOf("if (event.key === AUTH_CALLBACK_QUARANTINE_KEY)");
    const end = source.indexOf("if (event.key === RECOVERY_PENDING_KEY)", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = source.slice(start, end);

    const reread = branch.indexOf("supabase.auth.getSession()");
    const fence = branch.indexOf("!isRecoveryPendingInMemory()", reread);
    const reentry = branch.indexOf('handleAuthEvent("INITIAL_SESSION"', reread);
    expect(reread).toBeGreaterThan(-1);
    expect(fence).toBeGreaterThan(reread);
    expect(reentry).toBeGreaterThan(fence);
    // The check guards the re-entry itself, not an earlier, already closed block.
    expect(branch.slice(fence, reentry)).not.toMatch(/[;}]/);
  });
});
