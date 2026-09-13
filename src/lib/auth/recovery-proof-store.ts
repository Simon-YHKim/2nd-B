// Password-recovery provenance that survives a web refresh or native restart.
// Supabase persists the authenticated recovery session; this marker must have
// the same lifetime or a restart would turn that mandatory reset session into
// an ordinary signed-in session. The marker contains no token or credential.

import * as Crypto from "expo-crypto";

import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";
import {
  AUTH_CALLBACK_QUARANTINE_KEY,
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
} from "./auth-storage-schema";
import { getAuthStorageRuntime, runAuthSessionMutation } from "./session-mutation";

export {
  AUTH_CALLBACK_QUARANTINE_KEY,
  LEGACY_RECOVERY_PENDING_KEY,
  LEGACY_RECOVERY_PROOF_KEY,
  RECOVERY_PENDING_KEY,
  RECOVERY_PROOF_KEY,
  sessionIdFromAccessToken,
};

export interface RecoverySessionIdentity {
  userId: string;
  /** Stable `session_id` JWT claim. Unlike the access token, it survives refresh. */
  sessionId: string;
}

export interface RecoveryProof extends RecoverySessionIdentity {
  issuedAt: string;
  /** Pending operation that atomically published this proof. Absent on legacy
   *  proofs and event-only in-memory locks. */
  pendingOwnerNonce?: string;
  /** Callback quarantine that existed before the session producer ran. */
  callbackOwnerNonce?: string;
}

/** Exact, durable recovery operation captured by a caller. Unlike the general
 * auth-session expectation, this includes callback issuance + nonce identity. */
export type RecoveryOperationExpectation = Readonly<RecoveryProof>;

export class RecoveryOperationOwnerChangedError extends Error {
  constructor() {
    super("The active password recovery operation changed before the requested action.");
    this.name = "RecoveryOperationOwnerChangedError";
  }
}

export interface RecoveryPending {
  /** CSPRNG owner for one recovery operation/callback. Null means a legacy
   *  issuedAt-only marker that must remain fail-closed until exact CAS cleanup. */
  ownerNonce: string | null;
  issuedAt: string;
}

export interface AuthCallbackQuarantine {
  ownerNonce: string;
  issuedAt: string;
  kind: "ordinary" | "recovery";
  /** Exact recovery operation that may receive this callback. */
  pendingOwnerNonce: string | null;
}

export interface RecoveryMarkerSnapshot {
  proof: RecoveryProof | null;
  pending: RecoveryPending | null;
  quarantine: AuthCallbackQuarantine | null;
}

export interface RecoverySessionLike {
  access_token?: string | null;
  user?: { id?: string | null } | null;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function recoverySessionIdentity(
  session: RecoverySessionLike | null | undefined,
): RecoverySessionIdentity | null {
  const userId = session?.user?.id;
  const sessionId = sessionIdFromAccessToken(session?.access_token);
  return typeof userId === "string" && userId.length > 0 && sessionId
    ? { userId, sessionId }
    : null;
}

export function createRecoveryProof(
  identity: RecoverySessionIdentity,
  pendingOwnerNonce?: string,
  callbackOwnerNonce?: string,
): RecoveryProof {
  return {
    ...identity,
    issuedAt: new Date().toISOString(),
    ...(pendingOwnerNonce ? { pendingOwnerNonce } : {}),
    ...(callbackOwnerNonce ? { callbackOwnerNonce } : {}),
  };
}

export function createRecoveryPending(): RecoveryPending {
  return {
    ownerNonce: Crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  };
}

export function createAuthCallbackQuarantine(
  kind: AuthCallbackQuarantine["kind"],
  pending: RecoveryPending | null = null,
): AuthCallbackQuarantine {
  return {
    ownerNonce: Crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
    kind,
    pendingOwnerNonce: pending?.ownerNonce ?? null,
  };
}

export function recoveryProofMatchesSession(
  proof: RecoveryProof,
  session: RecoverySessionLike | null | undefined,
): boolean {
  const identity = recoverySessionIdentity(session);
  return identity?.userId === proof.userId && identity.sessionId === proof.sessionId;
}

/** Exact proof-owner comparison. `session_id` alone is not an operation CAS:
 *  two recovery callbacks can target the same durable auth session. */
export function sameRecoveryProof(
  left: RecoveryProof | null,
  right: RecoveryOperationExpectation | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.userId === right.userId &&
    left.sessionId === right.sessionId &&
    left.issuedAt === right.issuedAt &&
    left.pendingOwnerNonce === right.pendingOwnerNonce &&
    left.callbackOwnerNonce === right.callbackOwnerNonce
  );
}

