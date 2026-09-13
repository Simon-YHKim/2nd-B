import type { AiAuditInsert } from "../supabase/audit";
import { insertAiAuditLog } from "../supabase/audit";
import type { CrisisEventInsert } from "../supabase/crisis-events";
import { insertCrisisEvent } from "../supabase/crisis-events";
import { runAccountLocalMutation } from "../account/local-deletion-fence";

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type AuditWriteKind = "ai_audit_log" | "crisis_event";

interface AuditWriteBase {
  id: string;
  ownerUserId: string;
  warnLabel: string;
  requiresBoundSession: boolean;
}

export type AuditWriteSubmission =
  | {
      kind: "ai_audit_log";
      ownerUserId: string;
      payload: AiAuditInsert;
      warnLabel: string;
    }
  | {
      kind: "crisis_event";
      ownerUserId: string;
      payload: CrisisEventInsert;
      warnLabel: string;
    };

export interface CapturedAuditDelivery {
  userId: string;
  accessToken: string;
  signal?: AbortSignal;
  assertCurrent(): void;
}

type AuditWriteEntry =
  | (AuditWriteBase & { kind: "ai_audit_log"; payload: AiAuditInsert })
  | (AuditWriteBase & { kind: "crisis_event"; payload: CrisisEventInsert });

const STORAGE_KEY = "llm.auditWriteOutbox.v1";
// Bound on NON-critical (green/yellow ai_audit_log) entries -- the AsyncStorage /
// OOM guard (ANDROID_QA_GUIDELINES 2MB). Safety-critical entries get a separate,
// larger cap so C3 crisis evidence is never the first thing evicted during a
// delivery-failure / migration window (F3).
const MAX_OUTBOX_ENTRIES = 100;
const MAX_CRITICAL_ENTRIES = 500;

// C3-critical = a crisis_event, or an ai_audit_log row that recorded a RED
// interception. These prove the classifier caught dangerous input, so they must
// survive eviction ahead of routine green/yellow audit rows.
function isCriticalEntry(e: AuditWriteEntry): boolean {
  return (
    e.kind === "crisis_event" ||
    (e.kind === "ai_audit_log" && (e.payload as AiAuditInsert).safetyZone === "red")
  );
}

// Keep ALL critical entries (up to a large safety cap) and evict only the OLDEST
// non-critical entries to stay within MAX_OUTBOX_ENTRIES. Preserves the original
// chronological order (deliver() drains oldest-first). Replaces the old blanket
// slice(-100) that discarded early-session crisis rows first.
// Exported for unit testing (F3); not part of the runtime API surface.
export function boundOutbox(queue: AuditWriteEntry[]): AuditWriteEntry[] {
  const critical = queue.filter(isCriticalEntry);
  if (critical.length === 0) return queue.slice(-MAX_OUTBOX_ENTRIES);
  const keptCritical = new Set(critical.slice(-MAX_CRITICAL_ENTRIES));
  const keptNormal = new Set(queue.filter((e) => !isCriticalEntry(e)).slice(-MAX_OUTBOX_ENTRIES));
  return queue.filter((e) => keptCritical.has(e) || keptNormal.has(e));
}

let memoryOutbox: AuditWriteEntry[] = [];
let queueChain: Promise<void> = Promise.resolve();
let nextId = 0;
const deletedOwnerFences = new Set<string>();

function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // private mode / native: fall through
  }
  return null;
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

function isWriteKind(value: unknown): value is AuditWriteKind {
  return value === "ai_audit_log" || value === "crisis_event";
}

function normalizeEntry(value: unknown): AuditWriteEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<AuditWriteEntry>;
  if (typeof entry.id !== "string") return null;
  if (typeof entry.ownerUserId !== "string" || entry.ownerUserId.length === 0) return null;
  if (typeof entry.warnLabel !== "string" || entry.warnLabel.length === 0) return null;
  if (!isWriteKind(entry.kind)) return null;
  if (!entry.payload || typeof entry.payload !== "object") return null;
  return {
    ...entry,
    // v1 rows written before this field existed may include voice/crisis
    // evidence. Upgrade them conservatively: production retry already obtains
    // a fresh same-owner token, so fail closed instead of guessing provenance.
    requiresBoundSession: entry.requiresBoundSession !== false,
  } as AuditWriteEntry;
}

function parseQueue(raw: string | null): AuditWriteEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((entry): entry is AuditWriteEntry => entry !== null);
  } catch {
    return [];
  }
}

async function readQueue(): Promise<AuditWriteEntry[]> {
  const local = ls();
  if (local) {
    const stored = parseQueue(local.getItem(STORAGE_KEY));
    return memoryOutbox.length > stored.length ? memoryOutbox : stored;
  }
  const native = nativeStorage();
  if (!native) return memoryOutbox;
  try {
    const stored = parseQueue(await native.getItem(STORAGE_KEY));
    return memoryOutbox.length > stored.length ? memoryOutbox : stored;
  } catch {
    return memoryOutbox;
  }
}

