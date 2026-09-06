// Password-recovery provenance that survives a web refresh or native restart.
// Supabase persists the authenticated recovery session; this marker must have
// the same lifetime or a restart would turn that mandatory reset session into
// an ordinary signed-in session. The marker contains no token or credential.

export const RECOVERY_PROOF_KEY = "secondbrain.auth.recovery-proof.v1";
export const RECOVERY_PENDING_KEY = "secondbrain.auth.recovery-pending.v1";

export interface RecoverySessionIdentity {
  userId: string;
  /** Stable `session_id` JWT claim. Unlike the access token, it survives refresh. */
  sessionId: string;
}

export interface RecoveryProof extends RecoverySessionIdentity {
  issuedAt: string;
}

export interface RecoveryPending {
  issuedAt: string;
}

export interface RecoverySessionLike {
  access_token?: string | null;
  user?: { id?: string | null } | null;
}

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode the JWT payload without adding a runtime dependency or storing a token. */
function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || normalized.length % 4 === 1) return null;
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const char of padded) {
    if (char === "=") break;
    const index = BASE64_ALPHABET.indexOf(char);
    if (index < 0) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

export function sessionIdFromAccessToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const payloadSegment = accessToken.split(".")[1];
  if (!payloadSegment) return null;
  const payloadJson = decodeBase64Url(payloadSegment);
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { session_id?: unknown };
    return typeof payload.session_id === "string" && payload.session_id.length > 0
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}

export function recoverySessionIdentity(
  session: RecoverySessionLike | null | undefined,
): RecoverySessionIdentity | null {
  const userId = session?.user?.id;
  const sessionId = sessionIdFromAccessToken(session?.access_token);
  return typeof userId === "string" && userId.length > 0 && sessionId
    ? { userId, sessionId }
    : null;
}

export function createRecoveryProof(identity: RecoverySessionIdentity): RecoveryProof {
  return { ...identity, issuedAt: new Date().toISOString() };
}

export function recoveryProofMatchesSession(
  proof: RecoveryProof,
  session: RecoverySessionLike | null | undefined,
): boolean {
  const identity = recoverySessionIdentity(session);
  return identity?.userId === proof.userId && identity.sessionId === proof.sessionId;
}

export function parseRecoveryProof(raw: string | null): RecoveryProof | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecoveryProof>;
    const issuedAt = typeof value.issuedAt === "string" ? Date.parse(value.issuedAt) : NaN;
    if (
      typeof value.userId !== "string" ||
      value.userId.length === 0 ||
      typeof value.sessionId !== "string" ||
      value.sessionId.length === 0 ||
      !Number.isFinite(issuedAt)
    ) {
      return null;
    }
    return { userId: value.userId, sessionId: value.sessionId, issuedAt: value.issuedAt as string };
  } catch {
    return null;
  }
}

export function parseRecoveryPending(raw: string | null): RecoveryPending | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecoveryPending>;
    const issuedAt = typeof value.issuedAt === "string" ? Date.parse(value.issuedAt) : NaN;
    return Number.isFinite(issuedAt) ? { issuedAt: value.issuedAt as string } : null;
  } catch {
    return null;
  }
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): AsyncStorageLike | null {
  if (!isReactNativeRuntime()) return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

function webStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  // Reading the global itself may throw in hardened/private browser contexts.
  return localStorage;
}

function requireRuntimeStorage(): { kind: "web"; store: Storage } | { kind: "native"; store: AsyncStorageLike } | null {
  if (isReactNativeRuntime()) {
    const store = nativeStorage();
    if (!store) throw new Error("Recovery proof storage is unavailable on native");
    return { kind: "native", store };
  }
  const store = webStorage();
  return store ? { kind: "web", store } : null;
}

/**
 * Arm a provisional cross-tab lock before auth-js consumes a web callback URL.
 * A PKCE `code` is only provisional here; authoritative recovery provenance
 * still comes from auth-js redirectType/PASSWORD_RECOVERY later.
 */
