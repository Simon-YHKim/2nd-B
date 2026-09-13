import {
  __resetRecoveryProofStorageQueueForTests,
  applyRecoveryPendingStorageValue,
  armWebRecoveryPendingFromLocation,
  captureRecoveryPendingLease,
  clearRecoveryPending,
  clearRecoveryProof,
  createRecoveryProof,
  isRecoveryPendingStorageKey,
  isRecoveryPendingInMemory,
  loadRecoveryPending,
  loadRecoveryProof,
  parseRecoveryProof,
  persistRecoveryPending,
  persistRecoveryProof,
  recoveryProofMatchesSession,
  recoverySessionIdentity,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "../recovery-proof-store";

function accessToken(sessionId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: "u1", session_id: sessionId }))
    .toString("base64url");
  return `header.${payload}.signature`;
}

describe("persistent recovery proof", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    __resetRecoveryProofStorageQueueForTests();
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
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
    await clearRecoveryProof();
    await expect(loadRecoveryProof()).resolves.toBeNull();
  });

  test("removes an invalid persisted marker during hydration", async () => {
    values.set(RECOVERY_PROOF_KEY, JSON.stringify({ userId: "u1" }));
    await expect(loadRecoveryProof()).rejects.toThrow("invalid");
    expect(values.has(RECOVERY_PROOF_KEY)).toBe(false);
  });

  test("persists and broadcasts a provisional recovery lock", async () => {
    expect(isRecoveryPendingInMemory()).toBe(false);
    const lease = await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: expect.any(String),
      token: lease.token,
    });
    await expect(clearRecoveryPending(lease)).resolves.toBe("cleared");
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(values.has(`${RECOVERY_PENDING_KEY}.${lease.token}`)).toBe(false);
    await expect(loadRecoveryPending()).resolves.toBeNull();
  });

  test("arms web callback routes before Supabase consumes their session", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "https://example.com/2nd-B/reset-password?code=pkce-1" } },
    });
    expect(armWebRecoveryPendingFromLocation()).toBe(true);
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
  });

  test("keeps newer B locked when queued clear A runs before B reaches disk", async () => {
    const leaseA = await persistRecoveryPending();

    const clearA = clearRecoveryPending(leaseA);
    const persistB = persistRecoveryPending();
    const leaseBAtClaim = captureRecoveryPendingLease();
    const [clearResult, leaseBAfterWrite] = await Promise.all([clearA, persistB]);

    expect(clearResult).toBe("cleared");
    expect(leaseBAfterWrite).toEqual(leaseBAtClaim);
    expect(captureRecoveryPendingLease()).toEqual(leaseBAtClaim);
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(`${RECOVERY_PENDING_KEY}.${leaseBAtClaim.token}`)).toBe(true);
  });

  test("re-reads the owner ledger instead of trusting a stale storage event", () => {
    const markerA = {
      issuedAt: "2026-09-07T00:00:00.000Z",
      token: "owner-a",
      ownerKeyVersion: 1,
    };
    const markerB = {
      issuedAt: "2026-09-07T00:00:01.000Z",
      token: "owner-b",
      ownerKeyVersion: 1,
    };
    values.set(RECOVERY_PENDING_KEY, JSON.stringify(markerA));
    values.set(`${RECOVERY_PENDING_KEY}.${markerA.token}`, JSON.stringify(markerA));
    values.set(`${RECOVERY_PENDING_KEY}.${markerB.token}`, JSON.stringify(markerB));

    expect(applyRecoveryPendingStorageValue(JSON.stringify(markerA))).toEqual({
      issuedAt: markerB.issuedAt,
      token: markerB.token,
    });
    expect(captureRecoveryPendingLease().token).toBe(markerB.token);
  });

  test("fails closed after restart when the durable owner ledger is invalid", async () => {
    const token = "owner-a";
    values.set(`${RECOVERY_PENDING_KEY}.${token}`, JSON.stringify({
      issuedAt: "not-a-date",
      token,
      ownerKeyVersion: 1,
    }));
    __resetRecoveryProofStorageQueueForTests();

    await expect(loadRecoveryPending()).rejects.toThrow("owner marker is invalid");
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("preserves a base-only legacy owner across newer A persist and clear", async () => {
    const legacyIssuedAt = "2026-09-07T00:00:00.000Z";
    values.set(RECOVERY_PENDING_KEY, JSON.stringify({ issuedAt: legacyIssuedAt }));

    const leaseA = await persistRecoveryPending();
    await expect(clearRecoveryPending(leaseA)).resolves.toBe("cleared");
    __resetRecoveryProofStorageQueueForTests();

    await expect(loadRecoveryPending()).resolves.toEqual({
      issuedAt: legacyIssuedAt,
      token: expect.any(String),
    });
    expect(isRecoveryPendingInMemory()).toBe(true);
  });

  test("recognizes base, owner, and storage.clear pending events", () => {
    expect(isRecoveryPendingStorageKey(RECOVERY_PENDING_KEY)).toBe(true);
    expect(isRecoveryPendingStorageKey(`${RECOVERY_PENDING_KEY}.owner-a`)).toBe(true);
    expect(isRecoveryPendingStorageKey(null)).toBe(true);
    expect(isRecoveryPendingStorageKey(RECOVERY_PROOF_KEY)).toBe(false);
  });
});