/** Pure publication CAS used by AuthContext after a durable operation settles. */
export function settleRecoveryPublicationExpected(
  current: RecoveryProof | null,
  expected: RecoveryOperationExpectation,
): { completed: boolean; proof: RecoveryProof | null } {
  if (!current) return { completed: true, proof: null };
  return sameRecoveryProof(current, expected)
    ? { completed: true, proof: null }
    : { completed: false, proof: current };
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
    if (
      value.pendingOwnerNonce !== undefined &&
      (
        typeof value.pendingOwnerNonce !== "string" ||
        !UUID_V4.test(value.pendingOwnerNonce)
      )
    ) {
      return null;
    }
    if (
      value.callbackOwnerNonce !== undefined &&
      (
        typeof value.callbackOwnerNonce !== "string" ||
        !UUID_V4.test(value.callbackOwnerNonce)
      )
    ) {
      return null;
    }
    return {
      userId: value.userId,
      sessionId: value.sessionId,
      issuedAt: value.issuedAt as string,
      ...(value.pendingOwnerNonce ? { pendingOwnerNonce: value.pendingOwnerNonce } : {}),
      ...(value.callbackOwnerNonce ? { callbackOwnerNonce: value.callbackOwnerNonce } : {}),
    };
  } catch {
    return null;
  }
}

export function parseRecoveryPending(raw: string | null): RecoveryPending | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecoveryPending>;
    const issuedAt = typeof value.issuedAt === "string" ? Date.parse(value.issuedAt) : NaN;
    if (!Number.isFinite(issuedAt)) return null;
    // v1 markers contained only issuedAt. Preserve them as an explicit legacy
    // owner instead of deleting them: a persisted recovery session may already
    // exist, so migration must fail closed until the exact marker is handled.
    if (value.ownerNonce === undefined || value.ownerNonce === null) {
      return { ownerNonce: null, issuedAt: value.issuedAt as string };
    }
    if (
      typeof value.ownerNonce !== "string" ||
      !UUID_V4.test(value.ownerNonce)
    ) {
      return null;
    }
    return { ownerNonce: value.ownerNonce, issuedAt: value.issuedAt as string };
  } catch {
    return null;
  }
}

export function parseAuthCallbackQuarantine(
  raw: string | null,
): AuthCallbackQuarantine | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AuthCallbackQuarantine>;
    const issuedAt = typeof value.issuedAt === "string" ? Date.parse(value.issuedAt) : NaN;
    if (
      typeof value.ownerNonce !== "string" ||
      !UUID_V4.test(value.ownerNonce) ||
      !Number.isFinite(issuedAt) ||
      (value.kind !== "ordinary" && value.kind !== "recovery") ||
      (
        value.pendingOwnerNonce !== null &&
        (typeof value.pendingOwnerNonce !== "string" || !UUID_V4.test(value.pendingOwnerNonce))
      )
    ) {
      return null;
    }
    return {
      ownerNonce: value.ownerNonce,
      issuedAt: value.issuedAt as string,
      kind: value.kind,
      pendingOwnerNonce: value.pendingOwnerNonce,
    };
  } catch {
    return null;
  }
}

