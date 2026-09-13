import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  __resetRecoveryProofStorageQueueForTests,
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
  persistRecoveryPending,
  persistRecoveryProof,
  recoveryProofMatchesSession,
  recoveryProofOwnsPending,
  recoverySessionIdentity,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "../recovery-proof-store";
import { __resetAuthStorageRuntimeForTests } from "../session-mutation";

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
});
