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
const RECOVERY_PENDING_OWNER_PREFIX = `${RECOVERY_PENDING_KEY}.`;
const RECOVERY_PENDING_WEB_LOCK = "secondbrain.auth.recovery-pending";
const RECOVERY_PENDING_OWNER_KEY_VERSION = 1;
const MAX_RECOVERY_PENDING_RAW_CHARS = 512;
const MAX_RECOVERY_PENDING_TOKEN_CHARS = 128;
const MAX_WEB_STORAGE_KEYS = 4_096;
const MAX_WEB_RECOVERY_PENDING_OWNERS = 64;
const WEB_PENDING_SNAPSHOT_ATTEMPTS = 3;
const RECOVERY_PENDING_TOKEN = /^[a-z0-9-]+$/;

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

interface WebRecoveryPending extends Required<RecoveryPending> {
  readonly ownerKeyVersion: typeof RECOVERY_PENDING_OWNER_KEY_VERSION;
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
  if (!raw || raw.length > MAX_RECOVERY_PENDING_RAW_CHARS) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, "issuedAt")) return null;
    const issuedAtValue = record.issuedAt;
    const issuedAt = typeof issuedAtValue === "string" && issuedAtValue.length <= 64
      ? Date.parse(issuedAtValue)
      : NaN;
    const hasToken = Object.prototype.hasOwnProperty.call(record, "token");
    const token = hasToken ? record.token : undefined;
    if (
      !Number.isFinite(issuedAt)
      || (token !== undefined && (
        typeof token !== "string"
        || token.length === 0
        || token.length > MAX_RECOVERY_PENDING_TOKEN_CHARS
        || !RECOVERY_PENDING_TOKEN.test(token)
      ))
    ) {
      return null;
    }
    return token
      ? { issuedAt: issuedAtValue as string, token }
      : { issuedAt: issuedAtValue as string };
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

interface WebLockManagerLike {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

async function withWebPendingLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: WebLockManagerLike } | undefined)?.locks;
  if (!locks) return operation();
  let entered = false;
  try {
    return await locks.request(
      RECOVERY_PENDING_WEB_LOCK,
      { mode: "exclusive" },
      () => {
        entered = true;
        return operation();
      },
    );
  } catch (error) {
    // Lock acquisition is an optimization. The owner-key ledger remains safe
    // when the API is unavailable or rejects before invoking the callback.
    if (!entered) return operation();
    throw error;
  }
}

function recoveryPendingOwnerKey(token: string): string {
  return `${RECOVERY_PENDING_OWNER_PREFIX}${token}`;
}

export function isRecoveryPendingStorageKey(key: string | null): boolean {
  return key === null
    || key === RECOVERY_PENDING_KEY
    || key.startsWith(RECOVERY_PENDING_OWNER_PREFIX);
}

function toWebRecoveryPending(pending: Required<RecoveryPending>): WebRecoveryPending {
  return {
    ...pending,
    ownerKeyVersion: RECOVERY_PENDING_OWNER_KEY_VERSION,
  };
}

function parseWebRecoveryPending(raw: string | null): WebRecoveryPending | null {
  const pending = parseRecoveryPending(raw);
  if (!pending?.token || !raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(record, "ownerKeyVersion")
      && record.ownerKeyVersion === RECOVERY_PENDING_OWNER_KEY_VERSION
      ? toWebRecoveryPending({ issuedAt: pending.issuedAt, token: pending.token })
      : null;
  } catch {
    return null;
  }
}

/**
 * Arm a provisional cross-tab lock before auth-js consumes a web callback URL.
 * A PKCE `code` is only provisional here; authoritative recovery provenance
 * still comes from auth-js redirectType/PASSWORD_RECOVERY later.
 */