export function recoveryProofOwnsPending(
  proof: RecoveryProof,
  pending: RecoveryPending,
): boolean {
  return Boolean(
    proof.pendingOwnerNonce &&
    pending.ownerNonce &&
    proof.pendingOwnerNonce === pending.ownerNonce,
  );
}

export function recoveryProofOwnsCallbackQuarantine(
  proof: RecoveryProof,
  quarantine: AuthCallbackQuarantine,
): boolean {
  return Boolean(
    quarantine.kind === "recovery" &&
    proof.callbackOwnerNonce &&
    proof.callbackOwnerNonce === quarantine.ownerNonce &&
    proof.pendingOwnerNonce &&
    proof.pendingOwnerNonce === quarantine.pendingOwnerNonce,
  );
}

function sameRecoveryPending(
  left: RecoveryPending | null,
  right: RecoveryPending,
): boolean {
  return left?.ownerNonce === right.ownerNonce && left.issuedAt === right.issuedAt;
}

export function sameAuthCallbackQuarantine(
  left: AuthCallbackQuarantine | null,
  right: AuthCallbackQuarantine | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.ownerNonce === right.ownerNonce &&
    left.issuedAt === right.issuedAt &&
    left.kind === right.kind &&
    left.pendingOwnerNonce === right.pendingOwnerNonce
  );
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function nativeStorage(): StringStorage | null {
  if (!isReactNativeRuntime()) return null;
  // Initialization/key-continuity failures are security signals. Never fall
  // back to plaintext or an ephemeral marker store on a genuine native runtime.
  return getEncryptedNativeStorage();
}

function webStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  // Reading the global itself may throw in hardened/private browser contexts.
  return localStorage;
}

function requireRuntimeStorage(): { kind: "web"; store: Storage } | { kind: "native"; store: StringStorage } | null {
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
let armedWebRecovery:
  | { href: string; promise: Promise<RecoveryPending> }
  | null = null;

export function armWebRecoveryPendingFromLocation(): Promise<RecoveryPending | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  try {
    const href = window.location.href;
    const url = new URL(href);
    const resetRoute = url.pathname.replace(/\/+$/, "").endsWith("/reset-password");
    const params = new URLSearchParams(url.search);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    for (const [key, value] of new URLSearchParams(hash)) params.set(key, value);
    const callbackSignal =
      params.get("type") === "recovery" ||
      params.has("code") ||
      params.has("access_token") ||
      params.has("error_code");
    if (!resetRoute || !callbackSignal) return Promise.resolve(null);
    if (armedWebRecovery?.href === href) return armedWebRecovery.promise;
    const pending = createRecoveryPending();
    // Close this frame immediately. The durable write itself is serialized by
    // M below; if that fails, retaining the in-memory fence is fail-closed.
    setRecoveryPendingPresence(true);
    const promise = persistRecoveryPending(pending).then(() => pending);
    armedWebRecovery = { href, promise };
    return promise;
  } catch {
    return Promise.resolve(null);
  }
}

// Storage operations are serialized. A slow write must never land after a
// later owner-CAS clear and resurrect stale recovery state.
let storageQueue: Promise<void> = Promise.resolve();
let memoryRecoveryPending = false;
let memoryCallbackQuarantine = false;
let memoryPending = false;
const pendingListeners = new Set<(pending: boolean) => void>();

function publishMemoryPending(): void {
  const pending = memoryRecoveryPending || memoryCallbackQuarantine;
  if (memoryPending === pending) return;
  memoryPending = pending;
  for (const listener of pendingListeners) listener(pending);
}

function setRecoveryPendingPresence(pending: boolean): void {
  memoryRecoveryPending = pending;
  publishMemoryPending();
}

function setCallbackQuarantinePresence(pending: boolean): void {
  memoryCallbackQuarantine = pending;
  publishMemoryPending();
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
  // Malformed non-null state is still a restart fence. Its owner cannot be
  // proven, so only fail-closed handling (never deletion) may resolve it.
  setRecoveryPendingPresence(raw !== null);
  return pending;
}