export function armWebRecoveryPendingFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const resetRoute = url.pathname.replace(/\/+$/, "").endsWith("/reset-password");
    const params = new URLSearchParams(url.search);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    for (const [key, value] of new URLSearchParams(hash)) params.set(key, value);
    const callbackSignal =
      params.get("type") === "recovery" ||
      params.has("code") ||
      params.has("access_token") ||
      params.has("error_code");
    if (!resetRoute || !callbackSignal) return false;
    localStorage.setItem(
      RECOVERY_PENDING_KEY,
      JSON.stringify({ issuedAt: new Date().toISOString() } satisfies RecoveryPending),
    );
    setMemoryPending(true);
    return true;
  } catch {
    return false;
  }
}

// Storage operations are serialized. A slow set from PASSWORD_RECOVERY must
// never land after a later SIGNED_OUT clear and resurrect a stale proof.
let storageQueue: Promise<void> = Promise.resolve();
let memoryPending = false;
const pendingListeners = new Set<(pending: boolean) => void>();

function setMemoryPending(pending: boolean): void {
  if (memoryPending === pending) return;
  memoryPending = pending;
  for (const listener of pendingListeners) listener(pending);
}

export function isRecoveryPendingInMemory(): boolean {
  return memoryPending;
}

export function subscribeRecoveryPending(listener: (pending: boolean) => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

export function applyRecoveryPendingStorageValue(raw: string | null): RecoveryPending | null {
  const pending = parseRecoveryPending(raw);
  setMemoryPending(pending !== null);
  return pending;
}

function enqueueStorage<T>(operation: () => Promise<T>): Promise<T> {
  const task = storageQueue.then(operation, operation);
  storageQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function loadRecoveryProof(): Promise<RecoveryProof | null> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return null;
    const raw = storage.kind === "web"
      ? storage.store.getItem(RECOVERY_PROOF_KEY)
      : await storage.store.getItem(RECOVERY_PROOF_KEY);
    const proof = parseRecoveryProof(raw);
    if (raw && !proof) {
      if (storage.kind === "web") storage.store.removeItem(RECOVERY_PROOF_KEY);
      else await storage.store.removeItem(RECOVERY_PROOF_KEY);
      throw new Error("Persisted recovery proof is invalid");
    }
    return proof;
  });
}

export function persistRecoveryProof(proof: RecoveryProof): Promise<void> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return;
    const raw = JSON.stringify(proof);
    if (storage.kind === "web") storage.store.setItem(RECOVERY_PROOF_KEY, raw);
    else await storage.store.setItem(RECOVERY_PROOF_KEY, raw);
  });
}

export function clearRecoveryProof(): Promise<void> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return;
    if (storage.kind === "web") storage.store.removeItem(RECOVERY_PROOF_KEY);
    else await storage.store.removeItem(RECOVERY_PROOF_KEY);
  });
}

export function loadRecoveryPending(): Promise<RecoveryPending | null> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return null;
    const raw = storage.kind === "web"
      ? storage.store.getItem(RECOVERY_PENDING_KEY)
      : await storage.store.getItem(RECOVERY_PENDING_KEY);
    const pending = parseRecoveryPending(raw);
    if (raw && !pending) {
      if (storage.kind === "web") storage.store.removeItem(RECOVERY_PENDING_KEY);
      else await storage.store.removeItem(RECOVERY_PENDING_KEY);
      setMemoryPending(false);
      throw new Error("Persisted recovery pending marker is invalid");
    }
    setMemoryPending(pending !== null);
    return pending;
  });
}

export function persistRecoveryPending(): Promise<void> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return;
    const raw = JSON.stringify({ issuedAt: new Date().toISOString() } satisfies RecoveryPending);
    if (storage.kind === "web") storage.store.setItem(RECOVERY_PENDING_KEY, raw);
    else await storage.store.setItem(RECOVERY_PENDING_KEY, raw);
    setMemoryPending(true);
  });
}

export function clearRecoveryPending(): Promise<void> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return;
    if (storage.kind === "web") storage.store.removeItem(RECOVERY_PENDING_KEY);
    else await storage.store.removeItem(RECOVERY_PENDING_KEY);
    setMemoryPending(false);
  });
}

export function __resetRecoveryProofStorageQueueForTests(): void {
  storageQueue = Promise.resolve();
  setMemoryPending(false);
}