export function armWebRecoveryPendingFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  let recognizedCallback = false;
  let store: Storage | null = null;
  let ownerKey: string | null = null;
  let ownerWritten = false;
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
    recognizedCallback = true;
    store = localStorage;
    materializeWebLegacyPending(store);
    const marker = createRecoveryPendingMarker();
    claimPending(marker.token);
    const webMarker = toWebRecoveryPending(marker);
    const rawMarker = JSON.stringify(webMarker);
    ownerKey = recoveryPendingOwnerKey(marker.token);
    store.setItem(ownerKey, rawMarker);
    ownerWritten = true;
    readStableWebPendingSnapshot(store);
    store.setItem(RECOVERY_PENDING_KEY, rawMarker);
    commitDurablePendingState(capturePendingState());
    return true;
  } catch {
    if (store && ownerWritten && ownerKey) {
      try {
        store.removeItem(ownerKey);
      } catch {
        // Re-observation below keeps the gate locked if cleanup did not land.
      }
    }
    if (store) {
      try {
        observeWebPending(store, true);
      } catch {
        // The recognized callback itself is unresolved even if the ledger is
        // unreadable, so the route must remain locked in this runtime.
      }
    }
    if (recognizedCallback && !memoryPending) claimPending(createPendingToken(), true);
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
let durablePendingKnown = false;
const pendingListeners = new Set<(pending: boolean) => void>();

interface PendingStateSnapshot {
  pending: boolean;
  revision: number;
  token: string | null;
  legacy: boolean;
}

let durablePendingState: PendingStateSnapshot = {
  pending: false,
  revision: 0,
  token: null,
  legacy: false,
};

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

function commitDurablePendingState(state: PendingStateSnapshot): void {
  durablePendingKnown = true;
  durablePendingState = { ...state };
}

function durableStateForPending(
  pending: RecoveryPending,
  legacy = pending.token === undefined,
): PendingStateSnapshot {
  const token = pending.token
    ?? (durablePendingState.legacy ? durablePendingState.token : null)
    ?? createPendingToken();
  return {
    pending: true,
    revision: pendingRevision,
    token,
    legacy,
  };
}

function noPendingState(): PendingStateSnapshot {
  return {
    pending: false,
    revision: pendingRevision,
    token: null,
    legacy: false,
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

function restoreDurablePendingStateIfCurrent(lease: RecoveryPendingLease): void {
  restorePendingStateIfCurrent(lease, durablePendingState);
}

function applyNoPendingMarker(): void {
  pendingRevision += 1;
  pendingToken = null;
  pendingIsLegacy = false;
  setMemoryPending(false);
}

function applyPendingState(state: PendingStateSnapshot): void {
  if (
    memoryPending === state.pending
    && pendingToken === state.token
    && pendingIsLegacy === state.legacy
  ) return;
  pendingRevision += 1;
  pendingToken = state.token;
  pendingIsLegacy = state.legacy;
  setMemoryPending(state.pending);
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

interface WebPendingObservation {
  readonly pending: RecoveryPending | null;
  readonly state: PendingStateSnapshot;
}

interface WebPendingSnapshot {
  readonly baseRaw: string | null;
  readonly owners: readonly { key: string; raw: string }[];
}

function readBoundedWebPendingRaw(store: Storage, key: string): string | null {
  const raw = store.getItem(key);
  if (raw && raw.length > MAX_RECOVERY_PENDING_RAW_CHARS) {
    throw new Error("Persisted recovery pending marker exceeds its bound");
  }
  return raw;
}

function captureWebPendingSnapshot(store: Storage): WebPendingSnapshot | null {
  const partialStore = store as Storage & { key?: (index: number) => string | null };
  if (typeof partialStore.key !== "function") {
    throw new Error("Recovery pending owner enumeration is unavailable");
  }

  const length = store.length;
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_WEB_STORAGE_KEYS) {
    throw new Error("Recovery pending storage key count exceeds its bound");
  }
  const ownerKeys: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = partialStore.key(index);
    if (key === null) return null;
    if (!key.startsWith(RECOVERY_PENDING_OWNER_PREFIX)) continue;
    const token = key.slice(RECOVERY_PENDING_OWNER_PREFIX.length);
    if (
      token.length === 0
      || token.length > MAX_RECOVERY_PENDING_TOKEN_CHARS
      || !RECOVERY_PENDING_TOKEN.test(token)
    ) {
      throw new Error("Persisted recovery pending owner key is invalid");
    }
    ownerKeys.push(key);
  }
  if (store.length !== length) return null;
  if (ownerKeys.length > MAX_WEB_RECOVERY_PENDING_OWNERS) {
    throw new Error("Recovery pending owner count exceeds its bound");
  }

  ownerKeys.sort();
  const owners: { key: string; raw: string }[] = [];
  for (const key of ownerKeys) {
    const raw = readBoundedWebPendingRaw(store, key);
    if (raw === null) return null;
    owners.push({ key, raw });
  }
  const baseRaw = readBoundedWebPendingRaw(store, RECOVERY_PENDING_KEY);
  if (store.length !== length) return null;
  return { baseRaw, owners };
}

function sameWebPendingSnapshot(
  left: WebPendingSnapshot,
  right: WebPendingSnapshot,
): boolean {
  if (left.baseRaw !== right.baseRaw || left.owners.length !== right.owners.length) return false;
  return left.owners.every((owner, index) => (
    owner.key === right.owners[index]?.key && owner.raw === right.owners[index]?.raw
  ));
}

function readStableWebPendingSnapshot(store: Storage): WebPendingSnapshot {
  for (let attempt = 0; attempt < WEB_PENDING_SNAPSHOT_ATTEMPTS; attempt += 1) {
    const first = captureWebPendingSnapshot(store);
    const second = captureWebPendingSnapshot(store);
    if (first && second && sameWebPendingSnapshot(first, second)) return second;
  }
  throw new Error("Recovery pending owner ledger changed during observation");
}

function readWebPendingObservation(store: Storage): WebPendingObservation {
  const snapshot = readStableWebPendingSnapshot(store);
  const basePending = parseRecoveryPending(snapshot.baseRaw);
  const baseOwner = parseWebRecoveryPending(snapshot.baseRaw);
  let selectedOwner: Required<RecoveryPending> | null = null;

  for (const entry of snapshot.owners) {
    const owner = parseWebRecoveryPending(entry.raw);
    const keyToken = entry.key.slice(RECOVERY_PENDING_OWNER_PREFIX.length);
    if (!owner || owner.token !== keyToken) {
      throw new Error("Persisted recovery pending owner marker is invalid");
    }
    if (
      !selectedOwner
      || Date.parse(owner.issuedAt) > Date.parse(selectedOwner.issuedAt)
      || (
        owner.issuedAt === selectedOwner.issuedAt
        && owner.token > selectedOwner.token
      )
    ) {
      selectedOwner = { issuedAt: owner.issuedAt, token: owner.token };
    }
  }

  // The base is not ownership, but its token is a bounded direct pointer that
  // closes the remaining gap if a concurrent key-index shift hid that owner.
  if (baseOwner) {
    const directRaw = readBoundedWebPendingRaw(
      store,
      recoveryPendingOwnerKey(baseOwner.token),
    );
    const directOwner = parseWebRecoveryPending(directRaw);
    if (directRaw && directOwner?.token !== baseOwner.token) {
      throw new Error("Persisted recovery pending base owner is invalid");
    }
    if (directOwner && (
      !selectedOwner
      || Date.parse(directOwner.issuedAt) > Date.parse(selectedOwner.issuedAt)
      || (
        directOwner.issuedAt === selectedOwner.issuedAt
        && directOwner.token > selectedOwner.token
      )
    )) {
      selectedOwner = {
        issuedAt: directOwner.issuedAt,
        token: directOwner.token,
      };
    }
  }

  // A base-only marker from a pre-ledger runtime is still an authoritative
  // unresolved owner. Prefer it until it has been materialized as an owner key.
  if (basePending && !baseOwner) {
    return { pending: basePending, state: durableStateForPending(basePending, true) };
  }
  if (selectedOwner) {
    return { pending: selectedOwner, state: durableStateForPending(selectedOwner) };
  }
  if (snapshot.baseRaw && !basePending) {
    throw new Error("Persisted recovery pending marker is invalid");
  }
  // A modern base marker without its token-specific owner is a stale signal.
  return { pending: null, state: noPendingState() };
}

function observeWebPending(store: Storage, updateMemory: boolean): RecoveryPending | null {
  const observation = readWebPendingObservation(store);
  commitDurablePendingState(observation.state);
  if (updateMemory) applyPendingState(observation.state);
  return observation.pending;
}

function materializeWebLegacyPending(store: Storage): RecoveryPending | null {
  const observation = readWebPendingObservation(store);
  commitDurablePendingState(observation.state);
  if (!observation.pending || !observation.state.legacy) return observation.pending;

  const marker: Required<RecoveryPending> = {
    issuedAt: observation.pending.issuedAt,
    token: createPendingToken(),
  };
  const ownerKey = recoveryPendingOwnerKey(marker.token);
  let ownerWritten = false;
  try {
    const rawMarker = JSON.stringify(toWebRecoveryPending(marker));
    store.setItem(ownerKey, rawMarker);
    ownerWritten = true;
    readStableWebPendingSnapshot(store);
    store.setItem(RECOVERY_PENDING_KEY, rawMarker);
    commitDurablePendingState(pendingStateForMarker(marker, pendingRevision));
    return marker;
  } catch (error) {
    if (ownerWritten) {
      try {
        store.removeItem(ownerKey);
      } catch {
        // A surviving owner key remains a conservative recovery lock.
      }
    }
    try {
      observeWebPending(store, false);
    } catch {
      commitDurablePendingState(observation.state);
    }
    throw error;
  }
}

export function applyRecoveryPendingStorageValue(raw: string | null): RecoveryPending | null {
  let store: Storage | null;
  try {
    store = webStorage();
  } catch {
    claimPending(createPendingToken(), true);
    return null;
  }
  if (store) {
    try {
      // StorageEvent.newValue is only a wake-up signal. It may be delayed behind
      // a newer tab write, so ownership is always re-read from the current ledger.
      return observeWebPending(store, true);
    } catch {
      // An unreadable ledger is unresolved recovery state, never an unlock.
      claimPending(createPendingToken(), true);
      return null;
    }
  }

  const pending = parseRecoveryPending(raw);
  const state = pending ? durableStateForPending(pending) : noPendingState();
  commitDurablePendingState(state);
  if (pending || !raw) applyPendingState(state);
  else claimPending(createPendingToken(), true);
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

function pendingStateForMarker(
  marker: Required<RecoveryPending>,
  revision: number,
): PendingStateSnapshot {
  return {
    pending: true,
    revision,
    token: marker.token,
    legacy: false,
  };
}

function observeNativePendingRaw(raw: string | null): WebPendingObservation {
  const pending = parseRecoveryPending(raw);
  if (raw && !pending) {
    throw new Error("Persisted recovery pending marker is invalid");
  }
  return {
    pending,
    state: pending ? durableStateForPending(pending) : noPendingState(),
  };
}

export function loadRecoveryPending(): Promise<RecoveryPending | null> {
  const requestedRevision = pendingRevision;
  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) return null;

    if (storage.kind === "web") {
      return withWebPendingLock(async () => {
        const observation = readWebPendingObservation(storage.store);
        commitDurablePendingState(observation.state);
        if (pendingRevision !== requestedRevision) return observation.pending;
        applyPendingState(observation.state);
        if (!observation.pending || !observation.state.legacy) return observation.pending;

        const marker: Required<RecoveryPending> = {
          issuedAt: observation.pending.issuedAt,
          token: createPendingToken(),
        };
        const lease = claimPending(marker.token, true);
        const ownerKey = recoveryPendingOwnerKey(marker.token);
        const rawMarker = JSON.stringify(toWebRecoveryPending(marker));
        let ownerWritten = false;
        try {
          storage.store.setItem(ownerKey, rawMarker);
          ownerWritten = true;
          readStableWebPendingSnapshot(storage.store);
          storage.store.setItem(RECOVERY_PENDING_KEY, rawMarker);
          const durable = pendingStateForMarker(marker, lease.revision);
          commitDurablePendingState(durable);
          if (isRecoveryPendingLeaseCurrent(lease)) applyPendingState(durable);
          return marker;
        } catch (error) {
          if (ownerWritten) {
            try {
              storage.store.removeItem(ownerKey);
            } catch {
              // The owner ledger will keep recovery locked if cleanup failed.
            }
          }
          try {
            observeWebPending(storage.store, isRecoveryPendingLeaseCurrent(lease));
          } catch {
            restoreDurablePendingStateIfCurrent(lease);
          }
          throw error;
        }
      });
    }

    const raw = await storage.store.getItem(RECOVERY_PENDING_KEY);
    let observation: WebPendingObservation;
    try {
      observation = observeNativePendingRaw(raw);
    } catch (error) {
      await storage.store.removeItem(RECOVERY_PENDING_KEY);
      commitDurablePendingState(noPendingState());
      if (pendingRevision === requestedRevision) applyNoPendingMarker();
      throw error;
    }
    commitDurablePendingState(observation.state);
    if (pendingRevision !== requestedRevision) return observation.pending;
    applyPendingState(observation.state);
    if (!observation.pending || observation.pending.token) return observation.pending;

    const marker: Required<RecoveryPending> = {
      issuedAt: observation.pending.issuedAt,
      token: createPendingToken(),
    };
    const lease = claimPending(marker.token, true);
    try {
      await storage.store.setItem(RECOVERY_PENDING_KEY, JSON.stringify(marker));
      const durable = pendingStateForMarker(marker, lease.revision);
      commitDurablePendingState(durable);
      if (isRecoveryPendingLeaseCurrent(lease)) applyPendingState(durable);
      return marker;
    } catch (error) {
      restoreDurablePendingStateIfCurrent(lease);
      throw error;
    }
  });
}