export function applyAuthCallbackQuarantineStorageValue(
  raw: string | null,
): AuthCallbackQuarantine | null {
  const quarantine = parseAuthCallbackQuarantine(raw);
  setCallbackQuarantinePresence(raw !== null);
  return quarantine;
}

function enqueueStorage<T>(operation: () => Promise<T>): Promise<T> {
  const readyOperation = async () => {
    // Recovery keys participate in the auth v1 -> v2 migration. Never snapshot
    // them before that migration barrier has copied the legacy pair.
    await getAuthStorageRuntime().ready();
    return operation();
  };
  const task = storageQueue.then(readyOperation, readyOperation);
  storageQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function enqueueStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  return enqueueStorage(() =>
    runAuthSessionMutation(() => operation(), { requireCrossTab: true }),
  );
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
      throw new Error("Persisted recovery proof is invalid");
    }
    return proof;
  });
}

async function getStoredValue(
  storage: NonNullable<ReturnType<typeof requireRuntimeStorage>>,
  key: string,
): Promise<string | null> {
  return storage.kind === "web"
    ? storage.store.getItem(key)
    : await storage.store.getItem(key);
}

async function setStoredValue(
  storage: NonNullable<ReturnType<typeof requireRuntimeStorage>>,
  key: string,
  value: string,
): Promise<void> {
  if (storage.kind === "web") storage.store.setItem(key, value);
  else await storage.store.setItem(key, value);
}

async function removeStoredValue(
  storage: NonNullable<ReturnType<typeof requireRuntimeStorage>>,
  key: string,
): Promise<void> {
  if (storage.kind === "web") storage.store.removeItem(key);
  else await storage.store.removeItem(key);
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function loadRecoveryMarkerSnapshotInsideMutation(): Promise<RecoveryMarkerSnapshot> {
  const storage = requireRuntimeStorage();
  if (!storage) throw new Error("Recovery marker storage is unavailable");
  const [rawProof, rawPending, rawQuarantine] = await Promise.all([
    getStoredValue(storage, RECOVERY_PROOF_KEY),
    getStoredValue(storage, RECOVERY_PENDING_KEY),
    getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY),
  ]);
  const proof = parseRecoveryProof(rawProof);
  const pending = parseRecoveryPending(rawPending);
  const quarantine = parseAuthCallbackQuarantine(rawQuarantine);
  if (rawProof !== null && !proof) throw new Error("Persisted recovery proof is invalid");
  if (rawPending !== null && !pending) throw new Error("Persisted recovery pending marker is invalid");
  if (rawQuarantine !== null && !quarantine) {
    throw new Error("Persisted auth callback quarantine is invalid");
  }
  setRecoveryPendingPresence(pending !== null);
  setCallbackQuarantinePresence(quarantine !== null);
  return { proof, pending, quarantine };
}

export function loadRecoveryMarkerSnapshot(): Promise<RecoveryMarkerSnapshot> {
  return enqueueStorage(() => loadRecoveryMarkerSnapshotInsideMutation());
}

function sameRecoveryMarkerSnapshot(
  left: RecoveryMarkerSnapshot,
  right: RecoveryMarkerSnapshot,
): boolean {
  return (
    sameRecoveryProof(left.proof, right.proof) &&
    (
      left.pending === null
        ? right.pending === null
        : right.pending !== null && sameRecoveryPending(left.pending, right.pending)
    ) &&
    sameAuthCallbackQuarantine(left.quarantine, right.quarantine)
  );
}

/** Remove exactly one previously-read marker set. A stale A snapshot can never
 * delete any marker written by a newer callback B. Call only while owning M. */
