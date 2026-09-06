// Password-recovery provenance that survives a web refresh or native restart.
// Supabase persists the authenticated recovery session; this marker must have
// the same lifetime or a restart would turn that mandatory reset session into
// an ordinary signed-in session. The marker contains no token or credential.

import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";

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
  /** Opaque ownership token. Older markers without it remain readable. */
  token?: string;
}

/**
 * In-process version plus the disk ownership token for one pending intent.
 * The revision prevents ABA when a failed write restores an older owner.
 */
export interface RecoveryPendingLease {
  readonly revision: number;
  readonly token: string | null;
}

export type RecoveryPendingClearResult = "cleared" | "stale";

export interface RecoverySessionLike {
  access_token?: string | null;
  user?: { id?: string | null } | null;
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
    const token = value.token;
    if (
      !Number.isFinite(issuedAt)
      || (token !== undefined && (typeof token !== "string" || token.length === 0))
    ) {
      return null;
    }
    return token
      ? { issuedAt: value.issuedAt as string, token }
      : { issuedAt: value.issuedAt as string };
  } catch {
    return null;
  }
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function webStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  // Reading the global itself may throw in hardened/private browser contexts.
  return localStorage;
}

function requireRuntimeStorage(): { kind: "web"; store: Storage } | { kind: "native"; store: StringStorage } | null {
  if (isReactNativeRuntime()) {
    return { kind: "native", store: getEncryptedNativeStorage() };
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
  let claimed: {
    lease: RecoveryPendingLease;
    previous: PendingStateSnapshot;
  } | null = null;
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
    const previous = capturePendingState();
    const marker = createRecoveryPendingMarker();
    const lease = claimPending(marker.token);
    claimed = { lease, previous };
    localStorage.setItem(
      RECOVERY_PENDING_KEY,
      JSON.stringify(marker),
    );
    return true;
  } catch {
    if (claimed) restorePendingStateIfCurrent(claimed.lease, claimed.previous);
    return false;
  }
}

// Storage operations are serialized. A slow set from PASSWORD_RECOVERY must
// never land after a later SIGNED_OUT clear and resurrect a stale proof.
let storageQueue: Promise<void> = Promise.resolve();
let memoryPending = false;
let pendingRevision = 0;
let pendingToken: string | null = null;
let pendingIsLegacy = false;
let pendingTokenSequence = 0;
const pendingListeners = new Set<(pending: boolean) => void>();

interface PendingStateSnapshot {
  pending: boolean;
  revision: number;
  token: string | null;
  legacy: boolean;
}

function createPendingToken(): string {
  pendingTokenSequence += 1;
  // This is an ownership nonce, not a credential. Randomness prevents two tabs
  // created in the same millisecond from producing the same disk owner.
  return [
    Date.now().toString(36),
    pendingTokenSequence.toString(36),
    Math.random().toString(36).slice(2),
  ].join("-");
}

function createRecoveryPendingMarker(): Required<RecoveryPending> {
  return {
    issuedAt: new Date().toISOString(),
    token: createPendingToken(),
  };
}

function capturePendingState(): PendingStateSnapshot {
  return {
    pending: memoryPending,
    revision: pendingRevision,
    token: pendingToken,
    legacy: pendingIsLegacy,
  };
}

export function captureRecoveryPendingLease(): RecoveryPendingLease {
  return { revision: pendingRevision, token: pendingToken };
}

export function isRecoveryPendingLeaseCurrent(lease: RecoveryPendingLease): boolean {
  return lease.revision === pendingRevision && lease.token === pendingToken;
}

function claimPending(token: string, legacy = false): RecoveryPendingLease {
  pendingRevision += 1;
  pendingToken = token;
  pendingIsLegacy = legacy;
  setMemoryPending(true);
  return captureRecoveryPendingLease();
}

function restorePendingStateIfCurrent(
  lease: RecoveryPendingLease,
  previous: PendingStateSnapshot,
): void {
  if (!isRecoveryPendingLeaseCurrent(lease)) return;
  // Do not restore the old revision: that would make a pre-claim snapshot look
  // current again. Restore only the semantic state under a fresh revision.
  pendingRevision += 1;
  pendingToken = previous.token;
  pendingIsLegacy = previous.legacy;
  setMemoryPending(previous.pending);
}

function applyPendingMarker(pending: RecoveryPending): void {
  const token = pending.token ?? createPendingToken();
  claimPending(token, pending.token === undefined);
}

