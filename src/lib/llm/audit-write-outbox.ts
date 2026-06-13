import type { AiAuditInsert } from "../supabase/audit";
import { insertAiAuditLog } from "../supabase/audit";
import type { CrisisEventInsert } from "../supabase/crisis-events";
import { insertCrisisEvent } from "../supabase/crisis-events";

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

type AuditWriteEntry =
  | (AuditWriteBase & { kind: "ai_audit_log"; payload: AiAuditInsert })
  | (AuditWriteBase & { kind: "crisis_event"; payload: CrisisEventInsert });

const STORAGE_KEY = "llm.auditWriteOutbox.v1";
const MAX_OUTBOX_ENTRIES = 100;

let memoryOutbox: AuditWriteEntry[] = [];
let queueChain: Promise<void> = Promise.resolve();
let nextId = 0;

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
  return entry as AuditWriteEntry;
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

async function writeQueue(queue: AuditWriteEntry[]): Promise<void> {
  const bounded = queue.slice(-MAX_OUTBOX_ENTRIES);
  const raw = JSON.stringify(bounded);
  memoryOutbox = bounded;
  const local = ls();
  if (local) {
    try {
      if (bounded.length === 0) local.removeItem(STORAGE_KEY);
      else local.setItem(STORAGE_KEY, raw);
    } catch {
      // memoryOutbox is the fallback for this runtime tick.
    }
    return;
  }
  const native = nativeStorage();
  if (!native) return;
  try {
    if (bounded.length === 0) await native.removeItem(STORAGE_KEY);
    else await native.setItem(STORAGE_KEY, raw);
  } catch {
    // memoryOutbox is the fallback for this runtime tick.
  }
}

async function deliver(entry: AuditWriteEntry): Promise<void> {
  if (entry.kind === "ai_audit_log") {
    await insertAiAuditLog(entry.payload);
    return;
  }
  await insertCrisisEvent(entry.payload);
}

async function flushNow(ownerUserId?: string): Promise<void> {
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
      await deliver(entry);
    } catch (e) {
      blocked = true;
      remaining.push(entry);
      if (typeof console !== "undefined") console.warn(entry.warnLabel, e);
    }
  }
  await writeQueue(remaining);
}

export function enqueueAuditWrite(submission: AuditWriteSubmission): Promise<void> {
  queueChain = queueChain.catch(() => {}).then(async () => {
    const entry: AuditWriteEntry = {
      ...submission,
      id: `${Date.now().toString(36)}-${(nextId++).toString(36)}`,
    };
    const queue = await readQueue();
    await writeQueue([...queue, entry]);
    await flushNow(submission.ownerUserId);
  });
  return queueChain;
}

export function flushAuditWriteOutbox(ownerUserId?: string): Promise<void> {
  queueChain = queueChain.catch(() => {}).then(() => flushNow(ownerUserId));
  return queueChain;
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
}