export async function clearRecoveryMarkerSnapshotExpectedInsideMutation(
  expected: RecoveryMarkerSnapshot,
): Promise<boolean> {
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  const current = await loadRecoveryMarkerSnapshotInsideMutation();
  if (!sameRecoveryMarkerSnapshot(current, expected)) return false;
  if (expected.quarantine) await removeStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
  if (expected.pending) await removeStoredValue(storage, RECOVERY_PENDING_KEY);
  if (expected.proof) await removeStoredValue(storage, RECOVERY_PROOF_KEY);
  setRecoveryPendingPresence(false);
  setCallbackQuarantinePresence(false);
  return true;
}

/** Finish a recovery callback whose durable proof owns both provisional
 * markers. The proof remains; only its exact pending/quarantine predecessors
 * are removed. Call only while owning M. */
export async function completeRecoveryHandoffExpectedInsideMutation(
  expected: RecoveryMarkerSnapshot & {
    proof: RecoveryProof;
    quarantine: AuthCallbackQuarantine;
  },
): Promise<boolean> {
  if (!recoveryProofOwnsCallbackQuarantine(expected.proof, expected.quarantine)) return false;
  if (expected.pending && !recoveryProofOwnsPending(expected.proof, expected.pending)) return false;
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  const current = await loadRecoveryMarkerSnapshotInsideMutation();
  if (!sameRecoveryMarkerSnapshot(current, expected)) return false;
  if (expected.pending) await removeStoredValue(storage, RECOVERY_PENDING_KEY);
  await removeStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
  setRecoveryPendingPresence(false);
  setCallbackQuarantinePresence(false);
  return true;
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function persistRecoveryProofInsideMutation(
  proof: RecoveryProof,
): Promise<void> {
  const storage = requireRuntimeStorage();
  if (!storage) throw new Error("Recovery proof storage is unavailable");
  await setStoredValue(storage, RECOVERY_PROOF_KEY, JSON.stringify(proof));
}

export function persistRecoveryProof(proof: RecoveryProof): Promise<void> {
  return enqueueStorageMutation(() => persistRecoveryProofInsideMutation(proof));
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function assertRecoveryOperationCurrentInsideMutation(
  expected: RecoveryOperationExpectation,
): Promise<void> {
  const storage = requireRuntimeStorage();
  if (!storage) throw new RecoveryOperationOwnerChangedError();
  const [rawProof, rawPending, rawQuarantine] = await Promise.all([
    getStoredValue(storage, RECOVERY_PROOF_KEY),
    getStoredValue(storage, RECOVERY_PENDING_KEY),
    getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY),
  ]);
  // Any provisional marker, including an unreadable legacy value, may belong
  // to a newer callback that has not published its proof yet. No side effect
  // may begin until the exact proof owns durable state and none exists.
  if (
    rawPending !== null ||
    rawQuarantine !== null ||
    !sameRecoveryProof(parseRecoveryProof(rawProof), expected)
  ) {
    throw new RecoveryOperationOwnerChangedError();
  }
}

export async function persistAuthCallbackQuarantineInsideMutation(
  quarantine: AuthCallbackQuarantine,
): Promise<void> {
  const storage = requireRuntimeStorage();
  if (!storage) throw new Error("Auth callback quarantine storage is unavailable");
  const raw = await getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
  const current = parseAuthCallbackQuarantine(raw);
  if (raw !== null && !current) throw new Error("Persisted auth callback quarantine is invalid");
  if (current && !sameAuthCallbackQuarantine(current, quarantine)) {
    throw new Error("Another auth callback quarantine is still active");
  }
  await setStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY, JSON.stringify(quarantine));
  setCallbackQuarantinePresence(true);
}