function applyNoPendingMarker(): void {
  pendingRevision += 1;
  pendingToken = null;
  pendingIsLegacy = false;
  setMemoryPending(false);
}

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
  if (pending) {
    applyPendingMarker(pending);
  } else if (raw) {
    // A malformed cross-tab marker is still an unresolved recovery signal.
    // Keep the in-memory gate locked while the caller reports the fault.
    claimPending(createPendingToken(), true);
  } else {
    applyNoPendingMarker();
  }
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
  const requestedRevision = pendingRevision;
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
      if (pendingRevision === requestedRevision) applyNoPendingMarker();
      throw new Error("Persisted recovery pending marker is invalid");
    }
    // A persist intent may have claimed a newer owner while an encrypted read
    // was pending. Its state and queued write must win over this older read.
    if (pendingRevision !== requestedRevision) return pending;
    if (!pending) {
      applyNoPendingMarker();
      return null;
    }
    if (pending.token) {
      if (!memoryPending || pendingToken !== pending.token || pendingIsLegacy) {
        applyPendingMarker(pending);
      }
      return pending;
    }

    // Legacy issuedAt-only markers remain locked, then are upgraded in place.
    // If the upgrade fails, the conservative legacy lock remains in memory.
    const marker: Required<RecoveryPending> = {
      issuedAt: pending.issuedAt,
      token: createPendingToken(),
    };
    const lease = claimPending(marker.token, true);
    const rawMarker = JSON.stringify(marker);
    if (storage.kind === "web") storage.store.setItem(RECOVERY_PENDING_KEY, rawMarker);
    else await storage.store.setItem(RECOVERY_PENDING_KEY, rawMarker);
    if (isRecoveryPendingLeaseCurrent(lease)) pendingIsLegacy = false;
    return marker;
  });
}

export function persistRecoveryPending(): Promise<RecoveryPendingLease> {
  // Claim before entering the serialized queue. Otherwise an older queued clear
  // can run first and briefly unlock or delete this newer pending intent.
  const previous = capturePendingState();
  const marker = createRecoveryPendingMarker();
  const lease = claimPending(marker.token);
  return enqueueStorage(async () => {
    try {
      const storage = requireRuntimeStorage();
      if (!storage) {
        restorePendingStateIfCurrent(lease, previous);
        return lease;
      }
      const raw = JSON.stringify(marker);
      if (storage.kind === "web") storage.store.setItem(RECOVERY_PENDING_KEY, raw);
      else await storage.store.setItem(RECOVERY_PENDING_KEY, raw);
      return lease;
    } catch (error) {
      // A failed A write may restore A's prior state, but never B's newer claim.
      restorePendingStateIfCurrent(lease, previous);
      throw error;
    }
  });
}

export function clearRecoveryPending(): Promise<void>;
export function clearRecoveryPending(
  expectedLease: RecoveryPendingLease,
): Promise<RecoveryPendingClearResult>;
export function clearRecoveryPending(
  expectedLease: RecoveryPendingLease = captureRecoveryPendingLease(),
): Promise<void | RecoveryPendingClearResult> {
  return enqueueStorage(async () => {
    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    const storage = requireRuntimeStorage();
    if (!storage) {
      if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
      pendingIsLegacy = false;
      setMemoryPending(false);
      return "cleared";
    }

    const raw = storage.kind === "web"
      ? storage.store.getItem(RECOVERY_PENDING_KEY)
      : await storage.store.getItem(RECOVERY_PENDING_KEY);
    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    const pending = parseRecoveryPending(raw);
    if (raw && !pending) throw new Error("Persisted recovery pending marker is invalid");
    // Legacy markers cannot prove ownership. Keep them locked until hydration
    // upgrades them, rather than letting a cleanup guess and delete one.
    if (
      pending
      && (pendingIsLegacy || !pending.token || pending.token !== expectedLease.token)
    ) {
      return "stale";
    }
    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    if (raw) {
      if (storage.kind === "web") storage.store.removeItem(RECOVERY_PENDING_KEY);
      else await storage.store.removeItem(RECOVERY_PENDING_KEY);
    }
    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    pendingIsLegacy = false;
    setMemoryPending(false);
    return "cleared";
  });
}

export function __resetRecoveryProofStorageQueueForTests(): void {
  storageQueue = Promise.resolve();
  pendingRevision = 0;
  pendingToken = null;
  pendingIsLegacy = false;
  pendingTokenSequence = 0;
  setMemoryPending(false);
}