export function persistRecoveryPending(): Promise<RecoveryPendingLease> {
  // Claim before entering the serialized queue. Otherwise an older queued clear
  // can run first and briefly unlock or delete this newer pending intent.
  const marker = createRecoveryPendingMarker();
  const lease = claimPending(marker.token);
  return enqueueStorage(async () => {
    let storage: ReturnType<typeof requireRuntimeStorage>;
    try {
      storage = requireRuntimeStorage();
    } catch (error) {
      if (!durablePendingKnown) commitDurablePendingState(noPendingState());
      restoreDurablePendingStateIfCurrent(lease);
      throw error;
    }
    if (!storage) {
      if (!durablePendingKnown) commitDurablePendingState(noPendingState());
      restoreDurablePendingStateIfCurrent(lease);
      return lease;
    }

    if (storage.kind === "web") {
      return withWebPendingLock(async () => {
        let ownerWritten = false;
        const ownerKey = recoveryPendingOwnerKey(marker.token);
        try {
          materializeWebLegacyPending(storage.store);
          const rawMarker = JSON.stringify(toWebRecoveryPending(marker));
          storage.store.setItem(ownerKey, rawMarker);
          ownerWritten = true;
          readStableWebPendingSnapshot(storage.store);
          storage.store.setItem(RECOVERY_PENDING_KEY, rawMarker);
          const durable = pendingStateForMarker(marker, lease.revision);
          commitDurablePendingState(durable);
          if (isRecoveryPendingLeaseCurrent(lease)) applyPendingState(durable);
          return lease;
        } catch (error) {
          if (ownerWritten) {
            try {
              storage.store.removeItem(ownerKey);
            } catch {
              // A surviving owner key is intentionally fail-closed on restart.
            }
          }
          let recoveredDurableState = false;
          try {
            observeWebPending(storage.store, false);
            recoveredDurableState = true;
          } catch {
            // Unknown ledger state is a lock, never evidence of no pending owner.
          }
          if (recoveredDurableState) restoreDurablePendingStateIfCurrent(lease);
          else if (isRecoveryPendingLeaseCurrent(lease)) setMemoryPending(true);
          throw error;
        }
      });
    }

    try {
      const before = observeNativePendingRaw(
        await storage.store.getItem(RECOVERY_PENDING_KEY),
      );
      commitDurablePendingState(before.state);
      await storage.store.setItem(RECOVERY_PENDING_KEY, JSON.stringify(marker));
      commitDurablePendingState(pendingStateForMarker(marker, lease.revision));
      return lease;
    } catch (error) {
      restoreDurablePendingStateIfCurrent(lease);
      throw error;
    }
  });
}