export function loadAuthCallbackQuarantine(): Promise<AuthCallbackQuarantine | null> {
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return null;
    const raw = await getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
    const quarantine = parseAuthCallbackQuarantine(raw);
    if (raw !== null && !quarantine) {
      setCallbackQuarantinePresence(true);
      throw new Error("Persisted auth callback quarantine is invalid");
    }
    setCallbackQuarantinePresence(quarantine !== null);
    return quarantine;
  });
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function clearAuthCallbackQuarantineExpectedInsideMutation(
  expected: AuthCallbackQuarantine,
): Promise<boolean> {
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  const raw = await getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
  if (!sameAuthCallbackQuarantine(parseAuthCallbackQuarantine(raw), expected)) {
    setCallbackQuarantinePresence(raw !== null);
    return false;
  }
  await removeStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY);
  setCallbackQuarantinePresence(false);
  return true;
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function clearRecoveryStateExpectedInsideMutation(
  expected: RecoveryOperationExpectation,
): Promise<boolean> {
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  const [rawProof, rawPending, rawQuarantine] = await Promise.all([
    getStoredValue(storage, RECOVERY_PROOF_KEY),
    getStoredValue(storage, RECOVERY_PENDING_KEY),
    getStoredValue(storage, AUTH_CALLBACK_QUARANTINE_KEY),
  ]);
  const current = parseRecoveryProof(rawProof);
  if (!current) {
    return rawProof === null && rawPending === null && rawQuarantine === null;
  }
  if (!sameRecoveryProof(current, expected)) return false;
  // A fresh provisional marker may belong to a newer callback that has not
  // published its proof yet. Preserve all state rather than guessing ownership.
  if (rawPending !== null || rawQuarantine !== null) return false;
  await removeStoredValue(storage, RECOVERY_PROOF_KEY);
  return true;
}

export function clearRecoveryStateExpected(
  expected: RecoveryOperationExpectation,
): Promise<boolean> {
  return enqueueStorageMutation(() => clearRecoveryStateExpectedInsideMutation(expected));
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
      setRecoveryPendingPresence(true);
      throw new Error("Persisted recovery pending marker is invalid");
    }
    setRecoveryPendingPresence(pending !== null);
    return pending;
  });
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function persistRecoveryPendingInsideMutation(
  pending: RecoveryPending,
): Promise<void> {
  if (!pending.ownerNonce) {
    throw new Error("A new recovery pending marker requires an owner nonce");
  }
  const storage = requireRuntimeStorage();
  if (!storage) throw new Error("Recovery pending storage is unavailable");
  await setStoredValue(storage, RECOVERY_PENDING_KEY, JSON.stringify(pending));
  setRecoveryPendingPresence(true);
}

export function persistRecoveryPending(
  pending: RecoveryPending = createRecoveryPending(),
): Promise<RecoveryPending> {
  return enqueueStorageMutation(async () => {
    await persistRecoveryPendingInsideMutation(pending);
    return pending;
  });
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function recoveryPendingMatchesExpectedInsideMutation(
  expected: RecoveryPending,
): Promise<boolean> {
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  return sameRecoveryPending(
    parseRecoveryPending(await getStoredValue(storage, RECOVERY_PENDING_KEY)),
    expected,
  );
}

/** Call only while the caller already owns the auth mutation lock M. */
export async function clearRecoveryPendingExpectedInsideMutation(
  expected: RecoveryPending,
): Promise<boolean> {
  const storage = requireRuntimeStorage();
  if (!storage) return false;
  const raw = await getStoredValue(storage, RECOVERY_PENDING_KEY);
  if (!sameRecoveryPending(parseRecoveryPending(raw), expected)) {
    setRecoveryPendingPresence(raw !== null);
    return false;
  }
  await removeStoredValue(storage, RECOVERY_PENDING_KEY);
  setRecoveryPendingPresence(false);
  return true;
}

export function clearRecoveryPendingExpected(expected: RecoveryPending): Promise<boolean> {
  return enqueueStorageMutation(() => clearRecoveryPendingExpectedInsideMutation(expected));
}

export function __resetRecoveryProofStorageQueueForTests(): void {
  storageQueue = Promise.resolve();
  armedWebRecovery = null;
  memoryRecoveryPending = false;
  memoryCallbackQuarantine = false;
  publishMemoryPending();
}
