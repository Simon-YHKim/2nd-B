import {
  __resetRecoveryProofStorageQueueForTests,
  armWebRecoveryPendingFromLocation,
  clearRecoveryPending,
  clearRecoveryProof,
  createRecoveryProof,
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
    await persistRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(true);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(true);
    await expect(loadRecoveryPending()).resolves.toEqual({ issuedAt: expect.any(String) });
    await clearRecoveryPending();
    expect(isRecoveryPendingInMemory()).toBe(false);
    expect(values.has(RECOVERY_PENDING_KEY)).toBe(false);
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
});