export function clearRecoveryPending(): Promise<void>;
export function clearRecoveryPending(
  expectedLease: RecoveryPendingLease,
): Promise<RecoveryPendingClearResult>;
export function clearRecoveryPending(
  expectedLease?: RecoveryPendingLease,
): Promise<void | RecoveryPendingClearResult> {
  // A no-argument caller has no ownership proof. Capturing here would let stale
  // cleanup adopt a newer B lease, so legacy callers intentionally fail closed.
  if (!expectedLease) return Promise.resolve();

  return enqueueStorage(async () => {
    const storage = requireRuntimeStorage();
    if (!storage) {
      if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
      const cleared = noPendingState();
      commitDurablePendingState(cleared);
      applyPendingState(cleared);
      return "cleared";
    }

    if (storage.kind === "web") {
      return withWebPendingLock(async () => {
        observeWebPending(storage.store, false);
        if (!expectedLease.token) return "stale";
        const ownerKey = recoveryPendingOwnerKey(expectedLease.token);
        const owner = parseWebRecoveryPending(storage.store.getItem(ownerKey));
        if (owner?.token !== expectedLease.token) return "stale";

        try {
          // Base is a wake-up/legacy compatibility signal, never ownership.
          // Leaving a stale modern signal is fail-closed for old tabs and is
          // ignored by ledger-aware tabs once this token owner is gone.
          storage.store.removeItem(ownerKey);
        } finally {
          const updateMemory = isRecoveryPendingLeaseCurrent(expectedLease);
          observeWebPending(storage.store, updateMemory);
        }
        return "cleared";
      });
    }

    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    const raw = await storage.store.getItem(RECOVERY_PENDING_KEY);
    if (!isRecoveryPendingLeaseCurrent(expectedLease)) return "stale";
    const pending = parseRecoveryPending(raw);
    if (raw && !pending) throw new Error("Persisted recovery pending marker is invalid");
    if (
      pendingIsLegacy
      || !pending?.token
      || pending.token !== expectedLease.token
    ) return "stale";

    await storage.store.removeItem(RECOVERY_PENDING_KEY);
    const cleared = noPendingState();
    commitDurablePendingState(cleared);
    if (isRecoveryPendingLeaseCurrent(expectedLease)) applyPendingState(cleared);
    return "cleared";
  });
}

export function __resetRecoveryProofStorageQueueForTests(): void {
  storageQueue = Promise.resolve();
  pendingRevision = 0;
  pendingToken = null;
  pendingIsLegacy = false;
  pendingTokenSequence = 0;
  durablePendingKnown = false;
  durablePendingState = {
    pending: false,
    revision: 0,
    token: null,
    legacy: false,
  };
  setMemoryPending(false);
}