async function writeQueue(queue: AuditWriteEntry[]): Promise<boolean> {
  const bounded = boundOutbox(queue);
  const raw = JSON.stringify(bounded);
  memoryOutbox = bounded;
  const local = ls();
  if (local) {
    try {
      if (bounded.length === 0) local.removeItem(STORAGE_KEY);
      else local.setItem(STORAGE_KEY, raw);
      return local.getItem(STORAGE_KEY) === (bounded.length === 0 ? null : raw);
    } catch {
      // memoryOutbox is the fallback for this runtime tick.
      return false;
    }
  }
  const native = nativeStorage();
  if (!native) return true;
  try {
    if (bounded.length === 0) await native.removeItem(STORAGE_KEY);
    else await native.setItem(STORAGE_KEY, raw);
    return await native.getItem(STORAGE_KEY) === (bounded.length === 0 ? null : raw);
  } catch {
    // memoryOutbox is the fallback for this runtime tick.
    return false;
  }
}

async function deliver(entry: AuditWriteEntry, captured?: CapturedAuditDelivery): Promise<void> {
  if (
    (entry.requiresBoundSession && !captured) ||
    (captured && captured.userId !== entry.ownerUserId)
  ) {
    throw new Error("audit_session_owner_mismatch");
  }
  captured?.assertCurrent();
  if (entry.kind === "ai_audit_log") {
    if (captured) {
      await insertAiAuditLog(entry.payload, captured.accessToken, captured.signal);
    } else {
      await insertAiAuditLog(entry.payload);
    }
    return;
  }
  if (captured) {
    await insertCrisisEvent(entry.payload, captured.accessToken, captured.signal);
  } else {
    await insertCrisisEvent(entry.payload);
  }
}

async function flushNow(ownerUserId?: string, captured?: CapturedAuditDelivery): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: AuditWriteEntry[] = [];
  let blocked = false;
  for (const entry of queue) {
    const ownerMatches = !ownerUserId || entry.ownerUserId === ownerUserId;
    if (!ownerMatches || blocked) {
      remaining.push(entry);
      continue;
    }
    try {
      await deliver(entry, captured);
    } catch {
      blocked = true;
      remaining.push(entry);
      if (typeof console !== "undefined") console.warn(entry.warnLabel);
    }
  }
  await writeQueue(remaining);
}

export function enqueueAuditWrite(
  submission: AuditWriteSubmission,
  captured?: CapturedAuditDelivery,
): Promise<void> {
  if (deletedOwnerFences.has(submission.ownerUserId)) return Promise.resolve();
  return runAccountLocalMutation(submission.ownerUserId, async () => {
    queueChain = queueChain.catch(() => {}).then(async () => {
      // Purge may have fenced this owner after the submission was queued but
      // before its turn began. Do not recreate data for a terminally deleted ID.
      if (deletedOwnerFences.has(submission.ownerUserId)) return;
      const entry: AuditWriteEntry = {
        ...submission,
        id: `${Date.now().toString(36)}-${(nextId++).toString(36)}`,
        requiresBoundSession: captured !== undefined,
      };
      const queue = await readQueue();
      await writeQueue([...queue, entry]);
      await flushNow(submission.ownerUserId, captured);
    });
    await queueChain;
  }).then(() => undefined, () => undefined);
}

export function flushAuditWriteOutbox(
  ownerUserId?: string,
  captured?: CapturedAuditDelivery,
): Promise<void> {
  const owner = ownerUserId?.trim();
  if (!owner) return Promise.resolve();
  return runAccountLocalMutation(owner, async () => {
    queueChain = queueChain.catch(() => {}).then(() => flushNow(owner, captured));
    await queueChain;
  }).then(() => undefined, () => undefined);
}

/** Drop only one deleted owner's undelivered rows, preserving other accounts. */
export function purgeAuditWriteOutboxForOwner(ownerUserId: string): Promise<boolean> {
  const owner = ownerUserId.trim();
  if (!owner) return Promise.resolve(false);
  // Synchronous fence closes the enqueue-after-purge race while the serialized
  // storage rewrite is still waiting behind an in-flight delivery.
  deletedOwnerFences.add(owner);
  let observed = false;
  queueChain = queueChain.catch(() => {}).then(async () => {
    const queue = await readQueue();
    observed = await writeQueue(queue.filter((entry) => entry.ownerUserId !== owner));
  });
  return queueChain.then(() => observed, () => false);
}

export async function getAuditWriteOutboxForTests(): Promise<AuditWriteSubmission[]> {
  await queueChain.catch(() => {});
  const queue = await readQueue();
  return queue.map(({ kind, ownerUserId, payload, warnLabel }) => ({
    kind,
    ownerUserId,
    payload,
    warnLabel,
  })) as AuditWriteSubmission[];
}

export async function resetAuditWriteOutboxForTests(): Promise<void> {
  await queueChain.catch(() => {});
  await writeQueue([]);
  nextId = 0;
  deletedOwnerFences.clear();
}
